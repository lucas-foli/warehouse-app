// supabase/functions/decline_join_request/index.ts
//
// Authenticated. The tenant admin declines a pending join request.
import { getCorsHeaders } from "../_shared/cors.ts";
import { errorResponse, jsonResponse } from "../_shared/json.ts";
import { createAdminClient, createCallerClient } from "../_shared/supabaseAdmin.ts";
import { requireTenantAdmin } from "../_shared/authGuards.ts";

interface Body {
  request_id: string;
  reason?: string;
}

const REASON_MAX = 500;

Deno.serve(async (req: Request) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return errorResponse("method_not_allowed", 405, cors);

  let body: Body;
  try { body = await req.json(); } catch { return errorResponse("invalid_json", 400, cors); }
  if (!body.request_id) return errorResponse("missing_fields", 400, cors);

  const reason = (body.reason ?? "").trim();
  if (reason.length > REASON_MAX) return errorResponse("reason_too_long", 400, cors);

  const admin = createAdminClient();

  const { data: request, error: fetchErr } = await admin
    .from("tenant_join_requests")
    .select("id, tenant_id, status")
    .eq("id", body.request_id)
    .maybeSingle();
  if (fetchErr) return errorResponse("fetch_failed", 500, cors);
  if (!request) return errorResponse("request_not_found", 404, cors);
  if (request.status !== "pending") return errorResponse("already_processed", 409, cors);

  const caller = createCallerClient(req);
  const guard = await requireTenantAdmin(caller, request.tenant_id);
  if ("error" in guard) return errorResponse(guard.error, 403, cors);

  const { error: updateErr } = await admin
    .from("tenant_join_requests")
    .update({
      status: "declined",
      declined_reason: reason || null,
      reviewed_by: guard.userId,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", request.id)
    .eq("status", "pending");
  if (updateErr) return errorResponse("request_update_failed", 500, cors);

  return jsonResponse({ ok: true }, { status: 200 }, cors);
});
