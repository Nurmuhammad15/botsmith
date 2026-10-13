import { createFileRoute } from "@tanstack/react-router";
import { HelpPage } from "@/components/help-page";

export const Route = createFileRoute("/help")({
  head: () => ({
    meta: [
      { title: "Yordam — BotHub" },
      {
        name: "description",
        content: "Bot xarid qilish, sotish, buyurtmalar va pul yechish bo‘yicha savollar.",
      },
      { property: "og:title", content: "Yordam — BotHub" },
      {
        property: "og:description",
        content: "Bot xarid qilish, sotish, buyurtmalar va pul yechish bo‘yicha savollar.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HelpPage,
});
