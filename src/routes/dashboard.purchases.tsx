import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { DashboardLayout, StatusBadge, Stepper, Tabs } from "@/components/site";
import { orders, formatUZS } from "@/lib/data";
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
  const [tab, setTab] = useState(0);
  const [sel, setSel] = useState(0);
  const list = orders.filter((o) => tab === 0 || (tab === 1 ? o.status < 4 : o.status === 4));
  const o = orders[sel]!;
  return (
    <DashboardLayout user="Sardorbek" role="Xaridor" items={buyerNav}>
      <h1 className="text-xl font-bold">Mening buyurtmalarim</h1>
      {orders.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          Hozircha buyurtmalar yo‘q.
        </p>
      ) : (
        <div className="mt-4 grid gap-6 lg:grid-cols-2">
          <div>
            <Tabs tabs={["Barcha", "Faol", "Yakunlangan"]} value={tab} onChange={setTab} />
            <div className="mt-4 space-y-3">
              {list.map((x) => {
                const i = orders.indexOf(x);
                return (
                  <button
                    key={x.id}
                    onClick={() => setSel(i)}
                    className={cn(
                      "card-soft flex w-full items-center gap-3 p-4 text-left",
                      sel === i && "border-primary",
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">{x.id}</p>
                      <p className="text-xs text-muted-foreground">{x.bot.title}</p>
                      <p className="text-xs">{formatUZS(x.bot.price)}</p>
                    </div>
                    <StatusBadge status={x.status === 4 ? "done" : "delivering"} />
                  </button>
                );
              })}
              {list.length === 0 && (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Bu bo‘limda buyurtma yo‘q.
                </p>
              )}
            </div>
          </div>
          <div className="card-soft h-fit p-5">
            <p className="font-semibold">Buyurtma tafsilotlari</p>
            <p className="mt-3 text-sm font-medium">{o.id}</p>
            <p className="text-xs text-muted-foreground">{o.date}</p>
            <div className="mt-4 flex items-center gap-3 rounded-xl border p-3">
              <div className="flex-1">
                <p className="text-sm font-semibold">{o.bot.title}</p>
                <p className="text-xs text-muted-foreground">{formatUZS(o.bot.price)}</p>
              </div>
              <StatusBadge status={o.status === 4 ? "ready" : "delivering"} />
            </div>
            <div className="mt-6">
              <Stepper step={o.status} />
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
