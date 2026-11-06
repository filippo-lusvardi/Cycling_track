// @vitest-environment jsdom
import { act, cloneElement, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import type { ActivityDetail, RideStreams } from "@/lib/intervals";
import { RideCharts } from "./RideCharts";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
// jsdom has no layout, so give the charts a size for Recharts to draw the axes at.
vi.mock("recharts", async (original) => ({
  ...(await original<typeof import("recharts")>()),
  ResponsiveContainer: ({ children }: { children: ReactElement<object> }) =>
    cloneElement(children, { width: 600, height: 200 } as object),
}));

const axisStart = (heartrate: number[]) => {
  const n = heartrate.length;
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const streams = {
    time: Array.from({ length: n }, (_, i) => i),
    distance: Array.from({ length: n }, (_, i) => i * 9),
    altitude: [],
    watts: [],
    heartrate,
    cadence: [],
    lat: [],
    lng: [],
  } as unknown as RideStreams;
  act(() =>
    root.render(
      <RideCharts
        a={{ type: "Ride" } as unknown as ActivityDetail}
        streams={streams}
        chosen={[{ id: "speed", hidden: true }]}
      />,
    ),
  );
  const ticks = [...host.querySelectorAll(".recharts-yAxis .recharts-cartesian-axis-tick-value")];
  const values = ticks.map((t) => Number(t.textContent));
  act(() => root.unmount());
  host.remove();
  return Math.min(...values);
};

it("draws the heart-rate axis from 80 bpm, or from the activity's lowest when under 80", () => {
  expect(axisStart(Array.from({ length: 600 }, (_, i) => 120 + (i % 40)))).toBe(80);
  expect(axisStart(Array.from({ length: 600 }, (_, i) => 67 + (i % 90)))).toBe(67);
});
