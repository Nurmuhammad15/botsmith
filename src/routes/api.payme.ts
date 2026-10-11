import { createFileRoute } from "@tanstack/react-router";

// Payme Business calls this URL (Merchant API). Register  https://<your-domain>/api/payme  as the
// endpoint of the web cash desk. Server-only code is imported lazily so it never ships to the
// browser bundle.
export const Route = createFileRoute("/api/payme")({
  server: {
    handlers: {
      ANY: async ({ request }) => {
        const { handlePayme } = await import("@/server/payments/payme.server");
        const { getPaymeConfig, getPaymentsStore } =
          await import("@/server/payments/config.server");
        return handlePayme(request, { ...getPaymeConfig(), store: getPaymentsStore() });
      },
    },
  },
});
