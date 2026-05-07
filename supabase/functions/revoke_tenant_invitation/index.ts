// supabase/functions/revoke_tenant_invitation/index.ts
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
  const { data: invitation } = await admin
    .from("tenant_invitations")
    .select("id, tenant_id, accepted_at, revoked_at")
    .eq("id", body.invitation_id)
    .maybeSingle();
  if (!invitation) return errorResponse("invitation_not_found", 404, cors);

  const caller = createCallerClient(req);
  const guard = await requireTenantAdmin(caller, invitation.tenant_id);
  if ("error" in guard) return errorResponse(guard.error, 403, cors);

  if (invitation.accepted_at) return errorResponse("already_accepted", 409, cors);
  if (invitation.revoked_at) return jsonResponse({ ok: true, already: true }, { status: 200 }, cors);

  const { error: updateErr } = await admin
    .from("tenant_invitations")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", invitation.id);
  if (updateErr) return errorResponse("update_failed", 500, cors);

  return jsonResponse({ ok: true }, { status: 200 }, cors);
});
