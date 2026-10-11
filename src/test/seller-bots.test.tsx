import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SellerBotsProvider } from "@/lib/seller-bots-provider";
import { useSellerBots } from "@/lib/seller-bots-context";

afterEach(cleanup);

describe("seller demo bots", () => {
  it("adds a bot to the shared review list", () => {
    const hook = renderHook(() => useSellerBots(), {
      wrapper: SellerBotsProvider,
    });

    act(() => {
      hook.result.current.addBot({
        title: "New demo bot",
        category: "shop",
        price: 125_000,
        desc: "Demo description",
      });
    });

    expect(hook.result.current.addedBots).toHaveLength(1);
    expect(hook.result.current.addedBots[0]).toMatchObject({
      status: "pending",
      views: 0,
      bot: {
        title: "New demo bot",
        category: "shop",
        price: 125_000,
        desc: "Demo description",
        sales: 0,
      },
    });
  });
});
