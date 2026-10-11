import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/subscription-webhooks")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { runSubscriptionWebhookDelivery } =
          await import("@/server/subscription-webhooks.server");
        return runSubscriptionWebhookDelivery(request);
      },
    },
  },
});
