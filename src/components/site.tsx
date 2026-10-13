import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Send,
  Star,
  Heart,
  Check,
  Menu,
  Home,
  Search,
  Package,
  User,
  MessageCircle,
  MessageSquare,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  type LucideIcon,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import type { User as AuthUser } from "@supabase/supabase-js";
import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { BotCover, FavoriteButton } from "@/components/bot-media";
import { LanguageSwitcher } from "@/components/language-switcher";
import { PushToggle } from "@/components/push-toggle";
import { useInboxRealtime, useUnreadCount } from "@/lib/api-chat";
import { useT, type Lang } from "@/lib/i18n";
import { formatUZS, type BotItem } from "@/lib/data";
import { cn } from "@/lib/utils";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase";
import {
  MarketplaceAccountContext,
  useMarketplaceAccount,
  useMarketplaceAuth,
  type AccountRole,
  type MarketplaceAccount,
} from "@/lib/marketplace-auth-context";

async function loadAccount(user: AuthUser | undefined): Promise<MarketplaceAccount | null> {
  if (!user) return null;
  // The role lives in the profiles table (set by the server); user_metadata is client-editable.
  const { data, error } = await getSupabaseClient()
    .from("profiles")
    .select("role, full_name")
    .eq("id", user.id)
    .maybeSingle();
  if (error) throw error;
  const role: AccountRole = data?.role === "seller" || data?.role === "admin" ? data.role : "buyer";
  return {
    id: user.id,
    email: user.email ?? "",
    name: typeof data?.full_name === "string" ? data.full_name : "",
    role,
    isSeller: role === "seller",
    isAdmin: role === "admin",
  };
}

export function MarketplaceAuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [account, setAccount] = useState<MarketplaceAccount | null>(null);
  const [authError, setAuthError] = useState("");
  const [ready, setReady] = useState(!isSupabaseConfigured());
  useInboxRealtime(account?.id);

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    const supabase = getSupabaseClient();
    let mounted = true;
    let currentUserId: string | undefined;

    async function apply(user: AuthUser | undefined) {
      try {
        const next = await loadAccount(user);
        if (!mounted) return;
        if (currentUserId !== next?.id) queryClient.clear();
        currentUserId = next?.id;
        setAccount(next);
        setAuthError("");
      } catch {
        if (mounted) setAuthError("Hisob holatini tekshirib bo‘lmadi. Sahifani yangilang.");
      } finally {
        if (mounted) setReady(true);
      }
    }

    void supabase.auth.getSession().then(({ data }) => apply(data.session?.user));

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      // Defer: supabase-js forbids awaiting other client calls inside this callback.
      setTimeout(() => void apply(session?.user), 0);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [queryClient]);

  return (
    <MarketplaceAccountContext.Provider value={{ account, ready }}>
      {authError && (
        <p role="alert" className="px-4 py-2 text-center text-xs text-destructive">
          {authError}
        </p>
      )}
      {children}
    </MarketplaceAccountContext.Provider>
  );
}

export function Logo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <Link
      to="/"
      aria-label="BotSmith"
      className={cn("flex shrink-0 items-center gap-2 font-bold text-foreground", className)}
    >
      <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary text-primary-foreground">
        <Send className="h-4 w-4" />
      </span>
      <span className={cn(compact && "hidden min-[420px]:inline")}>BotSmith</span>
    </Link>
  );
}

/** Count of unread chat messages; renders nothing when there are none. */
export function UnreadBadge({ className }: { className?: string }) {
  const account = useMarketplaceAccount();
  const { data: unread = 0 } = useUnreadCount(Boolean(account));
  if (unread <= 0) return null;
  return (
    <span
      aria-label={`${unread} ta o‘qilmagan xabar`}
      className={cn(
        "grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-primary-foreground",
        className,
      )}
    >
      {unread > 99 ? "99+" : unread}
    </span>
  );
}

