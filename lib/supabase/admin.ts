import "server-only";

import { createClient } from "@supabase/supabase-js";

export function createSupabaseAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    const missingVariables = [
      !supabaseUrl && "NEXT_PUBLIC_SUPABASE_URL",
      !serviceRoleKey && "SUPABASE_SERVICE_ROLE_KEY",
    ].filter((variable): variable is string => Boolean(variable));
    throw new Error(
      `Missing server-only Supabase environment variable${missingVariables.length === 1 ? "" : "s"}: ` +
        `${missingVariables.join(", ")}. Configure ${missingVariables.join(" and ")} in the server runtime environment.`,
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}