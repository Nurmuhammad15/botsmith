import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Download, MessageSquare } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DashboardLayout, StatusBadge, Stepper, Tabs } from "@/components/site";
import { describeError, useOrders } from "@/lib/api";
import { useOpenConversation } from "@/lib/api-chat";
import { getBotFileUrl, useBotFiles } from "@/lib/api-media";
import { formatUZS, orderCode, orderStep, type Order } from "@/lib/data";
import { useMarketplaceAccount } from "@/lib/marketplace-auth-context";
import { formatBytes } from "@/lib/media";
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

const statusBadge = (order: Order) =>
  order.status === "done"
    ? "done"
    : order.status === "pending_payment" || order.status === "cancelled"
      ? "pending"
      : "delivering";

const statusLabel: Record<Order["status"], string> = {
  pending_payment: "To‘lov kutilmoqda",
  paid: "To‘langan",
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
    (o) =>
      tab === 0 ||
      (tab === 1 ? o.status !== "done" && o.status !== "cancelled" : o.status === "done"),
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
            <Tabs tabs={["Barcha", "Faol", "Yakunlangan"]} value={tab} onChange={setTab} />
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
                    <p className="text-xs">{formatUZS(x.amount)}</p>
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
                <p className="text-xs text-muted-foreground">{formatUZS(current.amount)}</p>
              </div>
              <span className="text-xs font-medium">{statusLabel[current.status]}</span>
            </div>
            {current.status === "pending_payment" && (
              <PayOrder order={current} returning={Boolean(pay)} />
            )}
            {current.status !== "cancelled" && (
              <div className="mt-6">
                <Stepper step={orderStep(current.status)} />
              </div>
            )}
            {["paid", "delivering", "done"].includes(current.status) && (
              <OrderFiles botId={current.botId} />
            )}
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

/** Deliverable files the seller attached to the bot; available once the order is paid. */
function OrderFiles({ botId }: { botId: string }) {
  const { data: files = [], isPending } = useBotFiles(botId);
  const [downloading, setDownloading] = useState<string | null>(null);

  if (isPending || files.length === 0) return null;

  async function download(file: (typeof files)[number]) {
    setDownloading(file.id);
    try {
      window.location.assign(await getBotFileUrl(file));
    } catch (e) {
      toast.error(describeError(e));
    } finally {
      setDownloading(null);
    }
  }

  return (
    <div className="mt-6">
      <p className="text-sm font-semibold">Bot fayllari</p>
      <ul className="mt-2 space-y-2">
        {files.map((file) => (
          <li key={file.id} className="flex items-center gap-3 rounded-lg border px-3 py-2 text-sm">
            <span className="min-w-0 flex-1 truncate">{file.name}</span>
            <span className="shrink-0 text-xs text-muted-foreground">{formatBytes(file.size)}</span>
            <Button
              size="sm"
              variant="outline"
              disabled={downloading === file.id}
              onClick={() => download(file)}
            >
              <Download />
              Yuklab olish
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Payment buttons for an unpaid order; falls back to manual confirmation when none is set up. */
function PayOrder({ order, returning }: { order: Order; returning: boolean }) {
  const methods = availablePaymentMethods();

  if (methods.length === 0) {
    return (
      <p className="mt-4 rounded-lg bg-muted p-3 text-xs text-muted-foreground">
        Buyurtma qabul qilindi, lekin hali to‘lanmagan. Onlayn to‘lov hozircha ulanmagan — to‘lov
        uchun yordam chatiga murojaat qiling, to‘lov tasdiqlangach buyurtma faollashadi.
      </p>
    );
  }

  const returnBase = `${window.location.origin}/dashboard/purchases`;
  return (
    <div className="mt-4 space-y-3 rounded-lg border p-4">
      {returning && (
        <p role="status" className="text-xs text-muted-foreground">
          To‘lov tekshirilmoqda… Tasdiqlangach holat bir necha soniyada yangilanadi.
        </p>
      )}
      <p className="text-sm font-medium">To‘lov usulini tanlang</p>
      <div className="flex flex-wrap gap-2">
        {methods.map((method) => (
          <Button key={method} asChild>
            <a href={paymentUrl(method, order, `${returnBase}?pay=${method}`) ?? "#"}>
              {PAYMENT_LABELS[method]} orqali to‘lash
            </a>
          </Button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        To‘lovdan keyin buyurtma avtomatik faollashadi. To‘lov qilgan bo‘lsangiz-u, holat
        o‘zgarmasa, yordam chatiga yozing.
      </p>
    </div>
  );
}
