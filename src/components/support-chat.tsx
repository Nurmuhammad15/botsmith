import { useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, MessageCircle, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SiteLayout } from "@/components/site";

type ChatMessage = { id: number; text: string };

export function SupportChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [message, setMessage] = useState("");

  function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = message.trim();
    if (!text) return;
    setMessages((current) => [...current, { id: (current.at(-1)?.id ?? 0) + 1, text }]);
    setMessage("");
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
              <p className="text-xs text-muted-foreground">BotSmith qo‘llab-quvvatlashi</p>
            </div>
          </header>
          <div className="min-h-72 space-y-3 p-5" aria-live="polite">
            <p className="max-w-[85%] rounded-2xl bg-muted p-3 text-sm">
              Salom! Botlar yoki platforma haqida savolingizni yozing.
            </p>
            {messages.map((entry) => (
              <p
                key={entry.id}
                className="ml-auto max-w-[85%] rounded-2xl bg-primary p-3 text-sm text-primary-foreground"
              >
                {entry.text}
              </p>
            ))}
          </div>
          <form onSubmit={sendMessage} className="flex gap-2 border-t p-4">
            <Input
              aria-label="Xabar matni"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Xabaringizni yozing..."
              maxLength={2000}
            />
            <Button type="submit" aria-label="Xabarni yuborish" disabled={!message.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </form>
          <p className="border-t px-5 py-3 text-xs text-muted-foreground">
            Demo chat: xabarlar faqat shu sahifada ko‘rinadi va operatorga yuborilmaydi.
          </p>
        </section>
      </main>
    </SiteLayout>
  );
}
