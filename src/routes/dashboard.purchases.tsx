import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { MessageSquare } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { CryptoPay } from "@/components/crypto-pay";
import { DashboardLayout, StatusBadge, Tabs } from "@/components/site";
import {
  describeError,
  useAcceptSubscriptionTerms,
  useOrders,
  useRequestSubscriptionRefund,
} from "@/lib/api";
import { useOpenConversation } from "@/lib/api-chat";
import { formatUZS, orderCode, type Order } from "@/lib/data";
import { useMarketplaceAccount } from "@/lib/marketplace-auth-context";
import {
  availablePaymentMethods,
  PAYMENT_LABELS,
  paymentUrl,
  type PaymentMethod,
} from "@/lib/payments";
import { buyerNav } from "@/lib/nav";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/dashboard/purchases")({
  // `?pay=payme|click` is added to the return URL we give the payment provider.
  validateSearch: (search: Record<string, unknown>): { pay?: PaymentMethod | undefined } => ({
    pay: search["pay"] === "payme" || search["pay"] === "click" ? search["pay"] : undefined,
  }),
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "Mening buyurtmalarim — BotSmith" },
      {
        name: "description",
        content: "Xarid qilingan botlar, buyurtma holati va bot ma'lumotlari.",
      },
      { property: "og:title", content: "Mening buyurtmalarim — BotSmith" },
      { property: "og:description", content: "Xarid qilingan botlar va buyurtma holati." },
    ],
  }),
  component: Purchases,
});

function Purchases() {
  return (
    <DashboardLayout user="" role="Xaridor" items={buyerNav}>
      <PurchasesContent />
    </DashboardLayout>
  );
}

const isSubscriptionActive = (order: Order) =>
  order.status === "paid" &&
  (!order.subscriptionExpiresAt || Date.parse(order.subscriptionExpiresAt) > Date.now());

const statusBadge = (order: Order) =>
  order.status === "paid"
    ? isSubscriptionActive(order)
      ? "active"
      : "expired"
    : order.status === "done"
      ? "done"
      : order.status === "pending_payment" || order.status === "cancelled"
        ? "pending"
        : "delivering";

const statusLabel: Record<Order["status"], string> = {
  pending_payment: "To‘lov kutilmoqda",
  paid: "Obuna faol",
  delivering: "Yetkazib berilmoqda",
  done: "Yakunlangan",
  cancelled: "Bekor qilingan",
};

