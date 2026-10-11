import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { check, db, describeError, num, str, type Row } from "@/lib/api-core";
import { coverUrl } from "@/lib/api-media";
import type {
  BotItem,
  BotStatus,
  Order,
  OrderStatus,
  SellerBot,
  Withdrawal,
  WithdrawalStatus,
} from "@/lib/data";
import { SUBSCRIPTION_TERMS_VERSION } from "@/lib/subscription";

export { describeError };

// --------------------------------------------------------------------------- catalogue

function toBot(row: Row): BotItem {
  return {
    id: str(row["id"]),
    title: str(row["title"]),
    desc: str(row["description"]),
    price: num(row["price"]),
    price7Days:
      row["price_7_days"] === null || row["price_7_days"] === undefined
        ? null
        : num(row["price_7_days"]),
    price30Days:
      row["price_30_days"] === null || row["price_30_days"] === undefined
        ? null
        : num(row["price_30_days"]),
    rating: num(row["rating"]),
    reviews: num(row["review_count"]),
    category: str(row["category"]),
    seller: str(row["seller_name"]),
    lang: Array.isArray(row["languages"]) ? (row["languages"] as string[]) : [],
    delivery: num(row["delivery_hours"]),
    sales: num(row["sales"]),
    images: Array.isArray(row["image_paths"]) ? (row["image_paths"] as string[]).map(coverUrl) : [],
    fileCount: num(row["file_count"]),
    sellerId: str(row["seller_id"]),
  };
}

export function useBots() {
  return useQuery({
    queryKey: ["bots"],
    queryFn: async () =>
      (
        check(
          await db().from("bots_public").select("*").order("created_at", { ascending: false }),
        ) as Row[]
      ).map(toBot),
  });
}

export function useBot(id: string) {
  return useQuery({
    queryKey: ["bot", id],
    queryFn: async () => {
      const row = check(await db().from("bots_public").select("*").eq("id", id).maybeSingle());
      return row ? toBot(row as Row) : null;
    },
  });
}

/** The favorited bots that are still published, newest favorite first. */
export function useFavoriteBots(userId: string | undefined) {
  return useQuery({
    queryKey: ["favorite-bots", userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const ids = (
        check(
          await db().from("favorites").select("bot_id").order("created_at", { ascending: false }),
        ) as Row[]
      ).map((r) => str(r["bot_id"]));
      if (ids.length === 0) return [];
      const bots = (check(await db().from("bots_public").select("*").in("id", ids)) as Row[]).map(
        toBot,
      );
      return ids.flatMap((id) => bots.filter((bot) => bot.id === id));
    },
  });
}

export type Review = { id: string; rating: number; comment: string; reviewer: string };

export function useBotReviews(botId: string) {
  return useQuery({
    queryKey: ["reviews", botId],
    queryFn: async () =>
      (
        check(
          await db()
            .from("bot_reviews")
            .select("*")
            .eq("bot_id", botId)
            .order("created_at", { ascending: false }),
        ) as Row[]
      ).map((r) => ({
        id: str(r["id"]),
        rating: num(r["rating"]),
        comment: str(r["comment"]),
        reviewer: str(r["reviewer"]),
      })) satisfies Review[],
  });
}

export function useRecordBotView(botId: string) {
  return useMutation({
    mutationFn: async () => {
      check(await db().rpc("record_bot_view", { p_bot: botId }));
    },
  });
}

export function useSubmitReview(botId: string, userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { rating: number; comment: string }) => {
      check(
        await db().from("reviews").insert({
          bot_id: botId,
          buyer_id: userId,
          rating: input.rating,
          comment: input.comment,
        }),
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["reviews", botId] });
      void queryClient.invalidateQueries({ queryKey: ["bot", botId] });
    },
  });
}

// --------------------------------------------------------------------------- orders

