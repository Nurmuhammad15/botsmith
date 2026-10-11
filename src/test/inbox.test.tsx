import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Inbox } from "@/components/inbox";
import { createFakeSupabase } from "./fake-supabase";
import { renderApp } from "./render-app";

const holder = vi.hoisted(() => ({ client: undefined as unknown }));
vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => true,
  getSupabaseClient: () => holder.client,
}));

const conversation = {
  id: "conv-1",
  bot_id: "bot-1",
  bot_title: "Shop Bot",
  other_name: "@sellerbek",
  as_seller: false,
  last_body: "Albatta, tayyor",
  last_at: "2026-10-11T10:00:00Z",
  unread: 2,
};

let lastFake: ReturnType<typeof createFakeSupabase> | undefined;
const holderLog = () => lastFake?.log.inserts.length ?? 0;

function setup(overrides: { conversations?: unknown[]; role?: "buyer" | "seller" } = {}) {
  const fake = createFakeSupabase({
    user: { id: "buyer-1", email: "b@x.uz" },
    tables: {
      profiles: [{ id: "buyer-1", role: overrides.role ?? "buyer", full_name: "Buyer" }],
      messages: [
        {
          id: "m1",
          conversation_id: "conv-1",
          sender_id: "buyer-1",
          body: "Salom, tayyormi?",
          created_at: "2026-10-11T09:00:00Z",
        },
        {
          id: "m2",
          conversation_id: "conv-1",
          sender_id: "seller-1",
          body: "Albatta, tayyor",
          created_at: "2026-10-11T10:00:00Z",
        },
      ],
    },
    rpc: {
      my_unread_count: 2,
      my_conversations: overrides.conversations ?? [conversation],
      mark_conversation_read: null,
    },
  });
  holder.client = fake.client;
  lastFake = fake;
  return fake;
}

beforeEach(() => {
  holder.client = undefined;
});
afterEach(cleanup);

describe("Inbox", () => {
  it("lists conversations with the unread count", async () => {
    setup();
    await renderApp(<Inbox selectedId={undefined} />, { path: "/messages" });

    expect(await screen.findByText("@sellerbek")).toBeInTheDocument();
    expect(screen.getByText("Shop Bot")).toBeInTheDocument();
    expect(screen.getByText("Albatta, tayyor")).toBeInTheDocument();
    expect(screen.getByLabelText("Yozishmalar")).toHaveTextContent("2");
    expect(screen.getByText("Yozishmani tanlang")).toBeInTheDocument();
  });

  it("explains how to start a chat when there are none (buyer) or wait for one (seller)", async () => {
    setup({ conversations: [] });
    const buyer = await renderApp(<Inbox selectedId={undefined} />, { path: "/messages" });
    expect(await screen.findByText(/“Sotuvchiga yozish” tugmasi/)).toBeInTheDocument();
    buyer.unmount();
    cleanup();

    setup({ conversations: [], role: "seller" });
    await renderApp(<Inbox selectedId={undefined} />, { path: "/messages" });
    expect(await screen.findByText(/Xaridorlar sizga yozganda/)).toBeInTheDocument();
  });

  it("opens a thread, shows both sides, and marks the incoming messages read", async () => {
    const fake = setup();
    await renderApp(<Inbox selectedId="conv-1" />, { path: "/messages?c=conv-1" });

    expect(await screen.findByText("Salom, tayyormi?")).toBeInTheDocument();
    expect(screen.getAllByText("Albatta, tayyor").length).toBeGreaterThan(0);
    await waitFor(() =>
      expect(fake.log.rpc).toContainEqual({
        name: "mark_conversation_read",
        args: { p_conversation: "conv-1" },
      }),
    );
  });

  it("sends a trimmed message as the signed-in user and clears the input", async () => {
    const fake = setup();
    await renderApp(<Inbox selectedId="conv-1" />, { path: "/messages?c=conv-1" });

    const input = await screen.findByLabelText("Xabar matni");
    const send = screen.getByRole("button", { name: "Yuborish" });
    expect(send).toBeDisabled();

    fireEvent.change(input, { target: { value: "  Narxi kelishiladimi?  " } });
    expect(send).toBeEnabled();
    fireEvent.click(send);

    await waitFor(() =>
      expect(fake.log.inserts).toContainEqual({
        table: "messages",
        row: { conversation_id: "conv-1", sender_id: "buyer-1", body: "Narxi kelishiladimi?" },
      }),
    );
    await waitFor(() => expect(input).toHaveValue(""));
  });

  it("does not send whitespace-only messages", async () => {
    const fake = setup();
    await renderApp(<Inbox selectedId="conv-1" />, { path: "/messages?c=conv-1" });

    const input = await screen.findByLabelText("Xabar matni");
    fireEvent.change(input, { target: { value: "    " } });
    expect(screen.getByRole("button", { name: "Yuborish" })).toBeDisabled();
    fireEvent.submit(input.closest("form")!);
    expect(fake.log.inserts).toHaveLength(0);
  });

  it("shows messages oldest first even though the newest 500 are fetched", async () => {
    setup();
    await renderApp(<Inbox selectedId="conv-1" />, { path: "/messages?c=conv-1" });
    await screen.findByText("Salom, tayyormi?");
    const thread = document.querySelector('[aria-live="polite"]')!;
    const texts = Array.from(thread.querySelectorAll("p.whitespace-pre-wrap")).map(
      (p) => p.textContent,
    );
    expect(texts).toEqual(["Salom, tayyormi?", "Albatta, tayyor"]);
  });

  it("keeps text typed while a message is being sent", async () => {
    setup();
    await renderApp(<Inbox selectedId="conv-1" />, { path: "/messages?c=conv-1" });
    const input = await screen.findByLabelText("Xabar matni");
    fireEvent.change(input, { target: { value: "birinchi" } });
    fireEvent.click(screen.getByRole("button", { name: "Yuborish" }));
    fireEvent.change(input, { target: { value: "ikkinchi" } }); // typed before the send resolves
    await waitFor(() => expect(holderLog()).toBeGreaterThan(0));
    expect(input).toHaveValue("ikkinchi");
  });
});
