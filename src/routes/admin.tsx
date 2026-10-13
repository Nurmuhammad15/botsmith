import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Check, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AdminCardCell } from "@/components/admin-card-cell";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DashboardLayout, StatusBadge, DataTable, Tabs } from "@/components/site";
import {
  describeError,
  useAdminBots,
  useAdminOrders,
  useAdminCryptoPayments,
  useAdminResolveCryptoPayment,
  useAdminResolveSubscriptionRefund,
  useAdminSetCryptoSettings,
  useAdminSetUserPassword,
  useAdminBanUser,
  useAdminDeleteUser,
  useCryptoSettings,
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
import { PLATFORM_SALES_COMMISSION_RATE } from "@/lib/subscription";
import { WITHDRAWAL_FEE_RATE } from "@/lib/wallet";
import { useMarketplaceAccount } from "@/lib/marketplace-auth-context";
import { adminNav } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { formatDate, formatDateTime } from "@/lib/format";

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
      { title: "Moderatsiya navbati — BotHub Admin" },
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
  const crypto = useAdminCryptoPayments(isAdmin);
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
      <div className="mt-4 hidden md:block">
        <Tabs
          tabs={[
            `Botlar (${(bots.data ?? []).length})${pendingBots.length > 0 ? ` · ${pendingBots.length} yangi` : ""}`,
            "Buyurtmalar",
            `Yechishlar (${(withdrawals.data ?? []).length})${pendingWithdrawals.length > 0 ? ` · ${pendingWithdrawals.length} yangi` : ""}`,
            "Murojaatlar",
            "Statistika",
            "Foydalanuvchilar",
            "Sozlamalar",
          ]}
          value={tab}
          onChange={setTab}
        />
      </div>
      {[bots, orders, withdrawals, threads, stats, users].map(
        (q, i) =>
          q.isError && (
            <p
              key={i}
              role="alert"
              className="mt-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive"
            >
              Ma‘lumotni yuklab bo‘lmadi:{" "}
              {(q.error as { message?: string } | null)?.message ?? describeError(q.error)}
            </p>
          ),
      )}
      <div className="mt-4">
        {tab === 0 && <BotsTab bots={bots.data ?? []} loading={bots.isPending} />}
        {tab === 1 && (
          <OrdersTab
            orders={orders.data ?? []}
            crypto={crypto.data ?? []}
            loading={orders.isPending}
          />
        )}
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
  const [preview, setPreview] = useState<string | null>(null);
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
    <>
      <DataTable
        head={["Bot nomi", "Kategoriya", "Sotuvchi", "Narx", "Holat", "Amallar"]}
        emptyMessage={loading ? "Yuklanmoqda…" : "Botlar yo‘q."}
        rows={bots.map((b) => [
          <div>
            <Link
              to="/admin-bots/$id"
              params={{ id: b.id }}
              className="font-medium text-primary hover:underline"
            >
              {b.title}
            </Link>
            <p className="text-xs text-muted-foreground">{formatDate(b.createdAt)}</p>
            {b.images.length > 0 && (
              <div className="mt-2 flex gap-1">
                {b.images.map((src) => (
                  <button
                    key={src}
                    type="button"
                    aria-label="Rasmni kattalashtirish"
                    onClick={() => setPreview(src)}
                    className="rounded outline-offset-2"
                  >
                    <img
                      src={src}
                      alt=""
                      loading="lazy"
                      className="h-10 w-14 rounded object-cover"
                    />
                  </button>
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
      <Dialog open={preview !== null} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogContent className="max-w-3xl p-2">
          <DialogHeader className="sr-only">
            <DialogTitle>Rasm</DialogTitle>
            <DialogDescription>Bot rasmi</DialogDescription>
          </DialogHeader>
          {preview && (
            <img src={preview} alt="" className="max-h-[80vh] w-full rounded object-contain" />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

const paymentState = (state: number) =>
  state === 2 ? "to‘langan" : state === 1 ? "kutilmoqda" : state === -2 ? "qaytarilgan" : "bekor";

function OrdersTab({
  orders,
  crypto,
  loading,
}: {
  orders: NonNullable<ReturnType<typeof useAdminOrders>["data"]>;
  crypto: NonNullable<ReturnType<typeof useAdminCryptoPayments>["data"]>;
  loading: boolean;
}) {
  const resolveCrypto = useAdminResolveCryptoPayment();
  // Newest first, so the first payment seen for an order is its latest attempt.
  const cryptoByOrder = new Map<string, (typeof crypto)[number]>();
  for (const payment of crypto)
    if (!cryptoByOrder.has(payment.orderId)) cryptoByOrder.set(payment.orderId, payment);
  const actCrypto = (id: string, confirm: boolean) =>
    resolveCrypto.mutate(
      { id, confirm },
      {
        onSuccess: () => toast.success(confirm ? "To‘lov tasdiqlandi" : "Rad etildi"),
        onError: fail,
      },
    );
  const cryptoLabel = {
    submitted: "tekshirilmoqda",
    confirmed: "tasdiqlangan",
    rejected: "rad etilgan",
  } as const;
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
        "TxID",
        "Holat",
        "Qaytarish so‘rovi",
        "Amallar",
      ]}
      emptyMessage={loading ? "Yuklanmoqda…" : "Buyurtmalar yo‘q."}
      rows={orders.map((o) => {
        const pay = cryptoByOrder.get(o.id);
        return [
          orderCode(o.number),
          o.botTitle,
          o.buyer,
          o.seller,
          <div>
            <p className="font-medium">{formatUZS(o.amount)}</p>
            {pay && (
              <p className="text-xs text-muted-foreground">{pay.amountUsdt.toFixed(2)} USDT</p>
            )}
          </div>,
          `${o.subscriptionDays} kun`,
          pay?.txid ? (
            <a
              href={`https://tronscan.org/#/transaction/${pay.txid}`}
              target="_blank"
              rel="noreferrer"
              className="break-all font-mono text-xs text-primary underline"
            >
              {pay.txid.slice(0, 10)}…{pay.txid.slice(-6)}
            </a>
          ) : (
            "—"
          ),
          <div>
            <p>{label[o.status]}</p>
            {pay && (
              <p className="text-xs text-muted-foreground">
                USDT: {cryptoLabel[pay.status as keyof typeof cryptoLabel] ?? pay.status}
              </p>
            )}
            {o.payments.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {o.payments
                  .map(
                    (p) =>
                      `${p.provider === "payme" ? "Payme" : "Click"}: ${paymentState(p.state)}`,
                  )
                  .join(", ")}
              </p>
            )}
          </div>,
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
                <p className="text-muted-foreground">{formatDateTime(o.refundRequestedAt)}</p>
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
          pay?.status === "submitted" ? (
            <div className="flex gap-2">
              <button
                onClick={() => actCrypto(pay.id, true)}
                aria-label="Tasdiqlash"
                title="USDT to‘lovini tasdiqlash"
                disabled={resolveCrypto.isPending}
                className="grid h-8 w-8 place-items-center rounded-md bg-success-soft text-success"
              >
                <Check className="h-4 w-4" />
              </button>
              <button
                onClick={() => actCrypto(pay.id, false)}
                aria-label="Rad etish"
                title="USDT to‘lovini rad etish"
                disabled={resolveCrypto.isPending}
                className="grid h-8 w-8 place-items-center rounded-md bg-destructive/10 text-destructive"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : o.status === "pending_payment" ? (
            <div className="flex gap-2">
              <Button size="sm" onClick={() => act(o.id, "paid")}>
                To‘langan
              </Button>
              <Button size="sm" variant="outline" onClick={() => act(o.id, "cancelled")}>
                Bekor qilish
              </Button>
            </div>
          ) : null,
        ];
      })}
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
        formatDateTime(w.createdAt),
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
    ["Sayt daromadi (jami)", formatUZS(stats.saleCommission + stats.feePaid)],
    [
      `Sotuvdan komissiya (${Math.round(PLATFORM_SALES_COMMISSION_RATE * 100)}%)`,
      formatUZS(stats.saleCommission),
    ],
    ["Yechishdan komissiya (to‘langan)", formatUZS(stats.feePaid)],
    ["Kutilayotgan yechish komissiyasi", formatUZS(stats.feePending)],
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
        Sayt daromadi — har bir sotuvdan {Math.round(PLATFORM_SALES_COMMISSION_RATE * 100)}%
        platforma komissiyasi va sotuvchi pul yechganda olinadigan{" "}
        {Math.round(WITHDRAWAL_FEE_RATE * 100)}% komissiya yig‘indisi.
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
  const date = (v: string | null) => (v ? formatDateTime(v) : "—");
  const [target, setTarget] = useState<(typeof users)[number] | null>(null);
  const [banTarget, setBanTarget] = useState<(typeof users)[number] | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<(typeof users)[number] | null>(null);
  const ban = useAdminBanUser();
  return (
    <>
      <DataTable
        head={[
          "Foydalanuvchi",
          "Rol",
          "Ro‘yxatdan o‘tgan",
          "Oxirgi kirish",
          "Botlar",
          "Xaridlar",
          "Sotuvlar",
          "Amallar",
        ]}
        emptyMessage={loading ? "Yuklanmoqda…" : "Foydalanuvchilar yo‘q."}
        rows={users.map((u) => [
          <div>
            <p className="font-medium">{u.fullName || "—"}</p>
            <p className="text-xs text-muted-foreground">
              {u.email}
              {!u.emailConfirmed && " · tasdiqlanmagan"}
            </p>
            {u.bannedUntil && (
              <p className="text-xs font-medium text-destructive">
                Ban: {isForever(u.bannedUntil) ? "umrbod" : `${formatDateTime(u.bannedUntil)} gacha`}
              </p>
            )}
          </div>,
          u.role,
          date(u.createdAt),
          date(u.lastSignInAt),
          String(u.bots),
          String(u.purchases),
          String(u.sales),
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setTarget(u)}>
              Parol
            </Button>
            {u.role !== "admin" &&
              (u.bannedUntil ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={ban.isPending}
                  onClick={() =>
                    ban.mutate(
                      { userId: u.id, hours: null, unban: true },
                      { onSuccess: () => toast.success("Ban olib tashlandi"), onError: fail },
                    )
                  }
                >
                  Bandan chiqarish
                </Button>
              ) : (
                <Button size="sm" variant="outline" onClick={() => setBanTarget(u)}>
                  Ban
                </Button>
              ))}
            {u.role !== "admin" && (
              <Button size="sm" variant="destructive" onClick={() => setDeleteTarget(u)}>
                O‘chirish
              </Button>
            )}
          </div>,
        ])}
      />
      <PasswordDialog user={target} onClose={() => setTarget(null)} />
      <BanDialog user={banTarget} onClose={() => setBanTarget(null)} />
      <DeleteUserDialog user={deleteTarget} onClose={() => setDeleteTarget(null)} />
    </>
  );
}

/** Lifetime bans are stored as "now + 100 years". */
const isForever = (iso: string) => Date.parse(iso) - Date.now() > 50 * 365 * 24 * 3600 * 1000;

const BAN_OPTIONS: { label: string; hours: number | null }[] = [
  { label: "1 soat", hours: 1 },
  { label: "24 soat", hours: 24 },
  { label: "7 kun", hours: 24 * 7 },
  { label: "30 kun", hours: 24 * 30 },
  { label: "Umrbod", hours: null },
];

type DialogUser = { id: string; email: string; fullName: string } | null;

function BanDialog({ user, onClose }: { user: DialogUser; onClose: () => void }) {
  const ban = useAdminBanUser();
  const [choice, setChoice] = useState("24");
  const hours = choice === "forever" ? null : Number(choice);
  return (
    <Dialog open={Boolean(user)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Foydalanuvchini ban qilish</DialogTitle>
          <DialogDescription>
            {user?.fullName || "—"} · {user?.email}. U barcha qurilmalardan chiqib ketadi va ban
            tugaguncha saytga kira olmaydi.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 text-sm">
          <p>Qancha muddatga?</p>
          {BAN_OPTIONS.map((o) => {
            const value = o.hours === null ? "forever" : String(o.hours);
            return (
              <label key={value} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="ban-duration"
                  checked={choice === value}
                  onChange={() => setChoice(value)}
                />
                {o.label}
              </label>
            );
          })}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Bekor qilish
          </Button>
          <Button
            variant="destructive"
            disabled={ban.isPending || !user}
            onClick={() =>
              user &&
              ban.mutate(
                { userId: user.id, hours },
                {
                  onSuccess: () => {
                    toast.success("Foydalanuvchi ban qilindi");
                    onClose();
                  },
                  onError: fail,
                },
              )
            }
          >
            {ban.isPending ? "Saqlanmoqda…" : "Ban qilish"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteUserDialog({ user, onClose }: { user: DialogUser; onClose: () => void }) {
  const remove = useAdminDeleteUser();
  return (
    <Dialog open={Boolean(user)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Foydalanuvchini o‘chirish</DialogTitle>
          <DialogDescription>
            {user?.fullName || "—"} · {user?.email}. Akkaunt, uning botlari, sharhlari va
            yozishmalari butunlay o‘chiriladi. Buni qaytarib bo‘lmaydi. Buyurtma yoki yechish tarixi
            bo‘lsa, o‘chirilmaydi — uni ban qiling.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Bekor qilish
          </Button>
          <Button
            variant="destructive"
            disabled={remove.isPending || !user}
            onClick={() =>
              user &&
              remove.mutate(user.id, {
                onSuccess: () => {
                  toast.success("Foydalanuvchi o‘chirildi");
                  onClose();
                },
                onError: fail,
              })
            }
          >
            {remove.isPending ? "O‘chirilmoqda…" : "O‘chirish"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** 14 random characters without look-alikes (0/O, 1/l/I), from the browser's secure RNG. */
function randomPassword() {
  const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(14));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

function PasswordDialog({
  user,
  onClose,
}: {
  user: { id: string; email: string; fullName: string } | null;
  onClose: () => void;
}) {
  const setPassword = useAdminSetUserPassword();
  const [value, setValue] = useState("");
  const [shown, setShown] = useState(false);

  const close = () => {
    setValue("");
    setShown(false);
    onClose();
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!user) return;
    setPassword.mutate(
      { userId: user.id, password: value },
      {
        onSuccess: () => {
          toast.success("Parol o‘zgartirildi");
          close();
        },
        onError: fail,
      },
    );
  };

  return (
    <Dialog open={Boolean(user)} onOpenChange={(open) => !open && close()}>
      <DialogContent>
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Parolni o‘zgartirish</DialogTitle>
            <DialogDescription>
              {user?.fullName || "—"} · {user?.email}. Foydalanuvchi barcha qurilmalardan chiqib
              ketadi va yangi parol bilan kiradi.
            </DialogDescription>
          </DialogHeader>
          <label className="block space-y-1 text-sm">
            <span>Yangi parol (kamida 8 ta belgi)</span>
            <Input
              required
              minLength={8}
              maxLength={72}
              type={shown ? "text" : "password"}
              autoComplete="new-password"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </label>
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" checked={shown} onChange={(e) => setShown(e.target.checked)} />
              Parolni ko‘rsatish
            </label>
            <button
              type="button"
              className="text-xs text-primary underline"
              onClick={() => {
                setValue(randomPassword());
                setShown(true);
              }}
            >
              Tasodifiy parol yaratish
            </button>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>
              Bekor qilish
            </Button>
            <Button type="submit" disabled={setPassword.isPending}>
              {setPassword.isPending ? "Saqlanmoqda…" : "Saqlash"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SettingsTab({ email }: { email: string }) {
  const rows: [string, string][] = [
    ["Admin akkaunt", email],
    ["Komissiya (pul yechishda)", `${Math.round(WITHDRAWAL_FEE_RATE * 100)}%`],
    ["To‘lovlar", "Payme / Click yoki admin tasdig‘i"],
    ["Sotuvchilarga to‘lov", "Qo‘lda (Yechishlar tabida tasdiqlanadi)"],
  ];
  return (
    <div className="space-y-6">
      <div className="card-soft divide-y">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
            <span className="text-muted-foreground">{k}</span>
            <span className="font-medium">{v}</span>
          </div>
        ))}
      </div>
      <CryptoSettingsForm />
    </div>
  );
}

function CryptoSettingsForm() {
  const settings = useCryptoSettings();
  const save = useAdminSetCryptoSettings();
  const [wallet, setWallet] = useState<string | null>(null);
  const [rate, setRate] = useState<string | null>(null);
  const walletValue = wallet ?? settings.data?.walletAddress ?? "";
  const rateValue = rate ?? String(settings.data?.rate ?? 12800);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const numeric = Number(rateValue);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      toast.error("Kurs noto‘g‘ri.");
      return;
    }
    save.mutate(
      { wallet: walletValue.trim(), rate: numeric },
      { onSuccess: () => toast.success("Saqlandi"), onError: fail },
    );
  };

  return (
    <form onSubmit={submit} className="card-soft space-y-4 p-4">
      <div>
        <h2 className="font-semibold">USDT (TRC-20) to‘lovi</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Hamyon manzili bo‘sh bo‘lsa, USDT to‘lovi xaridorlarga ko‘rinmaydi. Faqat ochiq manzilni
          kiriting (T… bilan boshlanadi), hech qachon maxfiy kalit yoki seed-frazani emas.
        </p>
      </div>
      <label className="block space-y-1 text-sm">
        <span>Hamyon manzili (TRON)</span>
        <Input
          value={walletValue}
          onChange={(e) => setWallet(e.target.value)}
          placeholder="T..."
          className="font-mono text-xs"
        />
      </label>
      <label className="block space-y-1 text-sm">
        <span>Kurs: 1 USDT = ... so‘m</span>
        <Input
          type="number"
          min="1"
          step="0.01"
          value={rateValue}
          onChange={(e) => setRate(e.target.value)}
        />
      </label>
      <Button type="submit" disabled={save.isPending}>
        {save.isPending ? "Saqlanmoqda…" : "Saqlash"}
      </Button>
    </form>
  );
}
