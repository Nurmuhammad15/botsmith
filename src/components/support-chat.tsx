import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, MessageCircle, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SiteLayout } from "@/components/site";
import { describeError, useSendSupportMessage, useSupportThread } from "@/lib/api";
import { useMarketplaceAuth } from "@/lib/marketplace-auth-context";

export function SupportChat() {
  const { account, ready } = useMarketplaceAuth();
  const { data: messages = [], isError } = useSupportThread(account?.id);
  const send = useSendSupportMessage(account?.id, account?.id);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottom.current?.scrollIntoView?.({ block: "end" });
  }, [messages.length]);

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = message.trim();
    if (!text) return;
    setError("");
    try {
      await send.mutateAsync(text);
      setMessage("");
    } catch (e) {
      setError(describeError(e));
    }
  }

  return (
    <SiteLayout>
      <main className="mx-auto max-w-3xl px-4 py-10">
        <Link
          to="/"
          className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Bosh sahifaga qaytish
        </Link>
        <section className="card-soft overflow-hidden">
          <header className="flex items-center gap-3 border-b p-5">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-primary-soft text-primary">
              <MessageCircle className="h-5 w-5" />
            </span>
            <div>
              <h1 className="font-semibold">Yordam chati</h1>
              <p className="text-xs text-muted-foreground">BotHub qo‘llab-quvvatlashi</p>
            </div>
          </header>
          {!ready ? (
            <p className="p-5 text-sm text-muted-foreground">Yuklanmoqda…</p>
          ) : !account ? (
            <p className="p-5 text-sm text-muted-foreground">
              Yordam xizmatiga yozish uchun{" "}
              <Link to="/login" className="font-medium text-primary">
                tizimga kiring
              </Link>
              .
            </p>
          ) : (
            <>
              <div
                className="max-h-[28rem] min-h-72 space-y-3 overflow-y-auto p-5"
                aria-live="polite"
              >
                <p className="max-w-[85%] rounded-2xl bg-muted p-3 text-sm">
                  Salom! Botlar yoki platforma haqida savolingizni yozing.
                </p>
                {messages.map((entry) => (
                  <p
                    key={entry.id}
                    className={
                      entry.fromStaff
                        ? "max-w-[85%] rounded-2xl bg-muted p-3 text-sm"
                        : "ml-auto max-w-[85%] rounded-2xl bg-primary p-3 text-sm text-primary-foreground"
                    }
                  >
                    {entry.body}
                  </p>
                ))}
                <div ref={bottom} />
              </div>
              {(error || isError) && (
                <p role="alert" className="px-5 pb-2 text-sm text-destructive">
                  {error || "Xabarlarni yuklab bo‘lmadi."}
                </p>
              )}
              <form onSubmit={sendMessage} className="flex gap-2 border-t p-4">
                <Input
                  aria-label="Xabar matni"
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  placeholder="Xabaringizni yozing..."
                  maxLength={2000}
                />
                <Button
                  type="submit"
                  aria-label="Xabarni yuborish"
                  disabled={!message.trim() || send.isPending}
                >
                  <Send className="h-4 w-4" />
                </Button>
              </form>
            </>
          )}
        </section>
      </main>
    </SiteLayout>
  );
}
