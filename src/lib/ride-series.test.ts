import { describe, expect, it } from "vitest";
import { rideSeries } from "./ride-series";

const ride = (
  secs: number,
  mps: number,
  watts: (i: number) => number | null,
  hr: number | null,
) => ({
  time: Array.from({ length: secs }, (_, i) => i),
  distance: Array.from({ length: secs }, (_, i) => i * mps),
  watts: Array.from({ length: secs }, (_, i) => watts(i)),
  heartrate: Array.from({ length: secs }, () => hr),
});

describe("ride series", () => {
  it("averages a steady ride into about the requested number of points", () => {
    const pts = rideSeries(
      ride(3600, 10, () => 200, 140),
      100,
    );
    expect(pts.length).toBeGreaterThanOrEqual(99);
    expect(pts.length).toBeLessThanOrEqual(101);
    expect(pts[10]!.speed).toBeCloseTo(36);
    expect(pts[10]!.watts).toBe(200);
    expect(pts[10]!.hr).toBe(140);
    expect(pts.at(-1)!.km).toBeLessThan(36);
  });
  it("smooths power over at least five samples", () => {
    const pts = rideSeries(
      ride(100, 8, (i) => (i % 2 ? 300 : 100), 150),
      1000,
    );
    expect(pts.every((p) => p.watts! > 120 && p.watts! < 280)).toBe(true);
  });
  it("leaves missing sensors empty", () => {
    const pts = rideSeries(ride(600, 8, () => null, null));
    expect(pts.every((p) => p.watts === null && p.hr === null && p.speed! > 28)).toBe(true);
  });
  it("shows a stop as zero speed", () => {
    const r = ride(200, 10, () => 150, 120);
    for (let i = 100; i < 200; i++) r.distance[i] = r.distance[99]!;
    const pts = rideSeries(r, 20);
    expect(pts.at(-1)!.speed).toBe(0);
  });
  it("averages cadence, and leaves it out when a sensor only ever said zero", () => {
    const base = ride(600, 10, () => 200, 140);
    const pedalled = rideSeries({ ...base, cadence: base.time.map((i) => (i % 2 ? 80 : 90)) }, 60);
    expect(pedalled[3]!.cadence).toBeCloseTo(85);
    expect(rideSeries({ ...base, cadence: base.time.map(() => 0) }, 60)[3]!.cadence).toBeNull();
    expect(rideSeries(base, 60)[3]!.cadence).toBeNull();
  });
});
