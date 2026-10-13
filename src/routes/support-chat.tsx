import { createFileRoute } from "@tanstack/react-router";
import { SupportChat } from "@/components/support-chat";

export const Route = createFileRoute("/support-chat")({
  head: () => ({
    meta: [
      { title: "Yordam chati — BotHub" },
      { name: "description", content: "BotHub qo‘llab-quvvatlash xizmati bilan chat." },
      { property: "og:title", content: "Yordam chati — BotHub" },
      { property: "og:description", content: "BotHub qo‘llab-quvvatlash xizmati bilan chat." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SupportChat,
});
