// supabase/functions/create_tenant_invitation/index.ts
import { getCorsHeaders } from "../_shared/cors.ts";
import { errorResponse, jsonResponse } from "../_shared/json.ts";
import { createAdminClient, createCallerClient } from "../_shared/supabaseAdmin.ts";
import { requireTenantAdmin } from "../_shared/authGuards.ts";

interface Body {
  tenant_id: string;
  email: string;
  role: "admin" | "member";
}

const EMAIL_RE = /.+@.+\..+/;
const INVITE_TTL_DAYS = 7;

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

Deno.serve(async (req: Request) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return errorResponse("method_not_allowed", 405, cors);

  let body: Body;
  try { body = await req.json(); } catch { return errorResponse("invalid_json", 400, cors); }
  if (!body.tenant_id || !body.email || !body.role) return errorResponse("missing_fields", 400, cors);
  if (!EMAIL_RE.test(body.email)) return errorResponse("invalid_email", 400, cors);
  if (body.role !== "admin" && body.role !== "member") return errorResponse("invalid_role", 400, cors);

  const caller = createCallerClient(req);
  const guard = await requireTenantAdmin(caller, body.tenant_id);
  if ("error" in guard) return errorResponse(guard.error, 403, cors);

  const admin = createAdminClient();
  const baseDomain = Deno.env.get("BASE_DOMAIN") ?? "";
  if (!baseDomain) return errorResponse("missing_base_domain", 500, cors);

  const normalizedEmail = body.email.trim().toLowerCase();

  // Active invitation?
  const { data: existingInvite } = await admin
    .from("tenant_invitations")
    .select("id")
    .eq("tenant_id", body.tenant_id)
    .ilike("email", normalizedEmail)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .maybeSingle();
  if (existingInvite) return errorResponse("already_invited", 409, cors);

  // Already a member?
  const { data: tenant } = await admin
    .from("tenants").select("slug").eq("id", body.tenant_id).maybeSingle();
  if (!tenant) return errorResponse("tenant_not_found", 404, cors);

  const { data: usersList } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  const existingUser = usersList?.users.find(
    (u) => (u.email ?? "").toLowerCase() === normalizedEmail,
  );
  if (existingUser) {
    const { data: existingMember } = await admin
      .from("tenant_members")
      .select("user_id")
      .eq("tenant_id", body.tenant_id)
      .eq("user_id", existingUser.id)
      .maybeSingle();
    if (existingMember) return errorResponse("already_member", 409, cors);
  }

  const token = generateToken();
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const redirectTo = `https://${tenant.slug}.${baseDomain}/accept-invite?token=${token}`;

  const { data: invitation, error: insertErr } = await admin
    .from("tenant_invitations")
    .insert({
      tenant_id: body.tenant_id,
      email: normalizedEmail,
      role: body.role,
      token,
      invited_by: guard.userId,
      expires_at: expiresAt,
    })
    .select("id, expires_at")
    .single();
  if (insertErr) return errorResponse("insert_failed", 500, cors);

  const { error: emailErr } = await admin.auth.admin.inviteUserByEmail(
    normalizedEmail,
    { redirectTo },
  );
  if (emailErr) {
    // Don't roll back the invitation row — admin can resend.
    return jsonResponse(
      { invitation_id: invitation.id, expires_at: invitation.expires_at, email_warning: emailErr.message },
      { status: 200 },
      cors,
    );
  }

  return jsonResponse(
    { invitation_id: invitation.id, expires_at: invitation.expires_at },
    { status: 200 },
    cors,
  );
});
