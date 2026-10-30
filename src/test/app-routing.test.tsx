import { QueryClient } from "@tanstack/react-query";
import { createMemoryHistory, createRouter, rootRouteId } from "@tanstack/react-router";
import { afterEach, describe, expect, it } from "vitest";

import { routeTree } from "@/routeTree.gen";
import { API_KEY } from "@/lib/settings";

// Match routes without running loaders or rendering: loaders need the network the test run lacks,
// and jsdom never loads the stylesheets React waits on.
describe("App routing", () => {
  afterEach(() => localStorage.clear());

  it("matches a page for / instead of falling back to not found", () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });

    const matches = router.matchRoutes("/");

    expect(matches.at(-1)?.routeId).not.toBe(rootRouteId);
  });

  it("sends a device without an API key to Settings", async () => {
    const router = createRouter({
      routeTree,
      context: { queryClient: new QueryClient() },
      history: createMemoryHistory({ initialEntries: ["/rides"] }),
    });
    await router.load();
    expect(router.state.location.pathname).toBe("/settings");
  });

  it("lets a device with a key through", async () => {
    localStorage.setItem(API_KEY, JSON.stringify("k"));
    const router = createRouter({
      routeTree,
      context: { queryClient: new QueryClient() },
      history: createMemoryHistory({ initialEntries: ["/settings"] }),
    });
    await router.load();
    expect(router.state.location.pathname).toBe("/settings");
    expect(router.matchRoutes("/rides").at(-1)?.routeId).toBe("/rides/");
  });
});