function PurchasesContent() {
  const account = useMarketplaceAccount();
  const { pay } = Route.useSearch();
  const {
    data: orders = [],
    isPending,
    isError,
  } = useOrders("buyer", account?.id, { fastPoll: Boolean(pay) });
  const [tab, setTab] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);

  const list = orders.filter(
    (o) => tab === 0 || (tab === 1 ? isSubscriptionActive(o) : !isSubscriptionActive(o)),
  );
  const current = orders.find((o) => o.id === selected) ?? list[0];

  if (isPending) {
    return <p className="mt-4 text-sm text-muted-foreground">Yuklanmoqda…</p>;
  }

  return (
    <>
      <h1 className="text-xl font-bold">Mening buyurtmalarim</h1>
      {isError ? (
        <p role="alert" className="mt-4 text-sm text-destructive">
          Buyurtmalarni yuklab bo‘lmadi. Sahifani yangilang.
        </p>
      ) : orders.length === 0 || !current ? (
        <p className="mt-4 rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          Hozircha buyurtmalar yo‘q.
        </p>
      ) : (
        <div className="mt-4 grid gap-6 lg:grid-cols-2">
          <div>
            <Tabs tabs={["Barcha", "Faol", "Boshqa holatlar"]} value={tab} onChange={setTab} />
            <div className="mt-4 space-y-3">
              {list.map((x) => (
                <button
                  key={x.id}
                  onClick={() => setSelected(x.id)}
                  className={cn(
                    "card-soft flex w-full items-center gap-3 p-4 text-left",
                    current.id === x.id && "border-primary",
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{orderCode(x.number)}</p>
                    <p className="text-xs text-muted-foreground">{x.botTitle}</p>
                    <p className="text-xs">
                      {formatUZS(x.amount)} · {x.subscriptionDays} kun
                    </p>
                  </div>
                  <StatusBadge status={statusBadge(x)} />
                </button>
              ))}
              {list.length === 0 && (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Bu bo‘limda buyurtma yo‘q.
                </p>
              )}
            </div>
          </div>
          <div className="card-soft h-fit p-5">
            <p className="font-semibold">Buyurtma tafsilotlari</p>
            <p className="mt-3 text-sm font-medium">{orderCode(current.number)}</p>
            <p className="text-xs text-muted-foreground">
              {new Date(current.createdAt).toLocaleString("uz-UZ")}
            </p>
            <div className="mt-4 flex items-center gap-3 rounded-xl border p-3">
              <div className="flex-1">
                <p className="text-sm font-semibold">{current.botTitle}</p>
                <p className="text-xs text-muted-foreground">
                  {formatUZS(current.amount)} · {current.subscriptionDays} kunlik obuna
                </p>
              </div>
              <span className="text-xs font-medium">
                {current.status === "paid"
                  ? isSubscriptionActive(current)
                    ? "Obuna faol"
                    : "Muddati tugagan"
                  : statusLabel[current.status]}
              </span>
            </div>
            {current.status === "pending_payment" && (
              <PayOrder key={current.id} order={current} returning={Boolean(pay)} />
            )}
            {current.status === "paid" && current.subscriptionExpiresAt && (
              <p className="mt-4 text-sm text-muted-foreground">
                {isSubscriptionActive(current) ? "Obuna faol" : "Obuna muddati tugagan"}:{" "}
                {new Date(current.subscriptionExpiresAt).toLocaleString("uz-UZ")} gacha.
              </p>
            )}
            {current.refundResolution === "refunded" ? (
              <p role="status" className="mt-4 rounded-lg bg-muted p-3 text-sm">
                To‘lov qaytarildi va obuna bekor qilindi.
              </p>
            ) : current.refundResolution === "rejected" ? (
              <p role="status" className="mt-4 rounded-lg bg-muted p-3 text-sm">
                Qaytarish so‘rovi rad etildi.
              </p>
            ) : current.status === "paid" && current.refundRequestedAt ? (
              <p role="status" className="mt-4 rounded-lg bg-muted p-3 text-sm">
                Qaytarish so‘rovingiz qabul qilindi. BotSmith jamoasi uni ko‘rib chiqadi.
              </p>
            ) : current.status === "paid" &&
              !current.refundRequestedAt &&
              current.paidAt &&
              Date.now() <= Date.parse(current.paidAt) + 24 * 60 * 60 * 1000 ? (
              <RefundRequest order={current} />
            ) : current.status === "paid" && !current.refundRequestedAt ? (
              <p className="mt-4 text-sm text-muted-foreground">
                Qaytarish so‘rovi uchun 24 soatlik muddat yakunlangan.
              </p>
            ) : null}
            <WriteToSeller botId={current.botId} />
          </div>
        </div>
      )}
    </>
  );
}

function WriteToSeller({ botId }: { botId: string }) {
  const navigate = useNavigate();
  const open = useOpenConversation();
  const [error, setError] = useState("");

  async function start() {
    setError("");
    try {
      const id = await open.mutateAsync({ botId });
      await navigate({ to: "/messages", search: { c: id } });
    } catch (e) {
      setError(describeError(e));
    }
  }

  return (
    <div className="mt-6">
      <Button variant="outline" onClick={start} disabled={open.isPending}>
        <MessageSquare />
        Sotuvchiga yozish
      </Button>
      {error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

function RefundRequest({ order }: { order: Order }) {
  const request = useRequestSubscriptionRefund();
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    try {
      await request.mutateAsync({ orderId: order.id, reason: reason.trim() });
      setSent(true);
    } catch (e) {
      setError(describeError(e));
    }
  }

  if (sent) {
    return (
      <p role="status" className="mt-4 rounded-lg bg-muted p-3 text-sm">
        Qaytarish so‘rovingiz yuborildi. BotSmith jamoasi uni ko‘rib chiqadi.
      </p>
    );
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="mt-5 space-y-3 rounded-lg border p-4">
      <p className="text-sm font-medium">Obuna mos kelmadimi?</p>
      <p className="text-xs text-muted-foreground">
        To‘lov tasdiqlanganidan keyin 24 soat ichida sababini yozib, qaytarish so‘rovini yuboring.
        <Link to="/terms" className="ml-1 text-primary underline">
          Qaytarish qoidalari
        </Link>
      </p>
      <label className="block space-y-1 text-sm">
        <span>Sabab</span>
        <textarea
          required
          minLength={3}
          maxLength={1000}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          className="min-h-20 w-full rounded-md border bg-background p-3"
        />
      </label>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" variant="outline" disabled={request.isPending}>
        {request.isPending ? "Yuborilmoqda…" : "Qaytarish so‘rovini yuborish"}
      </Button>
    </form>
  );
}

/** Payment buttons for an unpaid order; falls back to manual confirmation when none is set up. */
function PayOrder({ order, returning }: { order: Order; returning: boolean }) {
  const methods = availablePaymentMethods();
  const acceptTerms = useAcceptSubscriptionTerms(order.id);
  const [accepted, setAccepted] = useState(Boolean(order.termsAcceptedAt));
  const [error, setError] = useState("");

  useEffect(() => {
    setAccepted(Boolean(order.termsAcceptedAt));
    setError("");
  }, [order.id, order.termsAcceptedAt]);

  async function updateConsent(checked: boolean) {
    setError("");
    if (!checked) {
      setAccepted(false);
      return;
    }
    try {
      await acceptTerms.mutateAsync();
      setAccepted(true);
    } catch (e) {
      setError(describeError(e));
    }
  }

  const returnBase = `${window.location.origin}/dashboard/purchases`;
  return (
    <div className="mt-4 space-y-3 rounded-lg border p-4">
      {returning && (
        <p role="status" className="text-xs text-muted-foreground">
          To‘lov tekshirilmoqda… Tasdiqlangach holat bir necha soniyada yangilanadi.
        </p>
      )}
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={accepted || Boolean(order.termsAcceptedAt)}
          disabled={acceptTerms.isPending || Boolean(order.termsAcceptedAt)}
          onChange={(event) => void updateConsent(event.target.checked)}
          className="mt-1"
        />
        <span>
          Men{" "}
          <Link
            to="/terms"
            target="_blank"
            onClick={(event) => event.stopPropagation()}
            className="text-primary underline"
          >
            obuna va qaytarish qoidalarini
          </Link>{" "}
          o‘qidim va roziman.
        </span>
      </label>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          Rozilikni saqlab bo‘lmadi: {error}
        </p>
      )}
      {methods.length === 0 ? (
        <p className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">
          Onlayn to‘lov hozircha ulanmagan — to‘lov uchun yordam chatiga murojaat qiling, to‘lov
          tasdiqlangach obuna faollashadi.
        </p>
      ) : (
        <>
          <p className="text-sm font-medium">To‘lov usulini tanlang</p>
          <div className="flex flex-wrap gap-2">
            {methods.map((method) =>
              accepted || order.termsAcceptedAt ? (
                <Button key={method} asChild>
                  <a href={paymentUrl(method, order, `${returnBase}?pay=${method}`) ?? "#"}>
                    {PAYMENT_LABELS[method]} orqali to‘lash
                  </a>
                </Button>
              ) : (
                <Button key={method} disabled>
                  {PAYMENT_LABELS[method]} orqali to‘lash
                </Button>
              ),
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            To‘lovdan keyin obuna avtomatik faollashadi. To‘lov qilgan bo‘lsangiz-u, holat
            o‘zgarmasa, yordam chatiga yozing.
          </p>
        </>
      )}
      <CryptoPay orderId={order.id} enabled={accepted || Boolean(order.termsAcceptedAt)} />
    </div>
  );
}
