import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  CheckCircle2,
  MessageSquare,
  Save,
  Plus,
  Search,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DashboardLayout, DataTable, StatusBadge } from "@/components/site";
import { FaqList } from "@/components/faq-list";
import { MediaPicker } from "@/components/media-picker";
import { SellerSales } from "@/components/seller-sales";
import { sellerNav } from "@/lib/nav";
import { sellerFaqs } from "@/lib/faq";
import { uploadCovers } from "@/lib/api-media";
import { useOpenConversation } from "@/lib/api-chat";
import { IMAGE_TYPES, MAX_IMAGES, validateImage } from "@/lib/media";
import {
  describeError,
  useAddBot,
  useMyBots,
  useOrders,
  useProfile,
  useRequestWithdrawal,
  useUpdateProfile,
  useWallet,
  useWithdrawals,
} from "@/lib/api";
import {
  categories,
  formatUZS,
  orderCode,
  type Order,
  type Withdrawal,
  type WithdrawalStatus,
} from "@/lib/data";
import { useMarketplaceAccount } from "@/lib/marketplace-auth-context";
import {
  calculateWithdrawalFee,
  getMaximumWithdrawal,
  MINIMUM_WITHDRAWAL,
  WITHDRAWAL_FEE_RATE,
} from "@/lib/wallet";

export function SellerPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <DashboardLayout user="" role="Dasturchi" items={sellerNav}>
      <div className="mb-7 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="mb-1 text-xs text-muted-foreground">Sotuvchi paneli</p>
          <h1 className="text-2xl font-bold">{title}</h1>
        </div>
      </div>
      {children}
    </DashboardLayout>
  );
}

const orderStatusLabel: Record<Order["status"], string> = {
  pending_payment: "To‘lov kutilmoqda",
  paid: "Obuna faol",
  delivering: "Faol",
  done: "Eski buyurtma",
  cancelled: "Bekor qilingan",
};

const withdrawalStatusLabel: Record<WithdrawalStatus, string> = {
  pending: "Ko‘rib chiqilmoqda",
  paid: "To‘langan",
  rejected: "Rad etilgan",
};

function WithdrawalBadge({ status }: { status: WithdrawalStatus }) {
  return (
    <span className="rounded-full bg-muted px-2 py-1 text-xs">{withdrawalStatusLabel[status]}</span>
  );
}

export function SellerOrders() {
  const account = useMarketplaceAccount();
  const { data: orders = [], isPending, isError } = useOrders("seller", account?.id);
  const openConversation = useOpenConversation();
  const navigate = useNavigate();
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const rows = orders.filter(
    (o) =>
      (filter === "all" ||
        (filter === "active"
          ? o.status === "paid" &&
            (!o.subscriptionExpiresAt || Date.parse(o.subscriptionExpiresAt) > Date.now())
          : filter === "pending"
            ? o.status === "pending_payment"
            : false)) &&
      `${orderCode(o.number)} ${o.botTitle}`.toLowerCase().includes(query.toLowerCase()),
  );

  async function writeToBuyer(order: Order) {
    setError("");
    try {
      const id = await openConversation.mutateAsync({
        botId: order.botId,
        buyerId: order.buyerId,
      });
      await navigate({ to: "/messages", search: { c: id } });
    } catch (e) {
      setError(describeError(e));
    }
  }

  return (
    <SellerPage title="Buyurtmalar">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="flex gap-1">
          {[
            ["all", "Barchasi"],
            ["active", "Faol"],
            ["pending", "To‘lov kutilmoqda"],
          ].map(([value, label]) => (
            <Button
              key={value}
              variant={filter === value ? "secondary" : "ghost"}
              onClick={() => setFilter(value ?? "all")}
            >
              {label}
            </Button>
          ))}
        </div>
        <div className="relative ml-auto w-full sm:w-64">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            aria-label="Buyurtma qidirish"
            placeholder="Buyurtma qidirish"
            className="pl-9"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>
      {error && (
        <p role="alert" className="mb-3 text-sm text-destructive">
          {error}
        </p>
      )}
      {isError && (
        <p role="alert" className="mb-3 text-sm text-destructive">
          Buyurtmalarni yuklab bo‘lmadi.
        </p>
      )}
      <DataTable
        head={["Buyurtma", "Bot", "Sana", "Muddat", "Tugash vaqti", "Summa", "Holat", ""]}
        emptyMessage={isPending ? "Yuklanmoqda…" : "Buyurtma topilmadi"}
        rows={rows.map((o) => [
          orderCode(o.number),
          <Link to="/bots/$id" params={{ id: o.botId }}>
            {o.botTitle}
          </Link>,
          new Date(o.createdAt).toLocaleDateString("uz-UZ"),
          `${o.subscriptionDays} kun`,
          o.subscriptionExpiresAt ? new Date(o.subscriptionExpiresAt).toLocaleString("uz-UZ") : "—",
          formatUZS(o.amount),
          o.status === "paid" &&
          o.subscriptionExpiresAt &&
          Date.parse(o.subscriptionExpiresAt) <= Date.now()
            ? "Muddati tugagan"
            : orderStatusLabel[o.status],
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="ghost" onClick={() => writeToBuyer(o)}>
              <MessageSquare />
              Xaridorga yozish
            </Button>
          </div>,
        ])}
      />
    </SellerPage>
  );
}

