import { describe, expect, it } from "vitest";
import { orderStep } from "@/lib/data";
import { calculateWithdrawalFee, getMaximumWithdrawal, MINIMUM_WITHDRAWAL } from "@/lib/wallet";

describe("wallet rules", () => {
  it("uses a minimum withdrawal of 100,000 UZS", () => {
    expect(MINIMUM_WITHDRAWAL).toBe(100_000);
  });

  it("calculates the 3% fee", () => {
    expect(calculateWithdrawalFee(100_000)).toBe(3_000);
    expect(calculateWithdrawalFee(2_350_000)).toBe(70_500);
  });

  it("does not allow withdrawing more than the available balance", () => {
    expect(getMaximumWithdrawal(0)).toBe(0);
    expect(getMaximumWithdrawal(500_000)).toBe(500_000);
  });

  it("allows the full available balance", () => {
    expect(getMaximumWithdrawal(250_000)).toBe(250_000);
  });
});

describe("order timeline", () => {
  it("maps statuses to steps", () => {
    expect(orderStep("pending_payment")).toBe(1);
    expect(orderStep("paid")).toBe(2);
    expect(orderStep("delivering")).toBe(3);
    expect(orderStep("done")).toBe(4);
  });
});
