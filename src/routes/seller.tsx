import { createFileRoute, Link } from "@tanstack/react-router";
import { Eye, ImagePlus, Plus, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SellerSales } from "@/components/seller-sales";
import { DashboardLayout, StatCard, StatusBadge, DataTable } from "@/components/site";
import { useMyBots, useWallet } from "@/lib/api";
import { formatUZS } from "@/lib/data";
import { sellerNav } from "@/lib/nav";
import { getMaximumWithdrawal, MINIMUM_RETAINED_BALANCE } from "@/lib/wallet";

export const Route = createFileRoute("/seller")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "Sotuvchi paneli — BotSmith" },
      {
        name: "description",
        content: "Daromad, sotuvlar, ko'rishlar va botlaringizni boshqaring.",
      },
      { property: "og:title", content: "Sotuvchi paneli — BotSmith" },
      { property: "og:description", content: "Daromad va botlaringizni boshqaring." },
    ],
  }),
  component: Seller,
});

function Seller() {
  return (
    <DashboardLayout user="" role="Dasturchi" items={sellerNav}>
      <SellerContent />
    </DashboardLayout>
  );
}

const botStatus = { published: "published", pending: "review", rejected: "draft" } as const;

function SellerContent() {
  const { data: bots = [], isPending, isError } = useMyBots();
  const { data: wallet } = useWallet();
  const balance = wallet?.balance ?? 0;
  const totalEarnings = bots.reduce((total, bot) => total + bot.earned, 0);
  const totalOrders = bots.reduce((total, bot) => total + bot.sales, 0);
  const totalViews = bots.reduce((total, bot) => total + bot.views, 0);
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="mb-1 text-xs text-muted-foreground">Sotuvchi paneli</p>
          <h1 className="text-2xl font-bold">Mening botlarim</h1>
        </div>
      </div>
      {isError && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          Ma’lumotlarni yuklab bo‘lmadi. Sahifani yangilang.
        </p>
      )}
      <div className="mt-4 grid gap-4 lg:grid-cols-4">
        <div className="min-w-0 lg:col-span-3">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Jami daromad</p>
              <p className="mt-1 text-lg font-bold">{formatUZS(totalEarnings)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Buyurtmalar</p>
              <p className="mt-1 text-lg font-bold">{totalOrders.toLocaleString("ru-RU")}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Ko'rishlar</p>
              <p className="mt-1 text-lg font-bold">{totalViews.toLocaleString("ru-RU")}</p>
            </div>
          </div>
          <SellerSales bots={bots} />
        </div>
        <StatCard label="Balans" value={formatUZS(balance)}>
          <p className="mt-2 text-xs text-muted-foreground">
            Yechish mumkin: {formatUZS(getMaximumWithdrawal(balance))} · hisobda kamida{" "}
            {formatUZS(MINIMUM_RETAINED_BALANCE)} qoladi
          </p>
          <Button asChild className="mt-5 w-full">
            <Link to="/withdraw">
              <ArrowUpRight />
              Pul yechish
            </Link>
          </Button>
        </StatCard>
      </div>
      <div className="mt-8 flex items-center justify-between">
        <h2 className="font-bold">Mening botlarim</h2>
        <Button asChild>
          <Link to="/seller-new-bot">
            <Plus />
            Yangi bot qo‘shish
          </Link>
        </Button>
      </div>
      <div className="mt-4">
        <DataTable
          head={["Bot", "Holat", "Narx", "Ko'rishlar", ""]}
          emptyMessage={isPending ? "Yuklanmoqda…" : "Hozircha qo‘shilgan botlar yo‘q."}
          rows={bots.map((bot) => {
            const published = bot.status === "published";
            return [
              <Link
                to="/seller-bots/$id"
                params={{ id: bot.id }}
                aria-label={`${bot.title} ni boshqarish`}
              >
                <p className="font-medium">{bot.title}</p>
                <p className="text-xs text-muted-foreground">
                  {published
                    ? `${bot.sales} sotuv`
                    : bot.status === "pending"
                      ? "Ko‘rib chiqilmoqda"
                      : "Rad etilgan"}
                </p>
              </Link>,
              <StatusBadge status={botStatus[bot.status]} />,
              formatUZS(bot.price),
              `${bot.views} ko‘rish`,
              <Button asChild variant="ghost" size="icon">
                <Link
                  to="/seller-bots/$id"
                  params={{ id: bot.id }}
                  aria-label={
                    published
                      ? `${bot.title} statistikasi va fayllari`
                      : `${bot.title} rasm va fayllari`
                  }
                  title={published ? "Statistika va fayllar" : "Rasm va fayllar"}
                >
                  {published ? <Eye /> : <ImagePlus />}
                </Link>
              </Button>,
            ];
          })}
        />
      </div>
    </>
  );
}
