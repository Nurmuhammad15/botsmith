import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  ChevronRight,
  Clock,
  FileArchive,
  Languages,
  MessageSquare,
  RefreshCw,
} from "lucide-react";
import { BotGallery, FavoriteButton } from "@/components/bot-media";
import { SiteLayout, Rating, Tabs } from "@/components/site";
import {
  describeError,
  useBot,
  useBotReviews,
  useBots,
  useCreateOrder,
  useOrders,
  useRecordBotView,
  useSubmitReview,
} from "@/lib/api";
import { useOpenConversation } from "@/lib/api-chat";
import { categories, formatUZS } from "@/lib/data";
import { useT } from "@/lib/i18n";
import { useMarketplaceAuth } from "@/lib/marketplace-auth-context";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/bots/$id")({
  head: () => ({
    meta: [
      { title: "Bot — BotSmith" },
      { name: "description", content: "Telegram bot tafsilotlari, narxi va sharhlari." },
    ],
  }),
  component: Detail,
});

const LANGUAGE_NAMES: Record<string, string> = { uz: "Uz", ru: "Ru", en: "En" };

function Detail() {
  const { id } = Route.useParams();
  const { data: bot, isPending, isError } = useBot(id);
  const { data: allBots = [] } = useBots();
  const { account, ready } = useMarketplaceAuth();
  const { t } = useT();
  const navigate = useNavigate();
  const [tab, setTab] = useState(0);
  const createOrder = useCreateOrder();
  const openConversation = useOpenConversation();
  const [actionError, setActionError] = useState("");
  const { mutate: recordView } = useRecordBotView(id);

  useEffect(() => {
    // Wait for the session so a signed-in visitor is not also counted as an anonymous one.
    // The database counts one view per visitor per bot per day, so repeats are harmless.
    if (ready) recordView();
  }, [id, ready, account?.id, recordView]);

  useEffect(() => {
    if (bot) document.title = `${bot.title} — BotSmith`;
  }, [bot]);

  if (isPending) {
    return (
      <SiteLayout>
        <p className="py-24 text-center text-sm text-muted-foreground">Yuklanmoqda…</p>
      </SiteLayout>
    );
  }
  if (isError || !bot) {
    return (
      <SiteLayout>
        <div className="py-24 text-center">
          <p className="font-semibold">Bot topilmadi</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Bot e’lon qilinmagan yoki o‘chirilgan bo‘lishi mumkin.
          </p>
          <Link to="/bots" className="mt-4 inline-block text-sm font-medium text-primary">
            Botlar ro‘yxatiga qaytish
          </Link>
        </div>
      </SiteLayout>
    );
  }

  const isOwnBot = account?.id === bot.sellerId;

  async function buy() {
    if (!bot) return;
    setActionError("");
    try {
      await createOrder.mutateAsync(bot.id);
      await navigate({ to: "/dashboard/purchases" });
    } catch (error) {
      setActionError(describeError(error));
    }
  }

  async function writeToSeller() {
    if (!bot) return;
    setActionError("");
    try {
      const conversationId = await openConversation.mutateAsync({ botId: bot.id });
      await navigate({ to: "/messages", search: { c: conversationId } });
    } catch (error) {
      setActionError(describeError(error));
    }
  }

  const similar = allBots.filter((b) => b.id !== bot.id && b.category === bot.category).slice(0, 3);
  const categoryName = categories.find((c) => c.slug === bot.category)?.name;

  return (
    <SiteLayout>
      <div className="mx-auto max-w-7xl px-4 py-6">
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <Link
            to="/bots"
            aria-label="Botlar ro'yxatiga qaytish"
            title="Botlar ro'yxatiga qaytish"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full border hover:bg-muted"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <p>
            <Link to="/">Bosh sahifa</Link> › <Link to="/bots">Botlar</Link> › {bot.title}
          </p>
        </div>
        <div className="mt-4 grid gap-8 md:grid-cols-2">
          <BotGallery bot={bot} />
          <div>
            <div className="flex items-start justify-between gap-3">
              <h1 className="text-2xl font-bold">{bot.title}</h1>
              <FavoriteButton botId={bot.id} withLabel />
            </div>
            {categoryName && <p className="mt-1 text-xs text-muted-foreground">{categoryName}</p>}
            <div className="mt-2">
              <Rating value={bot.rating} count={bot.reviews} />
            </div>
            <p className="mt-4 line-clamp-4 text-sm text-muted-foreground">{bot.desc}</p>
            <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
              {account && bot.price !== null && (
                <p className="text-2xl font-bold text-primary">{formatUZS(bot.price)}</p>
              )}
              <div className="flex flex-wrap gap-3">
                {isOwnBot ? (
                  <Button asChild variant="outline" size="lg">
                    <Link to="/seller-bots/$id" params={{ id: bot.id }}>
                      Botni boshqarish
                    </Link>
                  </Button>
                ) : account ? (
                  <>
                    <Button
                      size="lg"
                      onClick={buy}
                      disabled={createOrder.isPending}
                      className="px-8"
                    >
                      {createOrder.isPending ? "Yuborilmoqda…" : t("buy")}
                    </Button>
                    <Button
                      size="lg"
                      variant="outline"
                      onClick={writeToSeller}
                      disabled={openConversation.isPending}
                    >
                      <MessageSquare />
                      {t("message")}
                    </Button>
                  </>
                ) : (
                  <Link
                    to="/login"
                    className="rounded-lg bg-primary px-8 py-3 text-sm font-semibold text-primary-foreground"
                  >
                    Kirish va xarid qilish
                  </Link>
                )}
              </div>
            </div>
            {actionError && (
              <p role="alert" className="mt-3 text-sm text-destructive">
                {actionError}
              </p>
            )}
            <div className="mt-5 grid grid-cols-3 gap-3">
              {[
                [Clock, "Yetkazib berish", `${bot.delivery} soat ichida`],
                [RefreshCw, "Kafolat", "30 kun"],
                [Languages, "Tillar", bot.lang.map((l) => LANGUAGE_NAMES[l] ?? l).join(", ")],
              ].map(([I, a, b]) => {
                const Icon = I as typeof Clock;
                return (
                  <div key={a as string} className="card-soft flex items-center gap-2 p-3">
                    <Icon className="h-4 w-4 text-primary" />
                    <div>
                      <p className="text-[11px] text-muted-foreground">{a as string}</p>
                      <p className="text-xs font-medium">{b as string}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <div className="mt-10 grid gap-8 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <Tabs tabs={["Tavsif", `Sharhlar (${bot.reviews})`]} value={tab} onChange={setTab} />
            <div className="py-5 text-sm">
              {tab === 0 ? (
                <>
                  <p className="whitespace-pre-line text-muted-foreground">{bot.desc}</p>
                  {bot.fileCount > 0 && (
                    <p className="mt-5 flex items-center gap-2 rounded-lg bg-muted p-3 text-xs text-muted-foreground">
                      <FileArchive className="h-4 w-4 shrink-0" />
                      Bot bilan birga {bot.fileCount} ta fayl taqdim etiladi — to‘lovdan keyin
                      “Buyurtmalar” sahifasidan yuklab olasiz.
                    </p>
                  )}
                </>
              ) : (
                <Reviews botId={bot.id} userId={account?.id} />
              )}
            </div>
          </div>
          <div className="space-y-6">
            <div className="card-soft p-5">
              <div className="flex items-center gap-3">
                <span className="grid h-11 w-11 place-items-center rounded-full bg-primary-soft font-semibold text-primary">
                  {bot.seller.replace("@", "").charAt(0).toUpperCase()}
                </span>
                <div>
                  <p className="text-xs text-muted-foreground">Sotuvchi</p>
                  <p className="font-semibold">{bot.seller}</p>
                </div>
              </div>
            </div>
            {similar.length > 0 && (
              <div>
                <p className="mb-3 font-semibold">O'xshash botlar</p>
                <div className="space-y-3">
                  {similar.map((b) => (
                    <Link
                      key={b.id}
                      to="/bots/$id"
                      params={{ id: b.id }}
                      className="card-soft flex items-center gap-3 p-3"
                    >
                      <div className="flex-1">
                        <p className="text-sm font-medium">{b.title}</p>
                        {account && b.price !== null ? (
                          <p className="text-xs font-semibold text-primary">{formatUZS(b.price)}</p>
                        ) : (
                          <p className="text-xs text-muted-foreground">Narx uchun tizimga kiring</p>
                        )}
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </SiteLayout>
  );
}

function Reviews({ botId, userId }: { botId: string; userId: string | undefined }) {
  const { data: reviews = [], isPending } = useBotReviews(botId);
  const { data: orders = [] } = useOrders("buyer", userId);
  const submit = useSubmitReview(botId, userId ?? "");
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [error, setError] = useState("");

  const hasPurchased = orders.some(
    (o) => o.botId === botId && ["paid", "delivering", "done"].includes(o.status),
  );

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      await submit.mutateAsync({ rating, comment: comment.trim() });
      setComment("");
    } catch (e) {
      const message = e && typeof e === "object" && "message" in e ? String(e.message) : "";
      setError(
        message.includes("duplicate key") || message.includes("row-level security")
          ? "Siz bu bot uchun allaqachon sharh qoldirgansiz."
          : describeError(e),
      );
    }
  }

  return (
    <div className="space-y-4">
      {hasPurchased && (
        <form onSubmit={onSubmit} className="card-soft space-y-3 p-4">
          <p className="font-medium">Sharh qoldiring</p>
          <label className="flex items-center gap-2">
            Baho
            <select
              value={rating}
              onChange={(e) => setRating(Number(e.target.value))}
              className="h-9 rounded-md border bg-background px-2"
            >
              {[5, 4, 3, 2, 1].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            maxLength={2000}
            placeholder="Fikringiz (ixtiyoriy)"
            className="min-h-20 w-full rounded-md border bg-background p-3"
          />
          {error && (
            <p role="alert" className="text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" disabled={submit.isPending}>
            Yuborish
          </Button>
        </form>
      )}
      {isPending ? (
        <p className="text-muted-foreground">Yuklanmoqda…</p>
      ) : reviews.length === 0 ? (
        <p className="text-muted-foreground">Hozircha sharhlar yo‘q.</p>
      ) : (
        reviews.map((r) => (
          <div key={r.id} className="card-soft p-4">
            <p className="font-medium">{r.reviewer || "Xaridor"}</p>
            <Rating value={r.rating} />
            {r.comment && <p className="mt-1 text-muted-foreground">{r.comment}</p>}
          </div>
        ))
      )}
    </div>
  );
}
