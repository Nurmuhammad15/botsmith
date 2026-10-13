import { createFileRoute } from "@tanstack/react-router";
import { SellerEarnings } from "@/components/seller-pages";
export const Route = createFileRoute("/seller-earnings")({
  head: () => ({
    meta: [
      { title: "Daromadlar — BotHub" },
      { name: "description", content: "Botlar savdosi, balans va sotuvlar tarixi." },
      { property: "og:title", content: "Daromadlar — BotHub" },
      { property: "og:description", content: "Botlar savdosi, balans va sotuvlar tarixi." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SellerEarnings,
});
