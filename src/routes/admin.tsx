import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Check, X } from "lucide-react";
import { toast } from "sonner";
import { DashboardLayout, StatusBadge, DataTable, Tabs } from "@/components/site";
import { bots, categories, formatUZS } from "@/lib/data";
import { adminNav } from "@/lib/nav";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "Moderatsiya navbati — BotSmith Admin" },
      {
        name: "description",
        content: "Yangi botlar, sotuvchilar, buyurtmalar va to'lovlarni moderatsiya qilish.",
      },
      { property: "og:title", content: "Moderatsiya — BotSmith" },
      { property: "og:description", content: "Admin moderatsiya paneli." },
    ],
  }),
  component: Admin,
});

function Admin() {
  const [tab, setTab] = useState(0);
  const [queue, setQueue] = useState(bots.slice(4, 9).map((b) => b.id));
  const act = (id: string, ok: boolean) => {
    setQueue((q) => q.filter((x) => x !== id));
    toast.success(ok ? "Tasdiqlandi" : "Rad etildi");
  };
  return (
    <DashboardLayout user="Admin" role="Administrator" items={adminNav}>
      <h1 className="text-xl font-bold">Moderatsiya navbati</h1>
      <div className="mt-4">
        <Tabs
          tabs={[`Yangi botlar (${queue.length})`, "Sotuvchilar", "Buyurtmalar", "To'lovlar"]}
          value={tab}
          onChange={setTab}
        />
      </div>
      <div className="mt-4">
        <DataTable
          head={["Bot nomi", "Kategoriya", "Sotuvchi", "Narx", "Holat", "Amallar"]}
          emptyMessage="Hozircha moderatsiya uchun bot yo‘q."
          rows={queue.map((id) => {
            const b = bots.find((x) => x.id === id)!;
            return [
              <div>
                <p className="font-medium">{b.title}</p>
                <p className="text-xs text-muted-foreground">1 soat oldin</p>
              </div>,
              categories.find((c) => c.slug === b.category)?.name,
              <span className="text-primary">{b.seller}</span>,
              formatUZS(b.price),
              <StatusBadge status="pending" />,
              <div className="flex gap-2">
                <button
                  onClick={() => act(id, true)}
                  aria-label="Approve"
                  className="grid h-8 w-8 place-items-center rounded-md bg-success-soft text-success"
                >
                  <Check className="h-4 w-4" />
                </button>
                <button
                  onClick={() => act(id, false)}
                  aria-label="Reject"
                  className="grid h-8 w-8 place-items-center rounded-md bg-destructive/10 text-destructive"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>,
            ];
          })}
        />
      </div>
    </DashboardLayout>
  );
}
