// Platform withdrawal rules. The database enforces the same numbers in request_withdrawal().
export const MINIMUM_WITHDRAWAL = 100_000;
export const MINIMUM_RETAINED_BALANCE = 500_000;
export const WITHDRAWAL_FEE_RATE = 0.03;

export function calculateWithdrawalFee(amount: number) {
  return Math.round(amount * WITHDRAWAL_FEE_RATE);
}

export function getMaximumWithdrawal(balance: number) {
  return Math.max(0, balance - MINIMUM_RETAINED_BALANCE);
}
