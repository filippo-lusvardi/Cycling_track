import type { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { t } from "./lib/i18n";
import { routeTree } from "./routeTree.gen";

export const getRouter = (queryClient: QueryClient) =>
  createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    defaultPendingComponent: () => (
      <p className="py-16 text-center text-sm text-muted-foreground">
        {t("Loading…", "Caricamento…")}
      </p>
    ),
  });

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
