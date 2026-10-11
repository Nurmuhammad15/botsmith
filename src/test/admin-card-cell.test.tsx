import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminCardCell } from "@/components/admin-card-cell";
import type { AdminWithdrawal } from "@/lib/api";
import { createFakeSupabase } from "./fake-supabase";

const holder = vi.hoisted(() => ({ client: undefined as unknown }));
vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => true,
  getSupabaseClient: () => holder.client,
}));

const withdrawal = (patch: Partial<AdminWithdrawal> = {}): AdminWithdrawal => ({
  id: "w-1",
  amount: 1_000_000,
  fee: 30_000,
  payout: 970_000,
  last4: "1234",
  status: "pending",
  createdAt: "2026-10-11T10:00:00Z",
  seller: "@sellerbek",
  holder: "Sotuvchi Bek",
  ...patch,
});

beforeEach(() => {
  vi.useRealTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("AdminCardCell", () => {
  it("shows only the last four digits until asked", () => {
    holder.client = createFakeSupabase().client;
    render(<AdminCardCell withdrawal={withdrawal()} />);

    expect(screen.getByText("•••• •••• •••• 1234")).toBeInTheDocument();
    expect(screen.getByText("Sotuvchi Bek")).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("8600");
  });

  it("reveals the full number through the audited function, then hides it again", async () => {
    vi.useFakeTimers();
    const fake = createFakeSupabase({ rpc: { admin_reveal_withdrawal_card: "8600123412341234" } });
    holder.client = fake.client;
    render(<AdminCardCell withdrawal={withdrawal()} />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Raqamni ko‘rsatish" }));
    });

    expect(screen.getByText("8600 1234 1234 1234")).toBeInTheDocument();
    expect(fake.log.rpc).toEqual([{ name: "admin_reveal_withdrawal_card", args: { p_id: "w-1" } }]);
    expect(screen.queryByRole("button", { name: "Raqamni ko‘rsatish" })).not.toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(30_001);
    });
    expect(screen.getByText("•••• •••• •••• 1234")).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("8600");
  });

  it("offers no reveal for withdrawals that are already settled", () => {
    holder.client = createFakeSupabase().client;
    for (const status of ["paid", "rejected"] as const) {
      const { unmount } = render(<AdminCardCell withdrawal={withdrawal({ status })} />);
      expect(screen.queryByRole("button")).not.toBeInTheDocument();
      unmount();
    }
  });
});
