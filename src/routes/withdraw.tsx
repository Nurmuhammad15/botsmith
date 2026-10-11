import { createFileRoute } from "@tanstack/react-router";
import { Withdrawal } from "@/components/seller-pages";
export const Route = createFileRoute("/withdraw")({
  head: () => ({
    meta: [
      { title: "Pul yechish — BotSmith" },
      { name: "description", content: "Balans va pul yechish so‘rovi." },
      { property: "og:title", content: "Pul yechish — BotSmith" },
      { property: "og:description", content: "Balans va pul yechish so‘rovi." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Withdrawal,
});
