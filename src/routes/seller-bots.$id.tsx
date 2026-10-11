import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Eye, FileText, ShoppingBag, Trash2, Wallet } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { MediaPicker } from "@/components/media-picker";
import { SellerPage } from "@/components/seller-pages";
import { StatusBadge } from "@/components/site";
import { describeError, useMyBots } from "@/lib/api";
import { coverUrl, useBotFiles, useUploadMedia, type UploadResult } from "@/lib/api-media";
import { formatUZS, type SellerBot } from "@/lib/data";
import { useMarketplaceAccount } from "@/lib/marketplace-auth-context";
import {
  formatBytes,
  IMAGE_TYPES,
  MAX_FILES,
  MAX_IMAGES,
  validateDeliverable,
  validateImage,
} from "@/lib/media";

export const Route = createFileRoute("/seller-bots/$id")({
  head: () => ({
    meta: [
      { title: "Bot boshqaruvi — BotSmith" },
      { name: "description", content: "Bot statistikasi, rasmlari va fayllarini boshqaring." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SellerBotPage,
});

function SellerBotPage() {
  return (
    <SellerPage title="Bot boshqaruvi">
      <SellerBotContent />
    </SellerPage>
  );
}

const statusBadge = { published: "published", pending: "review", rejected: "draft" } as const;

function SellerBotContent() {
  const { id } = Route.useParams();
  const account = useMarketplaceAccount();
  const { data: bots, isPending } = useMyBots();
  const bot = bots?.find((b) => b.id === id);

  return (
    <>
      <div className="mb-6">
        <Button asChild variant="outline">
          <Link to="/seller">
            <ArrowLeft />
            Sotuvchi kabinetiga qaytish
          </Link>
        </Button>
      </div>

      {isPending ? (
        <p className="text-sm text-muted-foreground">Yuklanmoqda…</p>
      ) : !bot || !account ? (
        <p className="text-sm text-muted-foreground">Bot topilmadi.</p>
      ) : (
        <>
          <div className="mb-8 flex flex-wrap items-center gap-3">
            <h2 className="text-xl font-semibold">{bot.title}</h2>
            <StatusBadge status={statusBadge[bot.status]} />
          </div>

          {bot.status === "published" ? (
            <Statistics bot={bot} />
          ) : (
            <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
              {bot.status === "pending"
                ? "Bot administrator tekshiruvida. Tasdiqlangach katalogda e’lon qilinadi va statistika shu yerda ko‘rinadi."
                : "Bot rad etilgan. Rasmlarni yangilasangiz, u qayta tekshiruvga yuboriladi."}
            </p>
          )}

          <MediaManager bot={bot} sellerId={account.id} />
        </>
      )}
    </>
  );
}

function Statistics({ bot }: { bot: SellerBot }) {
  return (
    <dl className="grid gap-4 sm:grid-cols-3">
      <div className="card-soft p-5">
        <dt className="flex items-center gap-2 text-sm text-muted-foreground">
          <Eye className="h-4 w-4 text-primary" />
          Ko‘rishlar
        </dt>
        <dd className="mt-3 text-2xl font-bold">{bot.views.toLocaleString("ru-RU")}</dd>
        <p className="mt-1 text-xs text-muted-foreground">
          Kuniga bir tashrif bir marta hisoblanadi
        </p>
      </div>
      <div className="card-soft p-5">
        <dt className="flex items-center gap-2 text-sm text-muted-foreground">
          <ShoppingBag className="h-4 w-4 text-primary" />
          Jami buyurtmalar
        </dt>
        <dd className="mt-3 text-2xl font-bold">{bot.sales.toLocaleString("ru-RU")}</dd>
        <p className="mt-1 text-xs text-muted-foreground">To‘langan buyurtmalar soni</p>
      </div>
      <div className="card-soft p-5">
        <dt className="flex items-center gap-2 text-sm text-muted-foreground">
          <Wallet className="h-4 w-4 text-primary" />
          Jami daromad
        </dt>
        <dd className="mt-3 text-2xl font-bold">{formatUZS(bot.earned)}</dd>
        <p className="mt-1 text-xs text-muted-foreground">To‘langan buyurtmalar summasi</p>
      </div>
    </dl>
  );
}

type Notice = { kind: "ok" | "error"; text: string };

function summarize(result: UploadResult, noun: string): Notice {
  if (result.failed.length === 0)
    return { kind: "ok", text: `${result.uploaded} ta ${noun} yuklandi.` };
  return {
    kind: "error",
    text: `${result.uploaded} ta ${noun} yuklandi, yuklanmadi: ${result.failed.join(", ")}.`,
  };
}

function MediaManager({ bot, sellerId }: { bot: SellerBot; sellerId: string }) {
  const media = useUploadMedia(sellerId, bot.id);
  const { data: files = [], isPending: filesPending } = useBotFiles(bot.id);
  const [newImages, setNewImages] = useState<File[]>([]);
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [imageNotice, setImageNotice] = useState<Notice | null>(null);
  const [fileNotice, setFileNotice] = useState<Notice | null>(null);

  async function uploadImages() {
    setImageNotice(null);
    try {
      const result = await media.covers.mutateAsync({
        files: newImages,
        existingPaths: bot.imagePaths,
      });
      setNewImages([]);
      setImageNotice(summarize(result, "rasm"));
    } catch (e) {
      setImageNotice({ kind: "error", text: describeError(e) });
    }
  }

  async function uploadFiles() {
    setFileNotice(null);
    try {
      const result = await media.files.mutateAsync(newFiles);
      setNewFiles([]);
      setFileNotice(summarize(result, "fayl"));
    } catch (e) {
      setFileNotice({ kind: "error", text: describeError(e) });
    }
  }

  async function run(action: Promise<unknown>, setNotice: (notice: Notice | null) => void) {
    setNotice(null);
    try {
      await action;
    } catch (e) {
      setNotice({ kind: "error", text: describeError(e) });
    }
  }

  return (
    <div className="mt-10 grid gap-10 lg:grid-cols-2">
      <section aria-labelledby="images-title" className="space-y-4">
        <h3 id="images-title" className="font-semibold">
          Rasmlar
        </h3>
        {bot.imagePaths.length === 0 ? (
          <p className="text-sm text-muted-foreground">Hozircha rasm yo‘q.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {bot.imagePaths.map((path, i) => (
              <li key={path} className="space-y-1">
                <div className="relative overflow-hidden rounded-lg border">
                  <img
                    src={coverUrl(path)}
                    alt={`${bot.title} — ${i + 1}-rasm`}
                    loading="lazy"
                    className="aspect-[16/10] w-full object-cover"
                  />
                  {i === 0 && (
                    <span className="absolute left-1 top-1 rounded bg-background/90 px-1.5 py-0.5 text-[10px] font-medium">
                      Muqova
                    </span>
                  )}
                  <button
                    type="button"
                    aria-label={`${i + 1}-rasmni o‘chirish`}
                    disabled={media.removeCover.isPending}
                    onClick={() =>
                      run(
                        media.removeCover.mutateAsync({
                          path,
                          remainingPaths: bot.imagePaths.filter((p) => p !== path),
                        }),
                        setImageNotice,
                      )
                    }
                    className="absolute right-1 top-1 grid h-7 w-7 place-items-center rounded-full bg-background/90 text-destructive shadow"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                {i > 0 && (
                  <button
                    type="button"
                    disabled={media.reorderCovers.isPending}
                    onClick={() =>
                      run(
                        media.reorderCovers.mutateAsync([
                          path,
                          ...bot.imagePaths.filter((p) => p !== path),
                        ]),
                        setImageNotice,
                      )
                    }
                    className="text-xs text-primary hover:underline"
                  >
                    Muqova qilish
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        <MediaPicker
          label="Rasm qo‘shish"
          hint={`JPG, PNG yoki WebP · 5 MB gacha · jami ${MAX_IMAGES} tagacha`}
          accept={IMAGE_TYPES.join(",")}
          files={newImages}
          onChange={setNewImages}
          validate={validateImage}
          max={MAX_IMAGES}
          used={bot.imagePaths.length}
          preview
          disabled={media.covers.isPending}
        />
        {bot.status !== "pending" && newImages.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Yangi rasm qo‘shsangiz, bot qayta tekshiruvga yuboriladi
            {bot.status === "published" && " va tasdiqlangunga qadar katalogdan yashiriladi"}.
          </p>
        )}
        {newImages.length > 0 && (
          <Button onClick={uploadImages} disabled={media.covers.isPending}>
            {media.covers.isPending ? "Yuklanmoqda…" : `${newImages.length} ta rasmni yuklash`}
          </Button>
        )}
        <NoticeText notice={imageNotice} />
      </section>

      <section aria-labelledby="files-title" className="space-y-4">
        <h3 id="files-title" className="font-semibold">
          Bot fayllari
        </h3>
        <p className="text-xs text-muted-foreground">
          Fayllarni faqat to‘lov qilgan xaridor yuklab oladi.
        </p>
        {filesPending ? (
          <p className="text-sm text-muted-foreground">Yuklanmoqda…</p>
        ) : files.length === 0 ? (
          <p className="text-sm text-muted-foreground">Hozircha fayl yo‘q.</p>
        ) : (
          <ul className="space-y-2">
            {files.map((file) => (
              <li
                key={file.id}
                className="flex items-center gap-3 rounded-lg border px-3 py-2 text-sm"
              >
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{file.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {formatBytes(file.size)}
                </span>
                <button
                  type="button"
                  aria-label={`${file.name} ni o‘chirish`}
                  disabled={media.removeFile.isPending}
                  onClick={() => run(media.removeFile.mutateAsync(file.id), setFileNotice)}
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <MediaPicker
          label="Fayl qo‘shish"
          hint={`50 MB gacha · jami ${MAX_FILES} tagacha`}
          files={newFiles}
          onChange={setNewFiles}
          validate={validateDeliverable}
          max={MAX_FILES}
          used={files.length}
          disabled={media.files.isPending}
        />
        {newFiles.length > 0 && (
          <Button onClick={uploadFiles} disabled={media.files.isPending}>
            {media.files.isPending ? "Yuklanmoqda…" : `${newFiles.length} ta faylni yuklash`}
          </Button>
        )}
        <NoticeText notice={fileNotice} />
      </section>
    </div>
  );
}

function NoticeText({ notice }: { notice: Notice | null }) {
  if (!notice) return null;
  return (
    <p
      role={notice.kind === "error" ? "alert" : "status"}
      className={notice.kind === "error" ? "text-sm text-destructive" : "text-sm text-success"}
    >
      {notice.text}
    </p>
  );
}
