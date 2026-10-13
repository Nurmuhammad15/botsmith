import { Bell, BellOff, BellRing } from "lucide-react";
import { usePushNotifications } from "@/lib/push";
import { cn } from "@/lib/utils";

/** Bell button that turns device notifications on or off. Hidden where push is unsupported. */
export function PushToggle({ className }: { className?: string }) {
  const { state, error, enable, disable } = usePushNotifications(true);
  if (state === "unsupported" || state === "loading") return null;

  const on = state === "on";
  const denied = state === "denied";
  const Icon = denied ? BellOff : on ? BellRing : Bell;
  const label = denied
    ? "Bildirishnoma brauzer sozlamalarida bloklangan"
    : on
      ? "Bildirishnomalar yoqilgan (o‘chirish)"
      : "Qurilmaga bildirishnomalarni yoqish";

  return (
    <button
      type="button"
      aria-label={label}
      title={error || label}
      disabled={denied}
      onClick={() => void (on ? disable() : enable())}
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
