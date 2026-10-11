import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// The database schema is not code-generated, so the client is deliberately untyped; api.ts maps
// every row into typed models.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any, "public", any>;

let client: Client | undefined;

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
