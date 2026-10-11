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

export type Category = { slug: string; name: string; sub: string; icon: LucideIcon };
export const categories: Category[] = [
  { slug: "booking", name: "Booking", sub: "Bron qilish", icon: CalendarCheck },
  { slug: "shop", name: "Online do'kon", sub: "E-commerce", icon: ShoppingCart },
  { slug: "lead", name: "Lead funnel", sub: "Marketing", icon: Filter },
  { slug: "education", name: "Ta'lim", sub: "Education", icon: GraduationCap },
  { slug: "support", name: "Qo'llab-quvvatlash", sub: "Support", icon: Headphones },
  { slug: "payments", name: "To'lovlar", sub: "Payments", icon: CreditCard },
  { slug: "games", name: "O'yinlar", sub: "Games", icon: Gamepad2 },
];

/** A published bot as shown in the public catalogue. `price` is null for signed-out visitors. */
export type BotItem = {
  id: string;
  title: string;
  desc: string;
  price: number | null;
  rating: number;
  reviews: number;
  category: string;
  seller: string;
  lang: string[];
  delivery: number;
  sales: number;
};

export type BotStatus = "pending" | "published" | "rejected";

/** A bot as seen by its own seller, with moderation status and statistics. */
export type SellerBot = {
  id: string;
  title: string;
  desc: string;
  price: number;
  category: string;
  status: BotStatus;
  views: number;
  sales: number;
  earned: number;
};

export type OrderStatus = "pending_payment" | "paid" | "delivering" | "done" | "cancelled";

export type Order = {
  id: string;
  number: number;
  botId: string;
  botTitle: string;
  amount: number;
  status: OrderStatus;
  createdAt: string;
};

export type WithdrawalStatus = "pending" | "paid" | "rejected";

export type Withdrawal = {
  id: string;
  amount: number;
  fee: number;
  payout: number;
  last4: string;
  status: WithdrawalStatus;
  createdAt: string;
};

export const orderCode = (number: number) => `BS-${number}`;

/** Position of an order in the 4-step buyer timeline. */
export const orderStep = (status: OrderStatus): 1 | 2 | 3 | 4 =>
  status === "pending_payment" || status === "cancelled"
    ? 1
    : status === "paid"
      ? 2
      : status === "delivering"
        ? 3
        : 4;
