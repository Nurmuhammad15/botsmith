import { Eye, EyeOff } from "lucide-react";
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
      <div className="flex items-center gap-2">
        <p className="font-mono text-xs">
          {card ? card.replace(/(.{4})/g, "$1 ").trim() : `•••• •••• •••• ${withdrawal.last4}`}
        </p>
        <button
          type="button"
          disabled={busy}
          onClick={() => (card ? setCard(null) : void reveal())}
          aria-label={card ? "Raqamni yashirish" : "Raqamni ko‘rsatish"}
          title={card ? "Raqamni yashirish" : "Raqamni ko‘rsatish"}
          className="text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          {card ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      <p className="text-xs text-muted-foreground">{withdrawal.holder}</p>
    </div>
  );
}
