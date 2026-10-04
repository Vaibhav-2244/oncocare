import { createClient } from "@supabase/supabase-js";

export function createServerSupabaseClient() {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL;

  const supabaseAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL in .env.local",
    );
  }

  if (!supabaseAnonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local",
    );
  }

  return createClient(
    supabaseUrl,
    supabaseAnonKey,
  );
}