import { Link } from "@tanstack/react-router";
import { Bot, Heart } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useFavoriteIds, useToggleFavorite } from "@/lib/api-favorites";
import { categories, type BotItem } from "@/lib/data";
import { useMarketplaceAccount } from "@/lib/marketplace-auth-context";
import { cn } from "@/lib/utils";

/** The bot's first cover image, or a neutral category placeholder when it has none. */
export function BotCover({
  bot,
  className,
}: {
  bot: Pick<BotItem, "title" | "category" | "images">;
  className?: string;
}) {
  const src = bot.images[0];
  if (src) {
    return (
      <img src={src} alt={bot.title} loading="lazy" className={cn("object-cover", className)} />
    );
  }
  const Icon = categories.find((c) => c.slug === bot.category)?.icon ?? Bot;
  return (
    <div className={cn("grid place-items-center bg-primary-soft text-primary", className)}>
      <Icon className="h-10 w-10 opacity-70" aria-hidden />
    </div>
  );
}

/** Cover gallery for the bot page: large image plus clickable thumbnails. */
export function BotGallery({ bot }: { bot: Pick<BotItem, "title" | "category" | "images"> }) {
  const [index, setIndex] = useState(0);
  const { images } = bot;
  if (images.length === 0) {
    return <BotCover bot={bot} className="aspect-[16/10] w-full rounded-2xl" />;
  }
  const current = images[Math.min(index, images.length - 1)];
  return (
    <div>
      <img
        src={current}
        alt={bot.title}
        className="aspect-[16/10] w-full rounded-2xl object-cover"
      />
      {images.length > 1 && (
        <div className="mt-3 flex gap-2 overflow-x-auto">
          {images.map((src, i) => (
            <button
              key={src}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`${i + 1}-rasm`}
              aria-current={i === index}
              className={cn(
                "h-14 w-20 shrink-0 overflow-hidden rounded-lg border-2",
                i === index ? "border-primary" : "border-transparent opacity-80 hover:opacity-100",
              )}
            >
              <img src={src} alt="" loading="lazy" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const iconButton =
  "grid h-9 shrink-0 place-items-center rounded-full border bg-background/90 text-muted-foreground shadow-sm backdrop-blur transition hover:text-foreground";

/** Heart toggle. Signed-out visitors are sent to the login page instead. */
export function FavoriteButton({
  botId,
  className,
  withLabel = false,
}: {
  botId: string;
  className?: string;
  withLabel?: boolean;
}) {
  const account = useMarketplaceAccount();
  const { data: ids = [] } = useFavoriteIds(account?.id);
  const toggle = useToggleFavorite(account?.id);
  const active = ids.includes(botId);
  const label = active ? "Sevimlilardan olib tashlash" : "Sevimlilarga qo‘shish";
  const size = withLabel ? "gap-2 px-4 text-sm font-medium" : "w-9";

  if (!account) {
    return (
      <Link
        to="/login"
        aria-label="Sevimlilarga qo‘shish uchun kiring"
        title="Sevimlilarga qo‘shish uchun kiring"
        className={cn(iconButton, size, "inline-flex items-center justify-center", className)}
      >
        <Heart className="h-4 w-4" />
        {withLabel && "Sevimli"}
      </Link>
    );
  }

  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={label}
      title={label}
      disabled={toggle.isPending}
      onClick={() =>
        toggle.mutate(
          { botId, favorite: !active },
          { onError: () => toast.error("Sevimlilarni yangilab bo‘lmadi. Qayta urinib ko‘ring.") },
        )
      }
      className={cn(iconButton, size, "inline-flex items-center justify-center", className)}
    >
      <Heart className={cn("h-4 w-4", active && "fill-current text-destructive")} />
      {withLabel && (active ? "Sevimlilarda" : "Sevimli")}
    </button>
  );
}
