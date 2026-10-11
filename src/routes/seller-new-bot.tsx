import { createFileRoute } from "@tanstack/react-router";
import { SellerNewBot } from "@/components/seller-pages";
export const Route = createFileRoute("/seller-new-bot")({
  head: () => ({
    meta: [
      { title: "Yangi bot qo‘shish — BotSmith" },
      { name: "description", content: "Bot nomi, kategoriya, narx va tavsifini kiriting." },
      { property: "og:title", content: "Yangi bot qo‘shish — BotSmith" },
      { property: "og:description", content: "Bot nomi, kategoriya, narx va tavsifini kiriting." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SellerNewBot,
});
