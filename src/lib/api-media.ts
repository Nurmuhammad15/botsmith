import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { check, db, num, str, type Row } from "@/lib/api-core";
import type { BotFile } from "@/lib/data";
import { objectPath, safeFileName } from "@/lib/media";

const COVERS = "bot-covers";
const FILES = "bot-files";

/** Public URL of a cover image stored in the `bot-covers` bucket. */
export function coverUrl(path: string) {
  return db().storage.from(COVERS).getPublicUrl(path).data.publicUrl;
}

export type UploadResult = { uploaded: number; failed: string[] };

/**
 * Uploads cover images and appends them to the bot's gallery. Files that fail to upload are
 * reported by name; if registering them in the database fails, the uploaded objects are
 * removed again so nothing is left orphaned.
 */
export async function uploadCovers(
  sellerId: string,
  botId: string,
  files: File[],
  existingPaths: string[],
): Promise<UploadResult> {
  const storage = db().storage.from(COVERS);
  const uploaded: string[] = [];
  const failed: string[] = [];
  for (const file of files) {
    const path = objectPath(sellerId, botId, file.name);
    const { error } = await storage.upload(path, file, {
      contentType: file.type,
      cacheControl: "31536000", // names are unique, so the file never changes
      upsert: false,
    });
    if (error) failed.push(file.name);
    else uploaded.push(path);
  }
  if (uploaded.length > 0) {
    // Re-read the gallery so changes made while the upload ran are not overwritten.
    const { data: current } = await db()
      .from("bots")
      .select("image_paths")
      .eq("id", botId)
      .single();
    const latest: string[] = Array.isArray(current?.image_paths)
      ? current.image_paths
      : existingPaths;
    const { error } = await db().rpc("set_bot_images", {
      p_bot: botId,
      p_paths: [...latest, ...uploaded].slice(0, 5),
    });
    if (error) {
      await storage.remove(uploaded);
      throw error;
    }
  }
  return { uploaded: uploaded.length, failed };
}

/** Uploads deliverable files to the private bucket and records them against the bot. */
export async function uploadDeliverables(
  sellerId: string,
  botId: string,
  files: File[],
): Promise<UploadResult> {
  const storage = db().storage.from(FILES);
  let uploaded = 0;
  const failed: string[] = [];
  for (const file of files) {
    const path = objectPath(sellerId, botId, file.name);
    const { error } = await storage.upload(path, file, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });
    if (error) {
      failed.push(file.name);
      continue;
    }
    const { error: recordError } = await db().rpc("add_bot_file", {
      p_bot: botId,
      p_path: path,
      p_name: file.name,
      p_size: file.size,
    });
    if (recordError) {
      await storage.remove([path]);
      failed.push(file.name);
    } else {
      uploaded += 1;
    }
  }
  return { uploaded, failed };
}

function toBotFile(r: Row): BotFile {
  return {
    id: str(r["id"]),
    botId: str(r["bot_id"]),
    path: str(r["path"]),
    name: str(r["file_name"]),
    size: num(r["size_bytes"]),
  };
}

/** Files attached to a bot. Row-level security limits this to the seller and paying buyers. */
export function useBotFiles(botId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ["bot-files", botId],
    enabled: enabled && Boolean(botId),
    queryFn: async () =>
      (
        check(
          await db()
            .from("bot_files")
            .select("*")
            .eq("bot_id", botId!)
            .order("created_at", { ascending: true }),
        ) as Row[]
      ).map(toBotFile),
  });
}

/** Short-lived download link (60 s) for a private file; allowed only for paying buyers/sellers. */
export async function getBotFileUrl(file: Pick<BotFile, "path" | "name">) {
  const { data, error } = await db()
    .storage.from(FILES)
    .createSignedUrl(file.path, 60, { download: file.name });
  if (error || !data) throw error ?? new Error("download_failed");
  return data.signedUrl;
}

