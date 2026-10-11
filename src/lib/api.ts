import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getSupabaseClient } from "@/lib/supabase";
import type {
  BotItem,
  BotStatus,
  Order,
  OrderStatus,
  SellerBot,
  Withdrawal,
  WithdrawalStatus,
} from "@/lib/data";

type Row = Record<string, unknown>;

const str = (v: unknown) => (typeof v === "string" ? v : "");
const num = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0));

const ERROR_MESSAGES: Record<string, string> = {
  not_authenticated: "Avval tizimga kiring.",
  not_a_seller: "Bu amal faqat sotuvchilar uchun.",
  invalid_card: "Karta raqami 16 ta raqamdan iborat bo‘lishi kerak.",
  amount_too_small: "Summa minimal yechish miqdoridan kam.",
  amount_exceeds_available: "Summa yechish mumkin bo‘lgan balansdan oshib ketdi.",
  bot_not_found: "Bot topilmadi yoki e’lon qilinmagan.",
  own_bot: "O‘z botingizni xarid qila olmaysiz.",
  order_not_found: "Buyurtma topilmadi.",
  invalid_transition: "Buyurtma holatini bunday o‘zgartirib bo‘lmaydi.",
  forbidden: "Bu amal uchun ruxsat yo‘q.",
};

/** Converts a Supabase/Postgres error into a message that is safe to show to the user. */
export function describeError(error: unknown): string {
  const message =
    error && typeof error === "object" && "message" in error ? str(error.message) : "";
  return (
    ERROR_MESSAGES[message] ??
    (message.includes("duplicate key") && message.includes("username")
      ? "Bu username band."
      : "Amal bajarilmadi. Qayta urinib ko‘ring.")
  );
}

function check<T>(result: { data: T; error: unknown }): T {
  if (result.error) throw result.error;
  return result.data;
}

const db = () => getSupabaseClient();

// --------------------------------------------------------------------------- catalogue

function toBot(row: Row): BotItem {
  return {
    id: str(row["id"]),
    title: str(row["title"]),
    desc: str(row["description"]),
    price: row["price"] === null || row["price"] === undefined ? null : num(row["price"]),
    rating: num(row["rating"]),
    reviews: num(row["review_count"]),
    category: str(row["category"]),
    seller: str(row["seller_name"]),
    lang: Array.isArray(row["languages"]) ? (row["languages"] as string[]) : [],
    delivery: num(row["delivery_hours"]),
    sales: num(row["sales"]),
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
      check(await db().rpc("increment_bot_views", { p_bot: botId }));
    },
  });
}

export function useSubmitReview(botId: string, userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { rating: number; comment: string }) => {
      check(
        await db()
          .from("reviews")
          .insert({
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
    amount: num(row["amount"]),
    status: str(row["status"]) as OrderStatus,
    createdAt: str(row["created_at"]),
  };
}

/** Orders where the signed-in user is the buyer (`role: "buyer"`) or the seller. */
export function useOrders(role: "buyer" | "seller", userId: string | undefined) {
  return useQuery({
    queryKey: ["orders", role, userId],
    enabled: Boolean(userId),
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
    mutationFn: async (botId: string) =>
      toOrder(check(await db().rpc("create_order", { p_bot_id: botId })) as Row),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["orders"] }),
  });
}

export function useAdvanceOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { orderId: string; status: "delivering" | "done" }) => {
      check(
        await db().rpc("seller_advance_order", { p_order: input.orderId, p_status: input.status }),
      );
    },
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
      })),
  });
}

export type NewBotInput = { title: string; category: string; price: number; desc: string };

export function useAddBot(sellerId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: NewBotInput) => {
      if (!sellerId) throw new Error("not_authenticated");
      check(
        await db().from("bots").insert({
          seller_id: sellerId,
          title: input.title.trim(),
          description: input.desc.trim(),
          price: input.price,
          category: input.category,
        }),
      );
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["my-bots"] }),
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

function toWithdrawal(row: Row): Withdrawal {
  return {
    id: str(row["id"]),
    amount: num(row["amount"]),
    fee: num(row["fee"]),
    payout: num(row["payout"]),
    last4: str(row["card_number"]).slice(-4),
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
            .select("*")
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

export type AdminOrder = Order & { buyer: string; seller: string };

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
              "*, buyer:profiles!orders_buyer_id_fkey(full_name, username), seller:profiles!orders_seller_id_fkey(full_name, username)",
            )
            .order("created_at", { ascending: false }),
        ) as Row[]
      ).map((r): AdminOrder => ({
        ...toOrder(r),
        buyer: sellerLabel(r["buyer"]),
        seller: sellerLabel(r["seller"]),
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

export type AdminWithdrawal = Withdrawal & { seller: string; card: string; holder: string };

export function useAdminWithdrawals(enabled: boolean) {
  return useQuery({
    queryKey: ["admin", "withdrawals"],
    enabled,
    queryFn: async () =>
      (
        check(
          await db()
            .from("withdrawals")
            .select("*, seller:profiles(full_name, username)")
            .order("created_at", { ascending: false }),
        ) as Row[]
      ).map((r): AdminWithdrawal => ({
        ...toWithdrawal(r),
        seller: sellerLabel(r["seller"]),
        card: str(r["card_number"]),
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
