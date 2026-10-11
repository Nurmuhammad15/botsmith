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
  type LucideIcon,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import type { User as AuthUser } from "@supabase/supabase-js";
import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
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

export function Logo({ className }: { className?: string }) {
  return (
    <Link to="/" className={cn("flex items-center gap-2 font-bold text-foreground", className)}>
      <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary text-primary-foreground">
        <Send className="h-4 w-4" />
      </span>
      BotSmith
    </Link>
  );
}

export function Navbar() {
  const { t, lang, setLang } = useT();
  const { account } = useMarketplaceAuth();
  const [signOutError, setSignOutError] = useState("");

  if (!account) return null;

  return (
    <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-8 px-4">
        <Logo />
        <nav className="hidden gap-6 text-sm text-muted-foreground md:flex">
          <Link to="/bots" activeProps={{ className: "text-primary font-medium" }}>
            {t("bots")}
          </Link>
          <Link to="/how-it-works">{t("how")}</Link>
          {account.isSeller && <Link to="/seller">{t("sell")}</Link>}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <select
            aria-label="Language"
            value={lang}
            onChange={(e) => setLang(e.target.value as Lang)}
            className="h-9 rounded-md bg-transparent px-2 text-sm font-medium"
          >
            <option value="uz">UZ</option>
            <option value="ru">RU</option>
            <option value="en">EN</option>
          </select>
          {account ? (
            <>
              <Link
                to={account.isSeller ? "/seller" : "/dashboard/purchases"}
                className="rounded-md border px-3 py-2 text-sm font-medium"
              >
                {account.name || account.email}
              </Link>
              <button
                type="button"
                className="hidden rounded-md px-3 py-2 text-sm text-muted-foreground sm:inline-flex"
                onClick={async () => {
                  const { error } = await getSupabaseClient().auth.signOut();
                  if (error) setSignOutError("Hisobdan chiqib bo‘lmadi. Qayta urinib ko‘ring.");
                }}
              >
                Chiqish
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
          © 2025 BotSmith. Barcha huquqlar himoyalangan.
        </p>
      </div>
    </footer>
  );
}

export function MobileTabBar() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const items: [string, string, LucideIcon][] = [
    ["/", "Asosiy", Home],
    ["/bots", "Botlar", Search],
    ["/dashboard/purchases", "Xaridlar", Package],
    ["/login", "Profil", User],
  ];
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t bg-background md:hidden">
      {items.map(([to, label, Icon]) => (
        <Link
          key={to}
          to={to}
          className={cn(
            "flex flex-col items-center gap-1 py-2 text-[11px]",
            path === to ? "text-primary" : "text-muted-foreground",
          )}
        >
          <Icon className="h-5 w-5" />
          {label}
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

export function BotCard({ bot, fav }: { bot: BotItem; fav?: boolean }) {
  const account = useMarketplaceAccount();
  return (
    <Link
      to="/bots/$id"
      params={{ id: bot.id }}
      className="card-soft relative flex flex-col gap-3 p-4 transition hover:-translate-y-0.5 hover:border-primary/40"
    >
      {fav && <Heart className="absolute right-4 top-4 h-4 w-4 text-muted-foreground" />}
      <div>
        <h3 className="font-semibold">{bot.title}</h3>
        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{bot.desc}</p>
      </div>
      <Rating value={bot.rating} count={bot.reviews} />
      {account && bot.price !== null ? (
        <p className="mt-auto font-bold text-primary">{formatUZS(bot.price)}</p>
      ) : (
        <p className="mt-auto text-sm font-medium text-primary">Narxni ko‘rish uchun kiring</p>
      )}
    </Link>
  );
}

type Status = "published" | "draft" | "review" | "pending" | "ready" | "done" | "delivering";
const statusMap: Record<Status, [string, string]> = {
  published: ["Published", "bg-success-soft text-success"],
  done: ["Yakunlandi", "bg-success-soft text-success"],
  ready: ["Tayyor", "bg-success-soft text-success"],
  draft: ["Draft", "bg-destructive/10 text-destructive"],
  review: ["Review", "bg-warning-soft text-warning"],
  pending: ["Tekshirish", "bg-warning-soft text-warning"],
  delivering: ["Yetkazib berilyapti", "bg-primary-soft text-primary"],
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

export type SideItem = { to: string; label: string; icon: LucideIcon };
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

  return (
    <>
      <Navbar />
      <div className="mx-auto flex max-w-7xl gap-6 px-4 py-6 pb-24 md:pb-6">
        <aside className="hidden w-56 shrink-0 md:block">
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
            {items.map(({ to, label, icon: Icon }, i) => (
              <Link
                key={label}
                to={to}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm",
                  path === to && i > 0
                    ? "bg-primary-soft font-medium text-primary"
                    : "text-muted-foreground hover:bg-muted",
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            ))}
          </nav>
        </aside>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
      <MobileTabBar />
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
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <Logo />
          <div className="flex items-center gap-3">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-primary-soft text-primary">
              <User className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-semibold">{account.name || account.email || user}</p>
              <p className="text-xs text-muted-foreground">{role}</p>
            </div>
          </div>
        </div>
        <nav
          aria-label="Sotuvchi menyusi"
          className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 sm:px-6"
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
              </Link>
            </Button>
          ))}
        </nav>
      </header>
      <main className="mx-auto min-w-0 max-w-7xl px-4 py-8 sm:px-6">{children}</main>
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
    <div className="card-soft overflow-x-auto">
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
  );
}