function toOrder(row: Row): Order {
  return {
    id: str(row["id"]),
    number: num(row["order_number"]),
    botId: str(row["bot_id"]),
    botTitle: str(row["bot_title"]),
    buyerId: str(row["buyer_id"]),
    amount: num(row["amount"]),
    subscriptionDays: num(row["subscription_days"]) as 1 | 7 | 30,
    status: str(row["status"]) as OrderStatus,
    createdAt: str(row["created_at"]),
    paidAt: typeof row["paid_at"] === "string" ? row["paid_at"] : null,
    subscriptionExpiresAt:
      typeof row["subscription_expires_at"] === "string" ? row["subscription_expires_at"] : null,
    refundRequestedAt:
      typeof row["refund_requested_at"] === "string" ? row["refund_requested_at"] : null,
    refundReason: typeof row["refund_reason"] === "string" ? row["refund_reason"] : null,
    refundResolution:
      row["refund_resolution"] === "refunded" || row["refund_resolution"] === "rejected"
        ? row["refund_resolution"]
        : null,
    refundResolvedAt:
      typeof row["refund_resolved_at"] === "string" ? row["refund_resolved_at"] : null,
    termsAcceptedAt: typeof row["terms_accepted_at"] === "string" ? row["terms_accepted_at"] : null,
  };
}

/**
 * Orders where the signed-in user is the buyer (`role: "buyer"`) or the seller. A buyer with an
 * unpaid order is polled so the page notices the payment provider's confirmation; `fastPoll`
 * is for the moment right after returning from the provider's page.
 */
export function useOrders(
  role: "buyer" | "seller",
  userId: string | undefined,
  options: { fastPoll?: boolean } = {},
) {
  return useQuery({
    queryKey: ["orders", role, userId],
    enabled: Boolean(userId),
    refetchInterval: (query) =>
      role === "buyer" && query.state.data?.some((o) => o.status === "pending_payment")
        ? options.fastPoll
          ? 3_000
          : 30_000
        : false,
    queryFn: async () =>
      (
        check(
          await db()
            .from("orders")
            .select("*")
            .eq(role === "buyer" ? "buyer_id" : "seller_id", userId!)
            .order("created_at", { ascending: false }),
        ) as Row[]
      ).map(toOrder),
  });
}

export function useCreateOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { botId: string; subscriptionDays: 1 | 7 | 30 }) =>
      toOrder(
        check(
          await db().rpc("create_order", {
            p_bot_id: input.botId,
            p_subscription_days: input.subscriptionDays,
          }),
        ) as Row,
      ),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["orders"] }),
  });
}

// --------------------------------------------------------------------------- seller

export function useMyBots(enabled = true) {
  return useQuery({
    queryKey: ["my-bots"],
    enabled,
    queryFn: async () =>
      (check(await db().rpc("my_bots")) as Row[]).map((r): SellerBot => ({
        id: str(r["id"]),
        title: str(r["title"]),
        desc: str(r["description"]),
        price: num(r["price"]),
        category: str(r["category"]),
        status: str(r["status"]) as BotStatus,
        views: num(r["views"]),
        sales: num(r["sales"]),
        earned: num(r["earned"]),
        imagePaths: Array.isArray(r["image_paths"]) ? (r["image_paths"] as string[]) : [],
        fileCount: num(r["file_count"]),
      })),
  });
}

export type NewBotInput = {
  title: string;
  category: string;
  price: number;
  price7Days: number;
  price30Days: number;
  desc: string;
  webhookUrl: string;
  webhookSecret: string;
};

export function useAddBot(sellerId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: NewBotInput): Promise<string> => {
      if (!sellerId) throw new Error("not_authenticated");
      return str(
        check(
          await db().rpc("create_sponsored_bot", {
            p_title: input.title.trim(),
            p_description: input.desc.trim(),
            p_category: input.category,
            p_price_1_day: input.price,
            p_price_7_days: input.price7Days,
            p_price_30_days: input.price30Days,
            p_webhook_url: input.webhookUrl.trim(),
            p_webhook_secret: input.webhookSecret.trim(),
          }),
        ),
      );
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["my-bots"] }),
  });
}

