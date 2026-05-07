// src/services/platformAdmin.ts
import { supabase } from "../lib/supabaseClient";

export async function checkIsPlatformAdmin(userId: string | null): Promise<boolean> {
  if (!userId) return false;
  const { data, error } = await supabase
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return false;
  return !!data;
}
