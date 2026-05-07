// supabase/functions/accept_tenant_invitation/index.ts
import { getCorsHeaders } from "../_shared/cors.ts";
import { errorResponse, jsonResponse } from "../_shared/json.ts";
import { createAdminClient, createCallerClient } from "../_shared/supabaseAdmin.ts";
import { requireAuthenticatedUser } from "../_shared/authGuards.ts";

interface Body { token: string; }

Deno.serve(async (req: Request) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return errorResponse("method_not_allowed", 405, cors);

  let body: Body;
  try { body = await req.json(); } catch { return errorResponse("invalid_json", 400, cors); }
  if (!body.token) return errorResponse("missing_token", 400, cors);

  const caller = createCallerClient(req);
  const auth = await requireAuthenticatedUser(caller);
  if ("error" in auth) return errorResponse(auth.error, 401, cors);

  const admin = createAdminClient();

  const { data: invitation, error: fetchErr } = await admin
    .from("tenant_invitations")
    .select("*")
    .eq("token", body.token)
    .maybeSingle();
  if (fetchErr) return errorResponse("fetch_failed", 500, cors);
  if (!invitation) return errorResponse("invalid_token", 404, cors);
  if (invitation.accepted_at) return errorResponse("already_accepted", 409, cors);
  if (invitation.revoked_at) return errorResponse("revoked", 410, cors);
  if (new Date(invitation.expires_at) <= new Date()) return errorResponse("expired", 410, cors);

  if ((auth.email ?? "").toLowerCase() !== invitation.email.toLowerCase()) {
    return errorResponse("email_mismatch", 403, cors);
  }

  const { error: memberErr } = await admin
    .from("tenant_members")
    .upsert(
      { tenant_id: invitation.tenant_id, user_id: auth.userId, role: invitation.role },
      { onConflict: "tenant_id,user_id" },
    );
  if (memberErr) return errorResponse("member_insert_failed", 500, cors);

  const { error: updateErr } = await admin
    .from("tenant_invitations")
    .update({ accepted_at: new Date().toISOString() })
    .eq("id", invitation.id);
  if (updateErr) return errorResponse("invitation_update_failed", 500, cors);

  return jsonResponse(
    { tenant_id: invitation.tenant_id, role: invitation.role },
    { status: 200 },
    cors,
  );
});
