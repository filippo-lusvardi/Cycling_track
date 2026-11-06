import { describe, expect, it } from "vitest";
import { hrAxis, rideSeries } from "./ride-series";

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

describe("hrAxis", () => {
  it("starts at 80 when the activity never drops below it", () => {
    expect(hrAxis([95, 120, 163], 163)).toEqual({
      domain: [80, 180],
      ticks: [80, 100, 120, 140, 160, 180],
    });
  });
  it("starts at the activity's lowest reading when that is under 80", () => {
    const { domain, ticks } = hrAxis([73.4, 120, 150], 150);
    expect(domain).toEqual([73, 160]);
    expect(ticks).toEqual([73, 100, 120, 140, 160]);
  });
  it("takes the lowest from the whole activity, even when only a stretch of it is shown", () => {
    expect(hrAxis([70, 150, 170], 170).domain[0]).toBe(70);
  });
  it("ignores nulls and sensor dropouts", () => {
    expect(hrAxis([0, null, 110, 150], 150).domain[0]).toBe(80);
  });
  it("keeps a usable range when the heart rate stays low", () => {
    expect(hrAxis([60, 70], 70)).toEqual({ domain: [60, 80], ticks: [60, 80] });
    expect(hrAxis([], null).domain).toEqual([80, 100]);
  });
  it("thins the ticks out over a wide range", () => {
    expect(hrAxis([85, 195], 195).ticks).toEqual([80, 120, 160, 200]);
  });
});
