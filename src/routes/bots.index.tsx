import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Search, Star, ChevronLeft, ChevronRight, LayoutGrid } from "lucide-react";
import { SiteLayout, BotCard } from "@/components/site";
import { useMarketplaceAccount } from "@/lib/marketplace-auth-context";
import { Link } from "@tanstack/react-router";
import { Slider } from "@/components/ui/slider";
import { bots, categories, formatUZS } from "@/lib/data";
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

function Catalog() {
  const account = useMarketplaceAccount();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string | null>(null);
  const [max, setMax] = useState(1500000);
  const [minRating, setMinRating] = useState(0);
  const [sort, setSort] = useState("popular");
  const [page, setPage] = useState(1);
  const list = useMemo(() => {
    const r = bots.filter(
      (b) =>
        (!cat || b.category === cat) &&
        b.price <= max &&
        b.rating >= minRating &&
        b.title.toLowerCase().includes(q.toLowerCase()),
    );
    return [...r].sort((a, b) =>
      sort === "cheap"
        ? a.price - b.price
        : sort === "expensive"
          ? b.price - a.price
          : sort === "rating"
            ? b.rating - a.rating
            : b.reviews - a.reviews,
    );
  }, [q, cat, max, minRating, sort]);

  const Check = ({ label }: { label: string }) => (
    <label className="flex items-center gap-2 text-sm text-muted-foreground">
      <input type="checkbox" className="accent-primary" />
      {label}
    </label>
  );

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
              onChange={(e) => setQ(e.target.value)}
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
                onClick={() => setCat(null)}
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
                  onClick={() => setCat(c.slug)}
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
            {account && (
              <div>
                <p className="mb-2 text-sm font-semibold">Narx oralig'i</p>
                <p className="mb-3 text-xs text-muted-foreground">0 – {formatUZS(max)}</p>
                <Slider
                  value={[max]}
                  min={100000}
                  max={1500000}
                  step={10000}
                  onValueChange={(v) => setMax(v[0] ?? max)}
                />
              </div>
            )}
            <div>
              <p className="mb-2 text-sm font-semibold">Reyting</p>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    onClick={() => setMinRating(minRating === n ? 0 : n)}
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
              <Check label="O'zbek" />
              <Check label="Русский" />
              <Check label="English" />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-semibold">Yetkazib berish vaqti</p>
              <Check label="1 soat" />
              <Check label="1–3 soat" />
              <Check label="3–6 soat" />
              <Check label="6+ soat" />
            </div>
          </aside>
          <div className="flex-1">
            {list.length ? (
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
                {list.map((b) => (
                  <BotCard key={b.id} bot={b} fav />
                ))}
              </div>
            ) : (
              <p className="py-20 text-center text-muted-foreground">Hech narsa topilmadi</p>
            )}
            {list.length > 0 && (
              <div className="mt-8 flex items-center justify-center gap-2 text-sm">
                <button
                  onClick={() => setPage(Math.max(1, page - 1))}
                  className="grid h-8 w-8 place-items-center"
                  aria-label="Prev"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                {[1, 2, 3].map((n) => (
                  <button
                    key={n}
                    onClick={() => setPage(n)}
                    className={cn(
                      "h-8 w-8 rounded-md",
                      page === n ? "bg-primary text-primary-foreground" : "text-muted-foreground",
                    )}
                  >
                    {n}
                  </button>
                ))}
                <span>…</span>
                <button
                  onClick={() => setPage(10)}
                  className={cn(
                    "h-8 w-8 rounded-md",
                    page === 10 ? "bg-primary text-primary-foreground" : "text-muted-foreground",
                  )}
                >
                  10
                </button>
                <button
                  onClick={() => setPage(Math.min(10, page + 1))}
                  className="grid h-8 w-8 place-items-center"
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
