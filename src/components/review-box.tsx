import { Star } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { MediaPicker } from "@/components/media-picker";
import { describeError, useMyReview, useSubmitReview } from "@/lib/api";
import { MAX_REVIEW_IMAGES } from "@/lib/api-media";
import { useMarketplaceAccount } from "@/lib/marketplace-auth-context";
import { IMAGE_TYPES, validateImage } from "@/lib/media";
import { cn } from "@/lib/utils";

function Stars({ value, size = "h-5 w-5" }: { value: number; size?: string }) {
  return (
    <span className="inline-flex" aria-label={`${value}/5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={cn(size, n <= value ? "fill-star text-star" : "text-muted-foreground/40")}
        />
      ))}
    </span>
  );
}

/**
 * Review of a purchased bot, shown under the order. One review per bot: after sending, the buyer
 * sees what they wrote (stars, text, photos); the review also appears on the bot page.
 */
export function ReviewBox({ botId, botTitle }: { botId: string; botTitle: string }) {
  const account = useMarketplaceAccount();
  const userId = account?.id;
  const mine = useMyReview(botId, userId);
  const submit = useSubmitReview(botId, userId ?? "");
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState("");

  if (!userId || mine.isPending) return null;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      await submit.mutateAsync({ rating, comment: comment.trim(), files });
      setComment("");
      setFiles([]);
    } catch (e) {
      const message = e && typeof e === "object" && "message" in e ? String(e.message) : "";
      setError(
        message.includes("duplicate key")
          ? "Siz bu bot uchun allaqachon sharh qoldirgansiz."
          : describeError(e),
      );
    }
  }

  if (mine.data) {
    return (
      <div className="mt-6 space-y-2 rounded-lg border p-4">
        <p className="text-sm font-medium">Sizning sharhingiz</p>
        <Stars value={mine.data.rating} />
        {mine.data.comment && <p className="text-sm text-muted-foreground">{mine.data.comment}</p>}
        {mine.data.images.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {mine.data.images.map((src) => (
              <img
                key={src}
                src={src}
                alt=""
                loading="lazy"
                className="h-16 w-20 rounded-lg border object-cover"
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-3 rounded-lg border p-4">
      <div>
        <p className="font-medium">Sharh qoldiring</p>
        <p className="text-xs text-muted-foreground">{botTitle}</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm">Baho</span>
        <div className="flex items-center gap-0.5" role="radiogroup" aria-label="Baho">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={rating === n}
              aria-label={`${n}`}
              onClick={() => setRating(n)}
              className="rounded p-0.5"
            >
              <Star
                className={cn(
                  "h-7 w-7 transition-colors",
                  n <= rating ? "fill-star text-star" : "text-muted-foreground/40",
                )}
              />
            </button>
          ))}
        </div>
        <span className="text-sm text-muted-foreground">{rating}/5</span>
      </div>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        maxLength={2000}
        placeholder="Fikringiz (ixtiyoriy)"
        className="min-h-20 w-full rounded-md border bg-background p-3 text-sm"
      />
      <MediaPicker
        label="Rasm qo‘shish (ixtiyoriy)"
        hint={`JPG, PNG yoki WebP · 5 MB gacha · ko‘pi bilan ${MAX_REVIEW_IMAGES} ta`}
        accept={IMAGE_TYPES.join(",")}
        files={files}
        onChange={setFiles}
        validate={validateImage}
        max={MAX_REVIEW_IMAGES}
        preview
        disabled={submit.isPending}
      />
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" disabled={submit.isPending}>
        {submit.isPending ? "Yuborilmoqda…" : "Yuborish"}
      </Button>
    </form>
  );
}