export function useUploadMedia(sellerId: string | undefined, botId: string) {
  const queryClient = useQueryClient();
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["my-bots"] });
    void queryClient.invalidateQueries({ queryKey: ["bot-files", botId] });
    void queryClient.invalidateQueries({ queryKey: ["bots"] });
    void queryClient.invalidateQueries({ queryKey: ["bot", botId] });
  };
  return {
    covers: useMutation({
      mutationFn: async (input: { files: File[]; existingPaths: string[] }) => {
        if (!sellerId) throw new Error("not_authenticated");
        return uploadCovers(sellerId, botId, input.files, input.existingPaths);
      },
      onSettled: refresh,
    }),
    files: useMutation({
      mutationFn: async (files: File[]) => {
        if (!sellerId) throw new Error("not_authenticated");
        return uploadDeliverables(sellerId, botId, files);
      },
      onSettled: refresh,
    }),
    reorderCovers: useMutation({
      mutationFn: async (paths: string[]) => {
        check(await db().rpc("set_bot_images", { p_bot: botId, p_paths: paths }));
      },
      onSettled: refresh,
    }),
    removeCover: useMutation({
      mutationFn: async (input: { path: string; remainingPaths: string[] }) => {
        check(await db().rpc("set_bot_images", { p_bot: botId, p_paths: input.remainingPaths }));
        // The database no longer references the image; deleting the object is best effort.
        await db().storage.from(COVERS).remove([input.path]);
      },
      onSettled: refresh,
    }),
    removeFile: useMutation({
      mutationFn: async (fileId: string) => {
        const path = check(await db().rpc("remove_bot_file", { p_id: fileId })) as string;
        await db().storage.from(FILES).remove([path]);
      },
      onSettled: refresh,
    }),
  };
}

const AVATARS = "avatars";

/** Public URL of a profile photo stored in the `avatars` bucket. */
export function avatarUrl(path: string) {
  return db().storage.from(AVATARS).getPublicUrl(path).data.publicUrl;
}

export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

/** Returns an error message for an unusable profile photo, or null when it is fine. */
export function validateAvatar(file: { name: string; type: string; size: number }) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    return "Faqat JPG, PNG yoki WebP rasm yuklash mumkin.";
  }
  if (file.size > MAX_AVATAR_BYTES) return "Rasm hajmi 2 MB dan oshmasligi kerak.";
  return null;
}

/** Uploads a new profile photo, points the profile at it and removes the previous object. */
export function useSetAvatar(userId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { file: File | null; previousPath: string | null }) => {
      if (!userId) throw new Error("not_authenticated");
      let path: string | null = null;
      if (input.file) {
        path = `${userId}/${crypto.randomUUID()}-${safeFileName(input.file.name)}`;
        const { error } = await db().storage.from(AVATARS).upload(path, input.file, {
          contentType: input.file.type,
          cacheControl: "31536000",
          upsert: false,
        });
        if (error) throw error;
      }
      const { error } = await db().from("profiles").update({ avatar_path: path }).eq("id", userId);
      if (error) {
        if (path) await db().storage.from(AVATARS).remove([path]);
        throw error;
      }
      // The profile no longer references the old photo; deleting it is best effort.
      if (input.previousPath) await db().storage.from(AVATARS).remove([input.previousPath]);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["profile", userId] });
      void queryClient.invalidateQueries({ queryKey: ["bots"] });
      void queryClient.invalidateQueries({ queryKey: ["bot"] });
    },
  });
}

const CVS = "cvs";

/** Public URL of a seller CV stored in the `cvs` bucket. */
export function cvUrl(path: string) {
  return db().storage.from(CVS).getPublicUrl(path).data.publicUrl;
}

export const MAX_CV_BYTES = 5 * 1024 * 1024;

/** Returns an error message for an unusable CV, or null when it is fine. */
export function validateCv(file: { name: string; type: string; size: number }) {
  if (file.type !== "application/pdf") return "CV faqat PDF formatida bo‘lishi kerak.";
  if (file.size === 0) return "Fayl bo‘sh.";
  if (file.size > MAX_CV_BYTES) return "CV hajmi 5 MB dan oshmasligi kerak.";
  return null;
}

/** Uploads a CV (or removes it when `file` is null) and deletes the previous object. */
export function useSetCv(userId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { file: File | null; previousPath: string | null }) => {
      if (!userId) throw new Error("not_authenticated");
      let path: string | null = null;
      if (input.file) {
        path = `${userId}/${crypto.randomUUID()}-${safeFileName(input.file.name)}`;
        const { error } = await db().storage.from(CVS).upload(path, input.file, {
          contentType: "application/pdf",
          cacheControl: "31536000",
          upsert: false,
        });
        if (error) throw error;
      }
      const { error } = await db()
        .from("profiles")
        .update({ cv_path: path, cv_name: input.file ? input.file.name.slice(0, 120) : null })
        .eq("id", userId);
      if (error) {
        if (path) await db().storage.from(CVS).remove([path]);
        throw error;
      }
      if (input.previousPath) await db().storage.from(CVS).remove([input.previousPath]);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["profile", userId] });
      void queryClient.invalidateQueries({ queryKey: ["bots"] });
      void queryClient.invalidateQueries({ queryKey: ["bot"] });
    },
  });
}
