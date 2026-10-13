import { useCallback, useEffect, useState } from "react";
import { check, db } from "@/lib/api-core";

export type PushState = "loading" | "unsupported" | "denied" | "off" | "on";

const supported = () =>
  typeof window !== "undefined" &&
  "serviceWorker" in navigator &&
  "PushManager" in window &&
  "Notification" in window;

function toKey(base64: string) {
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function registration() {
  await navigator.serviceWorker.register("/sw.js");
  return navigator.serviceWorker.ready;
}

/** Browser push for the signed-in user: current state plus enable / disable actions. */
export function usePushNotifications(enabled: boolean) {
  const [state, setState] = useState<PushState>("loading");
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (!supported()) return setState("unsupported");
    if (Notification.permission === "denied") return setState("denied");
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = await reg?.pushManager.getSubscription();
      setState(sub && Notification.permission === "granted" ? "on" : "off");
    } catch {
      setState("off");
    }
  }, []);

  useEffect(() => {
    if (enabled) void refresh();
  }, [enabled, refresh]);

  const enable = useCallback(async () => {
    setError("");
    try {
      const publicKey = check(await db().rpc("get_push_public_key")) as string | null;
      if (!publicKey) throw new Error("not_configured");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return setState(permission === "denied" ? "denied" : "off");
      const reg = await registration();
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: toKey(publicKey),
        }));
      const json = sub.toJSON();
      check(
        await db().rpc("save_push_subscription", {
          p_endpoint: sub.endpoint,
          p_p256dh: json.keys?.["p256dh"] ?? "",
          p_auth: json.keys?.["auth"] ?? "",
        }),
      );
      setState("on");
    } catch {
      setError("Bildirishnomani yoqib bo‘lmadi. Qayta urinib ko‘ring.");
      void refresh();
    }
  }, [refresh]);

  const disable = useCallback(async () => {
    setError("");
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        check(await db().rpc("delete_push_subscription", { p_endpoint: sub.endpoint }));
        await sub.unsubscribe();
      }
      setState("off");
    } catch {
      setError("Bildirishnomani o‘chirib bo‘lmadi.");
    }
  }, []);

  return { state, error, enable, disable };
}
