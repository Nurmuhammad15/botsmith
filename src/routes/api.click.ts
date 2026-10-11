import { createFileRoute } from "@tanstack/react-router";

// Click calls this URL for Prepare and Complete. Register  https://<your-domain>/api/click  as both
// the Prepare and Complete URL of the Click service. Server-only code is imported lazily so it
// never ships to the browser bundle.
export const Route = createFileRoute("/api/click")({
  server: {
    handlers: {
      ANY: async ({ request }) => {
        const { handleClick } = await import("@/server/payments/click.server");
        const { getClickConfig, getPaymentsStore } =
          await import("@/server/payments/config.server");
        return handleClick(request, { ...getClickConfig(), store: getPaymentsStore() });
      },
    },
  },
});
