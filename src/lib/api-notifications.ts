import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { check, db, num, str, type Row } from "@/lib/api-core";

export type SiteNotification = {
  id: string;
  title: string;
  body: string;
  link: string | null;
  createdAt: string;
  read: boolean;
};

/** The signed-in user's notifications from the site, newest first. */
export function useNotifications(enabled: boolean) {
  return useQuery({
    queryKey: ["notifications"],
    enabled,
    refetchInterval: 30_000,
    queryFn: async (): Promise<SiteNotification[]> =>
      (
        check(
          await db()
            .from("notifications")
            .select("id,title,body,link,created_at,read_at")
            .order("created_at", { ascending: false })
            .limit(30),
        ) as Row[]
      ).map((r) => ({
        id: str(r["id"]),
        title: str(r["title"]),
        body: str(r["body"]),
        link: r["link"] ? str(r["link"]) : null,
        createdAt: str(r["created_at"]),
        read: Boolean(r["read_at"]),
      })),
  });
}

export function useMarkNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      check(await db().rpc("mark_notifications_read"));
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });
}

export type NotificationAudience = "all" | "seller" | "buyer" | "incomplete";

/** How many users an audience reaches (admins only). */
export function useAudienceCount(audience: NotificationAudience, enabled: boolean) {
  return useQuery({
    queryKey: ["admin", "audience", audience],
    enabled,
    queryFn: async () =>
      num(check(await db().rpc("admin_notification_audience_count", { p_audience: audience }))),
  });
}

export function useAdminSendNotification() {
  return useMutation({
    mutationFn: async (input: {
      audience: NotificationAudience;
      title: string;
      body: string;
      link: string | null;
      sendEmail: boolean;
    }): Promise<number> =>
      num(
        check(
          await db().rpc("admin_send_notification", {
            p_audience: input.audience,
            p_title: input.title,
            p_body: input.body,
            p_link: input.link,
            p_send_email: input.sendEmail,
          }),
        ),
      ),
  });
}

/** Sends a site message to specific people by e-mail; reports addresses that match no account. */
export function useAdminSendNotificationToEmails() {
  return useMutation({
    mutationFn: async (input: {
      emails: string[];
      title: string;
      body: string;
      link: string | null;
      sendEmail: boolean;
    }): Promise<{ sent: number; missing: string[] }> => {
      const result = check(
        await db().rpc("admin_send_notification_to_emails", {
          p_emails: input.emails,
          p_title: input.title,
          p_body: input.body,
          p_link: input.link,
          p_send_email: input.sendEmail,
        }),
      ) as { sent?: unknown; missing?: unknown };
      return {
        sent: num(result.sent),
        missing: Array.isArray(result.missing) ? result.missing.map((m) => str(m)) : [],
      };
    },
  });
}
