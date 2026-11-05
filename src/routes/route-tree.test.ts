// @vitest-environment jsdom
// The real generated tree, which has type checking off: a route left hanging from a deleted parent only shows as a 404.
import { QueryClient } from "@tanstack/react-query";
import { createMemoryHistory, createRouter } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";
import { routeTree } from "@/routeTree.gen";

describe("the route tree", () => {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory(),
    context: { queryClient: new QueryClient() },
  });
  it.each([
    ["/plan", "/plan/"],
    ["/plan/", "/plan/"],
    ["/plan/settings", "/plan/settings"],
  ])("%s opens its page", (path, id) => {
    expect(router.matchRoutes(path).at(-1)?.routeId).toBe(id);
  });
});
