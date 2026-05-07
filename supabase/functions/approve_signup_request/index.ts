// supabase/functions/approve_signup_request/index.ts
import { getCorsHeaders } from "../_shared/cors.ts";
import { errorResponse, jsonResponse } from "../_shared/json.ts";
import { createAdminClient, createCallerClient } from "../_shared/supabaseAdmin.ts";
import { requirePlatformAdmin } from "../_shared/authGuards.ts";

interface Body {
  request_id: string;
  slug: string;
  granted_until: string | null; // ISO8601 or null for "forever"
}

const SLUG_RE = /^[a-z0-9-]{1,32}$/;

Deno.serve(async (req: Request) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return errorResponse("method_not_allowed", 405, cors);

  let body: Body;
  try { body = await req.json(); } catch { return errorResponse("invalid_json", 400, cors); }

  if (!body.request_id || !body.slug) return errorResponse("missing_fields", 400, cors);
  if (!SLUG_RE.test(body.slug)) return errorResponse("invalid_slug", 400, cors);

  const caller = createCallerClient(req);
  const guard = await requirePlatformAdmin(caller);
  if ("error" in guard) return errorResponse(guard.error, 403, cors);

  const admin = createAdminClient();
  const baseDomain = Deno.env.get("BASE_DOMAIN") ?? "";
  if (!baseDomain) return errorResponse("missing_base_domain", 500, cors);

  // 1. Lock and validate the request row.
  const { data: request, error: fetchErr } = await admin
    .from("signup_requests")
    .select("*")
    .eq("id", body.request_id)
    .maybeSingle();
  if (fetchErr) return errorResponse("fetch_failed", 500, cors);
  if (!request) return errorResponse("request_not_found", 404, cors);
  if (request.status !== "pending") return errorResponse("already_processed", 409, cors);

  // 2. Insert the tenant.
  const { data: tenant, error: tenantErr } = await admin
    .from("tenants")
    .insert({
      slug: body.slug,
      company_name: request.workspace_name,
      granted_until: body.granted_until,
    })
    .select("id, slug")
    .single();
  if (tenantErr) {
    if (tenantErr.code === "23505") return errorResponse("slug_taken", 409, cors);
    return errorResponse("tenant_insert_failed", 500, cors);
  }

  // 3. Send invite email (creates auth.users if absent, returns existing if present).
  const redirectTo = `https://${body.slug}.${baseDomain}/`;
  const { data: inviteData, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(
    request.email,
    { redirectTo },
  );
  let userId = inviteData?.user?.id ?? null;

  if (inviteErr || !userId) {
    // Email may already exist — fetch the existing user.
    const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    const existing = list?.users.find(
      (u) => (u.email ?? "").toLowerCase() === request.email.toLowerCase(),
    );
    if (existing) {
      userId = existing.id;
    } else {
      // Compensating delete of the tenant row we just inserted.
      await admin.from("tenants").delete().eq("id", tenant.id);
      return errorResponse("invite_email_failed", 500, cors);
    }
  }

  // 4. Insert the admin membership.
  const { error: memberErr } = await admin
    .from("tenant_members")
    .insert({ tenant_id: tenant.id, user_id: userId, role: "admin" });
  if (memberErr) {
    await admin.from("tenants").delete().eq("id", tenant.id);
    return errorResponse("member_insert_failed", 500, cors);
  }

  // 5. Mark the request approved.
  const { error: updateErr } = await admin
    .from("signup_requests")
    .update({
      status: "approved",
      approved_tenant_id: tenant.id,
      reviewed_by: guard.userId,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", request.id)
    .eq("status", "pending"); // optimistic lock
  if (updateErr) {
    // Tenant + member are created; the request update failed. Surface the error
    // but leave the side-effects so a manual SQL update can reconcile.
    return errorResponse("request_update_failed", 500, cors);
  }

  return jsonResponse(
    { tenant_id: tenant.id, slug: tenant.slug, granted_until: body.granted_until },
    { status: 200 },
    cors,
  );
});
