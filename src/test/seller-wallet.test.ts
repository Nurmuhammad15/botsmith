import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach } from "vitest";
import { describe, expect, it } from "vitest";
import {
  calculateWithdrawalFee,
  INITIAL_SELLER_BALANCE,
  getMaximumWithdrawal,
  MINIMUM_WITHDRAWAL,
  useDemoSellerWallet,
} from "@/lib/seller-wallet";

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("seller demo wallet", () => {
  it("starts with no balance when there are no published bots", () => {
    expect(INITIAL_SELLER_BALANCE).toBe(0);
    expect(getMaximumWithdrawal(INITIAL_SELLER_BALANCE)).toBe(0);
  });

  it("uses a minimum withdrawal of 100,000 UZS", () => {
    expect(MINIMUM_WITHDRAWAL).toBe(100_000);
  });

  it("calculates the 3% fee", () => {
    expect(calculateWithdrawalFee(100_000)).toBe(3_000);
    expect(calculateWithdrawalFee(2_350_000)).toBe(70_500);
  });

  it("does not allow withdrawals without a balance", async () => {
    const wallet = renderHook(() => useDemoSellerWallet());
    await waitFor(() => expect(wallet.result.current.ready).toBe(true));

    expect(() => wallet.result.current.createWithdrawal(MINIMUM_WITHDRAWAL, "1234")).toThrow();
    expect(wallet.result.current.balance).toBe(0);
  });

  it("clears old demo withdrawal history and balances", async () => {
    localStorage.setItem(
      "botsmith-demo-wallet-v4",
      JSON.stringify({
        balance: 75_000_000,
        history: [
          {
            id: "request-1",
            amount: 100_000_000,
            fee: 3_000_000,
            payout: 97_000_000,
            last4: "7678",
            createdAt: "2026-10-11T08:23:53.000Z",
          },
        ],
      }),
    );
    localStorage.setItem("botsmith-demo-withdrawals", JSON.stringify([]));

    const wallet = renderHook(() => useDemoSellerWallet());
    await waitFor(() => expect(wallet.result.current.ready).toBe(true));

    expect(wallet.result.current.balance).toBe(0);
    expect(wallet.result.current.history).toHaveLength(0);
    expect(getMaximumWithdrawal(wallet.result.current.balance)).toBe(0);
    expect(localStorage.getItem("botsmith-demo-wallet-v4")).toBeNull();
    expect(localStorage.getItem("botsmith-demo-withdrawals")).toBeNull();
    expect(JSON.parse(localStorage.getItem("botsmith-demo-wallet-v5") ?? "{}")).toMatchObject({
      balance: 0,
      history: [],
    });
  });
});
