import { createFileRoute } from "@tanstack/react-router";
import { SellerProfile } from "@/components/seller-pages";
export const Route = createFileRoute("/seller-profile")({
  head: () => ({
    meta: [
      { title: "Sotuvchi profili — BotHub" },
      { name: "description", content: "Sotuvchi profil ma’lumotlari." },
      { property: "og:title", content: "Sotuvchi profili — BotHub" },
      { property: "og:description", content: "Sotuvchi profil ma’lumotlari." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SellerProfile,
});
