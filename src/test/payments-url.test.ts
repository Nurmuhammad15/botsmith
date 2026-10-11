import { describe, expect, it } from "vitest";
import {
  availablePaymentMethods,
  buildClickUrl,
  buildPaymeUrl,
  paymentUrl,
  type PaymentSettings,
} from "@/lib/payments";

describe("buildPaymeUrl", () => {
  it("reproduces the example from Payme's documentation exactly", () => {
    // https://developer.help.paycom.uz/initsializatsiya-platezhey/otpravka-cheka-po-metodu-get
    expect(
      buildPaymeUrl({
        merchantId: "587f72c72cac0d162c722ae2",
        orderId: "197",
        amountTiyin: 500,
      }),
    ).toBe(
      "https://checkout.paycom.uz/bT01ODdmNzJjNzJjYWMwZDE2MmM3MjJhZTI7YWMub3JkZXJfaWQ9MTk3O2E9NTAw",
    );
  });

  it("encodes optional language and return URL and supports the sandbox host", () => {
    const url = buildPaymeUrl({
      merchantId: "m1",
      orderId: "o1",
      amountTiyin: 1000,
      lang: "uz",
      returnUrl: "https://shop.uz/back",
      checkoutUrl: "https://test.paycom.uz/",
    });
    expect(url.startsWith("https://test.paycom.uz/")).toBe(true);
    expect(atob(url.slice("https://test.paycom.uz/".length))).toBe(
      "m=m1;ac.order_id=o1;a=1000;l=uz;c=https://shop.uz/back",
    );
  });
});

describe("buildClickUrl", () => {
  it("writes the amount with two decimals and carries the order as transaction_param", () => {
    const url = new URL(
      buildClickUrl({
        serviceId: "111",
        merchantId: "222",
        orderId: "order-uuid",
        amount: 450000,
        returnUrl: "https://shop.uz/dashboard/purchases?pay=click",
      }),
    );
    expect(url.origin + url.pathname).toBe("https://my.click.uz/services/pay");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      service_id: "111",
      merchant_id: "222",
      amount: "450000.00",
      transaction_param: "order-uuid",
      return_url: "https://shop.uz/dashboard/purchases?pay=click",
    });
  });
});

describe("configuration", () => {
  const full: PaymentSettings = {
    paymeMerchantId: "m",
    clickServiceId: "s",
    clickMerchantId: "c",
  };

  it("offers only the configured methods", () => {
    expect(availablePaymentMethods({})).toEqual([]);
    expect(availablePaymentMethods({ paymeMerchantId: "m" })).toEqual(["payme"]);
    expect(availablePaymentMethods({ clickServiceId: "s" })).toEqual([]); // needs merchant id too
    expect(availablePaymentMethods(full)).toEqual(["payme", "click"]);
  });

  it("charges the order amount in the right unit for each provider", () => {
    const order = { id: "o1", amount: 450_000 };
    const payme = paymentUrl("payme", order, "https://back", full);
    expect(atob(payme!.split("/").pop()!)).toContain("a=45000000"); // tiyin
    const click = paymentUrl("click", order, "https://back", full);
    expect(new URL(click!).searchParams.get("amount")).toBe("450000.00"); // so'm
  });

  it("returns null for a method that is not configured", () => {
    expect(paymentUrl("payme", { id: "o", amount: 1 }, "x", {})).toBeNull();
    expect(paymentUrl("click", { id: "o", amount: 1 }, "x", { clickServiceId: "s" })).toBeNull();
  });
});
