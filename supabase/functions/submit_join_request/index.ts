// supabase/functions/submit_join_request/index.ts
//
// Anon-callable. A visitor on <slug>.warehouse.go-fly.ai/request-access submits
// { slug, email, note? }. This function resolves the slug → tenant_id with the
// service role (the table has no anon INSERT policy by design) and inserts a
// pending row.
//
// Anti-enumeration: when the slug doesn't resolve OR the tenant has
// accept_join_requests = false, the response is still { ok: true }. Slugs are
// already enumerable via branded login pages, but the *acceptance* state isn't,
// and we don't want this endpoint to become an oracle for it.
//
// Idempotent: re-submitting while a pending row already exists returns ok.
import { getCorsHeaders } from "../_shared/cors.ts";
import { errorResponse, jsonResponse } from "../_shared/json.ts";
import { createAdminClient } from "../_shared/supabaseAdmin.ts";

interface Body {
  slug: string;
  email: string;
  note?: string;
}

const EMAIL_RE = /.+@.+\..+/;
const SLUG_RE = /^[a-z0-9-]{1,32}$/;
const NOTE_MAX = 1000;

Deno.serve(async (req: Request) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return errorResponse("method_not_allowed", 405, cors);

  let body: Body;
  try { body = await req.json(); } catch { return errorResponse("invalid_json", 400, cors); }

  const slug = (body.slug ?? "").trim().toLowerCase();
  const email = (body.email ?? "").trim().toLowerCase();
  const note = (body.note ?? "").trim();

  if (!slug || !SLUG_RE.test(slug)) return errorResponse("invalid_slug", 400, cors);
  if (!email || !EMAIL_RE.test(email)) return errorResponse("invalid_email", 400, cors);
  if (note.length > NOTE_MAX) return errorResponse("note_too_long", 400, cors);

  const admin = createAdminClient();

  const { data: tenant, error: tenantErr } = await admin
    .from("tenants")
    .select("id, accept_join_requests")
    .eq("slug", slug)
    .maybeSingle();
  if (tenantErr) return errorResponse("lookup_failed", 500, cors);

  // Anti-enumeration: same response shape whether the slug exists or not, or
  // whether the tenant accepts requests.
  if (!tenant || !tenant.accept_join_requests) {
    return jsonResponse({ ok: true }, { status: 200 }, cors);
  }

  // Idempotent: a pending row already exists → return ok.
  const { data: existing } = await admin
    .from("tenant_join_requests")
    .select("id")
    .eq("tenant_id", tenant.id)
    .ilike("email", email)
    .eq("status", "pending")
    .maybeSingle();
  if (existing) {
    return jsonResponse({ ok: true }, { status: 200 }, cors);
  }

  const { error: insertErr } = await admin
    .from("tenant_join_requests")
    .insert({
      tenant_id: tenant.id,
      email,
      note: note || null,
    });
  if (insertErr) {
    if (insertErr.code === "23505") {
      // Raced another submission for the same (tenant, email) pending row.
      return jsonResponse({ ok: true }, { status: 200 }, cors);
    }
    return errorResponse("insert_failed", 500, cors);
  }

  return jsonResponse({ ok: true }, { status: 200 }, cors);
});
