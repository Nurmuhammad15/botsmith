import { createFileRoute } from "@tanstack/react-router";

// The database posts e-mail messages here (see supabase/migrations/0037_notification_email.sql).
// Server-only code is imported lazily so it never ships to the browser bundle.
export const Route = createFileRoute("/api/email")({
  server: {
    handlers: {
      ANY: async ({ request }) => {
        const { handleEmail } = await import("@/server/email.server");
        return handleEmail(request);
      },
    },
  },
});
