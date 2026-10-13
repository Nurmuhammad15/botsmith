import { createFileRoute, Link } from "@tanstack/react-router";
import { Search, ShieldCheck, BadgeCheck, RotateCcw, ArrowRight, Send } from "lucide-react";
import { SiteLayout, BotCard } from "@/components/site";
import { useMarketplaceAccount } from "@/lib/marketplace-auth-context";
import { useBots } from "@/lib/api";
import { categories } from "@/lib/data";
import { useT } from "@/lib/i18n";
import hero from "@/assets/hero.png";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "BotHub — Telegram botlarni xarid qiling yoki soting" },
      {
        name: "description",
        content:
          "Tayyor Telegram botlar, ishonchli dasturchilar va xavfsiz to'lov. Payme va Click orqali.",
      },
      { property: "og:title", content: "BotHub — Telegram botlar marketplace" },
      {
        property: "og:description",
        content: "Tayyor Telegram botlarni xarid qiling yoki o'zingizni soting.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  const { t } = useT();
  const account = useMarketplaceAccount();
  const { data: bots = [], isError } = useBots();
  const popular = [...bots].sort((a, b) => b.sales - a.sales).slice(0, 4);
  return (
    <SiteLayout>
      <section className="mx-auto grid max-w-7xl items-center gap-8 px-4 py-10 md:grid-cols-2 md:py-16">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full bg-primary-soft px-3 py-1 text-xs font-medium text-primary">
            <Send className="h-3 w-3" />
            Telegram bot markazi
          </span>
          <h1 className="mt-5 text-4xl font-extrabold leading-tight tracking-tight md:text-5xl">
            <span className="text-primary">{t("heroA")}</span> {t("heroB")}
            <br />
            {t("heroC")} {t("heroD")}
            <br />
            <span className="text-primary">{t("heroE")}</span>
          </h1>
          <p className="mt-4 max-w-lg text-muted-foreground">{t("heroSub")}</p>
          <form
            className="mt-6 flex max-w-lg items-center gap-2 rounded-xl border p-1.5"
            action={account ? "/bots" : "/login"}
          >
            <Search className="ml-2 h-4 w-4 text-muted-foreground" />
            <input
              name="q"
              placeholder={t("search")}
              className="flex-1 bg-transparent text-sm outline-none"
            />
            <button
              className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-primary-foreground"
              aria-label="Search"
            >
              <Search className="h-4 w-4" />
            </button>
          </form>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              to={account ? "/bots" : "/login"}
              className="rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground"
            >
              {account ? t("viewBots") : "Kirish va botlarni ko‘rish"}
            </Link>
            <Link
              to="/register"
              className="rounded-lg border border-primary px-5 py-3 text-sm font-semibold text-primary"
            >
              {t("startSelling")}
            </Link>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            Akkauntingiz bormi?{" "}
            <Link to="/login" className="font-medium text-primary">
              Kirish
            </Link>
            {" · "}
            <Link to="/register" className="font-medium text-primary">
              Ro‘yxatdan o‘tish
            </Link>
          </p>
        </div>
        <img
          src={hero}
          alt="Telegram bot"
          width={1024}
          height={1024}
          className="mx-auto hidden w-full max-w-md md:block"
        />
      </section>

      <section className="mx-auto max-w-7xl px-4">
        <h2 className="text-xl font-bold">{t("categories")}</h2>
        <div className="mt-4 flex gap-3 overflow-x-auto pb-2">
          {categories.map((c) => (
            <Link
              key={c.slug}
              to={account ? "/bots" : "/login"}
              className="card-soft flex shrink-0 items-center gap-3 px-4 py-3"
            >
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary-soft text-primary">
                <c.icon className="h-4 w-4" />
              </span>
              <span>
                <span className="block text-sm font-medium">{c.name}</span>
                <span className="text-xs text-muted-foreground">{c.sub}</span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pt-12">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">{t("popular")}</h2>
          <Link
            to={account ? "/bots" : "/login"}
            className="flex items-center gap-1 text-sm font-medium text-primary"
          >
            {t("seeAll")}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        {popular.length ? (
          <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {popular.map((b) => (
              <BotCard key={b.id} bot={b} />
            ))}
          </div>
        ) : (
          <p className="mt-4 rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            {isError
              ? "Botlarni yuklab bo‘lmadi. Keyinroq qayta urinib ko‘ring."
              : "Hozircha botlar qo‘shilmagan."}
          </p>
        )}
      </section>

      <section id="how" className="mx-auto grid max-w-7xl gap-6 px-4 pt-12 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <h2 className="text-xl font-bold">Qanday ishlaydi?</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Steps
              title="Xaridorlar uchun"
              items={[
                ["Botni tanlang", "Katalogdan kerakli botni toping"],
                ["To'lov qiling", "Payme yoki Click orqali xavfsiz"],
                ["Obunani faollashtiring", "To‘lovdan keyin botga kirish ochiladi"],
              ]}
            />
            <Steps
              title="Sotuvchilar uchun"
              items={[
                ["Botni joylang", "Bot ma'lumotlarini kiriting"],
                ["Buyurtmalarni oling", "Xaridorlar bilan ishlang"],
                ["Daromad qiling", "Pulni hisobingizga yeching"],
              ]}
            />
          </div>
        </div>
        <div>
          <h2 className="text-xl font-bold">Nega aynan BotHub?</h2>
          <div className="card-soft mt-4 flex flex-col gap-5 p-5">
            {[
              [ShieldCheck, "Xavfsiz to'lov", "Payme va Click"],
              [BadgeCheck, "Tasdiqlangan dasturchilar", "Haqiqiy profil va sharhlar"],
              [RotateCcw, "Qaytarish so‘rovi", "To‘lovdan keyin 24 soat ichida"],
            ].map(([I, a, b]) => {
              const Icon = I as typeof ShieldCheck;
              return (
                <div key={a as string} className="flex gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">
                    <Icon className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold">{a as string}</p>
                    <p className="text-xs text-muted-foreground">{b as string}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </SiteLayout>
  );
}

function Steps({ title, items }: { title: string; items: [string, string][] }) {
  return (
    <div className="card-soft p-5">
      <p className="font-semibold">{title}</p>
      <div className="mt-4 flex flex-col gap-4">
        {items.map(([a, b], i) => (
          <div key={a} className="flex gap-3">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
              {i + 1}
            </span>
            <div>
              <p className="text-sm font-medium">{a}</p>
              <p className="text-xs text-muted-foreground">{b}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
