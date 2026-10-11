import { useEffect, useState } from "react";
import { readDemoValue, writeDemoValue } from "@/lib/demo-storage";
import { getPublishedSellerBots } from "@/lib/data";

export const INITIAL_SELLER_BALANCE = getPublishedSellerBots().reduce(
  (total, { bot }) => total + bot.price * bot.sales,
  0,
);
export const MINIMUM_WITHDRAWAL = 100_000;
export const MINIMUM_RETAINED_BALANCE = 500_000;
export const WITHDRAWAL_FEE_RATE = 0.03;

const WALLET_STORAGE_KEY = "botsmith-demo-wallet-v5";
const PREVIOUS_WALLET_STORAGE_KEYS = [
  "botsmith-demo-wallet-v4",
  "botsmith-demo-wallet-v3",
  "botsmith-demo-wallet-v2",
  "botsmith-demo-withdrawals",
];

export type DemoWithdrawal = {
  id: string;
  amount: number;
  last4: string;
  createdAt: string;
  fee?: number;
  payout?: number;
};

function isDemoWithdrawal(value: unknown): value is DemoWithdrawal {
  if (!value || typeof value !== "object") return false;
  const request = value as Record<string, unknown>;
  return (
    typeof request["id"] === "string" &&
    Number.isSafeInteger(request["amount"]) &&
    (request["amount"] as number) > 0 &&
    typeof request["last4"] === "string" &&
    /^\d{4}$/.test(request["last4"]) &&
    typeof request["createdAt"] === "string" &&
    (request["fee"] === undefined || Number.isSafeInteger(request["fee"])) &&
    (request["payout"] === undefined || Number.isSafeInteger(request["payout"]))
  );
}

export function calculateWithdrawalFee(amount: number) {
  return Math.round(amount * WITHDRAWAL_FEE_RATE);
}

export function getMaximumWithdrawal(balance: number) {
  return Math.max(0, balance - MINIMUM_RETAINED_BALANCE);
}

function getBalanceAfterWithdrawals(history: DemoWithdrawal[]) {
  const withdrawn = history.reduce((total, request) => total + request.amount, 0);
  return Math.min(
    INITIAL_SELLER_BALANCE,
    Math.max(MINIMUM_RETAINED_BALANCE, INITIAL_SELLER_BALANCE - withdrawn),
  );
}

export function useDemoSellerWallet() {
  const [balance, setBalance] = useState(INITIAL_SELLER_BALANCE);
  const [history, setHistory] = useState<DemoWithdrawal[]>([]);
  const [storageError, setStorageError] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const savedWallet = readDemoValue(WALLET_STORAGE_KEY);
      if (savedWallet === null) {
        for (const key of PREVIOUS_WALLET_STORAGE_KEYS) {
          window.localStorage.removeItem(key);
        }
        setHistory([]);
        setBalance(INITIAL_SELLER_BALANCE);
        writeDemoValue(WALLET_STORAGE_KEY, {
          balance: INITIAL_SELLER_BALANCE,
          history: [],
        });
      } else {
        if (
          typeof savedWallet !== "object" ||
          savedWallet === null ||
          !Array.isArray((savedWallet as Record<string, unknown>)["history"])
        ) {
          throw new Error("Demo wallet data is invalid.");
        }
        const savedHistory = (savedWallet as { history: unknown[] }).history.filter(
          isDemoWithdrawal,
        );
        const savedBalance = getBalanceAfterWithdrawals(savedHistory);
        setHistory(savedHistory);
        setBalance(savedBalance);
        writeDemoValue(WALLET_STORAGE_KEY, { balance: savedBalance, history: savedHistory });
      }
    } catch {
      setStorageError(
        "Demo hamyon ma’lumotlarini tozalab bo‘lmadi. Brauzer xotirasini tekshiring.",
      );
    } finally {
      setReady(true);
    }
  }, []);

  function createWithdrawal(amount: number, last4: string) {
    if (amount < MINIMUM_WITHDRAWAL || amount > getMaximumWithdrawal(balance)) {
      throw new Error("Withdrawal amount violates the wallet limits.");
    }
    const fee = calculateWithdrawalFee(amount);
    const nextHistory = [
      {
        id: crypto.randomUUID(),
        amount,
        fee,
        payout: amount - fee,
        last4,
        createdAt: new Date().toISOString(),
      },
      ...history,
    ];
    const nextBalance = balance - amount;

    writeDemoValue(WALLET_STORAGE_KEY, { balance: nextBalance, history: nextHistory });
    setBalance(nextBalance);
    setHistory(nextHistory);
    return { fee, payout: amount - fee, balance: nextBalance };
  }

  return { balance, history, storageError, ready, createWithdrawal };
}
