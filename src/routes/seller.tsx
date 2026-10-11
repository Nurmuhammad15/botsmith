import { createFileRoute, Link } from "@tanstack/react-router";
import { Eye, Plus, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SellerSales } from "@/components/seller-sales";
import { DashboardLayout, StatCard, StatusBadge, DataTable } from "@/components/site";
import { getPublishedSellerBots, formatUZS } from "@/lib/data";
import { sellerNav } from "@/lib/nav";
import { useSellerBots } from "@/lib/seller-bots-context";
import {
  getMaximumWithdrawal,
  MINIMUM_RETAINED_BALANCE,
  useDemoSellerWallet,
} from "@/lib/seller-wallet";

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
  const publishedBots = getPublishedSellerBots();
  const { addedBots } = useSellerBots();
  const sellerBotRows = [...publishedBots, ...addedBots];
  const { balance, storageError } = useDemoSellerWallet();
  const maximumWithdrawal = getMaximumWithdrawal(balance);
  const totalEarnings = publishedBots.reduce((total, { bot }) => total + bot.price * bot.sales, 0);
  const totalOrders = publishedBots.reduce((total, { bot }) => total + bot.sales, 0);
  const totalViews = publishedBots.reduce((total, { views }) => total + views, 0);
  return (
    <DashboardLayout user="@dev_uz" role="Dasturchi" items={sellerNav}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="mb-1 text-xs text-muted-foreground">Sotuvchi paneli</p>
          <h1 className="text-2xl font-bold">Mening botlarim</h1>
        </div>
        <span className="text-xs text-muted-foreground">Namunaviy ma’lumotlar</span>
      </div>
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
          <SellerSales />
        </div>
        <StatCard label="Balans" value={formatUZS(balance)}>
          <p className="mt-2 text-xs text-muted-foreground">
            Yechish mumkin: {formatUZS(maximumWithdrawal)} · hisobda kamida{" "}
            {formatUZS(MINIMUM_RETAINED_BALANCE)} qoladi
          </p>
          {storageError && (
            <p role="alert" className="mt-2 text-xs text-destructive">
              {storageError}
            </p>
          )}
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
          emptyMessage="Hozircha qo‘shilgan botlar yo‘q."
          rows={sellerBotRows.map(({ bot, status, views }) => [
            status === "published" ? (
              <Link
                to="/seller-bots/$id"
                params={{ id: bot.id }}
                aria-label={`${bot.title} statistikasini ko‘rish`}
              >
                <p className="font-medium">{bot.title}</p>
                <p className="text-xs text-muted-foreground">{bot.sales} sotuv</p>
              </Link>
            ) : (
              <div>
                <p className="font-medium">{bot.title}</p>
                <p className="text-xs text-muted-foreground">Ko‘rib chiqilmoqda</p>
              </div>
            ),
            <StatusBadge status={status} />,
            formatUZS(bot.price),
            status === "published" ? (
              <Link
                to="/seller-bots/$id"
                params={{ id: bot.id }}
                className="rounded-sm hover:text-primary"
                aria-label={`${bot.title}: ${views} ko‘rish, statistikani ochish`}
              >
                {views} ko'rish
              </Link>
            ) : (
              `${views} ko‘rish`
            ),
            status === "published" ? (
              <Button asChild variant="ghost" size="icon">
                <Link
                  to="/seller-bots/$id"
                  params={{ id: bot.id }}
                  aria-label={`${bot.title} statistikasini ko‘rish`}
                  title="Bot statistikasi"
                >
                  <Eye />
                </Link>
              </Button>
            ) : null,
          ])}
        />
      </div>
    </DashboardLayout>
  );
}
