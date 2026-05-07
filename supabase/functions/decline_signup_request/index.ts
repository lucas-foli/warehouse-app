// supabase/functions/decline_signup_request/index.ts
import { getCorsHeaders } from "../_shared/cors.ts";
import { errorResponse, jsonResponse } from "../_shared/json.ts";
import { createAdminClient, createCallerClient } from "../_shared/supabaseAdmin.ts";
import { requirePlatformAdmin } from "../_shared/authGuards.ts";

interface Body {
  request_id: string;
  reason: string | null;
}

Deno.serve(async (req: Request) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return errorResponse("method_not_allowed", 405, cors);

  let body: Body;
  try { body = await req.json(); } catch { return errorResponse("invalid_json", 400, cors); }
  if (!body.request_id) return errorResponse("missing_fields", 400, cors);

  const caller = createCallerClient(req);
  const guard = await requirePlatformAdmin(caller);
  if ("error" in guard) return errorResponse(guard.error, 403, cors);

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("signup_requests")
    .update({
      status: "declined",
      declined_reason: body.reason,
      reviewed_by: guard.userId,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", body.request_id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();

  if (error) return errorResponse("update_failed", 500, cors);
  if (!data) return errorResponse("already_processed", 409, cors);

  return jsonResponse({ ok: true }, { status: 200 }, cors);
});
