import { createClient } from "@supabase/supabase-js";

let client: ReturnType<typeof createClient> | undefined;

export function isSupabaseConfigured() {
  const url = import.meta.env["VITE_SUPABASE_URL"];
  const anonKey = import.meta.env["VITE_SUPABASE_ANON_KEY"];
  return Boolean(url && anonKey);
}

export function getSupabaseClient() {
  const url = import.meta.env["VITE_SUPABASE_URL"];
  const anonKey = import.meta.env["VITE_SUPABASE_ANON_KEY"];

  if (!url || !anonKey) {
    throw new Error(
      "Supabase sozlanmagan. .env.local fayliga VITE_SUPABASE_URL va VITE_SUPABASE_ANON_KEY qiymatlarini kiriting.",
    );
  }

  client ??= createClient(url, anonKey);
  return client;
}
