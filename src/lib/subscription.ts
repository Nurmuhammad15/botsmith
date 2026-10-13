export const SUBSCRIPTION_TERMS_VERSION = "2026-10-11";
export const PLATFORM_SALES_COMMISSION_RATE = 0.08;
export const SUBSCRIPTION_DURATIONS = [1, 7, 30] as const;

export type SubscriptionDays = (typeof SUBSCRIPTION_DURATIONS)[number];

export function sellerSubscriptionNet(amount: number) {
  return amount - Math.round(amount * PLATFORM_SALES_COMMISSION_RATE);
}

/** Orders for bots without tariffs (one fixed price) are stored with 0 days. */
export const ONE_TIME_DAYS = 0;
export const subscriptionLabel = (days: number) =>
  days === ONE_TIME_DAYS ? "bir martalik" : `${days} kun`;
