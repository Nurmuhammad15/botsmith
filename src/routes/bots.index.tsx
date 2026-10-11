import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Search, Star, ChevronLeft, ChevronRight, LayoutGrid } from "lucide-react";
import { SiteLayout, BotCard } from "@/components/site";
import { useMarketplaceAccount } from "@/lib/marketplace-auth-context";
import { Link } from "@tanstack/react-router";
import { Slider } from "@/components/ui/slider";
import { useBots } from "@/lib/api";
import { categories, formatUZS } from "@/lib/data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/bots/")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "Barcha botlar — BotSmith" },
      {
        name: "description",
        content: "Siz uchun eng yaxshi Telegram botlar katalogi: filtrlar, reyting va narxlar.",
      },
      { property: "og:title", content: "Barcha botlar — BotSmith" },
      { property: "og:description", content: "Siz uchun eng yaxshi Telegram botlar katalogi." },
    ],
  }),
  component: Catalog,
});

const PAGE_SIZE = 12;
const LANGUAGES = [
  ["uz", "O'zbek"],
  ["ru", "Русский"],
  ["en", "English"],
] as const;
// [label, exclusive lower bound, inclusive upper bound] in hours
const DELIVERY_BUCKETS = [
  ["1 soat", 0, 1],
  ["1–3 soat", 1, 3],
  ["3–6 soat", 3, 6],
  ["6+ soat", 6, Infinity],
] as const;

function toggle<T>(items: T[], item: T) {
  return items.includes(item) ? items.filter((x) => x !== item) : [...items, item];
}

function Check({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-muted-foreground">
      <input type="checkbox" className="accent-primary" checked={checked} onChange={onChange} />
      {label}
    </label>
  );
}

