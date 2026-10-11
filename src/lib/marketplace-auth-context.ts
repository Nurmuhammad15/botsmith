import { createContext, useContext } from "react";

export type MarketplaceAccount = {
  email: string;
  name: string;
  isSeller: boolean;
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
