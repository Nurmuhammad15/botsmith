// Client-side helpers for sending a buyer to the Payme / Click payment page. Only public
// identifiers are used here; the secrets live on the server (src/server/payments).
export type PaymentMethod = "payme" | "click";

export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  payme: "Payme",
  click: "Click",
};

export type PaymentSettings = {
  paymeMerchantId?: string | undefined;
  /** https://checkout.paycom.uz in production, https://test.paycom.uz in the sandbox. */
  paymeCheckoutUrl?: string | undefined;
  clickServiceId?: string | undefined;
  clickMerchantId?: string | undefined;
};

const env = import.meta.env;
const clean = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

export const paymentSettings: PaymentSettings = {
  paymeMerchantId: clean(env["VITE_PAYME_MERCHANT_ID"]),
  paymeCheckoutUrl: clean(env["VITE_PAYME_CHECKOUT_URL"]),
  clickServiceId: clean(env["VITE_CLICK_SERVICE_ID"]),
  clickMerchantId: clean(env["VITE_CLICK_MERCHANT_ID"]),
};

/** Methods that are configured for this deployment (empty until merchant IDs are provided). */
export function availablePaymentMethods(settings: PaymentSettings = paymentSettings) {
  const methods: PaymentMethod[] = [];
  if (settings.paymeMerchantId) methods.push("payme");
  if (settings.clickServiceId && settings.clickMerchantId) methods.push("click");
  return methods;
}

/**
 * Payme checkout link: the parameters are joined as `key=value;…`, Base64-encoded and appended to
 * the checkout URL. `a` is in tiyin. https://developer.help.paycom.uz/initsializatsiya-platezhey
 */
export function buildPaymeUrl(options: {
  merchantId: string;
  orderId: string;
  amountTiyin: number;
  checkoutUrl?: string | undefined;
  returnUrl?: string | undefined;
  lang?: "uz" | "ru" | "en" | undefined;
}) {
  const parts = [
    `m=${options.merchantId}`,
    `ac.order_id=${options.orderId}`,
    `a=${options.amountTiyin}`,
    ...(options.lang ? [`l=${options.lang}`] : []),
    ...(options.returnUrl ? [`c=${options.returnUrl}`] : []),
  ];
  const base = (options.checkoutUrl ?? "https://checkout.paycom.uz").replace(/\/+$/, "");
  return `${base}/${btoa(parts.join(";"))}`;
}

/** Click payment link; `amount` is in so'm and must be written with two decimals. */
export function buildClickUrl(options: {
  serviceId: string;
  merchantId: string;
  orderId: string;
  amount: number;
  returnUrl?: string | undefined;
}) {
  const query = new URLSearchParams({
    service_id: options.serviceId,
    merchant_id: options.merchantId,
    amount: options.amount.toFixed(2),
    transaction_param: options.orderId,
    ...(options.returnUrl ? { return_url: options.returnUrl } : {}),
  });
  return `https://my.click.uz/services/pay?${query}`;
}

/** The payment page URL for an order, or null if that method is not configured. */
export function paymentUrl(
  method: PaymentMethod,
  order: { id: string; amount: number },
  returnUrl: string,
  settings: PaymentSettings = paymentSettings,
) {
  if (method === "payme" && settings.paymeMerchantId) {
    return buildPaymeUrl({
      merchantId: settings.paymeMerchantId,
      checkoutUrl: settings.paymeCheckoutUrl,
      orderId: order.id,
      amountTiyin: order.amount * 100,
      returnUrl,
      lang: "uz",
    });
  }
  if (method === "click" && settings.clickServiceId && settings.clickMerchantId) {
    return buildClickUrl({
      serviceId: settings.clickServiceId,
      merchantId: settings.clickMerchantId,
      orderId: order.id,
      amount: order.amount,
      returnUrl,
    });
  }
  return null;
}
