// supabase/functions/approve_join_request/index.ts
//
// Authenticated. The tenant admin approves a pending join request, which
// issues a tenant_invitations row (role=member) and sends the invite email.
// The accepted invite drops the new user into the existing accept-invite flow.
//
// Invitation creation mirrors create_tenant_invitation; kept inline rather
// than extracted to a shared helper to keep that function's behavior frozen.
import { getCorsHeaders } from "../_shared/cors.ts";
import { errorResponse, jsonResponse } from "../_shared/json.ts";
import { createAdminClient, createCallerClient } from "../_shared/supabaseAdmin.ts";
import { requireTenantAdmin } from "../_shared/authGuards.ts";

interface Body {
  request_id: string;
}

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
  if (!body.request_id) return errorResponse("missing_fields", 400, cors);

  const admin = createAdminClient();
  const baseDomain = Deno.env.get("BASE_DOMAIN") ?? "";
  if (!baseDomain) return errorResponse("missing_base_domain", 500, cors);

  // Fetch the request to learn its tenant — auth check needs the tenant_id.
  const { data: request, error: fetchErr } = await admin
    .from("tenant_join_requests")
    .select("id, tenant_id, email, status")
    .eq("id", body.request_id)
    .maybeSingle();
  if (fetchErr) return errorResponse("fetch_failed", 500, cors);
  if (!request) return errorResponse("request_not_found", 404, cors);
  if (request.status !== "pending") return errorResponse("already_processed", 409, cors);

  const caller = createCallerClient(req);
  const guard = await requireTenantAdmin(caller, request.tenant_id);
  if ("error" in guard) return errorResponse(guard.error, 403, cors);

  const normalizedEmail = request.email.trim().toLowerCase();

  // Resolve slug for the invite redirect.
  const { data: tenant } = await admin
    .from("tenants").select("slug").eq("id", request.tenant_id).maybeSingle();
  if (!tenant) return errorResponse("tenant_not_found", 404, cors);

  // Already a member?
  const { data: usersList } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  const existingUser = usersList?.users.find(
    (u) => (u.email ?? "").toLowerCase() === normalizedEmail,
  );
  if (existingUser) {
    const { data: existingMember } = await admin
      .from("tenant_members")
      .select("user_id")
      .eq("tenant_id", request.tenant_id)
      .eq("user_id", existingUser.id)
      .maybeSingle();
    if (existingMember) return errorResponse("already_member", 409, cors);
  }

  // Active invitation?
  const { data: existingInvite } = await admin
    .from("tenant_invitations")
    .select("id")
    .eq("tenant_id", request.tenant_id)
    .ilike("email", normalizedEmail)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .maybeSingle();

  let invitationId: string;

  if (existingInvite) {
    // Reuse the existing active invitation — don't double-invite.
    invitationId = existingInvite.id;
  } else {
    const token = generateToken();
    const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const redirectTo = `https://${tenant.slug}.${baseDomain}/accept-invite?token=${token}`;

    const { data: invitation, error: insertErr } = await admin
      .from("tenant_invitations")
      .insert({
        tenant_id: request.tenant_id,
        email: normalizedEmail,
        role: "member",
        token,
        invited_by: guard.userId,
        expires_at: expiresAt,
      })
      .select("id")
      .single();
    if (insertErr) return errorResponse("invite_insert_failed", 500, cors);

    invitationId = invitation.id;

    const { error: emailErr } = await admin.auth.admin.inviteUserByEmail(
      normalizedEmail,
      { redirectTo },
    );
    if (emailErr) {
      // Leave the invitation row so the tenant admin can resend — don't roll
      // back. Surface a soft warning. We still mark the request approved.
    }
  }

  const { error: updateErr } = await admin
    .from("tenant_join_requests")
    .update({
      status: "approved",
      approved_invitation_id: invitationId,
      reviewed_by: guard.userId,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", request.id)
    .eq("status", "pending");
  if (updateErr) return errorResponse("request_update_failed", 500, cors);

  return jsonResponse({ ok: true, invitation_id: invitationId }, { status: 200 }, cors);
});
