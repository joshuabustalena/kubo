import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabaseUrl } from "./env";

/**
 * Service-role client. Bypasses RLS — use ONLY in server actions that have
 * already verified the caller is an admin, and only for Auth admin APIs
 * (creating staff accounts). Never import this from client code.
 */
export function createServiceClient() {
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SECRET_KEY is not set; staff account creation needs it.");
  return createClient(supabaseUrl(), key, { auth: { persistSession: false, autoRefreshToken: false } });
}
