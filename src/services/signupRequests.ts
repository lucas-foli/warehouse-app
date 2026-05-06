// src/services/signupRequests.ts
import { supabase } from "../lib/supabaseClient";

export type SignupRequestStatus = "pending" | "approved" | "declined";

export interface SignupRequest {
  id: string;
  email: string;
  workspace_name: string;
  use_case: string | null;
  referral_source: string | null;
  status: SignupRequestStatus;
  declined_reason: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  approved_tenant_id: string | null;
  created_at: string;
}

export interface SubmitSignupRequestInput {
  email: string;
  workspace_name: string;
  use_case?: string;
  referral_source?: string;
}

export async function submitSignupRequest(
  input: SubmitSignupRequestInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.from("signup_requests").insert({
    email: input.email.trim().toLowerCase(),
    workspace_name: input.workspace_name.trim(),
    use_case: input.use_case?.trim() || null,
    referral_source: input.referral_source || null,
  });
  if (error) {
    if (error.code === "23505") return { ok: false, error: "already_pending" };
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function listSignupRequests(
  status?: SignupRequestStatus,
): Promise<SignupRequest[]> {
  let query = supabase
    .from("signup_requests")
    .select("*")
    .order("created_at", { ascending: false });
  if (status) query = query.eq("status", status);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as SignupRequest[];
}

export async function approveSignupRequest(input: {
  request_id: string;
  slug: string;
  granted_until: string | null;
}): Promise<{ ok: true; tenant_id: string } | { ok: false; error: string }> {
  const { data, error } = await supabase.functions.invoke("approve_signup_request", {
    body: input,
  });
  if (error) return { ok: false, error: error.message };
  if (data?.error) return { ok: false, error: data.error };
  return { ok: true, tenant_id: data.tenant_id };
}

export async function declineSignupRequest(input: {
  request_id: string;
  reason: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data, error } = await supabase.functions.invoke("decline_signup_request", {
    body: input,
  });
  if (error) return { ok: false, error: error.message };
  if (data?.error) return { ok: false, error: data.error };
  return { ok: true };
}
