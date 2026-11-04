import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Activity } from "@/lib/intervals";
import type { RunData } from "@/lib/run-data";
import { runSummary } from "@/lib/run-metrics";
import { RunAnalysis } from "./RunAnalysis";

// jsdom has no ResizeObserver, which the charts' containers need.
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);

vi.mock("@/components/FitnessSection", () => ({ FitnessSection: () => <div>Fitness</div> }));

const today = new Date().toISOString().slice(0, 10);
const streams = (secs: number, v: number) => ({
  time: Array.from({ length: secs }, (_, i) => i),
  distance: Array.from({ length: secs }, (_, i) => i * v),
  altitude: Array.from({ length: secs }, (_, i) => 100 + 20 * Math.sin(i / 200)),
  heartrate: Array.from({ length: secs }, () => 150),
});
const entry = (id: string, secs: number) => ({
  a: {
    id,
    name: id,
    type: "Run",
    start_date_local: `${today}T09:00:00`,
    moving_time: secs,
    icu_intensity: 72,
  } as Activity,
  date: today,
  s: runSummary(streams(secs, 3)),
});

async function show(data: RunData) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  qc.setQueryData(["run-data"], data);
  qc.setQueryData(["ride-zones", "run"], {
    ftp: null,
    power: [],
    hr: [130, 145, 155, 165, 175, 185, 999],
  });
  qc.setQueryData(["wellness", 90], []);
  const router = createRouter({
    routeTree: createRootRoute({ component: RunAnalysis }),
    history: createMemoryHistory(),
  });
  const host = document.body.appendChild(document.createElement("div"));
  await act(async () => {
    createRoot(host).render(
      <QueryClientProvider client={qc}>
        <RouterProvider router={router as never} />
      </QueryClientProvider>,
    );
    await router.load();
  });
  await vi.waitFor(() => expect(document.body.textContent).toContain("Fitness"));
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("the running Analysis page", () => {
  it("shows pace, best times, fade and zones, with no power words", async () => {
    await show({
      runs: [entry("long", 7200), entry("short", 1800)],
      threshold: 3.6,
      manual: false,
      fit: { speed: 3.6, cs: 3.6, dPrime: 180 },
    });
    const page = document.body.textContent ?? "";
    for (const shown of [
      "Threshold pace",
      "Best times",
      "Late-run fade",
      "Intensity distribution",
      "Grade-adjusted pace curve",
    ])
      expect(page).toContain(shown);
    expect(page).not.toMatch(/FTP|W′|\bwatts?\b|kJ/i);
  });
  it("says so when there are no runs yet", async () => {
    await show({ runs: [], threshold: null, manual: false, fit: null });
    expect(document.body.textContent).toContain("No runs with distance data yet");
  });
});