export function useAcceptSubscriptionTerms(orderId: string) {
  return useMutation({
    mutationFn: async () => {
      check(
        await db().rpc("accept_subscription_terms", {
          p_order: orderId,
          p_version: SUBSCRIPTION_TERMS_VERSION,
        }),
      );
    },
  });
}

export function useRequestSubscriptionRefund() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { orderId: string; reason: string }) => {
      check(
        await db().rpc("request_subscription_refund", {
          p_order: input.orderId,
          p_reason: input.reason,
        }),
      );
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["orders"] }),
  });
}

export function useAdminResolveSubscriptionRefund() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { orderId: string; resolution: "refunded" | "rejected" }) => {
      check(
        await db().rpc(
          input.resolution === "refunded"
            ? "admin_complete_subscription_refund"
            : "admin_reject_subscription_refund",
          { p_order: input.orderId },
        ),
      );
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["admin"] }),
  });
}

export function useSetBotSubscriptionWebhook() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { botId: string; url: string; secret: string }) => {
      check(
        await db().rpc("set_bot_subscription_webhook", {
          p_bot: input.botId,
          p_url: input.url,
          p_secret: input.secret,
        }),
      );
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["my-bots"] }),
  });
}

export type SellerSubscriptionConfig = {
  price1Day: number;
  price7Days: number | null;
  price30Days: number | null;
};

export function useSellerSubscriptionConfig(botId: string) {
  return useQuery({
    queryKey: ["seller-subscription", botId],
    queryFn: async (): Promise<SellerSubscriptionConfig> => {
      const row = check(
        await db().from("bots").select("price,price_7_days,price_30_days").eq("id", botId).single(),
      ) as Row;
      return {
        price1Day: num(row["price"]),
        price7Days:
          row["price_7_days"] === null || row["price_7_days"] === undefined
            ? null
            : num(row["price_7_days"]),
        price30Days:
          row["price_30_days"] === null || row["price_30_days"] === undefined
            ? null
            : num(row["price_30_days"]),
      };
    },
  });
}

export function useConfigureBotSubscription() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      botId: string;
      price1Day: number;
      price7Days: number;
      price30Days: number;
      webhookUrl: string;
      webhookSecret: string;
    }) => {
      check(
        await db().rpc("configure_bot_subscription", {
          p_bot: input.botId,
          p_price_1_day: input.price1Day,
          p_price_7_days: input.price7Days,
          p_price_30_days: input.price30Days,
          p_webhook_url: input.webhookUrl,
          p_webhook_secret: input.webhookSecret,
        }),
      );
    },
    onSuccess: (_result, input) => {
      void queryClient.invalidateQueries({ queryKey: ["seller-subscription", input.botId] });
      void queryClient.invalidateQueries({ queryKey: ["bots"] });
      void queryClient.invalidateQueries({ queryKey: ["my-bots"] });
    },
  });
}

export type Wallet = { earned: number; withdrawn: number; balance: number };

export function useWallet(enabled = true) {
  return useQuery({
    queryKey: ["wallet"],
    enabled,
    queryFn: async (): Promise<Wallet> => {
      const row = (check(await db().rpc("my_wallet")) as Row[])[0] ?? {};
      return {
        earned: num(row["earned"]),
        withdrawn: num(row["withdrawn"]),
        balance: num(row["balance"]),
      };
    },
  });
}

// `card_number` is deliberately not readable by clients (0004_withdrawal_card_privacy.sql), so
// withdrawals must be selected with an explicit column list — `select *` is denied.
const WITHDRAWAL_COLUMNS =
  "id, seller_id, amount, fee, payout, card_last4, card_holder, status, created_at, processed_at";

function toWithdrawal(row: Row): Withdrawal {
  return {
    id: str(row["id"]),
    amount: num(row["amount"]),
    fee: num(row["fee"]),
    payout: num(row["payout"]),
    last4: str(row["card_last4"]),
    status: str(row["status"]) as WithdrawalStatus,
    createdAt: str(row["created_at"]),
  };
}

