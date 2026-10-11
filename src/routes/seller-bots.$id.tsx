import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft, Eye, ShoppingBag, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SellerPage } from "@/components/seller-pages";
import { formatUZS, getPublishedSellerBots } from "@/lib/data";

export const Route = createFileRoute("/seller-bots/$id")({
  loader: ({ params }) => {
    const entry = getPublishedSellerBots().find(({ bot }) => bot.id === params.id);
    if (!entry) throw notFound();
    return entry;
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: `${loaderData?.bot.title ?? "Bot statistikasi"} — BotSmith` },
      { name: "description", content: "Sotuvchining e’lon qilingan bot statistikasi." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SellerBotStatistics,
});

function SellerBotStatistics() {
  const { bot, views } = Route.useLoaderData();

  return (
    <SellerPage title="Bot statistikasi">
      <div className="mb-6">
        <Button asChild variant="outline">
          <Link to="/seller">
            <ArrowLeft />
            Sotuvchi kabinetiga qaytish
          </Link>
        </Button>
      </div>

      <div className="mb-8">
        <div>
          <h2 className="text-xl font-semibold">{bot.title}</h2>
          <p className="text-sm text-muted-foreground">E’lon qilingan bot · {bot.seller}</p>
        </div>
      </div>

      <p className="mb-4 text-sm text-muted-foreground">
        Ushbu sotuvchining e’lon qilingan botiga tegishli ko‘rsatkichlar. Hozircha namunaviy
        statistika; haqiqiy analytics xizmati ulanmagan.
      </p>

      <dl className="grid gap-4 sm:grid-cols-3">
        <div className="card-soft p-5">
          <dt className="flex items-center gap-2 text-sm text-muted-foreground">
            <Eye className="h-4 w-4 text-primary" />
            Ko‘rishlar
          </dt>
          <dd className="mt-3 text-2xl font-bold">{views.toLocaleString("ru-RU")}</dd>
          <p className="mt-1 text-xs text-muted-foreground">Bot sahifasi ko‘rilgan</p>
        </div>
        <div className="card-soft p-5">
          <dt className="flex items-center gap-2 text-sm text-muted-foreground">
            <ShoppingBag className="h-4 w-4 text-primary" />
            Jami buyurtmalar
          </dt>
          <dd className="mt-3 text-2xl font-bold">{bot.sales.toLocaleString("ru-RU")}</dd>
          <p className="mt-1 text-xs text-muted-foreground">Bot bo‘yicha buyurtmalar soni</p>
        </div>
        <div className="card-soft p-5">
          <dt className="flex items-center gap-2 text-sm text-muted-foreground">
            <Wallet className="h-4 w-4 text-primary" />
            Jami daromad
          </dt>
          <dd className="mt-3 text-2xl font-bold">{formatUZS(bot.price * bot.sales)}</dd>
          <p className="mt-1 text-xs text-muted-foreground">Narx × buyurtmalar · namunaviy hisob</p>
        </div>
      </dl>
    </SellerPage>
  );
}
