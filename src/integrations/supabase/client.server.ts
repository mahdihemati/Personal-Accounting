import { createClient } from "@supabase/supabase-js";

// Server-only admin client. Bypasses RLS — use only for privileged work.
export function getSupabaseAdmin() {
  const url = process.env["EXT_DB_URL"];
  const key = process.env["EXT_DB_SERVICE_ROLE_KEY"];
  if (!url || !key) throw new Error("Database server credentials are missing");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
