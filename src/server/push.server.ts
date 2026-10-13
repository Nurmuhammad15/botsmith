/// <reference types="node" />
// Delivers a Web Push message. Called only by the database (pg_net) through /api/push, with the
// shared secret in the `x-push-secret` header. The VAPID private key never leaves the server.
import { timingSafeEqual } from "node:crypto";

const read = (name: string): string | undefined => {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

// Only the push services browsers use; the database already controls the endpoint list, this is
// defence in depth against the endpoint being turned into a request relay.
const PUSH_HOSTS = [
  "fcm.googleapis.com",
  ".push.services.mozilla.com",
  ".notify.windows.com",
  ".push.apple.com",
];

const allowedEndpoint = (value: unknown): value is string => {
  if (typeof value !== "string" || value.length > 1000) return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      PUSH_HOSTS.some((host) =>
        host.startsWith(".") ? url.hostname.endsWith(host) : url.hostname === host,
      )
    );
  } catch {
    return false;
  }
};

function secretMatches(given: string | null, expected: string) {
  if (!given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

type Subscription = { endpoint: string; keys: { p256dh: string; auth: string } };

export async function handlePush(request: Request) {
  if (request.method !== "POST") return json(405, { error: "method_not_allowed" });

  const secret = read("PUSH_SECRET");
  const publicKey = read("VAPID_PUBLIC_KEY");
  const privateKey = read("VAPID_PRIVATE_KEY");
  if (!secret || !publicKey || !privateKey) return json(503, { error: "push_not_configured" });
  if (!secretMatches(request.headers.get("x-push-secret"), secret)) {
    return json(401, { error: "unauthorized" });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json(400, { error: "invalid_json" });
  }
  const title = typeof body["title"] === "string" ? body["title"].slice(0, 80) : "BotHub";
  const text = typeof body["body"] === "string" ? body["body"].slice(0, 200) : "";
  const url = typeof body["url"] === "string" && body["url"].startsWith("/") ? body["url"] : "/";
  const list = Array.isArray(body["subscriptions"]) ? body["subscriptions"].slice(0, 20) : [];
  const subscriptions = list.filter(
    (s): s is Subscription =>
      Boolean(s) &&
      allowedEndpoint((s as Subscription).endpoint) &&
      typeof (s as Subscription).keys?.p256dh === "string" &&
      typeof (s as Subscription).keys?.auth === "string",
  );

  const { default: webpush } = await import("web-push");
  webpush.setVapidDetails(
    read("VAPID_SUBJECT") ?? "mailto:admin@bothub.work",
    publicKey,
    privateKey,
  );
  const payload = JSON.stringify({ title, body: text, url });
  const results = await Promise.allSettled(
    subscriptions.map((s) => webpush.sendNotification(s, payload, { TTL: 3600 })),
  );
  const sent = results.filter((r) => r.status === "fulfilled").length;
  return json(200, { sent, failed: results.length - sent });
}
