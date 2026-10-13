import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BotCard } from "@/components/site";
import type { BotItem } from "@/lib/data";
import { createFakeSupabase } from "./fake-supabase";
import { renderApp } from "./render-app";

const holder = vi.hoisted(() => ({ client: undefined as unknown }));
vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => true,
  getSupabaseClient: () => holder.client,
}));

const bot: BotItem = {
  id: "bot-1",
  title: "Shop Bot",
  desc: "Online do‘kon boti",
  price: 450_000,
  price7Days: 2_000_000,
  price30Days: 6_000_000,
  rating: 4.5,
  reviews: 2,
  category: "shop",
  seller: "@sellerbek",
  lang: ["uz"],
  delivery: 24,
  sales: 3,
  images: [],
  fileCount: 0,
  sellerId: "seller-1",
  sellerAvatar: null,
  sellerHeadline: "",
  sellerLocation: "",
  sellerExperience: null,
  sellerSkills: [],
  sellerBio: "",
  sellerWebsite: "",
};

const signedIn = (favorites: string[] = []) =>
  createFakeSupabase({
    user: { id: "buyer-1", email: "b@x.uz" },
    tables: {
      profiles: [{ id: "buyer-1", role: "buyer", full_name: "Buyer" }],
      favorites: favorites.map((bot_id) => ({ user_id: "buyer-1", bot_id })),
    },
    rpc: { my_unread_count: 0 },
  });

beforeEach(() => {
  holder.client = undefined;
});
afterEach(cleanup);

describe("BotCard", () => {
  it("shows the first cover image when the bot has images", async () => {
    holder.client = signedIn().client;
    await renderApp(
      <BotCard bot={{ ...bot, images: ["https://cdn.test/a.png", "https://cdn.test/b.png"] }} />,
    );

    const cover = screen.getByRole("img", { name: "Shop Bot" });
    expect(cover).toHaveAttribute("src", "https://cdn.test/a.png");
  });

  it("falls back to a neutral placeholder instead of a stock photo", async () => {
    holder.client = signedIn().client;
    await renderApp(<BotCard bot={bot} />);

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("shows the public 1-day subscription price to signed-out visitors", async () => {
    holder.client = createFakeSupabase({ user: null }).client;
    await renderApp(<BotCard bot={bot} />);

    expect(screen.getByText("450 000 so'm / 1 kun")).toBeInTheDocument();
  });

  it("sends signed-out visitors to the login page from the heart", async () => {
    holder.client = createFakeSupabase({ user: null }).client;
    await renderApp(<BotCard bot={bot} />);

    expect(
      screen.getByRole("link", { name: /Sevimlilarga qo‘shish uchun kiring/ }),
    ).toHaveAttribute("href", "/login");
  });
});

describe("favorites heart", () => {
  it("adds a favorite and flips to pressed immediately", async () => {
    const fake = signedIn();
    holder.client = fake.client;
    await renderApp(<BotCard bot={bot} />);

    const heart = await screen.findByRole("button", { name: "Sevimlilarga qo‘shish" });
    expect(heart).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(heart);

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Sevimlilardan olib tashlash" })).toHaveAttribute(
        "aria-pressed",
        "true",
      ),
    );
    expect(fake.log.inserts).toEqual([
      { table: "favorites", row: { user_id: "buyer-1", bot_id: "bot-1" } },
    ]);
  });

  it("shows an existing favorite as pressed and removes it on click", async () => {
    const fake = signedIn(["bot-1"]);
    holder.client = fake.client;
    await renderApp(<BotCard bot={bot} />);

    const heart = await screen.findByRole("button", { name: "Sevimlilardan olib tashlash" });
    expect(heart).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(heart);

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Sevimlilarga qo‘shish" })).toHaveAttribute(
        "aria-pressed",
        "false",
      ),
    );
    expect(fake.log.deletes).toHaveLength(1);
    expect(fake.log.deletes[0]?.filters).toEqual([
      ["user_id", "buyer-1"],
      ["bot_id", "bot-1"],
    ]);
  });
});
