// src/services/invitations.ts
import { supabase } from "../lib/supabaseClient";

export interface TenantInvitation {
  id: string;
  tenant_id: string;
  email: string;
  role: "admin" | "member";
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
  invited_by: string | null;
  created_at: string;
}

export interface TenantMember {
  tenant_id: string;
  user_id: string;
  role: "admin" | "member";
  email: string | null;
  created_at: string;
}

export async function listInvitations(tenantId: string): Promise<TenantInvitation[]> {
  const { data, error } = await supabase
    .from("tenant_invitations")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as TenantInvitation[];
}

// Note: emails come from a Postgres view that joins tenant_members with auth.users.
// If that view doesn't exist yet, returns rows without email — UI handles null.
export async function listMembers(tenantId: string): Promise<TenantMember[]> {
  const { data, error } = await supabase
    .from("tenant_members_with_email")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: true });
  if (error) {
    // Fallback: read tenant_members without email if the view doesn't exist.
    const { data: fallback } = await supabase
      .from("tenant_members")
      .select("tenant_id, user_id, role, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: true });
    return ((fallback ?? []) as Omit<TenantMember, "email">[]).map((r) => ({ ...r, email: null }));
  }
  return (data ?? []) as TenantMember[];
}

export async function createInvitation(input: {
  tenant_id: string;
  email: string;
  role: "admin" | "member";
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data, error } = await supabase.functions.invoke("create_tenant_invitation", { body: input });
  if (error) return { ok: false, error: error.message };
  if (data?.error) return { ok: false, error: data.error };
  return { ok: true };
}

export async function acceptInvitation(token: string):
  Promise<{ ok: true; tenant_id: string; role: string } | { ok: false; error: string }> {
  const { data, error } = await supabase.functions.invoke("accept_tenant_invitation", { body: { token } });
  if (error) return { ok: false, error: error.message };
  if (data?.error) return { ok: false, error: data.error };
  return { ok: true, tenant_id: data.tenant_id, role: data.role };
}

export async function resendInvitation(invitation_id: string):
  Promise<{ ok: true } | { ok: false; error: string }> {
  const { data, error } = await supabase.functions.invoke("resend_tenant_invitation", { body: { invitation_id } });
  if (error) return { ok: false, error: error.message };
  if (data?.error) return { ok: false, error: data.error };
  return { ok: true };
}

export async function revokeInvitation(invitation_id: string):
  Promise<{ ok: true } | { ok: false; error: string }> {
  const { data, error } = await supabase.functions.invoke("revoke_tenant_invitation", { body: { invitation_id } });
  if (error) return { ok: false, error: error.message };
  if (data?.error) return { ok: false, error: data.error };
  return { ok: true };
}
