import { Link } from "@tanstack/react-router";
import { ArrowLeft, MessageSquare, Send } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { describeError } from "@/lib/api-core";
import {
  useConversationMessages,
  useConversations,
  useMarkConversationRead,
  useSendMessage,
  type ChatMessage,
  type Conversation,
} from "@/lib/api-chat";
import { useMarketplaceAccount } from "@/lib/marketplace-auth-context";
import { cn } from "@/lib/utils";

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString("uz-UZ", { hour: "2-digit", minute: "2-digit" });
const day = (iso: string) =>
  new Date(iso).toLocaleDateString("uz-UZ", { day: "numeric", month: "long" });

/** Conversation list plus the open thread. `selectedId` comes from the `?c=` search param. */
export function Inbox({ selectedId }: { selectedId: string | undefined }) {
  const account = useMarketplaceAccount();
  const { data: conversations = [], isPending, isError } = useConversations(Boolean(account));
  const selected = conversations.find((conversation) => conversation.id === selectedId);

  return (
    <>
      <h1 className="text-xl font-bold">Xabarlar</h1>
      {isError && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          Xabarlarni yuklab bo‘lmadi. Sahifani yangilang.
        </p>
      )}
      <div className="mt-4 grid gap-4 md:grid-cols-[18rem_minmax(0,1fr)]">
        <ul className={cn("space-y-2", selected && "hidden md:block")} aria-label="Yozishmalar">
          {isPending && <li className="text-sm text-muted-foreground">Yuklanmoqda…</li>}
          {!isPending && conversations.length === 0 && (
            <li className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
              Hozircha yozishmalar yo‘q.{" "}
              {account?.isSeller
                ? "Xaridorlar sizga yozganda shu yerda ko‘rinadi."
                : "Bot sahifasidagi “Sotuvchiga yozish” tugmasi orqali boshlang."}
            </li>
          )}
          {conversations.map((conversation) => (
            <li key={conversation.id}>
              <Link
                to="/messages"
                search={{ c: conversation.id }}
                aria-current={conversation.id === selected?.id}
                className={cn(
                  "card-soft block p-3",
                  conversation.id === selected?.id && "border-primary",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-medium">{conversation.otherName}</p>
                  {conversation.unread > 0 && (
                    <span className="grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">
                      {conversation.unread}
                    </span>
                  )}
                </div>
                <p className="truncate text-xs text-muted-foreground">{conversation.botTitle}</p>
                <p className="mt-1 truncate text-xs">
                  {conversation.lastBody ?? "Hali xabar yo‘q"}
                </p>
              </Link>
            </li>
          ))}
        </ul>
        <section
          className={cn(
            "card-soft min-h-[28rem] flex-col overflow-hidden",
            selected ? "flex" : "hidden md:flex",
          )}
        >
          {selected && account ? (
            <Thread key={selected.id} conversation={selected} userId={account.id} />
          ) : (
            <div className="grid flex-1 place-items-center p-8 text-center text-sm text-muted-foreground">
              <div>
                <MessageSquare className="mx-auto mb-3 h-8 w-8" />
                Yozishmani tanlang
              </div>
            </div>
          )}
        </section>
      </div>
    </>
  );
}

function Thread({ conversation, userId }: { conversation: Conversation; userId: string }) {
  const { data: messages = [], isPending } = useConversationMessages(conversation.id);
  const send = useSendMessage(conversation.id, userId);
  const { mutate: markRead } = useMarkConversationRead();
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const bottom = useRef<HTMLDivElement>(null);
  const lastIncoming = messages.filter((m) => m.senderId !== userId).at(-1)?.id;

  useEffect(() => {
    bottom.current?.scrollIntoView?.({ block: "end" });
  }, [messages.length]);

  // Mark as read while the thread is open, including messages that arrive meanwhile.
  useEffect(() => {
    if (conversation.unread > 0) markRead(conversation.id);
  }, [conversation.id, conversation.unread, lastIncoming, markRead]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const body = text.trim();
    if (!body) return;
    setError("");
    try {
      await send.mutateAsync(body);
      setText("");
    } catch (e) {
      setError(describeError(e));
    }
  }

  return (
    <>
      <header className="flex items-center gap-3 border-b p-4">
        <Link
          to="/messages"
          aria-label="Yozishmalar ro‘yxatiga qaytish"
          className="grid h-8 w-8 place-items-center rounded-full border md:hidden"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0">
          <p className="truncate font-semibold">{conversation.otherName}</p>
          <Link
            to="/bots/$id"
            params={{ id: conversation.botId }}
            className="truncate text-xs text-muted-foreground hover:text-primary"
          >
            {conversation.botTitle}
          </Link>
        </div>
      </header>
      <div
        className="max-h-[32rem] min-h-72 flex-1 space-y-2 overflow-y-auto p-4"
        aria-live="polite"
      >
        {isPending && <p className="text-sm text-muted-foreground">Yuklanmoqda…</p>}
        {!isPending && messages.length === 0 && (
          <p className="text-center text-sm text-muted-foreground">
            Birinchi xabarni yozing — {conversation.asSeller ? "xaridor" : "sotuvchi"} javob
            berganda shu yerda ko‘rasiz.
          </p>
        )}
        {messages.map((message, i) => (
          <Bubble
            key={message.id}
            message={message}
            mine={message.senderId === userId}
            showDay={i === 0 || day(messages[i - 1]!.createdAt) !== day(message.createdAt)}
          />
        ))}
        <div ref={bottom} />
      </div>
      {error && (
        <p role="alert" className="px-4 pb-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <form onSubmit={submit} className="flex gap-2 border-t p-3">
        <Input
          aria-label="Xabar matni"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Xabaringizni yozing..."
          maxLength={2000}
        />
        <Button type="submit" aria-label="Yuborish" disabled={!text.trim() || send.isPending}>
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </>
  );
}

function Bubble({
  message,
  mine,
  showDay,
}: {
  message: ChatMessage;
  mine: boolean;
  showDay: boolean;
}) {
  return (
    <>
      {showDay && (
        <p className="py-1 text-center text-[11px] text-muted-foreground">
          {day(message.createdAt)}
        </p>
      )}
      <div className={cn("flex", mine && "justify-end")}>
        <div
          className={cn(
            "max-w-[85%] rounded-2xl px-3 py-2 text-sm",
            mine ? "bg-primary text-primary-foreground" : "bg-muted",
          )}
        >
          <p className="whitespace-pre-wrap break-words">{message.body}</p>
          <p
            className={cn(
              "mt-1 text-[10px]",
              mine ? "text-primary-foreground/70" : "text-muted-foreground",
            )}
          >
            {time(message.createdAt)}
          </p>
        </div>
      </div>
    </>
  );
}
