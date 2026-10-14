import { useState } from "react";
import { Check, Copy, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { describeError, useConfirmBotApiKey, usePendingBotApiKeys } from "@/lib/api";

/**
 * Shown to a seller whose bot was approved. It cannot be closed (no X, Esc or click outside)
 * until the seller confirms the API key was added to their bot; the key stays visible after a
 * reload until then.
 */
export function ApiKeyGate({ isSeller }: { isSeller: boolean }) {
  const { data: pending = [] } = usePendingBotApiKeys(isSeller);
  const confirm = useConfirmBotApiKey();
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const current = pending[0];

  async function copy(key: string) {
    try {
      await navigator.clipboard.writeText(key);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  async function done(botId: string) {
    setError("");
    try {
      await confirm.mutateAsync(botId);
      setSaved(false);
      setCopied(false);
    } catch (e) {
      setError(describeError(e));
    }
  }

  return (
    <AlertDialog open={Boolean(current)}>
      <AlertDialogContent onEscapeKeyDown={(event) => event.preventDefault()}>
        {current && (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <KeyRound className="h-5 w-5" />
                Botingiz tasdiqlandi — API kalitini oling
              </AlertDialogTitle>
              <AlertDialogDescription>
                <b>{current.title}</b> moderatsiyadan o‘tdi. Quyidagi kalitni nusxalab, o‘z
                botingizga qo‘shing: bot shu kalit bilan BotHub’dan xaridor obunasi faol yoki
                yo‘qligini tekshiradi. Kalitni qo‘shmaguningizcha bu oynani yopib bo‘lmaydi.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="flex gap-2">
              <Input aria-label="API kaliti" readOnly value={current.apiKey} />
              <Button type="button" variant="outline" onClick={() => void copy(current.apiKey)}>
                {copied ? <Check /> : <Copy />}
                {copied ? "Nusxalandi" : "Nusxa olish"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              So‘rov: <code>POST /api/seller-access</code> ·{" "}
              <code>Authorization: Bearer &lt;kalit&gt;</code> · <code>{`{"buyer_id":"..."}`}</code>
              . Tasdiqlagandan keyin kalit qayta ko‘rsatilmaydi; yo‘qotsangiz, bot sahifasida
              yangisini yarating.
            </p>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={saved}
                onChange={(event) => setSaved(event.target.checked)}
              />
              <span>Kalitni botimga qo‘shdim va xavfsiz joyda saqlab qo‘ydim.</span>
            </label>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <Button
              type="button"
              disabled={!saved || confirm.isPending}
              onClick={() => void done(current.botId)}
            >
              {confirm.isPending ? "Saqlanmoqda…" : "Davom etish"}
            </Button>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}
