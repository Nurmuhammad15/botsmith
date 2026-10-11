import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { check, db, num, str, type Row } from "@/lib/api-core";
import type { BotFile } from "@/lib/data";
import { objectPath } from "@/lib/media";

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
    const { error } = await db().rpc("set_bot_images", {
      p_bot: botId,
      p_paths: [...existingPaths, ...uploaded],
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
