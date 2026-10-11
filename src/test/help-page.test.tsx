import { cleanup, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HelpPage } from "@/components/help-page";
import { createFakeSupabase, type FakeOptions } from "./fake-supabase";
import { renderApp } from "./render-app";

const holder = vi.hoisted(() => ({ client: undefined as unknown }));
vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => true,
  getSupabaseClient: () => holder.client,
}));

const user = { id: "user-1", email: "user@example.uz" };
const as = (role: "buyer" | "seller" | null): FakeOptions =>
  role
    ? {
        user,
        tables: { profiles: [{ id: user.id, role, full_name: "Test User" }] },
        rpc: { my_unread_count: 0 },
      }
    : { user: null };

beforeEach(() => {
  holder.client = undefined;
});
afterEach(cleanup);

describe("/help", () => {
  it("shows signed-out visitors the public help centre without redirecting to login", async () => {
    holder.client = createFakeSupabase(as(null)).client;
    const { router } = await renderApp(<HelpPage />, { path: "/help" });

    expect(await screen.findByText("Xaridorlar uchun savollar")).toBeInTheDocument();
    expect(screen.getByText("Sotuvchilar uchun savollar")).toBeInTheDocument();
    await waitFor(() => expect(router.state.location.pathname).toBe("/help"));
  });

  it("shows buyers the buyer help inside their dashboard, not the seller area", async () => {
    holder.client = createFakeSupabase(as("buyer")).client;
    const { router } = await renderApp(<HelpPage />, { path: "/help" });

    expect(await screen.findByText("Xaridorlar uchun savollar")).toBeInTheDocument();
    expect(screen.queryByText("Sotuvchilar uchun savollar")).not.toBeInTheDocument();
    expect(screen.queryByText("Ko‘p so‘raladigan savollar")).not.toBeInTheDocument();
    // Buyer dashboard navigation is around the content.
    expect(screen.getAllByText("Buyurtmalar").length).toBeGreaterThan(0);
    await waitFor(() => expect(router.state.location.pathname).toBe("/help"));
  });

  it("keeps sellers in the seller layout with the seller help", async () => {
    holder.client = createFakeSupabase(as("seller")).client;
    const { router } = await renderApp(<HelpPage />, { path: "/help" });

    expect(await screen.findByText("Ko‘p so‘raladigan savollar")).toBeInTheDocument();
    expect(screen.getAllByText("Mening botlarim").length).toBeGreaterThan(0);
    await waitFor(() => expect(router.state.location.pathname).toBe("/help"));
  });
});
