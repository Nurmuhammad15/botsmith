import { createFileRoute } from "@tanstack/react-router";

// Sitemap for search engines (referenced from public/robots.txt). Server-only code is imported
// lazily so it never ships to the browser bundle.
export const Route = createFileRoute("/api/sitemap")({
  server: {
    handlers: {
      GET: async () => {
        const { handleSitemap } = await import("@/server/sitemap.server");
        return handleSitemap();
      },
    },
  },
});
