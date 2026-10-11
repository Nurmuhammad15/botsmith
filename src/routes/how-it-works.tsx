import { createFileRoute, Link } from "@tanstack/react-router";
import { Bot, CreditCard, Search } from "lucide-react";
import { SiteLayout } from "@/components/site";
import { Button } from "@/components/ui/button";

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
        <div className="mt-9 grid gap-8 sm:grid-cols-3">
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
      </div>
    </SiteLayout>
  );
}
