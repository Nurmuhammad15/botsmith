/// <reference types="node" />
// sitemap.xml for search engines: the public pages plus every published bot.
import { createClient } from "@supabase/supabase-js";

const SITE = "https://bothub.work";

const STATIC_PAGES: { path: string; priority: string }[] = [
  { path: "/", priority: "1.0" },
  { path: "/bots", priority: "0.9" },
  { path: "/how-it-works", priority: "0.6" },
  { path: "/help", priority: "0.5" },
  { path: "/terms", priority: "0.3" },
  { path: "/register", priority: "0.4" },
  { path: "/login", priority: "0.3" },
];

const escapeXml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export async function handleSitemap(): Promise<Response> {
  const entries = STATIC_PAGES.map(
    (page) => `<url><loc>${SITE}${page.path}</loc><priority>${page.priority}</priority></url>`,
  );

  const url = process.env["SUPABASE_URL"]?.trim() || import.meta.env["VITE_SUPABASE_URL"];
  const anonKey = import.meta.env["VITE_SUPABASE_ANON_KEY"];
  if (url && anonKey) {
    try {
      const client = createClient(url, anonKey, { auth: { persistSession: false } });
      const { data } = await client
        .from("bots_public")
        .select("id, created_at")
        .order("created_at", { ascending: false })
        .limit(5000);
      for (const bot of data ?? []) {
        const id = String(bot.id);
        if (!/^[0-9a-f-]{36}$/i.test(id)) continue;
        const lastmod = bot.created_at ? new Date(String(bot.created_at)).toISOString() : "";
        entries.push(
          `<url><loc>${escapeXml(`${SITE}/bots/${id}`)}</loc>${
            lastmod ? `<lastmod>${lastmod}</lastmod>` : ""
          }<priority>0.7</priority></url>`,
        );
      }
    } catch (error) {
      // The static pages are still worth serving.
      console.error("Sitemap: could not load the bots", error);
    }
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries.join("")}</urlset>`;
  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
