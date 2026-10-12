import { createFileRoute, Link } from "@tanstack/react-router";
import { Bot, CreditCard, Search, UserPlus, Upload, PackageCheck, Wallet } from "lucide-react";
import { SiteLayout } from "@/components/site";
import { Button } from "@/components/ui/button";
import { WITHDRAWAL_FEE_RATE } from "@/lib/wallet";

const steps = [
  {
    icon: Search,
    title: "Bot tanlang",
    description: "Katalogdagi botlarni narx, kategoriya va reyting bo‘yicha solishtiring.",
  },
  {
    icon: CreditCard,
    title: "Buyurtma bering",
    description: "Tanlangan botning narxi va yetkazish shartlarini ko‘rib chiqing.",
  },
  {
    icon: Bot,
    title: "Botni qabul qiling",
    description: "Buyurtmalar sahifasida holat va bot ma’lumotlarini kuzating.",
  },
];

const sellerSteps = [
  {
    icon: UserPlus,
    title: "Dasturchi sifatida ro‘yxatdan o‘ting",
    description: "Ro‘yxatdan o‘tishda «Dasturchi» rolini tanlang va sotuvchi kabinetiga kiring.",
  },
  {
    icon: Upload,
    title: "Botingizni joylang",
    description:
      "Nom, tavsif, narx va rasmlarni kiriting. Administrator tekshirib tasdiqlagach, bot katalogda ko‘rinadi.",
  },
  {
    icon: PackageCheck,
    title: "Buyurtmalarni bajaring",
    description:
      "Xaridor to‘lagach, buyurtma sizga keladi. Botni topshirib, holatini «Yetkazilmoqda» va «Tayyor» deb belgilang; xaridor bilan chatda yozishing mumkin.",
  },
  {
    icon: Wallet,
    title: "Daromadni yechib oling",
    description: `Balansdan istalgan summani yechish mumkin. Har bir yechishdan ${Math.round(WITHDRAWAL_FEE_RATE * 100)}% komissiya ushlanadi; pul administrator tomonidan kartangizga qo‘lda o‘tkaziladi.`,
  },
];

export const Route = createFileRoute("/how-it-works")({
  head: () => ({
    meta: [
      { title: "Qanday ishlaydi — BotSmith" },
      { name: "description", content: "Bot tanlash, buyurtma berish va botni qabul qilish." },
      { property: "og:title", content: "Qanday ishlaydi — BotSmith" },
      { property: "og:description", content: "Bot xarid qilish bosqichlari." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HowItWorks,
});

function HowItWorks() {
  return (
    <SiteLayout>
      <div className="mx-auto max-w-5xl px-4 py-12">
        <h1 className="text-3xl font-bold">Qanday ishlaydi</h1>
        <h2 className="mt-9 text-xl font-semibold">Xaridor uchun</h2>
        <div className="mt-6 grid gap-8 sm:grid-cols-3">
          {steps.map(({ icon: Icon, title, description }, index) => (
            <section key={title} className="border-t pt-6">
              <Icon className="h-7 w-7 text-primary" />
              <h2 className="mt-5 font-semibold">
                {index + 1}. {title}
              </h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
            </section>
          ))}
        </div>
        <Button asChild className="mt-5">
          <Link to="/bots">Botlarni ko‘rish</Link>
        </Button>

        <h2 className="mt-14 text-xl font-semibold">Dasturchi (sotuvchi) uchun</h2>
        <div className="mt-6 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {sellerSteps.map(({ icon: Icon, title, description }, index) => (
            <section key={title} className="border-t pt-6">
              <Icon className="h-7 w-7 text-primary" />
              <h3 className="mt-5 font-semibold">
                {index + 1}. {title}
              </h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
            </section>
          ))}
        </div>
        <Button asChild variant="outline" className="mt-5">
          <Link to="/register">Bot sotishni boshlash</Link>
        </Button>
      </div>
    </SiteLayout>
  );
}