export function Navbar() {
  const { t, lang, setLang } = useT();
  const { account } = useMarketplaceAuth();
  const [signOutError, setSignOutError] = useState("");

  if (!account) return null;

  return (
    <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:gap-8">
        <Logo compact />
        <nav className="hidden gap-6 text-sm text-muted-foreground md:flex">
          <Link to="/bots" activeProps={{ className: "text-primary font-medium" }}>
            {t("bots")}
          </Link>
          <Link to="/how-it-works">{t("how")}</Link>
          {account.isSeller && <Link to="/seller">{t("sell")}</Link>}
        </nav>
        <div className="ml-auto flex min-w-0 items-center gap-1 sm:gap-2">
          <Link
            to="/favorites"
            aria-label="Sevimlilar"
            title="Sevimlilar"
            className="hidden h-9 w-9 place-items-center rounded-md text-muted-foreground hover:bg-muted sm:grid"
          >
            <Heart className="h-5 w-5" />
          </Link>
          <Link
            to="/messages"
            aria-label="Xabarlar"
            title="Xabarlar"
            className="relative grid h-9 w-9 place-items-center rounded-md text-muted-foreground hover:bg-muted"
          >
            <MessageSquare className="h-5 w-5" />
            <UnreadBadge className="absolute -right-0.5 -top-0.5" />
          </Link>
          <PushToggle />
          <LanguageSwitcher />
          {account ? (
            <>
              <Link
                to={
                  account.isAdmin ? "/admin" : account.isSeller ? "/seller" : "/dashboard/purchases"
                }
                className="inline-flex shrink-0 items-center rounded-md text-sm font-medium sm:max-w-[220px] sm:border sm:px-3 sm:py-2"
              >
                <span className="grid h-9 w-9 place-items-center rounded-full bg-primary-soft font-semibold text-primary sm:hidden">
                  {(account.name || account.email || "?").charAt(0).toUpperCase()}
                </span>
                <span className="hidden truncate sm:inline">{account.name || account.email}</span>
              </Link>
              <button
                type="button"
                aria-label="Chiqish"
                title="Chiqish"
                className="inline-flex items-center gap-2 rounded-md px-2 py-2 text-sm text-muted-foreground hover:bg-muted sm:px-3"
                onClick={async () => {
                  const { error } = await getSupabaseClient().auth.signOut();
                  if (error) setSignOutError("Hisobdan chiqib bo‘lmadi. Qayta urinib ko‘ring.");
                }}
              >
                <LogOut className="h-5 w-5 sm:hidden" />
                <span className="hidden sm:inline">Chiqish</span>
              </button>
            </>
          ) : (
            <>
              <Link
                to="/login"
                className="hidden rounded-md border px-3 py-2 text-sm font-medium sm:inline-flex"
              >
                {t("login")}
              </Link>
              <Link
                to="/register"
                className="hidden rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground sm:inline-flex"
              >
                {t("register")}
              </Link>
              <Link to="/login" className="sm:hidden" aria-label="Menu">
                <Menu className="h-5 w-5" />
              </Link>
            </>
          )}
        </div>
      </div>
      {signOutError && (
        <p role="alert" className="px-4 pb-2 text-center text-xs text-destructive">
          {signOutError}
        </p>
      )}
    </header>
  );
}

export function Footer() {
  return (
    <footer className="mt-24 border-t pb-24 md:pb-0">
      <div className="mx-auto flex max-w-7xl items-start justify-between gap-6 px-4 pt-10 pb-2">
        <div>
          <Logo />
          <p className="mt-2 text-sm text-muted-foreground">Telegram botlar marketplace</p>
        </div>
        <Link
          to="/support-chat"
          aria-label="Yordam chatini ochish"
          title="Yordam chat"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full border text-primary transition hover:bg-primary-soft"
        >
          <MessageCircle className="h-5 w-5" />
        </Link>
      </div>
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 pb-8">
        <p className="text-xs text-muted-foreground">
          © {new Date().getFullYear()} BotSmith. Barcha huquqlar himoyalangan.
        </p>
        <nav className="ml-auto flex gap-4 text-xs text-muted-foreground">
          <Link to="/help" className="hover:text-foreground">
            Yordam
          </Link>
          <Link to="/how-it-works" className="hover:text-foreground">
            Qanday ishlaydi
          </Link>
          <Link to="/terms" className="hover:text-foreground">
            Obuna qoidalari
          </Link>
        </nav>
      </div>
    </footer>
  );
}

/** Phone bottom bar for dashboards with many sections: equal-width, horizontally scrollable. */
function BottomNav({
  items,
  isActive,
  label,
}: {
  items: SideItem[];
  isActive: (item: SideItem) => boolean;
  label: string;
}) {
  return (
    <nav
      aria-label={label}
      className="fixed inset-x-0 bottom-0 z-40 flex overflow-x-auto border-t bg-background pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {items.map((item) => {
        const { to, label: text, short, icon: Icon, tab } = item;
        return (
          <Link
            key={text}
            to={to}
            search={(tab ? { tab } : undefined) as never}
            className={cn(
              "relative flex w-20 shrink-0 flex-col items-center gap-1 px-1 py-2 text-center text-[11px] leading-tight",
              isActive(item) ? "text-primary" : "text-muted-foreground",
            )}
          >
            <Icon className="h-5 w-5" />
            <span className="w-full truncate">{short ?? text}</span>
            {to === "/messages" && <UnreadBadge className="absolute right-3 top-1" />}
          </Link>
        );
      })}
    </nav>
  );
}

