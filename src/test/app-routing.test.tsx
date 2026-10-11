import { QueryClient } from "@tanstack/react-query";
import { createRouter, rootRouteId } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";

import { routeTree } from "@/routeTree.gen";

// Match routes without running loaders or rendering: loaders may need a server or
// network the test run lacks, and jsdom never loads the stylesheets React waits on.
describe("App routing", () => {
  it.each([
    "/seller",
    "/seller-orders",
    "/seller-earnings",
    "/seller-profile",
    "/seller-new-bot",
    "/seller-bots/00000000-0000-0000-0000-000000000000",
    "/seller-withdrawal-history",
    "/support-chat",
    "/bots/",
    "/bots/00000000-0000-0000-0000-000000000000",
    "/admin",
    "/dashboard/purchases",
    "/withdraw",
    "/help",
    "/how-it-works",
  ])("matches %s", (path) => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });
    expect(router.matchRoutes(path).at(-1)?.routeId).not.toBe(rootRouteId);
    expect(router.matchRoutes(path).at(-1)?.pathname).toBe(path);
  });
  it("matches a page for / instead of falling back to not found", () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });

    const matches = router.matchRoutes("/");

    expect(matches.at(-1)?.routeId).not.toBe(rootRouteId);
  });
});
