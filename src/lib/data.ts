import {
  ShoppingCart,
  Filter,
  GraduationCap,
  Headphones,
  CreditCard,
  Gamepad2,
  CalendarCheck,
  type LucideIcon,
} from "lucide-react";

export const formatUZS = (n: number) => `${n.toLocaleString("ru-RU").replace(/,/g, " ")} so'm`;

export type Category = { slug: string; name: string; sub: string; icon: LucideIcon; count: number };
export const categories: Category[] = [
  { slug: "booking", name: "Booking", sub: "Bron qilish", icon: CalendarCheck, count: 0 },
  { slug: "shop", name: "Online do'kon", sub: "E-commerce", icon: ShoppingCart, count: 0 },
  { slug: "lead", name: "Lead funnel", sub: "Marketing", icon: Filter, count: 0 },
  { slug: "education", name: "Ta'lim", sub: "Education", icon: GraduationCap, count: 0 },
  { slug: "support", name: "Qo'llab-quvvatlash", sub: "Support", icon: Headphones, count: 0 },
  { slug: "payments", name: "To'lovlar", sub: "Payments", icon: CreditCard, count: 0 },
  { slug: "games", name: "O'yinlar", sub: "Games", icon: Gamepad2, count: 0 },
];

export type BotItem = {
  id: string;
  title: string;
  desc: string;
  price: number;
  rating: number;
  reviews: number;
  category: string;
  icon: LucideIcon;
  seller: string;
  lang: string[];
  delivery: number;
  sales: number;
  views: number;
};
export const bots: BotItem[] = [];
export const getBot = (id: string) => bots.find((b) => b.id === id);

export type OrderStatus = 1 | 2 | 3 | 4;
export const orders: {
  id: string;
  bot: BotItem;
  date: string;
  status: OrderStatus;
}[] = [];

export const sellerBots: {
  bot: BotItem;
  status: "published" | "draft" | "review";
  views: number;
}[] = [];
export const getPublishedSellerBots = (seller = "@dev_uz") =>
  sellerBots.filter(({ bot, status }) => status === "published" && bot.seller === seller);

export const chartData: { day: string; value: number }[] = [];