function AdminMobileTabBar({ items }: { items: SideItem[] }) {
  const currentTab = useRouterState({
    select: (s) => (s.location.search as { tab?: string }).tab ?? "bots",
  });
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (
    <BottomNav
      label="Admin menyusi"
      items={items}
      isActive={(item) =>
        item.tab ? path === "/admin" && item.tab === currentTab : path === item.to
      }
    />
  );
}

export function MobileTabBar({ adminItems }: { adminItems?: SideItem[] }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  if (adminItems) return <AdminMobileTabBar items={adminItems} />;
  const items: [string, string, LucideIcon][] = [
    ["/", "Asosiy", Home],
    ["/bots", "Botlar", Search],
    ["/favorites", "Sevimli", Heart],
    ["/messages", "Xabarlar", MessageSquare],
    ["/dashboard/purchases", "Xaridlar", Package],
  ];
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t bg-background md:hidden">
      {items.map(([to, label, Icon]) => (
        <Link
          key={to}
          to={to}
          className={cn(
            "relative flex flex-col items-center gap-1 py-2 text-[11px]",
            path === to ? "text-primary" : "text-muted-foreground",
          )}
        >
          <Icon className="h-5 w-5" />
          {label}
          {to === "/messages" && <UnreadBadge className="absolute right-4 top-1" />}
        </Link>
      ))}
    </nav>
  );
}

export function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Navbar />
      <main>{children}</main>
      <Footer />
    </>
  );
}

export function Rating({ value, count }: { value: number; count?: number }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <Star className="h-3.5 w-3.5 fill-star text-star" />
      {value}
      {count !== undefined && ` (${count})`}
    </span>
  );
}

export function BotCard({ bot }: { bot: BotItem }) {
  return (
    <div className="relative">
      <Link
        to="/bots/$id"
        params={{ id: bot.id }}
        className="card-soft flex h-full flex-col overflow-hidden transition hover:-translate-y-0.5 hover:border-primary/40"
      >
        <BotCover bot={bot} className="aspect-[16/10] w-full" />
        <div className="flex flex-1 flex-col gap-3 p-4">
          <div>
            <h3 className="font-semibold">{bot.title}</h3>
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{bot.desc}</p>
          </div>
          <Rating value={bot.rating} count={bot.reviews} />
          <p className="mt-auto font-bold text-primary">{formatUZS(bot.price)} / 1 kun</p>
        </div>
      </Link>
      <FavoriteButton botId={bot.id} className="absolute right-3 top-3" />
    </div>
  );
}

type Status =
  | "published"
  | "draft"
  | "review"
  | "pending"
  | "ready"
  | "done"
  | "delivering"
  | "active"
  | "expired";
const statusMap: Record<Status, [string, string]> = {
  published: ["E'lon qilingan", "bg-success-soft text-success"],
  done: ["Yakunlandi", "bg-success-soft text-success"],
  ready: ["Tayyor", "bg-success-soft text-success"],
  draft: ["Rad etilgan", "bg-destructive/10 text-destructive"],
  review: ["Tekshiruvda", "bg-warning-soft text-warning"],
  pending: ["Tekshirish", "bg-warning-soft text-warning"],
  delivering: ["Yetkazib berilyapti", "bg-primary-soft text-primary"],
  active: ["Obuna faol", "bg-success-soft text-success"],
  expired: ["Muddati tugagan", "bg-muted text-muted-foreground"],
};
export function StatusBadge({ status }: { status: Status }) {
  const [label, cls] = statusMap[status];
  return (
    <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium", cls)}>
      {label}
    </span>
  );
}

export function Stepper({ step }: { step: number }) {
  const steps = ["To'lov", "Sozlanmoqda", "Yetkazib berish", "Tayyor"];
  return (
    <div className="flex items-start">
      {steps.map((s, i) => (
        <div key={s} className="flex flex-1 flex-col items-center gap-2 text-center">
          <div className="flex w-full items-center">
            <div
              className={cn(
                "h-0.5 flex-1",
                i === 0 ? "bg-transparent" : i < step ? "bg-primary" : "bg-border",
              )}
            />
            <span
              className={cn(
                "grid h-6 w-6 place-items-center rounded-full border-2 text-[10px]",
                i < step
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background",
              )}
            >
              {i < step - 1 ? <Check className="h-3 w-3" /> : i + 1}
            </span>
            <div
              className={cn(
                "h-0.5 flex-1",
                i === steps.length - 1
                  ? "bg-transparent"
                  : i < step - 1
                    ? "bg-primary"
                    : "bg-border",
              )}
            />
          </div>
          <span
            className={cn("text-[11px]", i < step ? "text-foreground" : "text-muted-foreground")}
          >
            {s}
          </span>
        </div>
      ))}
    </div>
  );
}

