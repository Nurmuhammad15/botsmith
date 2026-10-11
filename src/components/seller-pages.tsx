import { Link } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { ArrowLeft, ArrowUpRight, CheckCircle2, Save, Plus, Search, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DashboardLayout, DataTable, StatusBadge } from "@/components/site";
import { SellerSales } from "@/components/seller-sales";
import { sellerNav } from "@/lib/nav";
import { useSellerBots } from "@/lib/seller-bots-context";
import { orders, getPublishedSellerBots, categories, formatUZS } from "@/lib/data";
import { readDemoValue, writeDemoValue } from "@/lib/demo-storage";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase";
import {
  calculateWithdrawalFee,
  getMaximumWithdrawal,
  MINIMUM_WITHDRAWAL,
  MINIMUM_RETAINED_BALANCE,
  useDemoSellerWallet,
  WITHDRAWAL_FEE_RATE,
} from "@/lib/seller-wallet";

export function SellerPage({
  title,
  children,
  user = "@dev_uz",
}: {
  title: string;
  children: ReactNode;
  user?: string;
}) {
  return (
    <DashboardLayout user={user} role="Dasturchi" items={sellerNav}>
      <div className="mb-7 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="mb-1 text-xs text-muted-foreground">Sotuvchi paneli</p>
          <h1 className="text-2xl font-bold">{title}</h1>
        </div>
        <span className="text-xs text-muted-foreground">Namunaviy ma’lumotlar</span>
      </div>
      {children}
    </DashboardLayout>
  );
}
export function SellerOrders() {
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const rows = orders.filter(
    (o) =>
      (filter === "all" || (filter === "done" ? o.status === 4 : o.status < 4)) &&
      `${o.id} ${o.bot.title}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <SellerPage title="Buyurtmalar">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="flex gap-1">
          {[
            ["all", "Barchasi"],
            ["active", "Faol"],
            ["done", "Yakunlangan"],
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
      <DataTable
        head={["Buyurtma", "Bot", "Sana", "Summa", "Holat"]}
        rows={rows.map((o) => [
          o.id,
          <Link to="/bots/$id" params={{ id: o.bot.id }}>
            {o.bot.title}
          </Link>,
          o.date,
          formatUZS(o.bot.price),
          <StatusBadge status={o.status === 4 ? "done" : "delivering"} />,
        ])}
      />
      {rows.length === 0 && (
        <p className="py-12 text-center text-sm text-muted-foreground">Buyurtma topilmadi</p>
      )}
    </SellerPage>
  );
}
export function SellerEarnings() {
  const publishedBots = getPublishedSellerBots();
  const totalEarnings = publishedBots.reduce((total, { bot }) => total + bot.price * bot.sales, 0);
  const { balance, history, storageError } = useDemoSellerWallet();
  const requestedTotal = history.reduce((total, request) => total + request.amount, 0);

  return (
    <SellerPage title="Daromadlar">
      <div className="grid gap-6 border-b pb-7 sm:grid-cols-3">
        {[
          ["Jami daromad · hisoblangan", totalEarnings],
          ["Yechish uchun balans", balance],
          ["Demo so‘rovlar summasi", requestedTotal],
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
        Jami daromad bot narxi × buyurtmalar soni bo‘yicha namunaviy hisoblanadi. Demo balans shu
        summadan boshlanadi; hisobda kamida {formatUZS(MINIMUM_RETAINED_BALANCE)} qolishi kerak.
        Balansdan zaxirani ayirgandan keyingi summani yechish mumkin. So‘rov summasidan 3% komissiya
        ayrilib, qolgan qismi hisobiy to‘lov bo‘ladi. Haqiqiy pul o‘tkazilmaydi.
      </p>
      {storageError && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {storageError}
        </p>
      )}
      <SellerSales />
      <h2 className="mb-4 mt-9 font-semibold">Sotuvlar tarixi</h2>
      <DataTable
        head={["Bot", "Sotilgan", "Narx"]}
        emptyMessage="Hozircha sotuvlar yo‘q."
        rows={publishedBots.map(({ bot }) => [bot.title, `${bot.sales} ta`, formatUZS(bot.price)])}
      />
    </SellerPage>
  );
}
export function SellerProfile() {
  const [saved, setSaved] = useState(false);
  const [savedToAccount, setSavedToAccount] = useState(false);
  const [error, setError] = useState("");
  const [profile, setProfile] = useState({
    name: "Dev Uz",
    username: "@dev_uz",
    bio: "Telegram botlar dasturchisi",
  });

  useEffect(() => {
    let active = true;

    async function loadProfile() {
      try {
        if (isSupabaseConfigured()) {
          const { data, error } = await getSupabaseClient().auth.getSession();
          if (error) throw error;
          const metadata = data.session?.user.user_metadata;
          if (metadata) {
            if (active) setSavedToAccount(true);
            if (active) {
              setProfile((current) => ({
                name:
                  typeof metadata["full_name"] === "string" ? metadata["full_name"] : current.name,
                username:
                  typeof metadata["username"] === "string"
                    ? metadata["username"]
                    : current.username,
                bio: typeof metadata["bio"] === "string" ? metadata["bio"] : current.bio,
              }));
            }
            return;
          }
        }

        if (active) setSavedToAccount(false);
        const value = readDemoValue("botsmith-demo-profile");
        if (
          value &&
          typeof value === "object" &&
          "name" in value &&
          "username" in value &&
          "bio" in value &&
          typeof value.name === "string" &&
          typeof value.username === "string" &&
          typeof value.bio === "string"
        ) {
          if (active) setProfile({ name: value.name, username: value.username, bio: value.bio });
        }
      } catch {
        if (active) setError("Saqlangan profilni yuklab bo‘lmadi. Qayta urinib ko‘ring.");
      }
    }

    void loadProfile();
    return () => {
      active = false;
    };
  }, []);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      let savedToAccount = false;
      if (isSupabaseConfigured()) {
        const supabase = getSupabaseClient();
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        if (data.session) {
          const { error: updateError } = await supabase.auth.updateUser({
            data: {
              full_name: profile.name,
              username: profile.username,
              bio: profile.bio,
            },
          });
          if (updateError) throw updateError;
          savedToAccount = true;
        } else {
          writeDemoValue("botsmith-demo-profile", profile);
        }
      } else {
        writeDemoValue("botsmith-demo-profile", profile);
      }
      setSavedToAccount(savedToAccount);
      setSaved(true);
      setError("");
    } catch {
      setSaved(false);
      setError("Profil saqlanmadi. Hisobga qayta kiring yoki qayta urinib ko‘ring.");
    }
  }

  return (
    <SellerPage title="Profil" user={profile.username}>
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
            <p className="font-semibold">{profile.username}</p>
            <p className="text-sm text-muted-foreground">Dasturchi</p>
          </div>
        </div>
        <label className="block space-y-2 text-sm">
          <span>Ism</span>
          <Input
            value={profile.name}
            onChange={(e) => {
              setProfile({ ...profile, name: e.target.value });
              setSaved(false);
            }}
            required
          />
        </label>
        <label className="block space-y-2 text-sm">
          <span>Telegram username</span>
          <Input
            value={profile.username}
            onChange={(e) => {
              setProfile({ ...profile, username: e.target.value });
              setSaved(false);
            }}
            required
            pattern="@[A-Za-z0-9_]{5,32}"
          />
        </label>
        <label className="block space-y-2 text-sm">
          <span>O‘zingiz haqingizda</span>
          <textarea
            className="min-h-28 w-full rounded-md border bg-background p-3"
            value={profile.bio}
            onChange={(e) => {
              setProfile({ ...profile, bio: e.target.value });
              setSaved(false);
            }}
          />
        </label>
        <Button type="submit">
          <Save />
          Saqlash
        </Button>
        {saved && (
          <p role="status" className="text-sm text-success">
            {savedToAccount
              ? "Profil hisobingizda saqlandi."
              : "Profil ushbu brauzerda saqlandi (demo)."}
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </form>
    </SellerPage>
  );
}
export function SellerNewBot() {
  const [added, setAdded] = useState(false);
  const [error, setError] = useState("");
  const { addBot } = useSellerBots();
  return (
    <SellerPage title="Yangi bot qo‘shish">
      {added ? (
        <div className="max-w-xl space-y-4 border-t py-8">
          <CheckCircle2 className="h-10 w-10 text-success" />
          <h2 className="text-lg font-semibold">Bot ro‘yxatga qo‘shildi</h2>
          <p className="text-sm text-muted-foreground">
            Bot “Mening botlarim”da ko‘rib chiqilmoqda deb ko‘rinadi. Bu demo ma’lumot faqat joriy
            sahifa sessiyasida mavjud; e’lon qilinmaydi va saqlanmaydi.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button asChild>
              <Link to="/seller">Mening botlarimga o‘tish</Link>
            </Button>
            <Button onClick={() => setAdded(false)} variant="outline">
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
            const formData = new FormData(e.currentTarget);
            const price = Number(formData.get("price"));
            if (!Number.isSafeInteger(price) || price < 1) {
              setError("Narxni musbat butun so‘m qiymatida kiriting.");
              return;
            }
            addBot({
              title: String(formData.get("title") ?? ""),
              category: String(formData.get("category") ?? ""),
              price,
              desc: String(formData.get("description") ?? ""),
            });
            setError("");
            setAdded(true);
          }}
        >
          <label className="block space-y-2 text-sm">
            <span>Bot nomi</span>
            <Input name="title" required placeholder="Masalan, Shop Bot" />
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
          <label className="block space-y-2 text-sm">
            <span>Narx (so‘m)</span>
            <Input name="price" required type="number" min="1" step="1" placeholder="450000" />
          </label>
          <label className="block space-y-2 text-sm">
            <span>Tavsif</span>
            <textarea
              name="description"
              required
              className="min-h-32 w-full rounded-md border bg-background p-3"
            />
          </label>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button type="submit">
            <Plus />
            Botni demo ro‘yxatga qo‘shish
          </Button>
        </form>
      )}
    </SellerPage>
  );
}
export function Withdrawal() {
  const { balance, history, storageError, ready, createWithdrawal } = useDemoSellerWallet();
  const [amount, setAmount] = useState("");
  const [card, setCard] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");
  const numericAmount = Number(amount);
  const fee = Number.isSafeInteger(numericAmount) ? calculateWithdrawalFee(numericAmount) : 0;
  const maximumWithdrawal = getMaximumWithdrawal(balance);

  function createDemoRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const digits = card.replace(/\s/g, "");
    if (
      !Number.isSafeInteger(numericAmount) ||
      numericAmount < MINIMUM_WITHDRAWAL ||
      numericAmount > maximumWithdrawal
    ) {
      setError(
        `Kamida ${formatUZS(MINIMUM_WITHDRAWAL)} va hisobda ${formatUZS(MINIMUM_RETAINED_BALANCE)} qoldiradigan summani kiriting.`,
      );
      return;
    }
    if (!/^\d{16}$/.test(digits)) {
      setError("Karta raqami 16 ta raqamdan iborat bo‘lishi kerak.");
      return;
    }

    try {
      createWithdrawal(numericAmount, digits.slice(-4));
      setError("");
      setConfirmed(true);
    } catch {
      setError("Demo so‘rov saqlanmadi. Brauzer ma’lumotlarni saqlashga ruxsat bermadi.");
    }
  }

  return (
    <SellerPage title="Pul yechish">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.7fr)]">
        <div className="max-w-xl">
          <div className="mb-7 flex items-center gap-4 border-b pb-6">
            <Wallet className="h-7 w-7 text-primary" />
            <div>
              <p className="text-sm text-muted-foreground">Hisobdagi demo balans</p>
              <p className="mt-1 text-2xl font-bold">{formatUZS(balance)}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Hozir yechish mumkin: {formatUZS(maximumWithdrawal)} · kamida{" "}
                {formatUZS(MINIMUM_RETAINED_BALANCE)} hisobda qoladi
              </p>
            </div>
          </div>
          {confirmed ? (
            <div className="space-y-4" role="status">
              <CheckCircle2 className="h-10 w-10 text-success" />
              <h2 className="text-lg font-semibold">Demo so‘rov tayyorlandi</h2>
              <p className="text-sm text-muted-foreground">
                {formatUZS(Number(amount))} — karta •••• {card.replace(/\s/g, "").slice(-4)}
              </p>
              <p className="text-sm text-muted-foreground">
                Komissiya: {formatUZS(fee)} · oluvchiga hisobiy:{" "}
                {formatUZS(Math.max(0, Number(amount) - fee))}
              </p>
              <p className="text-sm text-muted-foreground">
                Faqat demo yozuvi ushbu brauzerda saqlandi. Haqiqiy pul o‘tkazilmadi va so‘rov
                yuborilmadi. Demo balans {formatUZS(balance)} ga kamaytirildi; bu haqiqiy hamyon
                yoki to‘lov emas.
              </p>
              <Button variant="outline" onClick={() => setConfirmed(false)}>
                <ArrowLeft />
                Ortga qaytish
              </Button>
            </div>
          ) : (
            <form className="space-y-5" onSubmit={createDemoRequest}>
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
                    disabled={!ready || maximumWithdrawal < MINIMUM_WITHDRAWAL}
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
                <Input required placeholder="Ism va familiya" />
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
                  <span className="text-muted-foreground">Oluvchiga hisobiy summa</span>
                  <strong>{formatUZS(Math.max(0, numericAmount - fee))}</strong>
                </div>
              </div>
              {storageError && (
                <p role="alert" className="text-sm text-destructive">
                  {storageError}
                </p>
              )}
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Demo rejim. So‘rovdan keyin hisobda kamida {formatUZS(MINIMUM_RETAINED_BALANCE)}{" "}
                qoladi. So‘ralgan summadan 3% komissiya hisoblanadi, lekin haqiqiy pul
                o‘tkazilmaydi. Haqiqiy karta ma’lumotlarini kiritmang.
              </p>
              <Button
                className="w-full"
                type="submit"
                disabled={!ready || Boolean(storageError) || maximumWithdrawal < MINIMUM_WITHDRAWAL}
              >
                <ArrowUpRight />
                Demo so‘rovni tekshirish
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
              {history.map((request) => (
                <li key={request.id} className="rounded-lg border p-4">
                  <div className="flex items-center justify-between gap-3">
                    <strong>{formatUZS(request.amount)}</strong>
                    <span className="rounded-full bg-muted px-2 py-1 text-xs">Demo</span>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">Karta •••• {request.last4}</p>
                  {request.fee !== undefined && request.payout !== undefined && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Komissiya: {formatUZS(request.fee)} · oluvchiga: {formatUZS(request.payout)}
                    </p>
                  )}
                  <time
                    className="mt-1 block text-xs text-muted-foreground"
                    dateTime={request.createdAt}
                  >
                    {new Date(request.createdAt).toLocaleString("uz-UZ")}
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
  const { history, storageError, ready } = useDemoSellerWallet();
  const totalRequested = history.reduce((total, request) => total + request.amount, 0);

  return (
    <SellerPage title="Pul yechish tarixi">
      {storageError && (
        <p role="alert" className="mb-4 text-sm text-destructive">
          {storageError}
        </p>
      )}
      {!ready ? (
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
              <p className="text-sm text-muted-foreground">Demo so‘rovlar soni</p>
              <p className="mt-1 text-xl font-bold">{history.length}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">So‘ralgan jami summa</p>
              <p className="mt-1 text-xl font-bold">{formatUZS(totalRequested)}</p>
            </div>
          </div>
          <p className="mb-4 text-sm text-muted-foreground">
            Bu brauzerda saqlangan demo yozuvlari. Ular haqiqiy pul o‘tkazilganini bildirmaydi.
          </p>
          <ul className="space-y-3">
            {history.map((request) => (
              <li key={request.id} className="rounded-lg border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-bold">{formatUZS(request.amount)}</p>
                    <p className="mt-1 text-sm text-muted-foreground">Karta •••• {request.last4}</p>
                  </div>
                  <span className="rounded-full bg-muted px-2 py-1 text-xs">
                    Demo · to‘lanmagan
                  </span>
                </div>
                <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-muted-foreground">Komissiya · 3%</dt>
                    <dd className="mt-1 font-medium">
                      {formatUZS(request.fee ?? calculateWithdrawalFee(request.amount))}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Oluvchiga hisobiy summa</dt>
                    <dd className="mt-1 font-medium">
                      {formatUZS(
                        request.payout ?? request.amount - calculateWithdrawalFee(request.amount),
                      )}
                    </dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-muted-foreground">So‘rov sanasi va vaqti</dt>
                    <dd className="mt-1">
                      <time dateTime={request.createdAt}>
                        {new Date(request.createdAt).toLocaleString("uz-UZ", {
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
  const faqs = [
    [
      "Botni qanday joylayman?",
      "Mening botlarim sahifasidagi “Yangi bot qo‘shish” orqali bot nomi, kategoriya, narx va tavsifni kiriting.",
    ],
    [
      "Buyurtmalarni qayerda ko‘raman?",
      "Buyurtmalar sahifasida bot nomi, summa va buyurtma holati ko‘rinadi.",
    ],
    [
      "Pulni qanday yechaman?",
      "Eng kamida 100 000 so‘m so‘rash mumkin. So‘rov demo balansdan ayriladi; 3% platforma komissiyasi hisoblanib, 97% oluvchiga qoladi. Hozir pul o‘tkazilmaydi.",
    ],
    [
      "Nega ma’lumotlar saqlanmayapti?",
      "Bu namunaviy ko‘rinish. Haqiqiy hisoblar, botlarni e’lon qilish va to‘lovlar hali ulanmagan.",
    ],
  ];
  return (
    <SellerPage title="Yordam">
      <div className="max-w-3xl">
        <h2 className="mb-5 font-semibold">Ko‘p so‘raladigan savollar</h2>
        {faqs.map(([q, a]) => (
          <details key={q} className="border-b py-5">
            <summary className="cursor-pointer text-sm font-medium">{q}</summary>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">{a}</p>
          </details>
        ))}
      </div>
    </SellerPage>
  );
}