export function SellerEarnings() {
  const { data: bots = [] } = useMyBots();
  const { data: wallet } = useWallet();
  const published = bots.filter((bot) => bot.status === "published");

  return (
    <SellerPage title="Daromadlar">
      <div className="grid gap-6 border-b pb-7 sm:grid-cols-3">
        {[
          ["Jami daromad", wallet?.earned ?? 0],
          ["Yechish uchun balans", wallet?.balance ?? 0],
          ["So‘ralgan summa", wallet?.withdrawn ?? 0],
        ].map(([label, value]) => (
          <div key={String(label)}>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="mt-2 text-2xl font-bold">{formatUZS(Number(value))}</p>
          </div>
        ))}
      </div>
      <Button asChild className="mt-5">
        <Link to="/withdraw">
          <ArrowUpRight />
          Pul yechish
        </Link>
      </Button>
      <p className="mt-4 max-w-3xl text-sm text-muted-foreground">
        Sotuv daromadi to‘lovdan 24 soat o‘tgach va qaytarish so‘rovi bo‘lmaganda yechish uchun
        ochiladi. Har bir pul yechish so‘rovidan {WITHDRAWAL_FEE_RATE * 100}% komissiya ushlanadi.
      </p>
      <SellerSales bots={bots} />
      <h2 className="mb-4 mt-9 font-semibold">Sotuvlar tarixi</h2>
      <DataTable
        head={["Bot", "Sotilgan", "Narx", "Daromad"]}
        emptyMessage="Hozircha sotuvlar yo‘q."
        rows={published.map((bot) => [
          bot.title,
          `${bot.sales} ta`,
          formatUZS(bot.price),
          formatUZS(bot.earned),
        ])}
      />
    </SellerPage>
  );
}

