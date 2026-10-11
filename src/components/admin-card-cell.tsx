import { useEffect, useState } from "react";
import { toast } from "sonner";
import { describeError, revealWithdrawalCard, type AdminWithdrawal } from "@/lib/api";

/**
 * Masked card for a withdrawal. The full number is only fetched (and audited server-side) when
 * an administrator asks for it to make the transfer, and it disappears from the screen again.
 */
export function AdminCardCell({ withdrawal }: { withdrawal: AdminWithdrawal }) {
  const [card, setCard] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!card) return;
    const timer = setTimeout(() => setCard(null), 30_000);
    return () => clearTimeout(timer);
  }, [card]);

  async function reveal() {
    setBusy(true);
    try {
      setCard(await revealWithdrawalCard(withdrawal.id));
    } catch (error) {
      toast.error(describeError(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <p className="font-mono text-xs">
        {card ? card.replace(/(.{4})/g, "$1 ").trim() : `•••• •••• •••• ${withdrawal.last4}`}
      </p>
      <p className="text-xs text-muted-foreground">{withdrawal.holder}</p>
      {withdrawal.status === "pending" && !card && (
        <button
          type="button"
          disabled={busy}
          onClick={reveal}
          className="mt-1 text-xs font-medium text-primary hover:underline"
        >
          Raqamni ko‘rsatish
        </button>
      )}
    </div>
  );
}
