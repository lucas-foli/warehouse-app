// src/services/joinRequests.ts
import { supabase } from "../lib/supabaseClient";
import { parseEdgeErrorCode } from "../utils/edgeErrors";

export type JoinRequestStatus = "pending" | "approved" | "declined";

export interface TenantJoinRequest {
  id: string;
  tenant_id: string;
  email: string;
  note: string | null;
  status: JoinRequestStatus;
  declined_reason: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  approved_invitation_id: string | null;
  created_at: string;
}

export interface SubmitJoinRequestInput {
  slug: string;
  email: string;
  note?: string;
}

export async function submitJoinRequest(
  input: SubmitJoinRequestInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data, error } = await supabase.functions.invoke("submit_join_request", {
    body: {
      slug: input.slug.trim().toLowerCase(),
      email: input.email.trim().toLowerCase(),
      note: input.note?.trim() || undefined,
    },
  });
  if (error) return { ok: false, error: (await parseEdgeErrorCode(error)) ?? error.message };
  if (data?.error) return { ok: false, error: data.error };
  return { ok: true };
}

export async function listJoinRequests(
  tenantId: string,
  status?: JoinRequestStatus,
): Promise<TenantJoinRequest[]> {
  let query = supabase
    .from("tenant_join_requests")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });
  if (status) query = query.eq("status", status);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as TenantJoinRequest[];
}

export async function approveJoinRequest(
  request_id: string,
): Promise<{ ok: true; invitation_id: string } | { ok: false; error: string }> {
  const { data, error } = await supabase.functions.invoke("approve_join_request", {
    body: { request_id },
  });
  if (error) return { ok: false, error: (await parseEdgeErrorCode(error)) ?? error.message };
  if (data?.error) return { ok: false, error: data.error };
  return { ok: true, invitation_id: data.invitation_id };
}

export async function declineJoinRequest(input: {
  request_id: string;
  reason: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data, error } = await supabase.functions.invoke("decline_join_request", {
    body: { request_id: input.request_id, reason: input.reason ?? undefined },
  });
  if (error) return { ok: false, error: (await parseEdgeErrorCode(error)) ?? error.message };
  if (data?.error) return { ok: false, error: data.error };
  return { ok: true };
}
