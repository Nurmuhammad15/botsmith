import { describe, expect, it } from "vitest";
import { orderStep } from "@/lib/data";
import {
  calculateWithdrawalFee,
  getMaximumWithdrawal,
  MINIMUM_RETAINED_BALANCE,
  MINIMUM_WITHDRAWAL,
} from "@/lib/wallet";

describe("wallet rules", () => {
  it("uses a minimum withdrawal of 100,000 UZS", () => {
    expect(MINIMUM_WITHDRAWAL).toBe(100_000);
  });

  it("calculates the 3% fee", () => {
    expect(calculateWithdrawalFee(100_000)).toBe(3_000);
    expect(calculateWithdrawalFee(2_350_000)).toBe(70_500);
  });

  it("allows nothing when the balance does not exceed the retained amount", () => {
    expect(getMaximumWithdrawal(0)).toBe(0);
    expect(getMaximumWithdrawal(MINIMUM_RETAINED_BALANCE)).toBe(0);
  });

  it("allows the balance above the retained amount", () => {
    expect(getMaximumWithdrawal(MINIMUM_RETAINED_BALANCE + 250_000)).toBe(250_000);
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
