import { useEffect, useRef } from "react";
import { Bell, BellOff, BellRing } from "lucide-react";
import { usePushNotifications } from "@/lib/push";
import { cn } from "@/lib/utils";

/** Bell button that turns device notifications on or off. Hidden where push is unsupported. */
export function PushToggle({ className }: { className?: string }) {
  const { state, error, enable } = usePushNotifications(true);
  if (state === "unsupported" || state === "loading") return null;

  const on = state === "on";
  const denied = state === "denied";
  const Icon = denied ? BellOff : on ? BellRing : Bell;
  // Notifications stay on: there is no way to turn them off from the site.
  const label = denied
    ? "Bildirishnoma brauzer sozlamalarida bloklangan. Brauzer sozlamalaridan ruxsat bering."
    : on
      ? "Bildirishnomalar yoqilgan"
      : "Qurilmaga bildirishnomalarni yoqish";

  return (
    <button
      type="button"
      aria-label={label}
      title={error || label}
      disabled={denied || on}
      onClick={() => void enable()}
      className={cn(
        "grid h-9 w-9 place-items-center rounded-md hover:bg-muted disabled:opacity-50",
        on ? "text-primary" : "text-muted-foreground",
        error && "text-destructive",
        className,
      )}
    >
      <Icon className="h-5 w-5" />
    </button>
  );
}

/**
 * Keeps push on for every signed-in user. A lost subscription is restored silently when the
 * permission was already granted; otherwise the browser's permission prompt is shown on the
 * user's first click or tap (browsers do not allow a prompt without a user gesture).
 */
export function PushAutoEnable({ userId }: { userId: string | undefined }) {
  const enabled = Boolean(userId);
  const { state, enable } = usePushNotifications(enabled);
  const asked = useRef(false);
  const synced = useRef<string | undefined>(undefined);

  // This device may still be attached to the previous user: attach it to the signed-in one.
  useEffect(() => {
    if (!userId || state !== "on" || synced.current === userId) return;
    synced.current = userId;
    void enable();
  }, [userId, state, enable]);

  useEffect(() => {
    if (!enabled || state !== "off") return;
    if (Notification.permission === "granted") {
      void enable();
      return;
    }
    const onGesture = () => {
      if (asked.current) return;
      asked.current = true;
      void enable();
    };
    window.addEventListener("pointerdown", onGesture, { once: true });
    return () => window.removeEventListener("pointerdown", onGesture);
  }, [enabled, state, enable]);

  return null;
}
