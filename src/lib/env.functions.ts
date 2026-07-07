import { createServerFn } from "@tanstack/react-start";
import { getSupabaseUrl, getSupabasePublishableKey, getSupabaseServiceRoleKey } from "@/integrations/supabase/env";

export const checkServerEnv = createServerFn({ method: "GET" }).handler(async () => {
  const missing: string[] = [];
  const url = getSupabaseUrl();
  const publishable = getSupabasePublishableKey();
  const service = getSupabaseServiceRoleKey();

  if (!url) missing.push("SUPABASE_URL");
  if (!publishable) missing.push("SUPABASE_PUBLISHABLE_KEY");
  // service role key is optional for client reads but required for admin ops
  if (!service) missing.push("SUPABASE_SERVICE_ROLE_KEY");

  return {
    ok: missing.length === 0,
    missing,
  };
});
