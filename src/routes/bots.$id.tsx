import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, Check, ChevronRight, Clock, Languages, RefreshCw } from "lucide-react";
import { SiteLayout, Rating, Tabs } from "@/components/site";
import { bots, getBot, formatUZS } from "@/lib/data";
import { useT } from "@/lib/i18n";
import { useMarketplaceAccount } from "@/lib/marketplace-auth-context";
import cover from "@/assets/bot-cover.jpg";

export const Route = createFileRoute("/bots/$id")({
  loader: ({ params }) => {
    const bot = getBot(params.id);
    if (!bot) throw notFound();
    return { id: bot.id, title: bot.title, desc: bot.desc };
  },
  head: ({ loaderData }) =>
    loaderData
      ? {
          meta: [
            { title: `${loaderData.title} — BotSmith` },
            { name: "description", content: loaderData.desc },
            { property: "og:title", content: `${loaderData.title} — BotSmith` },
            { property: "og:description", content: loaderData.desc },
          ],
        }
      : { meta: [{ title: "Bot topilmadi" }, { name: "robots", content: "noindex" }] },
  component: Detail,
});

function Detail() {
  const { id } = Route.useLoaderData();
  const bot = getBot(id)!;
  const account = useMarketplaceAccount();
  const { t } = useT();
  const [tab, setTab] = useState(0);
  const features = [
    "Mahsulotlar katalogi",
    "Buyurtma boshqaruvi",
    "To'lov tizimi (Payme, Click)",
    "Yetkazib berish nazorati",
    "Admin panel",
  ];
  return (
    <SiteLayout>
      <div className="mx-auto max-w-7xl px-4 py-6">
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <Link
            to="/bots"
            aria-label="Botlar ro'yxatiga qaytish"
            title="Botlar ro'yxatiga qaytish"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full border hover:bg-muted"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <p>
            <Link to="/">Bosh sahifa</Link> › <Link to="/bots">Botlar</Link> › {bot.title}
          </p>
        </div>
        <div className="mt-4 grid gap-8 md:grid-cols-2">
          <div>
            <img
              src={cover}
              alt={bot.title}
              width={1280}
              height={800}
              className="aspect-[16/10] w-full rounded-2xl object-cover"
            />
            <div className="mt-3 flex gap-2">
              {[0, 1, 2, 3].map((i) => (
                <img
                  key={i}
                  src={cover}
                  alt=""
                  loading="lazy"
                  width={1280}
                  height={800}
                  className="h-14 w-20 rounded-lg object-cover opacity-80"
                />
              ))}
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">{bot.title}</h1>
            </div>
            <div className="mt-2">
              <Rating value={bot.rating} count={bot.reviews} />
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              {bot.desc} Mahsulotlarni ko'rsatish, buyurtma qabul qilish, to'lov va yetkazib berish.
            </p>
            <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
              {account && <p className="text-2xl font-bold text-primary">{formatUZS(bot.price)}</p>}
              <div className="flex flex-wrap gap-3">
                <Link
                  to={account ? "/dashboard/purchases" : "/login"}
                  className="rounded-lg bg-primary px-8 py-3 text-sm font-semibold text-primary-foreground"
                >
                  {account ? t("buy") : "Kirish va xarid qilish"}
                </Link>
                <Link
                  to="/support-chat"
                  className="rounded-lg border border-primary px-6 py-3 text-sm font-semibold text-primary"
                >
                  {t("message")}
                </Link>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-3 gap-3">
              {[
                [Clock, "Yetkazib berish", `1–${bot.delivery} soat`],
                [RefreshCw, "Kafolat", "30 kun"],
                [Languages, "Tillar", "Uz, Ru"],
              ].map(([I, a, b]) => {
                const Icon = I as typeof Clock;
                return (
                  <div key={a as string} className="card-soft flex items-center gap-2 p-3">
                    <Icon className="h-4 w-4 text-primary" />
                    <div>
                      <p className="text-[11px] text-muted-foreground">{a as string}</p>
                      <p className="text-xs font-medium">{b as string}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <div className="mt-10 grid gap-8 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <Tabs
              tabs={["Tavsif", "Imkoniyatlar", "Texnologiyalar", `Sharhlar (${bot.reviews})`]}
              value={tab}
              onChange={setTab}
            />
            <div className="py-5 text-sm">
              {tab === 0 && (
                <>
                  <p className="text-muted-foreground">
                    Bu bot onlayn do'konlar uchun mo'ljallangan. U mahsulotlarni ko'rsatish,
                    buyurtma qabul qilish, to'lov va yetkazib berish jarayonini to'liq
                    avtomatlashtiradi.
                  </p>
                  <p className="mt-5 font-semibold">Asosiy imkoniyatlar:</p>
                  <ul className="mt-3 space-y-2">
                    {features.map((f) => (
                      <li key={f} className="flex items-center gap-2">
                        <Check className="h-4 w-4 text-success" />
                        {f}
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {tab === 1 && (
                <ul className="space-y-2">
                  {features.map((f) => (
                    <li key={f} className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-success" />
                      {f}
                    </li>
                  ))}
                </ul>
              )}
              {tab === 2 && (
                <div className="flex flex-wrap gap-2">
                  {["Python", "aiogram 3", "PostgreSQL", "Redis", "Docker"].map((x) => (
                    <span key={x} className="rounded-full bg-muted px-3 py-1">
                      {x}
                    </span>
                  ))}
                </div>
              )}
              {tab === 3 && (
                <div className="space-y-4">
                  {[
                    ["Aziz", "Juda yaxshi bot, tez sozlab berishdi!"],
                    ["Malika", "Sotuvchi bilan aloqa a'lo darajada."],
                  ].map(([n, c]) => (
                    <div key={n} className="card-soft p-4">
                      <p className="font-medium">{n}</p>
                      <Rating value={5} />
                      <p className="mt-1 text-muted-foreground">{c}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="space-y-6">
            <div className="card-soft p-5">
              <div className="flex items-center gap-3">
                <span className="grid h-11 w-11 place-items-center rounded-full bg-primary-soft font-semibold text-primary">
                  D
                </span>
                <div>
                  <p className="font-semibold">{bot.seller}</p>
                </div>
              </div>
              <button className="mt-4 w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground">
                {t("message")}
              </button>
            </div>
            <div>
              <p className="mb-3 font-semibold">O'xshash botlar</p>
              <div className="space-y-3">
                {bots
                  .filter((b) => b.id !== bot.id)
                  .slice(0, 3)
                  .map((b) => (
                    <Link
                      key={b.id}
                      to="/bots/$id"
                      params={{ id: b.id }}
                      className="card-soft flex items-center gap-3 p-3"
                    >
                      <div className="flex-1">
                        <p className="text-sm font-medium">{b.title}</p>
                        {account ? (
                          <p className="text-xs font-semibold text-primary">{formatUZS(b.price)}</p>
                        ) : (
                          <p className="text-xs text-muted-foreground">Narx uchun tizimga kiring</p>
                        )}
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </Link>
                  ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </SiteLayout>
  );
}
