// supabase/functions/_shared/authGuards.ts
import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export async function requireAuthenticatedUser(
  caller: SupabaseClient,
): Promise<{ userId: string; email: string } | { error: string }> {
  const { data, error } = await caller.auth.getUser();
  if (error || !data.user) return { error: "not_authenticated" };
  return { userId: data.user.id, email: data.user.email ?? "" };
}

export async function requirePlatformAdmin(
  caller: SupabaseClient,
): Promise<{ userId: string } | { error: string }> {
  const auth = await requireAuthenticatedUser(caller);
  if ("error" in auth) return auth;
  const { data, error } = await caller
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", auth.userId)
    .maybeSingle();
  if (error) return { error: "auth_check_failed" };
  if (!data) return { error: "not_platform_admin" };
  return { userId: auth.userId };
}

export async function requireTenantAdmin(
  caller: SupabaseClient,
  tenantId: string,
): Promise<{ userId: string } | { error: string }> {
  const auth = await requireAuthenticatedUser(caller);
  if ("error" in auth) return auth;
  // is_tenant_admin() reads auth.uid(), so the caller-scoped client honors RLS.
  const { data, error } = await caller.rpc("is_tenant_admin", {
    target_tenant_id: tenantId,
  });
  if (error) return { error: "auth_check_failed" };
  if (!data) return { error: "not_tenant_admin" };
  return { userId: auth.userId };
}
