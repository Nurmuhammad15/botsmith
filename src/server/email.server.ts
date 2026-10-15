/// <reference types="node" />
// Sends e-mails in the name of the site (through Resend). Called only by the database (pg_net)
// through /api/email, with the shared secret in the `x-push-secret` header (the same secret as
// /api/push). The Resend API key never leaves the server.
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

function secretMatches(given: string | null, expected: string) {
  if (!given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const SITE = "https://bothub.work";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Message = { to: string; title: string; body: string; link: string | null };

function render(message: Message) {
  const url = message.link ? SITE + message.link : SITE;
  const title = escapeHtml(message.title);
  const body = escapeHtml(message.body).replace(/\n/g, "<br>");
  const html = `<!doctype html><html><body style="margin:0;background:#f4f6fb;font-family:Arial,Helvetica,sans-serif;color:#111827">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" style="max-width:520px;background:#ffffff;border-radius:12px;padding:28px" cellpadding="0" cellspacing="0">
<tr><td style="font-size:18px;font-weight:700;color:#2563eb;padding-bottom:16px">BotHub</td></tr>
<tr><td style="font-size:18px;font-weight:700;padding-bottom:12px">${title}</td></tr>
<tr><td style="font-size:15px;line-height:1.55;padding-bottom:24px">${body}</td></tr>
<tr><td><a href="${escapeHtml(url)}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-size:15px;font-weight:600">BotHub&rsquo;ni ochish</a></td></tr>
</table>
<p style="font-size:12px;color:#6b7280;margin:16px 0 0">Bu xabar bothub.work saytidan yuborildi.</p>
</td></tr></table></body></html>`;
  const text = `${message.title}\n\n${message.body}\n\n${url}`;
  return { html, text };
}

export async function handleEmail(request: Request) {
  if (request.method !== "POST") return json(405, { error: "method_not_allowed" });

  const secret = read("PUSH_SECRET");
  const apiKey = read("RESEND_API_KEY");
  if (!secret || !apiKey) return json(503, { error: "email_not_configured" });
  if (!secretMatches(request.headers.get("x-push-secret"), secret)) {
    return json(401, { error: "unauthorized" });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json(400, { error: "invalid_json" });
  }
  const raw = Array.isArray(body["messages"]) ? body["messages"] : [];
  const messages: Message[] = raw
    .map((m): Message | null => {
      if (!m || typeof m !== "object") return null;
      const { to, title, body: text, link } = m as Record<string, unknown>;
      if (typeof to !== "string" || !EMAIL_RE.test(to) || to.length > 254) return null;
      if (typeof title !== "string" || typeof text !== "string") return null;
      return {
        to,
        title: title.slice(0, 120),
        body: text.slice(0, 1000),
        link: typeof link === "string" && link.startsWith("/") ? link.slice(0, 200) : null,
      };
    })
    .filter((m): m is Message => m !== null)
    .slice(0, 500);

  const from = read("EMAIL_FROM") ?? "BotHub <noreply@bothub.work>";
  let sent = 0;
  let failed = 0;
  const errors: string[] = [];

  // Resend's batch endpoint takes up to 100 messages per request.
  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100);
    try {
      const response = await fetch("https://api.resend.com/emails/batch", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(
          chunk.map((m) => {
            const { html, text } = render(m);
            return { from, to: [m.to], subject: m.title, html, text };
          }),
        ),
      });
      if (response.ok) {
        sent += chunk.length;
      } else {
        failed += chunk.length;
        const detail = await response.text().catch(() => "");
        errors.push(`${response.status} ${detail.slice(0, 200)}`);
        console.error("Resend rejected the batch", response.status, detail.slice(0, 500));
      }
    } catch (error) {
      failed += chunk.length;
      errors.push("network_error");
      console.error("Resend request failed", error);
    }
  }
  return json(200, { sent, failed, errors });
}
