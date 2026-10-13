import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, ChevronRight, Languages, MessageSquare, RefreshCw, Star } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
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
      { title: "Bot — BotHub" },
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
  const [subscriptionDays, setSubscriptionDays] = useState<1 | 7 | 30>(1);
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
    if (bot) document.title = `${bot.title} — BotHub`;
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
      await createOrder.mutateAsync({ botId: bot.id, subscriptionDays });
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
            <div className="mt-5 space-y-4">
              <fieldset>
                <legend className="mb-2 text-sm font-semibold">Obuna muddatini tanlang</legend>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      [1, "1 kun", bot.price],
                      [7, "7 kun", bot.price7Days],
                      [30, "30 kun", bot.price30Days],
                    ] as const
                  ).map(([days, label, price]) => (
                    <button
                      key={days}
                      type="button"
                      disabled={price === null}
                      aria-pressed={subscriptionDays === days}
                      onClick={() => setSubscriptionDays(days)}
                      className={`rounded-lg border p-3 text-left text-sm disabled:cursor-not-allowed disabled:opacity-40 ${
                        subscriptionDays === days ? "border-primary bg-primary/5" : ""
                      }`}
                    >
                      <span className="block font-medium">{label}</span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {price === null ? "Hozircha mavjud emas" : formatUZS(price)}
                      </span>
                    </button>
                  ))}
                </div>
              </fieldset>
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
                      {createOrder.isPending ? "Yuborilmoqda…" : "Obuna bo‘lish"}
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
            <div className="mt-5 grid grid-cols-2 gap-3">
              {[
                [RefreshCw, "Qaytarish muddati", "To‘lovdan keyin 24 soat"],
                [Languages, "Tillar", bot.lang.map((l) => LANGUAGE_NAMES[l] ?? l).join(", ")],
              ].map(([I, a, b]) => {
                const Icon = I as typeof RefreshCw;
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
                </>
              ) : (
                <Reviews botId={bot.id} />
              )}
            </div>
          </div>
          <div className="space-y-6">
            <div className="card-soft p-5">
              <div className="flex items-center gap-3">
                {bot.sellerAvatar ? (
                  <img
                    src={bot.sellerAvatar}
                    alt=""
                    className="h-14 w-14 rounded-full border object-cover"
                  />
                ) : (
                  <span className="grid h-14 w-14 place-items-center rounded-full bg-primary-soft text-lg font-semibold text-primary">
                    {bot.seller.replace("@", "").charAt(0).toUpperCase()}
                  </span>
                )}
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Sotuvchi</p>
                  <p className="truncate font-semibold">{bot.seller}</p>
                  {bot.sellerHeadline && (
                    <p className="text-xs text-muted-foreground">{bot.sellerHeadline}</p>
                  )}
                </div>
              </div>
              {(bot.sellerLocation || bot.sellerExperience !== null) && (
                <p className="mt-3 text-xs text-muted-foreground">
                  {[
                    bot.sellerLocation,
                    bot.sellerExperience !== null ? `${bot.sellerExperience} yil tajriba` : "",
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              )}
              {bot.sellerBio && (
                <p className="mt-3 whitespace-pre-line text-sm leading-6 text-muted-foreground">
                  {bot.sellerBio}
                </p>
              )}
              {bot.sellerCv && (
                <a
                  href={bot.sellerCv}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 block truncate text-sm text-primary underline"
                >
                  CV: {bot.sellerCvName}
                </a>
              )}
              {bot.sellerWebsite && (
                <a
                  href={bot.sellerWebsite}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="mt-3 block truncate text-sm text-primary underline"
                >
                  {bot.sellerWebsite.replace(/^https?:\/\//, "")}
                </a>
              )}
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
                        <p className="text-xs font-semibold text-primary">
                          {formatUZS(b.price)} / 1 kun
                        </p>
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

function Reviews({ botId }: { botId: string }) {
  const { data: reviews = [], isPending } = useBotReviews(botId);
  const [preview, setPreview] = useState<string | null>(null);

  return (
    <div className="space-y-4">
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
            {r.images.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {r.images.map((src) => (
                  <button
                    key={src}
                    type="button"
                    aria-label="Rasmni kattalashtirish"
                    onClick={() => setPreview(src)}
                    className="rounded"
                  >
                    <img
                      src={src}
                      alt=""
                      loading="lazy"
                      className="h-16 w-20 rounded-lg border object-cover"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>
        ))
      )}
      <Dialog open={preview !== null} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogContent className="max-w-3xl p-2">
          <DialogHeader className="sr-only">
            <DialogTitle>Rasm</DialogTitle>
            <DialogDescription>Sharh rasmi</DialogDescription>
          </DialogHeader>
          {preview && (
            <img src={preview} alt="" className="max-h-[80vh] w-full rounded object-contain" />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