export function StatCard({
  label,
  value,
  children,
}: {
  label: string;
  value: string;
  children?: ReactNode;
}) {
  return (
    <div className="card-soft p-5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-2 text-xl font-bold">{value}</p>
      {children}
    </div>
  );
}

export type SideItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  tab?: string;
  /** Shorter label for the phone bottom bar. */
  short?: string;
};
export function DashboardLayout({
  user,
  role,
  items,
  children,
}: {
  user: string;
  role: string;
  items: SideItem[];
  children: ReactNode;
}) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const isSeller = items.some((item) => item.to === "/seller");
  if (isSeller)
    return (
      <SellerDashboardLayout user={user} role={role} items={items} path={path}>
        {children}
      </SellerDashboardLayout>
    );
  return (
    <BuyerDashboardLayout user={user} role={role} items={items} path={path}>
      {children}
    </BuyerDashboardLayout>
  );
}

function BuyerDashboardLayout({
  user,
  role,
  items,
  path,
  children,
}: {
  user: string;
  role: string;
  items: SideItem[];
  path: string;
  children: ReactNode;
}) {
  const { account, ready } = useMarketplaceAuth();
  const navigate = useNavigate();
  const currentTab = useRouterState({
    select: (s) => (s.location.search as { tab?: string }).tab,
  });
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem("sidebar-collapsed") === "1");
    } catch {
      /* storage unavailable: keep the menu open */
    }
  }, []);

  const toggleSidebar = () => {
    setCollapsed((prev) => {
      try {
        localStorage.setItem("sidebar-collapsed", prev ? "0" : "1");
      } catch {
        /* ignore */
      }
      return !prev;
    });
  };

  useEffect(() => {
    if (ready && !account) {
      void navigate({ to: "/login", replace: true });
    }
  }, [account, navigate, ready]);

  if (!ready || !account) {
    return (
      <main className="mx-auto max-w-7xl px-4 py-12 text-center text-sm text-muted-foreground">
        Hisobingiz tekshirilmoqda…
      </main>
    );
  }

  const SidebarIcon = collapsed ? PanelLeftOpen : PanelLeftClose;

  return (
    <>
      <Navbar />
      <div className="mx-auto flex max-w-7xl gap-6 px-4 py-6 pb-24 md:pb-6">
        <aside className={cn("hidden w-56 shrink-0", collapsed ? "md:hidden" : "md:block")}>
          <div className="mb-6 flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-primary-soft font-semibold text-primary">
              {(account.name || account.email || user).charAt(0).toUpperCase()}
            </span>
            <div>
              <p className="text-sm font-semibold">{account.name || account.email || user}</p>
              <p className="text-xs text-muted-foreground">{role}</p>
            </div>
          </div>
          <nav className="flex flex-col gap-1">
            {items.map(({ to, label, icon: Icon, tab }, i) => (
              <Link
                key={label}
                to={to}
                search={(tab ? { tab } : undefined) as never}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm",
                  path === to && i > 0 && (!tab || tab === currentTab)
                    ? "bg-primary-soft font-medium text-primary"
                    : "text-muted-foreground hover:bg-muted",
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
                {to === "/messages" && <UnreadBadge className="ml-auto" />}
              </Link>
            ))}
          </nav>
        </aside>
        <main className="min-w-0 flex-1">
          <button
            type="button"
            onClick={toggleSidebar}
            aria-label={collapsed ? "Menyuni ochish" : "Menyuni yopish"}
            title={collapsed ? "Menyuni ochish" : "Menyuni yopish"}
            className="mb-3 hidden h-9 w-9 place-items-center rounded-md border text-muted-foreground hover:bg-muted md:grid"
          >
            <SidebarIcon className="h-5 w-5" />
          </button>
          {children}
        </main>
      </div>
      <MobileTabBar {...(items.some((i) => i.tab) ? { adminItems: items } : {})} />
    </>
  );
}

