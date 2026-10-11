import { lookup } from "node:dns/promises";
import { createHmac, timingSafeEqual } from "node:crypto";
import https from "node:https";
import { createClient } from "@supabase/supabase-js";

type Delivery = {
  id: string;
  event: string;
  payload: Record<string, unknown>;
  webhook_url: string;
  webhook_secret: string;
  attempts: number;
};

const env = (name: string) => process.env[name]?.trim();

function secureEqual(left: string, right: string) {
  const a = createHmac("sha256", "botsmith-cron-auth").update(left).digest();
  const b = createHmac("sha256", "botsmith-cron-auth").update(right).digest();
  return timingSafeEqual(a, b);
}

function isPublicAddress(address: string, family: number) {
  if (family === 4) {
    const octets = address.split(".").map(Number);
    if (
      octets.length !== 4 ||
      octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
    ) {
      return false;
    }
    const [a, b, c] = octets as [number, number, number, number];
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 0 || b === 168)) ||
      (a === 192 && b === 0 && c === 2) ||
      (a === 198 && (b === 18 || b === 19 || b === 51)) ||
      (a === 203 && b === 0 && c === 113) ||
      a >= 224
    );
  }

  if (family !== 6 || address.includes("%")) return false;
  const words = address.split(":");
  const first = Number.parseInt(words[0] || "0", 16);
  const second = Number.parseInt(words[1] || "0", 16);
  return first >= 0x2000 && first <= 0x3fff && !(first === 0x2001 && second === 0x0db8);
}

async function postSignedWebhook(delivery: Delivery) {
  const target = new URL(delivery.webhook_url);
  if (
    target.protocol !== "https:" ||
    target.username ||
    target.password ||
    (target.port && target.port !== "443") ||
    target.hostname.endsWith(".local")
  ) {
    throw new Error("webhook_url_not_allowed");
  }

  const addresses = await lookup(target.hostname, { all: true, verbatim: true });
  if (
    addresses.length === 0 ||
    addresses.some((entry) => !isPublicAddress(entry.address, entry.family))
  ) {
    throw new Error("webhook_host_not_public");
  }
  const address = addresses[0]!;
  const body = JSON.stringify(delivery.payload);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = createHmac("sha256", delivery.webhook_secret)
    .update(`${timestamp}.${body}`)
    .digest("hex");

  await new Promise<void>((resolve, reject) => {
    const request = https.request(
      target,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": Buffer.byteLength(body),
          "user-agent": "BotSmith-Webhooks/1.0",
          "x-botsmith-event": delivery.event,
          "x-botsmith-delivery": delivery.id,
          "x-botsmith-timestamp": timestamp,
          "x-botsmith-signature": `sha256=${signature}`,
        },
        lookup: (_hostname, _options, callback) => callback(null, address.address, address.family),
      },
      (response) => {
        response.resume();
        response.on("end", () => {
          if (response.statusCode && response.statusCode >= 200 && response.statusCode < 300) {
            resolve();
          } else {
            reject(new Error(`webhook_http_${response.statusCode ?? "unknown"}`));
          }
        });
      },
    );
    request.setTimeout(8_000, () => request.destroy(new Error("webhook_timeout")));
    request.on("error", reject);
    request.end(body);
  });
}

export async function runSubscriptionWebhookDelivery(request: Request) {
  const cronSecret = env("CRON_SECRET");
  if (!cronSecret) return Response.json({ error: "cron_not_configured" }, { status: 503 });
  const authorization = request.headers.get("authorization") ?? "";
  const supplied = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!supplied || !secureEqual(supplied, cronSecret)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = env("SUPABASE_URL") ?? env("VITE_SUPABASE_URL");
  const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey)
    return Response.json({ error: "database_not_configured" }, { status: 503 });

  const client = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const expired = await client.rpc("process_expired_subscriptions");
  if (expired.error) {
    console.error("Could not enqueue expired subscription events", expired.error.message);
    return Response.json({ error: "expiration_processing_failed" }, { status: 503 });
  }

  const claimed = await client.rpc("claim_subscription_webhooks", { p_limit: 20 });
  if (claimed.error) {
    console.error("Could not claim subscription webhooks", claimed.error.message);
    return Response.json({ error: "webhook_claim_failed" }, { status: 503 });
  }

  const deliveries = (claimed.data ?? []) as Delivery[];
  let delivered = 0;
  let failed = 0;
  let finalizationFailed = false;
  for (const delivery of deliveries) {
    let error: string | null = null;
    try {
      await postSignedWebhook(delivery);
      delivered++;
    } catch (cause) {
      error = cause instanceof Error ? cause.message : "webhook_delivery_failed";
      failed++;
      console.error("Subscription webhook delivery failed", delivery.id, error);
    }

    const finalized = await client.rpc("finish_subscription_webhook", {
      p_id: delivery.id,
      p_success: error === null,
      p_error: error,
    });
    if (finalized.error) {
      finalizationFailed = true;
      console.error(
        "Could not record subscription webhook result",
        delivery.id,
        finalized.error.message,
      );
    }
  }

  if (finalizationFailed) {
    return Response.json(
      { error: "webhook_result_recording_failed", delivered, failed },
      { status: 503 },
    );
  }
  return Response.json({ delivered, failed, expiredQueued: expired.data ?? 0 });
}
