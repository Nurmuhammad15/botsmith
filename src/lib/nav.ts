import {
  Home,
  ShoppingBag,
  Heart,
  HelpCircle,
  Bot,
  Package,
  Wallet,
  History,
  User,
  Users,
  CreditCard,
  Percent,
  MessageSquare,
  Settings,
} from "lucide-react";
import type { SideItem } from "@/components/site";

export const buyerNav: SideItem[] = [
  { to: "/", label: "Bosh sahifa", icon: Home },
  { to: "/dashboard/purchases", label: "Buyurtmalar", icon: ShoppingBag },
  { to: "/favorites", label: "Sevimlilar", icon: Heart },
  { to: "/messages", label: "Xabarlar", icon: MessageSquare },
  { to: "/help", label: "Yordam", icon: HelpCircle },
];
export const sellerNav: SideItem[] = [
  { to: "/seller", label: "Mening botlarim", short: "Botlarim", icon: Bot },
  { to: "/seller-orders", label: "Buyurtmalar", icon: Package },
  { to: "/messages", label: "Xabarlar", icon: MessageSquare },
  { to: "/seller-earnings", label: "Daromadlar", icon: Wallet },
  { to: "/seller-withdrawal-history", label: "Yechish tarixi", short: "Tarix", icon: History },
  { to: "/seller-profile", label: "Profil", icon: User },
  { to: "/help", label: "Yordam", icon: HelpCircle },
];
export const adminNav: SideItem[] = [
  { to: "/", label: "Bosh sahifa", short: "Bosh", icon: Home },
  { to: "/admin", tab: "bots", label: "Botlar", icon: Bot },
  { to: "/admin", tab: "users", label: "Foydalanuvchilar", short: "Userlar", icon: Users },
  { to: "/admin", tab: "orders", label: "Buyurtmalar", icon: Package },
  { to: "/admin", tab: "withdrawals", label: "To'lovlar", icon: CreditCard },
  { to: "/admin", tab: "stats", label: "Komissiya", icon: Percent },
  { to: "/admin", tab: "support", label: "Murojaatlar", short: "Murojaat", icon: MessageSquare },
  { to: "/admin", tab: "settings", label: "Sozlamalar", short: "Sozlama", icon: Settings },
];

/** The side menu and role label that match the signed-in account (buyers are the default). */
export function navForAccount(account: { isAdmin: boolean; isSeller: boolean } | null) {
  if (account?.isAdmin) return { items: adminNav, role: "Administrator" };
  if (account?.isSeller) return { items: sellerNav, role: "Dasturchi" };
  return { items: buyerNav, role: "Xaridor" };
}
