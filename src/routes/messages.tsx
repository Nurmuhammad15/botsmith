import { createFileRoute } from "@tanstack/react-router";
import { Inbox } from "@/components/inbox";
import { DashboardLayout } from "@/components/site";
import { useMarketplaceAccount } from "@/lib/marketplace-auth-context";
import { navForAccount } from "@/lib/nav";

export const Route = createFileRoute("/messages")({
  validateSearch: (search: Record<string, unknown>): { c?: string | undefined } => ({
    c: typeof search["c"] === "string" && search["c"] ? search["c"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Xabarlar — BotSmith" },
      { name: "description", content: "Sotuvchilar va xaridorlar bilan yozishmalar." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Messages,
});

function Messages() {
  const account = useMarketplaceAccount();
  const { c: selectedId } = Route.useSearch();
  const { items, role } = navForAccount(account);
  return (
    <DashboardLayout user="" role={role} items={items}>
      <Inbox selectedId={selectedId} />
    </DashboardLayout>
  );
}