export function SellerProfile() {
  const account = useMarketplaceAccount();
  const { data: saved, isPending, isError: loadFailed } = useProfile(account?.id);
  const update = useUpdateProfile(account?.id);
  const [profile, setProfile] = useState({ name: "", username: "", bio: "" });
  const [loaded, setLoaded] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (saved && !loaded) {
      setProfile({ name: saved.name, username: saved.username, bio: saved.bio });
      setLoaded(true);
    }
  }, [saved, loaded]);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    try {
      await update.mutateAsync(profile);
      setDone(true);
    } catch (e) {
      setDone(false);
      setError(describeError(e));
    }
  }

  const edit = (patch: Partial<typeof profile>) => {
    setProfile({ ...profile, ...patch });
    setDone(false);
  };

  return (
    <SellerPage title="Profil">
      {isPending ? (
        <p className="text-sm text-muted-foreground">Yuklanmoqda…</p>
      ) : loadFailed ? (
        <p role="alert" className="text-sm text-destructive">
          Profilni yuklab bo‘lmadi. Sahifani yangilang.
        </p>
      ) : (
        <form className="max-w-xl space-y-5" onSubmit={saveProfile}>
          <div className="flex items-center gap-4 border-b pb-6">
            <span className="grid h-16 w-16 place-items-center rounded-full bg-primary-soft text-xl font-semibold text-primary">
              {profile.name
                .split(/\s+/)
                .map((part) => part[0])
                .join("")
                .slice(0, 2)
                .toUpperCase()}
            </span>
            <div>
              <p className="font-semibold">{profile.username || profile.name}</p>
              <p className="text-sm text-muted-foreground">Dasturchi · {account?.email}</p>
            </div>
          </div>
          <label className="block space-y-2 text-sm">
            <span>Ism</span>
            <Input value={profile.name} onChange={(e) => edit({ name: e.target.value })} required />
          </label>
          <label className="block space-y-2 text-sm">
            <span>Telegram username</span>
            <Input
              value={profile.username}
              onChange={(e) => edit({ username: e.target.value })}
              placeholder="@username"
              pattern="@[A-Za-z0-9_]{5,32}"
            />
          </label>
          <label className="block space-y-2 text-sm">
            <span>O‘zingiz haqingizda</span>
            <textarea
              className="min-h-28 w-full rounded-md border bg-background p-3"
              value={profile.bio}
              onChange={(e) => edit({ bio: e.target.value })}
            />
          </label>
          <Button type="submit" disabled={update.isPending}>
            <Save />
            Saqlash
          </Button>
          {done && (
            <p role="status" className="text-sm text-success">
              Profil saqlandi.
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </form>
      )}
    </SellerPage>
  );
}

export function SellerNewBot() {
  const account = useMarketplaceAccount();
  const queryClient = useQueryClient();
  const addBot = useAddBot(account?.id);
  const [created, setCreated] = useState<{ id: string; problems: string[] } | null>(null);
  const [stage, setStage] = useState("");
  const [error, setError] = useState("");
  const [images, setImages] = useState<File[]>([]);
  const [prices, setPrices] = useState({ one: "", seven: "", thirty: "" });
  const busy = stage !== "";

  async function submit(form: HTMLFormElement) {
    if (!account) return;
    const formData = new FormData(form);
    const price = Number(formData.get("price-1"));
    const price7Days = Number(formData.get("price-7"));
    const price30Days = Number(formData.get("price-30"));
    const webhookUrl = String(formData.get("webhook-url") ?? "").trim();
    const webhookSecret = String(formData.get("webhook-secret") ?? "").trim();
    if (
      ![price, price7Days, price30Days].every((value) => Number.isSafeInteger(value) && value > 0)
    ) {
      setError("Uchala obuna narxini ham musbat butun so‘m qiymatida kiriting.");
      return;
    }
    if (!webhookUrl.startsWith("https://") || webhookSecret.length < 32) {
      setError("HTTPS webhook manzili va kamida 32 belgili maxfiy kalit kiriting.");
      return;
    }
    setError("");
    let botId: string;
    try {
      setStage("Bot yaratilmoqda…");
      botId = await addBot.mutateAsync({
        title: String(formData.get("title") ?? ""),
        category: String(formData.get("category") ?? ""),
        price,
        price7Days,
        price30Days,
        desc: String(formData.get("description") ?? ""),
        webhookUrl,
        webhookSecret,
      });
    } catch (err) {
      setError(describeError(err));
      setStage("");
      return;
    }

    // The bot exists from here on; media problems are reported, not retried by re-creating it.
    const problems: string[] = [];
    try {
      if (images.length > 0) {
        setStage("Rasmlar yuklanmoqda…");
        const result = await uploadCovers(account.id, botId, images, []);
        problems.push(...result.failed.map((name) => `Rasm yuklanmadi: ${name}`));
      }
    } catch {
      problems.push("Rasmlar saqlanmadi.");
    }
    void queryClient.invalidateQueries({ queryKey: ["my-bots"] });
    setStage("");
    setCreated({ id: botId, problems });
  }

  return (
    <SellerPage title="Yangi bot qo‘shish">
      {created ? (
        <div className="max-w-xl space-y-4 border-t py-8">
          <CheckCircle2 className="h-10 w-10 text-success" />
          <h2 className="text-lg font-semibold">Bot moderatsiyaga yuborildi</h2>
          <p className="text-sm text-muted-foreground">
            Administrator tekshirgach bot katalogda e’lon qilinadi. Holatini “Mening botlarim”da
            kuzatishingiz mumkin.
          </p>
          {created.problems.length > 0 && (
            <div role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
              <p className="font-medium">Ba’zi rasmlar yuklanmadi:</p>
              <ul className="mt-1 list-disc pl-5">
                {created.problems.map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
              </ul>
              <Link
                to="/seller-bots/$id"
                params={{ id: created.id }}
                className="mt-2 inline-block font-medium underline"
              >
                Bot sahifasida qayta yuklash
              </Link>
            </div>
          )}
          <div className="flex flex-wrap gap-3">
            <Button asChild>
              <Link to="/seller">Mening botlarimga o‘tish</Link>
            </Button>
            <Button
              onClick={() => {
                setCreated(null);
                setImages([]);
              }}
              variant="outline"
            >
              <Plus />
              Yana bot qo‘shish
            </Button>
          </div>
        </div>
      ) : (
        <form
          className="max-w-xl space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            void submit(e.currentTarget);
          }}
        >
          <label className="block space-y-2 text-sm">
            <span>Bot nomi</span>
            <Input
              name="title"
              required
              minLength={2}
              maxLength={120}
              placeholder="Masalan, Shop Bot"
            />
          </label>
          <label className="block space-y-2 text-sm">
            <span>Kategoriya</span>
            <select
              name="category"
              required
              className="h-10 w-full rounded-md border bg-background px-3"
            >
              <option value="">Kategoriya tanlang</option>
              {categories.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          {(
            [
              ["price-1", "1 kunlik narx (so‘m)", "one"],
              ["price-7", "7 kunlik narx (so‘m)", "seven"],
              ["price-30", "30 kunlik narx (so‘m)", "thirty"],
            ] as const
          ).map(([name, label, key]) => {
            const amount = Number(prices[key]);
            const net =
              Number.isSafeInteger(amount) && amount > 0
                ? amount - Math.round(amount * 0.15)
                : null;
            return (
              <label key={name} className="block space-y-2 text-sm">
                <span>{label}</span>
                <Input
                  name={name}
                  required
                  type="number"
                  min="1"
                  step="1"
                  placeholder="450000"
                  value={prices[key]}
                  onChange={(event) =>
                    setPrices((previous) => ({ ...previous, [key]: event.target.value }))
                  }
                />
                <span className="block text-xs text-muted-foreground">
                  Platforma komissiyasi: −15%
                  {net !== null ? ` · Sizga qoladi: ${formatUZS(net)}` : ""}
                </span>
              </label>
            );
          })}
          <label className="block space-y-2 text-sm">
            <span>Tavsif</span>
            <textarea
              name="description"
              required
              maxLength={5000}
              className="min-h-32 w-full rounded-md border bg-background p-3"
            />
          </label>
          <label className="block space-y-2 text-sm">
            <span>Obunani boshqarish webhook HTTPS manzili</span>
            <Input
              name="webhook-url"
              required
              type="url"
              placeholder="https://example.uz/botsmith/webhook"
            />
          </label>
          <label className="block space-y-2 text-sm">
            <span>Webhook maxfiy kaliti (kamida 32 belgi)</span>
            <Input
              name="webhook-secret"
              required
              minLength={32}
              type="password"
              autoComplete="new-password"
              placeholder="O‘zingizning bot serveringizda ham sozlang"
            />
            <span className="block text-xs text-muted-foreground">
              `subscription.activated`, `subscription.expired`, `subscription.refund_requested`,
              `subscription.refunded` va `subscription.reactivated` hodisalari yuboriladi. Imzo
              `X-BotSmith-Timestamp` va `X-BotSmith-Signature` sarlavhalarida; JSON tanasini
              <code>{"<timestamp>.<raw body>"}</code> ko‘rinishida HMAC-SHA256 bilan tekshiring.
              Kalitni faqat serveringizda saqlang va `X-BotSmith-Delivery` identifikatori bo‘yicha
              takrorlarni oldini oling.
            </span>
          </label>
          <MediaPicker
            label="Rasmlar (birinchisi muqova bo‘ladi)"
            hint={`JPG, PNG yoki WebP · 5 MB gacha · ko‘pi bilan ${MAX_IMAGES} ta`}
            accept={IMAGE_TYPES.join(",")}
            files={images}
            onChange={setImages}
            validate={validateImage}
            max={MAX_IMAGES}
            preview
            disabled={busy}
          />
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" disabled={busy}>
            <Plus />
            {busy ? stage : "Moderatsiyaga yuborish"}
          </Button>
        </form>
      )}
    </SellerPage>
  );
}

export function Withdrawal() {
  const account = useMarketplaceAccount();
  const { data: wallet, isPending } = useWallet();
  const { data: history = [] } = useWithdrawals(account?.id);
  const request = useRequestWithdrawal();
  const [amount, setAmount] = useState("");
  const [card, setCard] = useState("");
  const [holder, setHolder] = useState("");
  const [created, setCreated] = useState<Withdrawal | null>(null);
  const [error, setError] = useState("");
  const balance = wallet?.balance ?? 0;
  const numericAmount = Number(amount);
  const fee = Number.isSafeInteger(numericAmount) ? calculateWithdrawalFee(numericAmount) : 0;
  const maximumWithdrawal = getMaximumWithdrawal(balance);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const digits = card.replace(/\s/g, "");
    if (
      !Number.isSafeInteger(numericAmount) ||
      numericAmount < MINIMUM_WITHDRAWAL ||
      numericAmount > maximumWithdrawal
    ) {
      setError(
        `Kamida ${formatUZS(MINIMUM_WITHDRAWAL)} va mavjud balansdan oshmagan summani kiriting.`,
      );
      return;
    }
    if (!/^\d{16}$/.test(digits)) {
      setError("Karta raqami 16 ta raqamdan iborat bo‘lishi kerak.");
      return;
    }
    try {
      setCreated(await request.mutateAsync({ amount: numericAmount, card: digits, holder }));
      setError("");
      setAmount("");
      setCard("");
      setHolder("");
    } catch (e) {
      setError(describeError(e));
    }
  }

  return (
    <SellerPage title="Pul yechish">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.7fr)]">
        <div className="max-w-xl">
          <div className="mb-7 flex items-center gap-4 border-b pb-6">
            <Wallet className="h-7 w-7 text-primary" />
            <div>
              <p className="text-sm text-muted-foreground">Hisobdagi balans</p>
              <p className="mt-1 text-2xl font-bold">{formatUZS(balance)}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Hozir yechish mumkin: {formatUZS(maximumWithdrawal)}
              </p>
            </div>
          </div>
          {created ? (
            <div className="space-y-4" role="status">
              <CheckCircle2 className="h-10 w-10 text-success" />
              <h2 className="text-lg font-semibold">So‘rov qabul qilindi</h2>
              <p className="text-sm text-muted-foreground">
                {formatUZS(created.amount)} — karta •••• {created.last4}
              </p>
              <p className="text-sm text-muted-foreground">
                Komissiya: {formatUZS(created.fee)} · kartaga o‘tkaziladi:{" "}
                {formatUZS(created.payout)}
              </p>
              <p className="text-sm text-muted-foreground">
                So‘rov administratorga yuborildi. O‘tkazma qo‘lda amalga oshiriladi; holatini
                “Yechish tarixi”da kuzating.
              </p>
              <Button variant="outline" onClick={() => setCreated(null)}>
                <ArrowLeft />
                Ortga qaytish
              </Button>
            </div>
          ) : (
            <form className="space-y-5" onSubmit={submit}>
              <label className="block space-y-2 text-sm">
                <span>Summa (so‘m) · eng kami {formatUZS(MINIMUM_WITHDRAWAL)}</span>
                <div className="flex gap-2">
                  <Input
                    aria-label="Yechish summasi"
                    required
                    type="number"
                    min={MINIMUM_WITHDRAWAL}
                    max={maximumWithdrawal}
                    step="1"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder={String(MINIMUM_WITHDRAWAL)}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={isPending || maximumWithdrawal < MINIMUM_WITHDRAWAL}
                    onClick={() => setAmount(String(maximumWithdrawal))}
                  >
                    Barchasi
                  </Button>
                </div>
              </label>
              <label className="block space-y-2 text-sm">
                <span>Karta raqami</span>
                <Input
                  aria-label="Karta raqami"
                  required
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={19}
                  value={card}
                  onChange={(e) =>
                    setCard(
                      e.target.value
                        .replace(/\D/g, "")
                        .slice(0, 16)
                        .replace(/(.{4})/g, "$1 ")
                        .trim(),
                    )
                  }
                  placeholder="0000 0000 0000 0000"
                />
              </label>
              <label className="block space-y-2 text-sm">
                <span>Karta egasi</span>
                <Input
                  required
                  minLength={2}
                  maxLength={80}
                  value={holder}
                  onChange={(e) => setHolder(e.target.value)}
                  placeholder="Ism va familiya"
                />
              </label>
              <div className="space-y-2 border-y py-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">So‘ralgan summa</span>
                  <strong>{formatUZS(numericAmount || 0)}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    Komissiya ({WITHDRAWAL_FEE_RATE * 100}%)
                  </span>
                  <strong>{formatUZS(fee)}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Kartaga o‘tkaziladi</span>
                  <strong>{formatUZS(Math.max(0, numericAmount - fee))}</strong>
                </div>
              </div>
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Faqat karta raqami so‘raladi — CVV va amal qilish muddatini hech qachon kiritmang.
                So‘rovdan keyin balansning yechilmagan qismi hisobda qoladi.
              </p>
              <Button
                className="w-full"
                type="submit"
                disabled={isPending || request.isPending || maximumWithdrawal < MINIMUM_WITHDRAWAL}
              >
                <ArrowUpRight />
                Pul yechishni so‘rash
              </Button>
            </form>
          )}
        </div>
        <section className="border-t pt-6 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
          <h2 className="font-semibold">Pul yechish tarixi</h2>
          {history.length === 0 ? (
            <div className="flex min-h-48 flex-col items-center justify-center gap-3 text-center">
              <Wallet className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Hozircha so‘rovlar yo‘q</p>
            </div>
          ) : (
            <ul className="mt-4 space-y-3">
              {history.map((item) => (
                <li key={item.id} className="rounded-lg border p-4">
                  <div className="flex items-center justify-between gap-3">
                    <strong>{formatUZS(item.amount)}</strong>
                    <WithdrawalBadge status={item.status} />
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">Karta •••• {item.last4}</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Komissiya: {formatUZS(item.fee)} · kartaga: {formatUZS(item.payout)}
                  </p>
                  <time
                    className="mt-1 block text-xs text-muted-foreground"
                    dateTime={item.createdAt}
                  >
                    {new Date(item.createdAt).toLocaleString("uz-UZ")}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </SellerPage>
  );
}

export function SellerWithdrawalHistory() {
  const account = useMarketplaceAccount();
  const { data: history = [], isPending, isError } = useWithdrawals(account?.id);
  const totalRequested = history
    .filter((item) => item.status !== "rejected")
    .reduce((total, item) => total + item.amount, 0);

  return (
    <SellerPage title="Pul yechish tarixi">
      {isError && (
        <p role="alert" className="mb-4 text-sm text-destructive">
          Tarixni yuklab bo‘lmadi. Sahifani yangilang.
        </p>
      )}
      {isPending ? (
        <p className="py-12 text-center text-sm text-muted-foreground">Yuklanmoqda…</p>
      ) : history.length === 0 ? (
        <div className="flex min-h-48 flex-col items-center justify-center gap-3 text-center">
          <Wallet className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Hozircha yechish so‘rovlari yo‘q</p>
        </div>
      ) : (
        <>
          <div className="mb-5 grid gap-4 rounded-lg border p-4 sm:grid-cols-2">
            <div>
              <p className="text-sm text-muted-foreground">So‘rovlar soni</p>
              <p className="mt-1 text-xl font-bold">{history.length}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">So‘ralgan jami summa (rad etilmagan)</p>
              <p className="mt-1 text-xl font-bold">{formatUZS(totalRequested)}</p>
            </div>
          </div>
          <ul className="space-y-3">
            {history.map((item) => (
              <li key={item.id} className="rounded-lg border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-bold">{formatUZS(item.amount)}</p>
                    <p className="mt-1 text-sm text-muted-foreground">Karta •••• {item.last4}</p>
                  </div>
                  <WithdrawalBadge status={item.status} />
                </div>
                <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-muted-foreground">
                      Komissiya · {WITHDRAWAL_FEE_RATE * 100}%
                    </dt>
                    <dd className="mt-1 font-medium">{formatUZS(item.fee)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Kartaga o‘tkaziladi</dt>
                    <dd className="mt-1 font-medium">{formatUZS(item.payout)}</dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-muted-foreground">So‘rov sanasi va vaqti</dt>
                    <dd className="mt-1">
                      <time dateTime={item.createdAt}>
                        {new Date(item.createdAt).toLocaleString("uz-UZ", {
                          dateStyle: "long",
                          timeStyle: "medium",
                        })}
                      </time>
                    </dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>
        </>
      )}
    </SellerPage>
  );
}

export function SellerHelp() {
  return (
    <SellerPage title="Yordam">
      <FaqList title="Ko‘p so‘raladigan savollar" items={sellerFaqs} />
      <p className="mt-6 max-w-3xl text-sm text-muted-foreground">
        Javob topmadingizmi?{" "}
        <Link to="/support-chat" className="font-medium text-primary">
          Yordam chatiga yozing
        </Link>
        .
      </p>
    </SellerPage>
  );
}
