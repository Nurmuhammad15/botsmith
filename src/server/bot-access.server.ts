/// <reference types="node" />
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const read = (name: string): string | undefined => {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
};

function json(body: Record<string, unknown>, status: number): Response {
  return Response.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

export async function handleSellerAccess(request: Request): Promise<Response> {
  const authorization = request.headers.get("authorization") ?? "";
  const match = /^Bearer (bsk_[a-f0-9]{64})$/.exec(authorization);
  if (!match) return json({ error: "unauthorized" }, 401);
  const apiKey = match[1];
  if (!apiKey) return json({ error: "unauthorized" }, 401);

  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > 4096) return json({ error: "request_too_large" }, 413);

  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    if (error instanceof SyntaxError) return json({ error: "invalid_json" }, 400);
    throw error;
  }
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return json({ error: "invalid_request" }, 400);
  }

  const buyerId = (body as Record<string, unknown>)["buyer_id"];
  if (
    typeof buyerId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(buyerId)
  ) {
    return json({ error: "invalid_buyer_id" }, 400);
  }

  const url = read("SUPABASE_URL") ?? import.meta.env["VITE_SUPABASE_URL"];
  const serviceKey = read("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) {
    console.error("Bot access API requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
    return json({ error: "service_unavailable" }, 503);
  }

  let client;
  try {
    client = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  } catch (error) {
    console.error("Could not create the bot access database client", error);
    return json({ error: "service_unavailable" }, 503);
  }

  const keyHash = createHash("sha256").update(apiKey).digest("hex");
  const { data, error } = await client.rpc("check_bot_subscription_access", {
    p_key_hash: keyHash,
    p_buyer: buyerId,
  });
  if (error) {
    console.error("Bot access API query failed", error);
    return json({ error: "internal_error" }, 500);
  }
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    console.error("Bot access API returned an invalid response");
    return json({ error: "internal_error" }, 500);
  }

  const result = data as Record<string, unknown>;
  if (result["error"] === "invalid_api_key") return json({ error: "unauthorized" }, 401);
  if (
    typeof result["active"] !== "boolean" ||
    (result["subscription_days"] !== null && typeof result["subscription_days"] !== "number") ||
    (result["expires_at"] !== null && typeof result["expires_at"] !== "string")
  ) {
    console.error("Bot access API returned an invalid access result");
    return json({ error: "internal_error" }, 500);
  }
  return json(
    {
      active: result["active"],
      subscription_days: result["subscription_days"],
      expires_at: result["expires_at"],
    },
    200,
  );
}
