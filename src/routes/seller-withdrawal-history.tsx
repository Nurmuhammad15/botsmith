import { createFileRoute } from "@tanstack/react-router";
import { SellerWithdrawalHistory } from "@/components/seller-pages";

export const Route = createFileRoute("/seller-withdrawal-history")({
  head: () => ({
    meta: [
      { title: "Pul yechish tarixi — BotSmith" },
      { name: "description", content: "Sotuvchining pul yechish so‘rovlari tarixi." },
      { property: "og:title", content: "Pul yechish tarixi — BotSmith" },
      { property: "og:description", content: "Sotuvchining pul yechish so‘rovlari tarixi." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SellerWithdrawalHistory,
});
