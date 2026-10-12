import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Check, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AdminCardCell } from "@/components/admin-card-cell";
import { DashboardLayout, StatusBadge, DataTable, Tabs } from "@/components/site";
import {
  describeError,
  useAdminBots,
  useAdminOrders,
  useAdminResolveSubscriptionRefund,
  useAdminStats,
  useAdminUsers,
  useAdminSetBotStatus,
  useAdminSetOrderStatus,
  useAdminSetWithdrawalStatus,
  useAdminThreads,
  useAdminWithdrawals,
  useSendSupportMessage,
  useSupportThread,
} from "@/lib/api";
import { categories, formatUZS, orderCode } from "@/lib/data";
import { MINIMUM_WITHDRAWAL, WITHDRAWAL_FEE_RATE } from "@/lib/wallet";
import { useMarketplaceAccount } from "@/lib/marketplace-auth-context";
import { adminNav } from "@/lib/nav";
import { cn } from "@/lib/utils";

const TABS = ["bots", "orders", "withdrawals", "support", "stats", "users", "settings"] as const;
type TabKey = (typeof TABS)[number];

export const Route = createFileRoute("/admin")({
  validateSearch: (search: Record<string, unknown>): { tab?: TabKey | undefined } => ({
    tab: TABS.find((t) => t === search["tab"]),
  }),
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "Moderatsiya navbati — BotSmith Admin" },
      {
        name: "description",
        content: "Yangi botlar, sotuvchilar, buyurtmalar va to'lovlarni moderatsiya qilish.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Admin,
});

function Admin() {
  return (
    <DashboardLayout user="Admin" role="Administrator" items={adminNav}>
      <AdminContent />
    </DashboardLayout>
  );
}

const fail = (error: unknown) => toast.error(describeError(error));

function AdminContent() {
  const account = useMarketplaceAccount();
  const isAdmin = Boolean(account?.isAdmin);
  const { tab: tabKey } = Route.useSearch();
  const navigate = useNavigate({ from: "/admin" });
  const tab = Math.max(0, TABS.indexOf(tabKey ?? "bots"));
  const setTab = (i: number) => void navigate({ search: { tab: TABS[i] ?? "bots" } });
  const bots = useAdminBots(isAdmin);
  const orders = useAdminOrders(isAdmin);
  const withdrawals = useAdminWithdrawals(isAdmin);
  const threads = useAdminThreads(isAdmin);
  const stats = useAdminStats(isAdmin);
  const users = useAdminUsers(isAdmin);

  if (!isAdmin) {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">
        Bu sahifa faqat administratorlar uchun.
      </p>
    );
  }

  const pendingBots = (bots.data ?? []).filter((b) => b.status === "pending");
  const pendingWithdrawals = (withdrawals.data ?? []).filter((w) => w.status === "pending");

  return (
    <>
      <h1 className="text-xl font-bold">Boshqaruv paneli</h1>
      <div className="mt-4">
        <Tabs
          tabs={[
            `Botlar (${pendingBots.length})`,
            "Buyurtmalar",
            `Yechishlar (${pendingWithdrawals.length})`,
            "Murojaatlar",
            "Statistika",
            "Foydalanuvchilar",
            "Sozlamalar",
          ]}
          value={tab}
          onChange={setTab}
        />
      </div>
      <div className="mt-4">
        {tab === 0 && <BotsTab bots={bots.data ?? []} loading={bots.isPending} />}
        {tab === 1 && <OrdersTab orders={orders.data ?? []} loading={orders.isPending} />}
        {tab === 2 && (
          <WithdrawalsTab items={withdrawals.data ?? []} loading={withdrawals.isPending} />
        )}
        {tab === 3 && <SupportTab threads={threads.data ?? []} loading={threads.isPending} />}
        {tab === 4 && <StatsTab stats={stats.data} loading={stats.isPending} />}
        {tab === 5 && <UsersTab users={users.data ?? []} loading={users.isPending} />}
        {tab === 6 && <SettingsTab email={account?.email ?? ""} />}
      </div>
    </>
  );
}