function SellerDashboardLayout({
  user,
  role,
  items,
  path,
  children,
}: {
  user: string;
  role: string;
  items: SideItem[];
  path: string;
  children: ReactNode;
}) {
  const { account, ready } = useMarketplaceAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (ready && !account?.isSeller) {
      void navigate({ to: "/login", replace: true });
    }
  }, [account, navigate, ready]);

  if (!ready || !account?.isSeller) {
    return (
      <main className="mx-auto max-w-7xl px-4 py-12 text-center text-sm text-muted-foreground">
        Sotuvchi hisobingiz tekshirilmoqda…
      </main>
    );
  }

  return (
    <>
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-2 px-4 sm:gap-4 sm:px-6">
          <Logo compact />
          <div className="flex min-w-0 items-center gap-1 sm:gap-3">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary-soft text-primary">
              <User className="h-4 w-4" />
            </span>
            <div className="hidden min-w-0 sm:block">
              <p className="text-sm font-semibold">{account.name || account.email || user}</p>
              <p className="text-xs text-muted-foreground">{role}</p>
            </div>
            <LanguageSwitcher />
            <PushToggle />
            <button
              type="button"
              aria-label="Chiqish"
              title="Chiqish"
              className="ml-1 inline-flex items-center gap-2 rounded-md px-2 py-2 text-sm text-muted-foreground hover:bg-muted"
              onClick={() => void getSupabaseClient().auth.signOut()}
            >
              <LogOut className="h-5 w-5" />
              <span className="hidden sm:inline">Chiqish</span>
            </button>
          </div>
        </div>
        <nav
          aria-label="Sotuvchi menyusi"
          className="mx-auto hidden max-w-7xl gap-1 overflow-x-auto px-4 sm:px-6 md:flex"
        >
          {items.map(({ to, label, icon: Icon }) => (
            <Button
              key={label}
              asChild
              variant="ghost"
              className={cn(
                "h-12 shrink-0 rounded-none border-b-2 px-3",
                path === to ||
                  (to === "/seller-earnings" && path === "/withdraw") ||
                  (to === "/seller" && path === "/seller-new-bot")
                  ? "border-primary bg-primary-soft text-primary"
                  : "border-transparent text-muted-foreground",
              )}
            >
              <Link to={to}>
                <Icon className="h-4 w-4" />
                {label}
                {to === "/messages" && <UnreadBadge />}
              </Link>
            </Button>
          ))}
        </nav>
      </header>
      <main className="mx-auto min-w-0 max-w-7xl px-4 py-8 pb-28 sm:px-6 md:pb-8">{children}</main>
      <BottomNav
        label="Sotuvchi menyusi"
        items={items}
        isActive={({ to }) =>
          path === to ||
          (to === "/seller-earnings" && path === "/withdraw") ||
          (to === "/seller" && path === "/seller-new-bot")
        }
      />
    </>
  );
}

export function Tabs({
  tabs,
  value,
  onChange,
}: {
  tabs: string[];
  value: number;
  onChange: (i: number) => void;
}) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b">
      {tabs.map((t, i) => (
        <button
          key={t}
          onClick={() => onChange(i)}
          className={cn(
            "whitespace-nowrap border-b-2 px-4 py-2.5 text-sm",
            value === i
              ? "border-primary font-medium text-primary"
              : "border-transparent text-muted-foreground",
          )}
        >
          {t}
        </button>
      ))}
    </div>
  );
}

export function DataTable({
  head,
  rows,
  emptyMessage,
}: {
  head: string[];
  rows: ReactNode[][];
  emptyMessage?: string;
}) {
  return (
    <>
      {/* Phones: one card per row, "label: value" pairs, so nothing needs sideways scrolling. */}
      <div className="space-y-3 md:hidden">
        {rows.length > 0
          ? rows.map((r, i) => (
              <div key={i} className="card-soft space-y-2 p-4 text-sm">
                {r.map((c, j) => {
                  const label = head[j];
                  if (j === 0) return <div key={j}>{c}</div>;
                  if (c === "" || c === null || c === undefined) return null;
                  return (
                    <div key={j} className="flex items-start justify-between gap-4">
                      <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
                      <div className="min-w-0 text-right">{c}</div>
                    </div>
                  );
                })}
              </div>
            ))
          : emptyMessage && (
              <p className="card-soft px-4 py-10 text-center text-sm text-muted-foreground">
                {emptyMessage}
              </p>
            )}
      </div>
      <div className="card-soft hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              {head.map((h) => (
                <th key={h} className="px-4 py-3 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length > 0
              ? rows.map((r, i) => (
                  <tr key={i} className="border-b last:border-0">
                    {r.map((c, j) => (
                      <td key={j} className="px-4 py-3">
                        {c}
                      </td>
                    ))}
                  </tr>
                ))
              : emptyMessage && (
                  <tr>
                    <td
                      colSpan={head.length}
                      className="px-4 py-10 text-center text-muted-foreground"
                    >
                      {emptyMessage}
                    </td>
                  </tr>
                )}
          </tbody>
        </table>
      </div>
    </>
  );
}
