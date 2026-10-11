import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { check, db, num, str, type Row } from "@/lib/api-core";

export type Conversation = {
  id: string;
  botId: string;
  botTitle: string;
  otherName: string;
  /** True when the signed-in user is the seller in this conversation. */
  asSeller: boolean;
  lastBody: string | null;
  lastAt: string;
  unread: number;
};

export type ChatMessage = {
  id: string;
  senderId: string;
  body: string;
  createdAt: string;
};

const toConversation = (r: Row): Conversation => ({
  id: str(r["id"]),
  botId: str(r["bot_id"]),
  botTitle: str(r["bot_title"]),
  otherName: str(r["other_name"]),
  asSeller: r["as_seller"] === true,
  lastBody: typeof r["last_body"] === "string" ? r["last_body"] : null,
  lastAt: str(r["last_at"]),
  unread: num(r["unread"]),
});

export function useConversations(enabled: boolean) {
  return useQuery({
    queryKey: ["conversations"],
    enabled,
    refetchInterval: 60_000, // realtime keeps it fresh; this is only a safety net
    queryFn: async () => (check(await db().rpc("my_conversations")) as Row[]).map(toConversation),
  });
}

export function useUnreadCount(enabled: boolean) {
  return useQuery({
    queryKey: ["unread"],
    enabled,
    refetchInterval: 60_000,
    queryFn: async () => num(check(await db().rpc("my_unread_count"))),
  });
}

export function useConversationMessages(conversationId: string | undefined) {
  return useQuery({
    queryKey: ["messages", conversationId],
    enabled: Boolean(conversationId),
    refetchInterval: 60_000,
    queryFn: async () =>
      (
        check(
          await db()
            .from("messages")
            .select("id, sender_id, body, created_at")
            .eq("conversation_id", conversationId!)
            .order("created_at", { ascending: true })
            .limit(500),
        ) as Row[]
      ).map((r): ChatMessage => ({
        id: str(r["id"]),
        senderId: str(r["sender_id"]),
        body: str(r["body"]),
        createdAt: str(r["created_at"]),
      })),
  });
}

export function useSendMessage(conversationId: string | undefined, userId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: string) => {
      if (!conversationId || !userId) throw new Error("not_authenticated");
      check(
        await db()
          .from("messages")
          .insert({ conversation_id: conversationId, sender_id: userId, body }),
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["messages", conversationId] });
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
}

export function useMarkConversationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (conversationId: string) => {
      check(await db().rpc("mark_conversation_read", { p_conversation: conversationId }));
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
      void queryClient.invalidateQueries({ queryKey: ["unread"] });
    },
  });
}

/**
 * Opens (or creates) the chat about a bot and returns its id. Buyers call it with just the bot;
 * a seller passes the buyer's id to reach out to someone who ordered that bot.
 */
export function useOpenConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { botId: string; buyerId?: string }) =>
      check(
        await db().rpc("open_conversation", {
          p_bot: input.botId,
          p_buyer: input.buyerId ?? null,
        }),
      ) as string,
    // Returned so `mutateAsync` resolves only after the inbox has the new conversation.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["conversations"] }),
  });
}

/**
 * One realtime subscription for the signed-in user: any new message they are allowed to see
 * (row-level security filters the stream) refreshes the inbox, unread badge and open threads.
 */
export function useInboxRealtime(userId: string | undefined) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!userId) return;
    const client = db();
    const channel = client
      .channel(`inbox:${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, () => {
        void queryClient.invalidateQueries({ queryKey: ["conversations"] });
        void queryClient.invalidateQueries({ queryKey: ["unread"] });
        void queryClient.invalidateQueries({ queryKey: ["messages"] });
      })
      .subscribe();
    return () => {
      void client.removeChannel(channel);
    };
  }, [userId, queryClient]);
}