function BotsTab({
  bots,
  loading,
}: {
  bots: NonNullable<ReturnType<typeof useAdminBots>["data"]>;
  loading: boolean;
}) {
  const setStatus = useAdminSetBotStatus();
  const act = (id: string, status: "published" | "rejected") =>
    setStatus.mutate(
      { id, status },
      {
        onSuccess: () => toast.success(status === "published" ? "Tasdiqlandi" : "Rad etildi"),
        onError: fail,
      },
    );
  const label = { pending: "pending", published: "published", rejected: "draft" } as const;
  return (
    <DataTable
      head={["Bot nomi", "Kategoriya", "Sotuvchi", "Narx", "Holat", "Amallar"]}
      emptyMessage={loading ? "Yuklanmoqda…" : "Botlar yo‘q."}
      rows={bots.map((b) => [
        <div>
          <p className="font-medium">{b.title}</p>
          <p className="text-xs text-muted-foreground">
            {new Date(b.createdAt).toLocaleDateString("uz-UZ")}
          </p>
          {b.images.length > 0 && (
            <div className="mt-2 flex gap-1">
              {b.images.map((src) => (
                <a key={src} href={src} target="_blank" rel="noreferrer">
                  <img src={src} alt="" loading="lazy" className="h-10 w-14 rounded object-cover" />
                </a>
              ))}
            </div>
          )}
        </div>,
        categories.find((c) => c.slug === b.category)?.name,
        <span className="text-primary">{b.seller}</span>,
        formatUZS(b.price),
        <StatusBadge status={label[b.status]} />,
        <div className="flex gap-2">
          {b.status !== "published" && (
            <button
              onClick={() => act(b.id, "published")}
              aria-label="Tasdiqlash"
              className="grid h-8 w-8 place-items-center rounded-md bg-success-soft text-success"
            >
              <Check className="h-4 w-4" />
            </button>
          )}
          {b.status !== "rejected" && (
            <button
              onClick={() => act(b.id, "rejected")}
              aria-label="Rad etish"
              className="grid h-8 w-8 place-items-center rounded-md bg-destructive/10 text-destructive"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>,
      ])}
    />
  );
}

const paymentState = (state: number) =>
  state === 2 ? "to‘langan" : state === 1 ? "kutilmoqda" : state === -2 ? "qaytarilgan" : "bekor";

function OrdersTab({
  orders,
  loading,
}: {
  orders: NonNullable<ReturnType<typeof useAdminOrders>["data"]>;
  loading: boolean;
}) {
  const setStatus = useAdminSetOrderStatus();
  const resolveRefund = useAdminResolveSubscriptionRefund();
  const act = (id: string, status: "paid" | "cancelled") =>
    setStatus.mutate(
      { id, status },
      {
        onSuccess: () =>
          toast.success(status === "paid" ? "To‘langan deb belgilandi" : "Bekor qilindi"),
        onError: fail,
      },
    );
  const resolve = (id: string, resolution: "refunded" | "rejected") => {
    if (
      resolution === "refunded" &&
      !window.confirm(
        "To‘lov provayderida pulni xaridorga qaytarganingizni tasdiqlaysizmi? Bu amal obunani bekor qiladi.",
      )
    ) {
      return;
    }
    resolveRefund.mutate(
      { orderId: id, resolution },
      {
        onSuccess: () =>
          toast.success(
            resolution === "refunded"
              ? "Qaytarish bajarildi deb qayd etildi"
              : "Qaytarish so‘rovi rad etildi",
          ),
        onError: fail,
      },
    );
  };
  const label = {
    pending_payment: "To‘lov kutilmoqda",
    paid: "To‘langan",
    delivering: "Yetkazilmoqda",
    done: "Yakunlangan",
    cancelled: "Bekor qilingan",
  } as const;
  return (
    <DataTable
      head={[
        "Buyurtma",
        "Bot",
        "Xaridor",
        "Sotuvchi",
        "Summa",
        "Obuna",
        "Holat",
        "Onlayn to‘lov",
        "Qaytarish so‘rovi",
        "Amallar",
      ]}
      emptyMessage={loading ? "Yuklanmoqda…" : "Buyurtmalar yo‘q."}
      rows={orders.map((o) => [
        orderCode(o.number),
        o.botTitle,
        o.buyer,
        o.seller,
        formatUZS(o.amount),
        `${o.subscriptionDays} kun`,
        label[o.status],
        o.payments.length === 0
          ? "—"
          : o.payments
              .map((p) => `${p.provider === "payme" ? "Payme" : "Click"}: ${paymentState(p.state)}`)
              .join(", "),
        o.refundRequestedAt ? (
          <div className="max-w-64 space-y-1 text-xs">
            <p>
              {o.refundResolution === "refunded"
                ? "Qaytarildi"
                : o.refundResolution === "rejected"
                  ? "Rad etildi"
                  : "Ko‘rib chiqilmoqda"}
            </p>
            {o.refundReason && <p className="whitespace-pre-wrap">{o.refundReason}</p>}
            {o.refundRequestedAt && (
              <p className="text-muted-foreground">
                {new Date(o.refundRequestedAt).toLocaleString("uz-UZ")}
              </p>
            )}
            {o.status === "paid" && o.refundResolution === null && (
              <div className="flex flex-wrap gap-1 pt-1">
                <Button size="sm" onClick={() => resolve(o.id, "refunded")}>
                  Qaytarildi
                </Button>
                <Button size="sm" variant="outline" onClick={() => resolve(o.id, "rejected")}>
                  Rad etish
                </Button>
              </div>
            )}
          </div>
        ) : (
          "—"
        ),
        o.status === "pending_payment" ? (
          <div className="flex gap-2">
            <Button size="sm" onClick={() => act(o.id, "paid")}>
              To‘langan
            </Button>
            <Button size="sm" variant="outline" onClick={() => act(o.id, "cancelled")}>
              Bekor qilish
            </Button>
          </div>
        ) : null,
      ])}
    />
  );
}

function WithdrawalsTab({
  items,
  loading,
}: {
  items: NonNullable<ReturnType<typeof useAdminWithdrawals>["data"]>;
  loading: boolean;
}) {
  const setStatus = useAdminSetWithdrawalStatus();
  const act = (id: string, status: "paid" | "rejected") =>
    setStatus.mutate(
      { id, status },
      {
        onSuccess: () =>
          toast.success(status === "paid" ? "To‘langan deb belgilandi" : "Rad etildi"),
        onError: fail,
      },
    );
  const label = { pending: "Kutilmoqda", paid: "To‘langan", rejected: "Rad etilgan" } as const;
  return (
    <DataTable
      head={["Sotuvchi", "Summa", "Kartaga", "Karta", "Sana", "Holat", "Amallar"]}
      emptyMessage={loading ? "Yuklanmoqda…" : "Yechish so‘rovlari yo‘q."}
      rows={items.map((w) => [
        w.seller,
        formatUZS(w.amount),
        formatUZS(w.payout),
        <AdminCardCell withdrawal={w} />,
        new Date(w.createdAt).toLocaleString("uz-UZ"),
        label[w.status],
        w.status === "pending" ? (
          <div className="flex gap-2">
            <Button size="sm" onClick={() => act(w.id, "paid")}>
              O‘tkazildi
            </Button>
            <Button size="sm" variant="outline" onClick={() => act(w.id, "rejected")}>
              Rad etish
            </Button>
          </div>
        ) : null,
      ])}
    />
  );
}

function SupportTab({
  threads,
  loading,
}: {
  threads: NonNullable<ReturnType<typeof useAdminThreads>["data"]>;
  loading: boolean;
}) {
  const account = useMarketplaceAccount();
  const [selected, setSelected] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const current = threads.find((t) => t.userId === selected) ?? threads[0];
  const { data: messages = [] } = useSupportThread(current?.userId);
  const send = useSendSupportMessage(current?.userId, account?.id, true);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const text = reply.trim();
    if (!text) return;
    try {
      await send.mutateAsync(text);
      setReply("");
    } catch (e) {
      fail(e);
    }
  }

  if (threads.length === 0) {
    return (
      <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
        {loading ? "Yuklanmoqda…" : "Murojaatlar yo‘q."}
      </p>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
      <div className="space-y-2">
        {threads.map((t) => (
          <button
            key={t.userId}
            onClick={() => setSelected(t.userId)}
            className={cn(
              "card-soft block w-full p-3 text-left",
              current?.userId === t.userId && "border-primary",
            )}
          >
            <p className="text-sm font-medium">{t.user}</p>
            <p className="line-clamp-1 text-xs text-muted-foreground">{t.lastMessage}</p>
          </button>
        ))}
      </div>
      <div className="card-soft flex flex-col">
        <div className="max-h-96 min-h-64 space-y-3 overflow-y-auto p-4">
          {messages.map((m) => (
            <p
              key={m.id}
              className={cn(
                "max-w-[85%] rounded-2xl p-3 text-sm",
                m.fromStaff ? "ml-auto bg-primary text-primary-foreground" : "bg-muted",
              )}
            >
              {m.body}
            </p>
          ))}
        </div>
        <form onSubmit={submit} className="flex gap-2 border-t p-3">
          <Input
            aria-label="Javob"
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            maxLength={2000}
            placeholder="Javob yozing..."
          />
          <Button type="submit" disabled={!reply.trim() || send.isPending}>
            Yuborish
          </Button>
        </form>
      </div>
    </div>
  );
}

function StatsTab({
  stats,
  loading,
}: {
  stats: ReturnType<typeof useAdminStats>["data"];
  loading: boolean;
}) {
  if (!stats) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        {loading ? "Yuklanmoqda…" : "Statistikani yuklab bo‘lmadi."}
      </p>
    );
  }
  const cards: [string, string][] = [
    ["Sayt daromadi (komissiya, to‘langan)", formatUZS(stats.feePaid)],
    ["Kutilayotgan komissiya", formatUZS(stats.feePending)],
    ["Botlar sotuvi (jami)", formatUZS(stats.salesTotal)],
    ["Sotilgan buyurtmalar", String(stats.ordersPaid)],
    ["Saytdagi botlar (jami)", String(stats.botsTotal)],
    ["Nashr etilgan botlar", String(stats.botsPublished)],
    ["Foydalanuvchilar", String(stats.users)],
    ["Sotuvchilar", String(stats.sellers)],
  ];
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(([label, value]) => (
          <div key={label} className="card-soft p-4">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 text-xl font-bold">{value}</p>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Sayt daromadi — sotuvchilar pul yechganda olinadigan {Math.round(WITHDRAWAL_FEE_RATE * 100)}
        % komissiya.
      </p>
    </>
  );
}

function UsersTab({
  users,
  loading,
}: {
  users: NonNullable<ReturnType<typeof useAdminUsers>["data"]>;
  loading: boolean;
}) {
  const date = (v: string | null) => (v ? new Date(v).toLocaleString("uz-UZ") : "—");
  return (
    <DataTable
      head={[
        "Foydalanuvchi",
        "Rol",
        "Ro‘yxatdan o‘tgan",
        "Oxirgi kirish",
        "Botlar",
        "Xaridlar",
        "Sotuvlar",
      ]}
      emptyMessage={loading ? "Yuklanmoqda…" : "Foydalanuvchilar yo‘q."}
      rows={users.map((u) => [
        <div>
          <p className="font-medium">{u.fullName || "—"}</p>
          <p className="text-xs text-muted-foreground">
            {u.email}
            {!u.emailConfirmed && " · tasdiqlanmagan"}
          </p>
        </div>,
        u.role,
        date(u.createdAt),
        date(u.lastSignInAt),
        String(u.bots),
        String(u.purchases),
        String(u.sales),
      ])}
    />
  );
}

function SettingsTab({ email }: { email: string }) {
  const rows: [string, string][] = [
    ["Admin akkaunt", email],
    ["Komissiya (pul yechishda)", `${Math.round(WITHDRAWAL_FEE_RATE * 100)}%`],
    ["Minimal yechish summasi", formatUZS(MINIMUM_WITHDRAWAL)],
    ["To‘lovlar", "Payme / Click yoki admin tasdig‘i"],
    ["Sotuvchilarga to‘lov", "Qo‘lda (Yechishlar tabida tasdiqlanadi)"],
  ];
  return (
    <div className="card-soft divide-y">
      {rows.map(([k, v]) => (
        <div key={k} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
          <span className="text-muted-foreground">{k}</span>
          <span className="font-medium">{v}</span>
        </div>
      ))}
    </div>
  );
}
