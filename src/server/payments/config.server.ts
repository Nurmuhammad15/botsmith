/// <reference types="node" />
// Reads payment settings from the server environment. Nothing here may ever reach the browser:
// the service-role key can bypass every row-level security policy.
import { createClient } from "@supabase/supabase-js";
import type { FiscalConfig } from "./payme.server";
import { createPaymentsStore } from "./store.server";
import type { PaymentsStore } from "./types";

const read = (name: string): string | undefined => {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
};

/** Store that talks to Supabase as the service role, or null when it is not configured. */
export function getPaymentsStore(): PaymentsStore | null {
  const url = read("SUPABASE_URL") ?? import.meta.env["VITE_SUPABASE_URL"];
  const serviceKey = read("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return null;
  const client = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return createPaymentsStore(client);
}

export function getPaymeConfig() {
  const key = read("PAYME_KEY");
  const code = read("PAYME_IKPU");
  const packageCode = read("PAYME_PACKAGE_CODE");
  const vat = read("PAYME_VAT_PERCENT");
  const fiscal: FiscalConfig | undefined =
    code && packageCode && vat !== undefined && Number.isFinite(Number(vat))
      ? { code, packageCode, vatPercent: Number(vat) }
      : undefined;
  return { key, fiscal };
}

export function getClickConfig() {
  return { secretKey: read("CLICK_SECRET_KEY"), serviceId: read("CLICK_SERVICE_ID") };
}
