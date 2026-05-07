// supabase/functions/_shared/supabaseAdmin.ts
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// Service-role client — bypasses RLS. Use only in Edge Functions.
export function createAdminClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) {
    throw new Error("missing_supabase_env");
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// Caller-scoped client — uses the JWT in the request's Authorization header.
// Use this to verify who is calling (auth.uid(), is_tenant_admin(), is_platform_admin()).
export function createCallerClient(req: Request): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !anonKey) {
    throw new Error("missing_supabase_env");
  }
  const authHeader = req.headers.get("Authorization") ?? "";
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authHeader } },
  });
}
