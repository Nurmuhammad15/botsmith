import { createFileRoute } from "@tanstack/react-router";

// The database posts push messages here (see supabase/migrations/0019_push_notifications.sql).
// Server-only code is imported lazily so it never ships to the browser bundle.
export const Route = createFileRoute("/api/push")({
  server: {
    handlers: {
      ANY: async ({ request }) => {
        const { handlePush } = await import("@/server/push.server");
        return handlePush(request);
      },
    },
  },
});
