import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Eye, ShoppingBag, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SellerPage } from "@/components/seller-pages";
import { useMyBots } from "@/lib/api";
import { formatUZS } from "@/lib/data";

export const Route = createFileRoute("/seller-bots/$id")({
  head: () => ({
    meta: [
      { title: "Bot statistikasi — BotSmith" },
      { name: "description", content: "Sotuvchining e’lon qilingan bot statistikasi." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SellerBotStatistics,
});

function SellerBotStatistics() {
  return (
    <SellerPage title="Bot statistikasi">
      <SellerBotStatisticsContent />
    </SellerPage>
  );
}

function SellerBotStatisticsContent() {
  const { id } = Route.useParams();
  const { data: bots, isPending } = useMyBots();
  const bot = bots?.find((b) => b.id === id && b.status === "published");

  return (
    <>
      <div className="mb-6">
        <Button asChild variant="outline">
          <Link to="/seller">
            <ArrowLeft />
            Sotuvchi kabinetiga qaytish
          </Link>
        </Button>
      </div>

      {isPending ? (
        <p className="text-sm text-muted-foreground">Yuklanmoqda…</p>
      ) : !bot ? (
        <p className="text-sm text-muted-foreground">Bot topilmadi yoki hali e’lon qilinmagan.</p>
      ) : (
        <>
          <div className="mb-8">
            <h2 className="text-xl font-semibold">{bot.title}</h2>
            <p className="text-sm text-muted-foreground">E’lon qilingan bot</p>
          </div>

          <dl className="grid gap-4 sm:grid-cols-3">
            <div className="card-soft p-5">
              <dt className="flex items-center gap-2 text-sm text-muted-foreground">
                <Eye className="h-4 w-4 text-primary" />
                Ko‘rishlar
              </dt>
              <dd className="mt-3 text-2xl font-bold">{bot.views.toLocaleString("ru-RU")}</dd>
              <p className="mt-1 text-xs text-muted-foreground">Bot sahifasi ochilgan marta</p>
            </div>
            <div className="card-soft p-5">
              <dt className="flex items-center gap-2 text-sm text-muted-foreground">
                <ShoppingBag className="h-4 w-4 text-primary" />
                Jami buyurtmalar
              </dt>
              <dd className="mt-3 text-2xl font-bold">{bot.sales.toLocaleString("ru-RU")}</dd>
              <p className="mt-1 text-xs text-muted-foreground">To‘langan buyurtmalar soni</p>
            </div>
            <div className="card-soft p-5">
              <dt className="flex items-center gap-2 text-sm text-muted-foreground">
                <Wallet className="h-4 w-4 text-primary" />
                Jami daromad
              </dt>
              <dd className="mt-3 text-2xl font-bold">{formatUZS(bot.earned)}</dd>
              <p className="mt-1 text-xs text-muted-foreground">To‘langan buyurtmalar summasi</p>
            </div>
          </dl>
        </>
      )}
    </>
  );
}
