import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { persistQueryClient } from "@tanstack/react-query-persist-client";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { RouterProvider } from "@tanstack/react-router";
import { del, get, set } from "idb-keyval";

import "@fontsource/space-grotesk/400.css";
import "@fontsource/space-grotesk/500.css";
import "@fontsource/space-grotesk/600.css";
import "@fontsource/space-grotesk/700.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/600.css";
import "./styles.css";

import { AuthError } from "./lib/intervals";
import { getRouter } from "./router";

const WEEK = 7 * 86400000;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: WEEK,
      // Try the network even when the browser thinks it's offline, then fall back to the persisted cache.
      networkMode: "offlineFirst",
      retry: (n, e) => !(e instanceof AuthError) && navigator.onLine && n < 2,
    },
  },
});

// The last data fetched lives in IndexedDB so Today and the dashboards open offline.
const persister = createAsyncStoragePersister({
  key: "cadence-query-cache",
  storage: { getItem: get, setItem: set, removeItem: del },
});

// Streams have their own cache and race tracks come from the segment store, so neither goes in the snapshot.
const NOT_PERSISTED = new Set(["streams", "effort-track"]);

navigator.storage?.persist?.().catch(() => {});

const router = getRouter(queryClient);

const [, restored] = persistQueryClient({
  queryClient,
  persister,
  maxAge: WEEK,
  buster: "v1",
  dehydrateOptions: {
    shouldDehydrateQuery: (q) =>
      q.state.status === "success" && !NOT_PERSISTED.has(String(q.queryKey[0])),
  },
});

// Restore the cache before the first route loader runs, so an offline start finds yesterday's data.
restored.finally(() =>
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </StrictMode>,
  ),
);
