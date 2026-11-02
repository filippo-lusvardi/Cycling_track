import { QueryClient } from "@tanstack/react-query";
import { createMemoryHistory, createRouter, rootRouteId } from "@tanstack/react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import { routeTree } from "@/routeTree.gen";
import { API_KEY } from "@/lib/settings";

// No Firebase in tests: a signed-in (or not) user is enough for the route gate.
const fb = vi.hoisted(() => ({
  auth: { currentUser: null as { uid: string } | null },
  authReady: Promise.resolve(),
  db: {},
}));
vi.mock("@/lib/firebase", () => fb);
vi.mock("@/lib/account", () => ({ sessionReady: () => Promise.resolve() }));

const load = async (path: string) => {
  const router = createRouter({
    routeTree,
    context: { queryClient: new QueryClient() },
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  await router.load();
  return router;
};

// Match routes without running loaders or rendering: loaders need the network the test run lacks,
// and jsdom never loads the stylesheets React waits on.
describe("App routing", () => {
  afterEach(() => {
    localStorage.clear();
    fb.auth.currentUser = null;
  });

  it("matches a page for / instead of falling back to not found", () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });

    const matches = router.matchRoutes("/");

    expect(matches.at(-1)?.routeId).not.toBe(rootRouteId);
  });

  it("sends a signed-out device to sign in", async () => {
    localStorage.setItem(API_KEY, JSON.stringify("k"));
    expect((await load("/rides")).state.location.pathname).toBe("/login");
  });

  it("sends a signed-in account without an API key to Settings", async () => {
    fb.auth.currentUser = { uid: "u" };
    expect((await load("/rides")).state.location.pathname).toBe("/settings");
  });

  it("lets a signed-in account with a key through", async () => {
    fb.auth.currentUser = { uid: "u" };
    localStorage.setItem(API_KEY, JSON.stringify("k"));
    const router = await load("/settings");
    expect(router.state.location.pathname).toBe("/settings");
    expect(router.matchRoutes("/rides").at(-1)?.routeId).toBe("/rides/");
  });

  it("moves a signed-in account off the sign-in page", async () => {
    fb.auth.currentUser = { uid: "u" };
    localStorage.setItem(API_KEY, JSON.stringify("k"));
    expect((await load("/login")).state.location.pathname).not.toBe("/login");
  });
});
