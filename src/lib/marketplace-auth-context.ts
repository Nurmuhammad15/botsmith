import { createContext, useContext } from "react";

export type AccountRole = "buyer" | "seller" | "admin";

export type MarketplaceAccount = {
  id: string;
  email: string;
  name: string;
  role: AccountRole;
  isSeller: boolean;
  isAdmin: boolean;
};

type MarketplaceAuthState = {
  account: MarketplaceAccount | null;
  ready: boolean;
};

export const MarketplaceAccountContext = createContext<MarketplaceAuthState>({
  account: null,
  ready: true,
});

export function useMarketplaceAccount() {
  return useContext(MarketplaceAccountContext).account;
}

export function useMarketplaceAuth() {
  return useContext(MarketplaceAccountContext);
}
