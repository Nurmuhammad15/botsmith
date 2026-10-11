import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRouter, RouterContextProvider } from "@tanstack/react-router";
import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { MarketplaceAuthProvider } from "@/components/site";
import { routeTree } from "@/routeTree.gen";

/**
 * Renders a component with the real auth provider, react-query and a memory router (so links
 * and navigation work) without mounting the document-level root route, which jsdom cannot host.
 */
export async function renderApp(ui: ReactNode, { path = "/" }: { path?: string } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
    context: { queryClient },
  });
  await router.load();
  const view = render(
    <QueryClientProvider client={queryClient}>
      <MarketplaceAuthProvider>
        <RouterContextProvider router={router}>{ui}</RouterContextProvider>
      </MarketplaceAuthProvider>
    </QueryClientProvider>,
  );
  return { router, queryClient, ...view };
}