export function useWithdrawals(userId: string | undefined) {
  return useQuery({
    queryKey: ["withdrawals", userId],
    enabled: Boolean(userId),
    queryFn: async () =>
      (
        check(
          await db()
            .from("withdrawals")
            .select(WITHDRAWAL_COLUMNS)
            .eq("seller_id", userId!)
            .order("created_at", { ascending: false }),
        ) as Row[]
      ).map(toWithdrawal),
  });
}

export function useRequestWithdrawal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { amount: number; card: string; holder: string }) =>
      toWithdrawal(
        check(
          await db().rpc("request_withdrawal", {
            p_amount: input.amount,
            p_card: input.card,
            p_holder: input.holder,
          }),
        ) as Row,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["wallet"] });
      void queryClient.invalidateQueries({ queryKey: ["withdrawals"] });
    },
  });
}

// --------------------------------------------------------------------------- profile

export type Profile = { name: string; username: string; bio: string; phone: string };

export function useProfile(userId: string | undefined) {
  return useQuery({
    queryKey: ["profile", userId],
    enabled: Boolean(userId),
    queryFn: async (): Promise<Profile> => {
      const row = check(await db().from("profiles").select("*").eq("id", userId!).single()) as Row;
      return {
        name: str(row["full_name"]),
        username: str(row["username"]),
        bio: str(row["bio"]),
        phone: str(row["phone"]),
      };
    },
  });
}

export function useUpdateProfile(userId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (profile: Omit<Profile, "phone">) => {
      if (!userId) throw new Error("not_authenticated");
      check(
        await db()
          .from("profiles")
          .update({
            full_name: profile.name.trim(),
            username: profile.username.trim() || null,
            bio: profile.bio.trim(),
          })
          .eq("id", userId),
      );
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["profile", userId] }),
  });
}

// --------------------------------------------------------------------------- support chat

export type SupportMessage = { id: string; body: string; fromStaff: boolean; createdAt: string };

function toSupportMessage(r: Row): SupportMessage {
  return {
    id: str(r["id"]),
    body: str(r["body"]),
    fromStaff: r["from_staff"] === true,
    createdAt: str(r["created_at"]),
  };
}

/** Messages in one user's support thread; polls so staff replies show up. */
export function useSupportThread(threadUserId: string | undefined) {
  return useQuery({
    queryKey: ["support", threadUserId],
    enabled: Boolean(threadUserId),
    refetchInterval: 10_000,
    queryFn: async () =>
      (
        check(
          await db()
            .from("support_messages")
            .select("*")
            .eq("thread_user_id", threadUserId!)
            .order("created_at", { ascending: true }),
        ) as Row[]
      ).map(toSupportMessage),
  });
}

export function useSendSupportMessage(
  threadUserId: string | undefined,
  senderId: string | undefined,
  fromStaff = false,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: string) => {
      if (!threadUserId || !senderId) throw new Error("not_authenticated");
      check(
        await db().from("support_messages").insert({
          thread_user_id: threadUserId,
          sender_id: senderId,
          from_staff: fromStaff,
          body,
        }),
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["support", threadUserId] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "threads"] });
    },
  });
}

// --------------------------------------------------------------------------- admin

export type AdminBot = {
  id: string;
  title: string;
  category: string;
  price: number;
  status: BotStatus;
  seller: string;
  createdAt: string;
  images: string[];
};

const sellerLabel = (profile: unknown) => {
  const p = (profile ?? {}) as Row;
  return str(p["username"]) || str(p["full_name"]) || "—";
};

export function useAdminBots(enabled: boolean) {
  return useQuery({
    queryKey: ["admin", "bots"],
    enabled,
    queryFn: async () =>
      (
        check(
          await db()
            .from("bots")
            .select("*, seller:profiles(full_name, username)")
            .order("created_at", { ascending: false }),
        ) as Row[]
      ).map((r): AdminBot => ({
        id: str(r["id"]),
        title: str(r["title"]),
        category: str(r["category"]),
        price: num(r["price"]),
        status: str(r["status"]) as BotStatus,
        seller: sellerLabel(r["seller"]),
        createdAt: str(r["created_at"]),
        images: Array.isArray(r["image_paths"]) ? (r["image_paths"] as string[]).map(coverUrl) : [],
      })),
  });
}

