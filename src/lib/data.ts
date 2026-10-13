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

/** A published bot and its public 1/7/30-day subscription prices. */
export type BotItem = {
  id: string;
  title: string;
  desc: string;
  price: number;
  price7Days: number | null;
  price30Days: number | null;
  rating: number;
  reviews: number;
  category: string;
  seller: string;
  lang: string[];
  delivery: number;
  sales: number;
  /** Public URLs of the cover gallery; the first one is the cover. */
  images: string[];
  /** Number of deliverable files attached (visible only to the seller and paying buyers). */
  fileCount: number;
  sellerId: string;
  sellerAvatar: string | null;
  sellerHeadline: string;
  sellerLocation: string;
  sellerExperience: number | null;
  sellerSkills: string[];
  sellerBio: string;
  sellerWebsite: string;
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
  /** Storage paths in the public `bot-covers` bucket; the first one is the cover. */
  imagePaths: string[];
  fileCount: number;
};

/** A deliverable file attached to a bot (stored in the private `bot-files` bucket). */
export type BotFile = {
  id: string;
  botId: string;
  path: string;
  name: string;
  size: number;
};

export type OrderStatus = "pending_payment" | "paid" | "delivering" | "done" | "cancelled";

export type Order = {
  id: string;
  number: number;
  botId: string;
  botTitle: string;
  buyerId: string;
  amount: number;
  subscriptionDays: 1 | 7 | 30;
  status: OrderStatus;
  createdAt: string;
  paidAt: string | null;
  subscriptionExpiresAt: string | null;
  refundRequestedAt: string | null;
  refundReason: string | null;
  refundResolution: "refunded" | "rejected" | null;
  refundResolvedAt: string | null;
  termsAcceptedAt: string | null;
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
