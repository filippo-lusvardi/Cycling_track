// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActivityDetail, RideStreams } from "@/lib/intervals";
import { RideCharts } from "./RideCharts";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);

const n = 600;
const streams = {
  time: Array.from({ length: n }, (_, i) => i),
  distance: Array.from({ length: n }, (_, i) => i * 9),
  altitude: [],
  watts: Array.from({ length: n }, () => 200),
  heartrate: Array.from({ length: n }, () => 140),
  cadence: Array.from({ length: n }, () => 85),
  lat: [],
  lng: [],
} as unknown as RideStreams;
const ride = { type: "Ride", average_cadence: 85 } as unknown as ActivityDetail;

describe("choosing the charts", () => {
  let root: Root;
  let host: HTMLDivElement;
  beforeEach(() => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });
  const pills = () => [...host.querySelectorAll<HTMLButtonElement>("button[aria-pressed]")];
  const titles = () =>
    [...host.querySelectorAll("span.font-medium")].map((s) => s.textContent?.trim());

  it("shows what's chosen in its order, with a way back for what's hidden", () => {
    const onChoose = vi.fn();
    act(() =>
      root.render(
        <RideCharts
          a={ride}
          streams={streams}
          onChoose={onChoose}
          chosen={[
            { id: "cadence", hidden: false },
            { id: "speed", hidden: false },
            { id: "watts", hidden: true },
            { id: "hr", hidden: true },
          ]}
        />,
      ),
    );
    expect(titles()).toEqual(["Cadence", "Speed"]);
    expect(pills().map((p) => [p.textContent, p.getAttribute("aria-pressed")])).toEqual([
      ["Cadence", "true"],
      ["Speed", "true"],
      ["Power", "false"],
      ["Heart rate", "false"],
    ]);
    act(() => pills()[2]!.click());
    expect(onChoose).toHaveBeenCalledWith("watts", false);
    act(() => pills()[0]!.click());
    expect(onChoose).toHaveBeenCalledWith("cadence", true);
  });
  it("hiding them all leaves the pills", () => {
    act(() =>
      root.render(
        <RideCharts
          a={ride}
          streams={streams}
          onChoose={() => {}}
          chosen={["speed", "watts", "hr", "cadence"].map((id) => ({ id, hidden: true }))}
        />,
      ),
    );
    expect(titles()).toEqual([]);
    expect(pills()).toHaveLength(4);
  });
});

describe("the numbers over a part of the ride", () => {
  let root: Root;
  let host: HTMLDivElement;
  beforeEach(() => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });
  it("are that part's own, not the whole ride's", () => {
    // 400 W between 1.1 and 1.6 km; the ride's top, 900 W, comes later at 4.5 km.
    const bumpy = {
      ...streams,
      watts: Array.from({ length: n }, (_, i) =>
        i >= 120 && i < 180 ? 400 : i === 500 ? 900 : 200,
      ),
    } as unknown as RideStreams;
    const header = () =>
      [...host.querySelectorAll("span.stat-num")].map((x) => x.textContent ?? "");
    act(() => root.render(<RideCharts a={ride} streams={bumpy} />));
    expect(header().some((h) => h.includes("max 900 W"))).toBe(true);
    act(() => root.render(<RideCharts a={ride} streams={bumpy} work={{ startKm: 1, endKm: 2 }} />));
    expect(header().some((h) => h.includes("max 400 W"))).toBe(true);
    expect(header().some((h) => h.includes("900"))).toBe(false);
  });
});