export function useAdminSetBotStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; status: BotStatus }) => {
      check(await db().rpc("admin_set_bot_status", { p_bot: input.id, p_status: input.status }));
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "bots"] });
      void queryClient.invalidateQueries({ queryKey: ["bots"] });
    },
  });
}

export type AdminOrder = Order & {
  buyer: string;
  seller: string;
  /** Online payment attempts (provider and state: 1 created, 2 paid, -1/-2 cancelled). */
  payments: { provider: string; state: number }[];
};

export function useAdminOrders(enabled: boolean) {
  return useQuery({
    queryKey: ["admin", "orders"],
    enabled,
    queryFn: async () =>
      (
        check(
          await db()
            .from("orders")
            .select(
              "*, buyer:profiles!orders_buyer_id_fkey(full_name, username), seller:profiles!orders_seller_id_fkey(full_name, username), payments:payment_transactions(provider, state)",
            )
            .order("created_at", { ascending: false }),
        ) as Row[]
      ).map((r): AdminOrder => ({
        ...toOrder(r),
        buyer: sellerLabel(r["buyer"]),
        seller: sellerLabel(r["seller"]),
        payments: Array.isArray(r["payments"])
          ? (r["payments"] as { provider: string; state: number }[])
          : [],
      })),
  });
}

export function useAdminSetOrderStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; status: OrderStatus }) => {
      check(
        await db().rpc("admin_set_order_status", { p_order: input.id, p_status: input.status }),
      );
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["admin"] }),
  });
}

export type AdminWithdrawal = Withdrawal & { seller: string; holder: string };

/** Full card number of a withdrawal, for making the transfer. Every call is audited server-side. */
export async function revealWithdrawalCard(withdrawalId: string) {
  return check(await db().rpc("admin_reveal_withdrawal_card", { p_id: withdrawalId })) as string;
}

export function useAdminWithdrawals(enabled: boolean) {
  return useQuery({
    queryKey: ["admin", "withdrawals"],
    enabled,
    queryFn: async () =>
      (
        check(
          await db()
            .from("withdrawals")
            .select(`${WITHDRAWAL_COLUMNS}, seller:profiles(full_name, username)`)
            .order("created_at", { ascending: false }),
        ) as Row[]
      ).map((r): AdminWithdrawal => ({
        ...toWithdrawal(r),
        seller: sellerLabel(r["seller"]),
        holder: str(r["card_holder"]),
      })),
  });
}

export function useAdminSetWithdrawalStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; status: "paid" | "rejected" }) => {
      check(
        await db().rpc("admin_set_withdrawal_status", { p_id: input.id, p_status: input.status }),
      );
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["admin"] }),
  });
}

export type SupportThread = { userId: string; user: string; lastMessage: string; lastAt: string };

/** Admin inbox: one row per user, newest conversation first. */
export function useAdminThreads(enabled: boolean) {
  return useQuery({
    queryKey: ["admin", "threads"],
    enabled,
    refetchInterval: 15_000,
    queryFn: async () => {
      const rows = check(
        await db()
          .from("support_messages")
          .select(
            "thread_user_id, body, created_at, user:profiles!support_messages_thread_user_id_fkey(full_name, username)",
          )
          .order("created_at", { ascending: false })
          .limit(500),
      ) as Row[];
      const threads = new Map<string, SupportThread>();
      for (const r of rows) {
        const userId = str(r["thread_user_id"]);
        if (!threads.has(userId)) {
          threads.set(userId, {
            userId,
            user: sellerLabel(r["user"]),
            lastMessage: str(r["body"]),
            lastAt: str(r["created_at"]),
          });
        }
      }
      return [...threads.values()];
    },
  });
}
