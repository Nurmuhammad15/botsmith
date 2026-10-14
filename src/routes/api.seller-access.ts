import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/seller-access")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleSellerAccess } = await import("@/server/bot-access.server");
        return handleSellerAccess(request);
      },
    },
  },
});
