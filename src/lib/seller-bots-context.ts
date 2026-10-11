import { createContext, useContext } from "react";
import type { BotItem } from "@/lib/data";

export type AddedSellerBot = {
  bot: BotItem;
  status: "pending";
  views: number;
};

export type NewSellerBotInput = {
  title: string;
  category: string;
  price: number;
  desc: string;
};

export type SellerBotsContextValue = {
  addedBots: AddedSellerBot[];
  addBot: (input: NewSellerBotInput) => void;
};

export const SellerBotsContext = createContext<SellerBotsContextValue | null>(null);

export function useSellerBots() {
  const context = useContext(SellerBotsContext);
  if (!context) {
    throw new Error("useSellerBots must be used within SellerBotsProvider");
  }
  return context;
}
