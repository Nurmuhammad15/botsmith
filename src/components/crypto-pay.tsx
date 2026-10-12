import { useState, type FormEvent } from "react";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  describeError,
  useCreateCryptoPayment,
  useCryptoSettings,
  useOrderCryptoPayment,
  useSubmitCryptoTxid,
} from "@/lib/api";

/** USDT (TRC-20) payment for an unpaid order: send to the shown wallet, paste the hash. */
export function CryptoPay({ orderId, enabled }: { orderId: string; enabled: boolean }) {
  const settings = useCryptoSettings();
  const payment = useOrderCryptoPayment(orderId);
  const create = useCreateCryptoPayment(orderId);
  const submit = useSubmitCryptoTxid(orderId);
  const [txid, setTxid] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");

  if (settings.isPending) return null;
  if (!settings.data?.walletAddress) {
    return (
      <p className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">
        To‘lov usuli hozircha ulanmagan — to‘lov uchun yordam chatiga murojaat qiling, to‘lov
        tasdiqlangach obuna faollashadi.
      </p>
    );
  }
  const current = payment.data;
  const open =
    current &&
    (current.status === "submitted" ||
      (current.status === "pending" && new Date(current.expiresAt).getTime() > Date.now()));

  async function start() {
    setError("");
    try {
      await create.mutateAsync();
    } catch (e) {
      setError(describeError(e));
    }
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!current) return;
    setError("");
    try {
      await submit.mutateAsync({ paymentId: current.id, txid: txid.trim() });
      setTxid("");
    } catch (e) {
      setError(describeError(e));
    }
  }

  async function copy(value: string, key: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      setTimeout(() => setCopied(""), 1500);
    } catch {
      /* clipboard unavailable: the value is still selectable */
    }
  }

  return (
    <div className="mt-3 space-y-3 rounded-lg border p-4">
      {!open && (
        <>
          <Button
            type="button"
            variant="outline"
            disabled={!enabled || create.isPending}
            onClick={start}
          >
            {create.isPending ? "Tayyorlanmoqda…" : `${settings.data.network} orqali to‘lash`}
          </Button>
          {current?.status === "rejected" && (
            <p className="text-sm text-destructive">
              Oldingi to‘lov tasdiqlanmadi. Qayta urinib ko‘ring yoki yordam chatiga yozing.
            </p>
          )}
          {current?.status === "expired" && (
            <p className="text-sm text-muted-foreground">
              Oldingi to‘lov muddati tugagan. Yangi to‘lovni boshlang.
            </p>
          )}
        </>
      )}

      {open && current && (
        <>
          <p className="text-sm font-medium">{current.network} orqali to‘lov</p>
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">
                Aniq summa (kam yuborsangiz, to‘lov topilmaydi)
              </dt>
              <dd className="flex items-center gap-2 font-semibold">
                {current.amountUsdt.toFixed(2)} USDT
                <button
                  type="button"
                  aria-label="Summani nusxalash"
                  onClick={() => void copy(current.amountUsdt.toFixed(2), "amount")}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <Copy className="h-4 w-4" />
                </button>
                {copied === "amount" && <span className="text-xs text-success">nusxalandi</span>}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Hamyon manzili ({current.network})</dt>
              <dd className="flex items-start gap-2 break-all font-mono text-xs">
                {current.address}
                <button
                  type="button"
                  aria-label="Manzilni nusxalash"
                  onClick={() => void copy(current.address, "address")}
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                >
                  <Copy className="h-4 w-4" />
                </button>
                {copied === "address" && <span className="text-xs text-success">nusxalandi</span>}
              </dd>
            </div>
          </dl>
          <p className="text-xs text-muted-foreground">
            Faqat TRON (TRC-20) tarmog‘ida USDT yuboring, boshqa tarmoqdagi pul yo‘qoladi. To‘lovni{" "}
            {new Date(current.expiresAt).toLocaleTimeString("uz-UZ", {
              hour: "2-digit",
              minute: "2-digit",
            })}{" "}
            gacha amalga oshiring.
          </p>

          {current.status === "pending" ? (
            <form onSubmit={send} className="space-y-2">
              <label className="block space-y-1 text-sm">
                <span>Pul yuborgach, tranzaksiya hash (TxID) ni kiriting</span>
                <Input
                  required
                  value={txid}
                  onChange={(e) => setTxid(e.target.value)}
                  placeholder="64 belgili hash"
                  maxLength={64}
                  className="font-mono text-xs"
                />
              </label>
              <Button type="submit" disabled={submit.isPending}>
                {submit.isPending ? "Yuborilmoqda…" : "To‘ladim, tekshirish uchun yuborish"}
              </Button>
            </form>
          ) : (
            <p role="status" className="rounded-lg bg-muted p-3 text-sm">
              To‘lov tekshirilmoqda. Administrator tasdiqlagach buyurtma faollashadi.
            </p>
          )}
        </>
      )}

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
