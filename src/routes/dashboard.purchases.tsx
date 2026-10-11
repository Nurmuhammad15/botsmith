import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { DashboardLayout, StatusBadge, Stepper, Tabs } from "@/components/site";
import { useOrders } from "@/lib/api";
import { formatUZS, orderCode, orderStep, type Order } from "@/lib/data";
import { useMarketplaceAccount } from "@/lib/marketplace-auth-context";
import { buyerNav } from "@/lib/nav";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/dashboard/purchases")({
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
  const { data: orders = [], isPending, isError } = useOrders("buyer", account?.id);
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
              <p className="mt-4 rounded-lg bg-muted p-3 text-xs text-muted-foreground">
                Buyurtma qabul qilindi, lekin hali to‘lanmagan. Onlayn to‘lov (Payme, Click) hali
                ulanmagan — to‘lov uchun yordam chatiga murojaat qiling, to‘lov tasdiqlangach
                buyurtma faollashadi.
              </p>
            )}
            {current.status !== "cancelled" && (
              <div className="mt-6">
                <Stepper step={orderStep(current.status)} />
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
