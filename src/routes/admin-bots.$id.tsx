import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Check, X } from "lucide-react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DashboardLayout, StatusBadge } from "@/components/site";
import { describeError, useAdminBot, useAdminSetBotStatus } from "@/lib/api";
import { categories, formatUZS } from "@/lib/data";
import { useMarketplaceAccount } from "@/lib/marketplace-auth-context";
import { adminNav } from "@/lib/nav";
import { WITHDRAWAL_FEE_RATE } from "@/lib/wallet";

export const Route = createFileRoute("/admin-bots/$id")({
  head: () => ({
    meta: [{ title: "Bot ma’lumotlari — BotSmith Admin" }, { name: "robots", content: "noindex" }],
  }),
  component: AdminBotPage,
});

function AdminBotPage() {
  return (
    <DashboardLayout user="Admin" role="Administrator" items={adminNav}>
      <AdminBotContent />
    </DashboardLayout>
  );
}

const SALE_COMMISSION = 0.15;
const statusBadge = { published: "published", pending: "pending", rejected: "draft" } as const;

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 px-4 py-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{children}</span>
    </div>
  );
}

function AdminBotContent() {
  const { id } = Route.useParams();
  const isAdmin = Boolean(useMarketplaceAccount()?.isAdmin);
  const { data: bot, isPending, error } = useAdminBot(id, isAdmin);
  const setStatus = useAdminSetBotStatus();

  if (!isAdmin) {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">
        Bu sahifa faqat administratorlar uchun.
      </p>
    );
  }

  const act = (status: "published" | "rejected") =>
    setStatus.mutate(
      { id, status },
      {
        onSuccess: () => toast.success(status === "published" ? "Tasdiqlandi" : "Rad etildi"),
        onError: (e) => toast.error(describeError(e)),
      },
    );

  const back = (
    <Button asChild variant="outline" className="mb-6">
      <Link to="/admin" search={{ tab: "bots" }}>
        <ArrowLeft />
        Botlar ro‘yxatiga qaytish
      </Link>
    </Button>
  );

  if (isPending) {
    return (
      <>
        {back}
        <p className="text-sm text-muted-foreground">Yuklanmoqda…</p>
      </>
    );
  }
  if (error || !bot) {
    return (
      <>
        {back}
        <p className="text-sm text-muted-foreground">
          {error
            ? `Yuklab bo‘lmadi: ${(error as { message?: string }).message ?? ""}`
            : "Bot topilmadi."}
        </p>
      </>
    );
  }

  const tariffs: [string, number | null][] = [
    ["1 kunlik", bot.price1Day],
    ["7 kunlik", bot.price7Days],
    ["30 kunlik", bot.price30Days],
  ];
  const net = (price: number) => price - Math.round(price * SALE_COMMISSION);

  return (
    <>
      {back}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">{bot.title}</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            {new Date(bot.createdAt).toLocaleString("uz-UZ")} · ID: {bot.id}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={statusBadge[bot.status]} />
          {bot.status !== "published" && (
            <Button size="sm" onClick={() => act("published")} disabled={setStatus.isPending}>
              <Check /> Tasdiqlash
            </Button>
          )}
          {bot.status !== "rejected" && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => act("rejected")}
              disabled={setStatus.isPending}
            >
              <X /> Rad etish
            </Button>
          )}
        </div>
      </div>

      {bot.images.length > 0 && (
        <div className="mt-5 flex flex-wrap gap-3">
          {bot.images.map((src) => (
            <a key={src} href={src} target="_blank" rel="noreferrer">
              <img src={src} alt="" className="h-28 w-40 rounded-lg border object-cover" />
            </a>
          ))}
        </div>
      )}

      <h2 className="mt-8 font-semibold">Tariflar</h2>
      <div className="card-soft mt-3 divide-y">
        {tariffs.map(([label, price]) => (
          <InfoRow key={label} label={label}>
            {price == null ? (
              "—"
            ) : (
              <>
                {formatUZS(price)}{" "}
                <span className="font-normal text-muted-foreground">
                  (sotuvchiga {formatUZS(net(price))})
                </span>
              </>
            )}
          </InfoRow>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Sotuvdan {Math.round(SALE_COMMISSION * 100)}% platforma komissiyasi, pul yechishda yana{" "}
        {Math.round(WITHDRAWAL_FEE_RATE * 100)}%.
      </p>

      <h2 className="mt-8 font-semibold">Umumiy ma’lumot</h2>
      <div className="card-soft mt-3 divide-y">
        <InfoRow label="Kategoriya">
          {categories.find((c) => c.slug === bot.category)?.name ?? bot.category}
        </InfoRow>
        <InfoRow label="Tillar">{bot.languages.join(", ").toUpperCase() || "—"}</InfoRow>
        <InfoRow label="Yetkazish muddati">{bot.deliveryHours} soat</InfoRow>
        <InfoRow label="Ko‘rishlar">{bot.views}</InfoRow>
        <InfoRow label="Buyurtmalar (jami / to‘langan)">
          {bot.orders.total} / {bot.orders.paid}
        </InfoRow>
        <InfoRow label="Sotuv summasi">{formatUZS(bot.orders.revenue)}</InfoRow>
      </div>

      <h2 className="mt-8 font-semibold">Sotuvchi</h2>
      <div className="card-soft mt-3 divide-y">
        <InfoRow label="Ism">{bot.seller.name || "—"}</InfoRow>
        <InfoRow label="Username">{bot.seller.username || "—"}</InfoRow>
        <InfoRow label="Telefon">{bot.seller.phone || "—"}</InfoRow>
      </div>

      <h2 className="mt-8 font-semibold">Tavsif</h2>
      <p className="card-soft mt-3 whitespace-pre-wrap p-4 text-sm leading-6">{bot.description}</p>
    </>
  );
}