function Catalog() {
  const account = useMarketplaceAccount();
  const { data: bots = [], isPending, isError } = useBots();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string | null>(null);
  const [maxPrice, setMaxPrice] = useState<number | null>(null);
  const [minRating, setMinRating] = useState(0);
  const [sort, setSort] = useState("popular");
  const [page, setPage] = useState(1);
  const [langs, setLangs] = useState<string[]>([]);
  const [buckets, setBuckets] = useState<number[]>([]);

  const priceCeiling = useMemo(
    () => bots.reduce((top, b) => Math.max(top, b.price ?? 0), 0),
    [bots],
  );
  const max = maxPrice ?? priceCeiling;

  const list = useMemo(() => {
    const query = q.trim().toLowerCase();
    const filtered = bots.filter(
      (b) =>
        (!cat || b.category === cat) &&
        (b.price === null || b.price <= max) &&
        b.rating >= minRating &&
        (langs.length === 0 || langs.some((l) => b.lang.includes(l))) &&
        (buckets.length === 0 ||
          buckets.some((i) => {
            const [, from, to] = DELIVERY_BUCKETS[i]!;
            return b.delivery > from && b.delivery <= to;
          })) &&
        `${b.title} ${categories.find((c) => c.slug === b.category)?.name ?? ""}`
          .toLowerCase()
          .includes(query),
    );
    return filtered.sort((a, b) =>
      sort === "cheap"
        ? (a.price ?? 0) - (b.price ?? 0)
        : sort === "expensive"
          ? (b.price ?? 0) - (a.price ?? 0)
          : sort === "rating"
            ? b.rating - a.rating
            : b.sales - a.sales,
    );
  }, [bots, q, cat, max, minRating, sort, langs, buckets]);

  const pageCount = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visible = list.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <SiteLayout>
      <div className="mx-auto max-w-7xl px-4 py-8">
        <h1 className="text-2xl font-bold">Barcha botlar</h1>
        <p className="text-sm text-muted-foreground">Siz uchun eng yaxshi Telegram botlar</p>
        {!account && (
          <p className="mt-3 text-sm text-muted-foreground">
            Bot narxlarini ko‘rish uchun{" "}
            <Link to="/login" className="font-medium text-primary">
              tizimga kiring
            </Link>{" "}
            yoki{" "}
            <Link to="/register" className="font-medium text-primary">
              ro‘yxatdan o‘ting
            </Link>
            .
          </p>
        )}
        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <div className="flex flex-1 items-center gap-2 rounded-lg border px-3">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
              placeholder="Bot nomi yoki kategoriya..."
              className="h-10 flex-1 bg-transparent text-sm outline-none"
            />
          </div>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="h-10 rounded-lg border bg-background px-3 text-sm"
          >
            <option value="popular">Tartiblash: Mashhurlik</option>
            <option value="rating">Reyting</option>
            {account && (
              <>
                <option value="cheap">Arzonroq</option>
                <option value="expensive">Qimmatroq</option>
              </>
            )}
          </select>
        </div>
        <div className="mt-6 flex flex-col gap-6 md:flex-row">
          <aside className="card-soft h-fit w-full shrink-0 space-y-6 p-4 md:w-60">
            <div>
              <p className="mb-2 text-sm font-semibold">Kategoriyalar</p>
              <button
                onClick={() => {
                  setCat(null);
                  setPage(1);
                }}
                className={cn(
                  "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm",
                  !cat ? "bg-primary-soft text-primary" : "text-muted-foreground",
                )}
              >
                <span className="flex items-center gap-2">
                  <LayoutGrid className="h-4 w-4" />
                  Barchasi
                </span>
                <span>{bots.length}</span>
              </button>
              {categories.map((c) => (
                <button
                  key={c.slug}
                  onClick={() => {
                    setCat(c.slug);
                    setPage(1);
                  }}
                  className={cn(
                    "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm",
                    cat === c.slug ? "bg-primary-soft text-primary" : "text-muted-foreground",
                  )}
                >
                  <span className="flex items-center gap-2">
                    <c.icon className="h-4 w-4" />
                    {c.name}
                  </span>
                  <span>{bots.filter((bot) => bot.category === c.slug).length}</span>
                </button>
              ))}
            </div>
            {account && priceCeiling > 0 && (
              <div>
                <p className="mb-2 text-sm font-semibold">Narx oralig'i</p>
                <p className="mb-3 text-xs text-muted-foreground">0 – {formatUZS(max)}</p>
                <Slider
                  value={[max]}
                  min={0}
                  max={priceCeiling}
                  step={Math.max(1, Math.round(priceCeiling / 100))}
                  onValueChange={(v) => {
                    setMaxPrice(v[0] ?? max);
                    setPage(1);
                  }}
                />
              </div>
            )}
            <div>
              <p className="mb-2 text-sm font-semibold">Reyting</p>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    onClick={() => {
                      setMinRating(minRating === n ? 0 : n);
                      setPage(1);
                    }}
                    aria-label={`${n}`}
                  >
                    <Star
                      className={cn(
                        "h-4 w-4",
                        n <= minRating ? "fill-star text-star" : "text-border",
                      )}
                    />
                  </button>
                ))}
                <span className="ml-1 text-xs text-muted-foreground">va undan yuqori</span>
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-semibold">Til</p>
              {LANGUAGES.map(([code, label]) => (
                <Check
                  key={code}
                  label={label}
                  checked={langs.includes(code)}
                  onChange={() => {
                    setLangs((x) => toggle(x, code));
                    setPage(1);
                  }}
                />
              ))}
            </div>
            <div className="space-y-2">
              <p className="text-sm font-semibold">Yetkazib berish vaqti</p>
              {DELIVERY_BUCKETS.map(([label], i) => (
                <Check
                  key={label}
                  label={label}
                  checked={buckets.includes(i)}
                  onChange={() => {
                    setBuckets((x) => toggle(x, i));
                    setPage(1);
                  }}
                />
              ))}
            </div>
          </aside>
          <div className="flex-1">
            {isPending ? (
              <p className="py-20 text-center text-muted-foreground">Yuklanmoqda…</p>
            ) : isError ? (
              <p role="alert" className="py-20 text-center text-destructive">
                Botlarni yuklab bo‘lmadi. Keyinroq qayta urinib ko‘ring.
              </p>
            ) : visible.length ? (
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
                {visible.map((b) => (
                  <BotCard key={b.id} bot={b} />
                ))}
              </div>
            ) : (
              <p className="py-20 text-center text-muted-foreground">Hech narsa topilmadi</p>
            )}
            {pageCount > 1 && (
              <div className="mt-8 flex items-center justify-center gap-2 text-sm">
                <button
                  onClick={() => setPage(Math.max(1, currentPage - 1))}
                  disabled={currentPage === 1}
                  className="grid h-8 w-8 place-items-center disabled:opacity-40"
                  aria-label="Prev"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
                  <button
                    key={n}
                    onClick={() => setPage(n)}
                    className={cn(
                      "h-8 w-8 rounded-md",
                      currentPage === n
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground",
                    )}
                  >
                    {n}
                  </button>
                ))}
                <button
                  onClick={() => setPage(Math.min(pageCount, currentPage + 1))}
                  disabled={currentPage === pageCount}
                  className="grid h-8 w-8 place-items-center disabled:opacity-40"
                  aria-label="Next"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </SiteLayout>
  );
}
