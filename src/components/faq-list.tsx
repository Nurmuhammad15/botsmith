import type { Faq } from "@/lib/faq";

export function FaqList({ title, items }: { title: string; items: readonly Faq[] }) {
  return (
    <section className="max-w-3xl">
      <h2 className="mb-2 font-semibold">{title}</h2>
      {items.map(([question, answer]) => (
        <details key={question} className="border-b py-5">
          <summary className="cursor-pointer text-sm font-medium">{question}</summary>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">{answer}</p>
        </details>
      ))}
    </section>
  );
}
