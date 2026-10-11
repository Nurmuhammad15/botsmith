import { useState, type ReactNode } from "react";
import { Bot } from "lucide-react";
import type { BotItem } from "@/lib/data";
import { SellerBotsContext, type NewSellerBotInput } from "@/lib/seller-bots-context";

export function SellerBotsProvider({ children }: { children: ReactNode }) {
  const [addedBots, setAddedBots] = useState<{ bot: BotItem; status: "pending"; views: number }[]>(
    [],
  );

  function addBot(input: NewSellerBotInput) {
    const bot: BotItem = {
      id: `demo-${crypto.randomUUID()}`,
      title: input.title.trim(),
      desc: input.desc.trim(),
      price: input.price,
      rating: 0,
      reviews: 0,
      category: input.category,
      icon: Bot,
      seller: "@dev_uz",
      lang: ["uz", "ru"],
      delivery: 1,
      sales: 0,
      views: 0,
    };
    setAddedBots((current) => [{ bot, status: "pending", views: 0 }, ...current]);
  }

  return (
    <SellerBotsContext.Provider value={{ addedBots, addBot }}>
      {children}
    </SellerBotsContext.Provider>
  );
}
