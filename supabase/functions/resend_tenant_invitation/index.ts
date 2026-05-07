// supabase/functions/resend_tenant_invitation/index.ts
import { getCorsHeaders } from "../_shared/cors.ts";
import { errorResponse, jsonResponse } from "../_shared/json.ts";
import { createAdminClient, createCallerClient } from "../_shared/supabaseAdmin.ts";
import { requireTenantAdmin } from "../_shared/authGuards.ts";

interface Body { invitation_id: string; }

Deno.serve(async (req: Request) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return errorResponse("method_not_allowed", 405, cors);

  let body: Body;
  try { body = await req.json(); } catch { return errorResponse("invalid_json", 400, cors); }
  if (!body.invitation_id) return errorResponse("missing_fields", 400, cors);

  const admin = createAdminClient();
  const baseDomain = Deno.env.get("BASE_DOMAIN") ?? "";
  if (!baseDomain) return errorResponse("missing_base_domain", 500, cors);

  const { data: invitation } = await admin
    .from("tenant_invitations")
    .select("id, tenant_id, email, token, accepted_at, revoked_at, expires_at, tenants:tenant_id(slug)")
    .eq("id", body.invitation_id)
    .maybeSingle();
  if (!invitation) return errorResponse("invitation_not_found", 404, cors);

  const caller = createCallerClient(req);
  const guard = await requireTenantAdmin(caller, invitation.tenant_id);
  if ("error" in guard) return errorResponse(guard.error, 403, cors);

  if (invitation.accepted_at) return errorResponse("already_accepted", 409, cors);
  if (invitation.revoked_at) return errorResponse("revoked", 410, cors);

  // Refresh expiry to give recipient a fresh window.
  const newExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  await admin.from("tenant_invitations").update({ expires_at: newExpires }).eq("id", invitation.id);

  // tenants:tenant_id(slug) embeds the slug; type is `{ slug: string } | { slug: string }[] | null`
  const tenantSlug = Array.isArray(invitation.tenants)
    ? invitation.tenants[0]?.slug
    : (invitation.tenants as { slug: string } | null)?.slug;
  if (!tenantSlug) return errorResponse("tenant_slug_missing", 500, cors);

  const redirectTo = `https://${tenantSlug}.${baseDomain}/accept-invite?token=${invitation.token}`;
  const { error: emailErr } = await admin.auth.admin.inviteUserByEmail(
    invitation.email, { redirectTo },
  );
  if (emailErr) return errorResponse("email_failed", 500, cors);

  return jsonResponse({ ok: true, expires_at: newExpires }, { status: 200 }, cors);
});
