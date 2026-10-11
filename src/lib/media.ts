// Limits and helpers for bot cover images and deliverable files. The same limits are enforced
// by the storage buckets and the database (see supabase/migrations/0002_media_chat_favorites.sql).
export const MAX_IMAGES = 5;
export const MAX_FILES = 10;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_FILE_BYTES = 50 * 1024 * 1024;
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Returns an error message for an unusable cover image, or null when it is fine. */
export function validateImage(file: { name: string; type: string; size: number }) {
  if (!IMAGE_TYPES.includes(file.type)) {
    return `${file.name}: faqat JPG, PNG yoki WebP rasm yuklash mumkin.`;
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return `${file.name}: rasm hajmi ${formatBytes(MAX_IMAGE_BYTES)} dan oshmasligi kerak.`;
  }
  return null;
}

/** Returns an error message for an unusable deliverable file, or null when it is fine. */
export function validateDeliverable(file: { name: string; size: number }) {
  if (file.size === 0) return `${file.name}: fayl bo‘sh.`;
  if (file.size > MAX_FILE_BYTES) {
    return `${file.name}: fayl hajmi ${formatBytes(MAX_FILE_BYTES)} dan oshmasligi kerak.`;
  }
  return null;
}

/**
 * Storage-safe file name: the base keeps ASCII letters, digits, dash and underscore; the
 * extension is kept only when it is plain alphanumerics. The result never contains a dot
 * except before the extension, so it can neither escape its folder nor contain "..".
 */
export function safeFileName(name: string) {
  const normalized = name.normalize("NFKD");
  const dot = normalized.lastIndexOf(".");
  const rawBase = dot > 0 ? normalized.slice(0, dot) : normalized;
  const rawExt = dot > 0 ? normalized.slice(dot + 1) : "";
  const base =
    rawBase
      .replace(/[^A-Za-z0-9_-]+/g, "_")
      .replace(/_{2,}/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 80) || "file";
  const ext = /^[A-Za-z0-9]{1,10}$/.test(rawExt) ? rawExt : "";
  return ext ? `${base}.${ext}` : base;
}

/** `<seller>/<bot>/<random>-<name>` — the layout the storage policies require. */
export function objectPath(sellerId: string, botId: string, fileName: string) {
  return `${sellerId}/${botId}/${crypto.randomUUID()}-${safeFileName(fileName)}`;
}
