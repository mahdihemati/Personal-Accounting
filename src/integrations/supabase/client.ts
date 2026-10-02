import { createClient } from "@supabase/supabase-js";

// Publishable values are safe to ship to the browser.
export const SUPABASE_URL = "https://fgzegazejfltnrgziztw.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_KTy5aq2VOLHF4P7N8tbJNw_uzt8sAXV";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: typeof window !== "undefined" ? window.localStorage : undefined,
    persistSession: typeof window !== "undefined",
    autoRefreshToken: typeof window !== "undefined",
  },
});
