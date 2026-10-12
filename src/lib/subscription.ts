export const SUBSCRIPTION_TERMS_VERSION = "2026-10-11";
export const PLATFORM_SALES_COMMISSION_RATE = 0.05;
export const SUBSCRIPTION_DURATIONS = [1, 7, 30] as const;

export type SubscriptionDays = (typeof SUBSCRIPTION_DURATIONS)[number];

export function sellerSubscriptionNet(amount: number) {
  return amount - Math.round(amount * PLATFORM_SALES_COMMISSION_RATE);
}
