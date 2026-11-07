// @vitest-environment jsdom
import { act, cloneElement, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

describe("with real text sizes", () => {
  // jsdom measures text as 0 px, which hides the labels Recharts drops for not fitting.
  beforeEach(() => {
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 600,
      bottom: 14,
      width: 600,
      height: 14,
      toJSON: () => ({}),
    });
  });
  afterEach(() => vi.restoreAllMocks());

  const rendered = () => {
    const n = 600;
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const streams = {
      time: Array.from({ length: n }, (_, i) => i),
      distance: Array.from({ length: n }, (_, i) => i * 9),
      altitude: [],
      watts: Array.from({ length: n }, (_, i) => 180 + (i % 60)),
      heartrate: Array.from({ length: n }, (_, i) => 130 + (i % 30)),
      cadence: Array.from({ length: n }, (_, i) => 80 + (i % 10)),
      lat: [],
      lng: [],
    } as unknown as RideStreams;
    act(() =>
      root.render(
        <RideCharts a={{ type: "Ride" } as unknown as ActivityDetail} streams={streams} />,
      ),
    );
    /** Each chart's y labels, top chart first. */
    const labels = () =>
      [...host.querySelectorAll(".recharts-wrapper")].map((chart) =>
        [...chart.querySelectorAll(".recharts-yAxis .recharts-cartesian-axis-tick-value")].map(
          (t) => Number(t.textContent),
        ),
      );
    const pinchIn = () => {
      const area = host.querySelector(".select-none")!;
      const touch = (type: string, xs: number[]) =>
        act(() => {
          const e = new Event(type, { bubbles: true });
          const touches = xs.map((clientX) => ({ clientX, clientY: 0 }));
          Object.assign(e, {
            touches: Object.assign(touches, { item: (i: number) => touches[i] }),
          });
          area.dispatchEvent(e);
        });
      touch("touchstart", [250, 350]);
      touch("touchmove", [100, 500]);
      touch("touchend", []);
    };
    return { labels, pinchIn, done: () => (act(() => root.unmount()), host.remove()) };
  };

  it("draws the lowest label on every chart, not only the one with the distance axis", () => {
    const c = rendered();
    const [speed, power, hr, cadence] = c.labels();
    expect(Math.min(...speed!)).toBe(0);
    expect(Math.min(...power!)).toBe(0);
    expect(Math.min(...hr!)).toBe(80);
    expect(hr).toContain(120);
    expect(Math.min(...cadence!)).toBe(0);
    c.done();
  });

  it("keeps 0 when zoomed, except heart rate, which fits what's shown", () => {
    const c = rendered();
    c.pinchIn();
    expect(document.body.textContent).toContain("Reset zoom");
    const [speed, power, hr, cadence] = c.labels();
    expect(Math.min(...speed!)).toBe(0);
    expect(Math.min(...power!)).toBe(0);
    expect(Math.min(...cadence!)).toBe(0);
    expect(Math.min(...hr!)).toBeGreaterThan(80);
    c.done();
  });
});
