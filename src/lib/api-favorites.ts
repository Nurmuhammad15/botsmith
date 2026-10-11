import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { check, db, str, type Row } from "@/lib/api-core";

/** Ids of the bots the signed-in user has favorited. */
export function useFavoriteIds(userId: string | undefined) {
  return useQuery({
    queryKey: ["favorites", userId],
    enabled: Boolean(userId),
    queryFn: async () =>
      (
        check(
          await db().from("favorites").select("bot_id").order("created_at", { ascending: false }),
        ) as Row[]
      ).map((r) => str(r["bot_id"])),
  });
}

/** Adds or removes a favorite with an optimistic update that rolls back on failure. */
export function useToggleFavorite(userId: string | undefined) {
  const queryClient = useQueryClient();
  const key = ["favorites", userId];
  return useMutation({
    mutationFn: async (input: { botId: string; favorite: boolean }) => {
      if (!userId) throw new Error("not_authenticated");
      if (input.favorite) {
        check(await db().from("favorites").insert({ user_id: userId, bot_id: input.botId }));
      } else {
        check(
          await db().from("favorites").delete().eq("user_id", userId).eq("bot_id", input.botId),
        );
      }
    },
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<string[]>(key);
      queryClient.setQueryData<string[]>(key, (current = []) =>
        input.favorite
          ? [input.botId, ...current.filter((id) => id !== input.botId)]
          : current.filter((id) => id !== input.botId),
      );
      return { previous };
    },
    onError: (_error, _input, context) => {
      queryClient.setQueryData(key, context?.previous);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: key });
      void queryClient.invalidateQueries({ queryKey: ["favorite-bots"] });
    },
  });
}
