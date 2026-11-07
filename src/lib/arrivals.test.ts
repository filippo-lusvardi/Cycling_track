import { describe, expect, it } from "vitest";
import { effortProfile, planArrivals, returnShoots, rideFtp } from "./arrivals";
import type { TreeBranch, TreeDay } from "./tree";

const ride = (id: string, brioches = 0) => ({ id, brioches }) as TreeBranch;
const day = (date: string, branches: TreeBranch[] = [], sprouts = 0): TreeDay =>
  ({
    date,
    branches,
    sprouts: Array(sprouts).fill({}),
    ctl: 1,
    trunk: 8,
    budSide: 1,
    off: null,
  }) as TreeDay;

describe("planArrivals", () => {
  const days = [
    day("2026-11-07", [ride("a"), ride("b", 2)]),
    day("2026-11-06"),
    day("2026-11-05", [ride("c", 1)]),
  ];

  it("has nothing to show the first time, and remembers everything", () => {
    expect(planArrivals(days, null, 5)).toEqual({
      sap: null,
      birds: [],
      next: { a: 0, b: 2, c: 1 },
    });
  });
  it("plays the newest new ride, its birds coming after it", () => {
    const p = planArrivals(days, { c: 1 }, 5);
    expect(p.sap).toBe("b");
    expect(p.birds).toEqual([{ id: "b", from: 0, to: 2 }]);
  });
  it("flies in only the difference when brioches are entered later", () => {
    const p = planArrivals(days, { a: 0, b: 1, c: 1 }, 5);
    expect(p.sap).toBeNull();
    expect(p.birds).toEqual([{ id: "b", from: 1, to: 2 }]);
  });
  it("sends a bird away when the count goes down", () => {
    const p = planArrivals(days, { a: 0, b: 3, c: 1 }, 5);
    expect(p.birds).toEqual([{ id: "b", from: 3, to: 2 }]);
  });
  it("does nothing once it has all been seen, and plays only once", () => {
    const first = planArrivals(days, { c: 1 }, 5);
    expect(planArrivals(days, first.next, 5)).toEqual({ sap: null, birds: [], next: first.next });
  });
  it("forgets rides folded into weeks, which have nothing to animate", () => {
    expect(planArrivals(days, { old: 3, a: 0, b: 2, c: 1 }, 1).next).toEqual({ a: 0, b: 2 });
    expect(planArrivals(days, { a: 0, b: 2, c: 9 }, 1).birds).toEqual([]);
  });
});

describe("returnShoots", () => {
  const gap = (n: number, y = "2026-10-") =>
    Array.from({ length: n }, (_, i) => day(`${y}${String(n - i).padStart(2, "0")}`));
  it("marks the last empty day before a return from a long gap", () => {
    const empty = gap(20);
    const days = [day("2026-10-21", [ride("back")]), ...empty, day("2026-09-30", [ride("old")])];
    expect([...returnShoots(days)]).toEqual(["2026-10-20"]);
  });
  it("says nothing of a short gap or of the very first ride", () => {
    const days = [day("2026-10-14", [ride("b")]), ...gap(13), day("2026-09-30", [ride("a")])];
    expect(returnShoots(days).size).toBe(0);
    expect(returnShoots([day("2026-10-21", [ride("first")]), ...gap(20)]).size).toBe(0);
  });
  it("does not count a gap filled by the garden", () => {
    const filled = gap(20);
    filled[10] = day(filled[10]!.date, [], 1);
    const days = [day("2026-10-21", [ride("back")]), ...filled, day("2026-09-30", [ride("old")])];
    expect(returnShoots(days).size).toBe(0);
  });
});

describe("effortProfile", () => {
  const blocks = Array.from({ length: 3600 }, (_, i) => (Math.floor(i / 600) % 2 ? 120 : 330));
  it("shows intervals as high and low against FTP", () => {
    const p = effortProfile({ watts: blocks, heartrate: [] }, 275)!;
    expect(Math.max(...p)).toBe(1);
    expect(Math.min(...p)).toBeLessThan(0.45);
  });
  it("keeps a steady easy ride calm", () => {
    const p = effortProfile({ watts: Array(3600).fill(150), heartrate: [] }, 275)!;
    expect(Math.max(...p)).toBeLessThan(0.5);
  });
  it("falls back on heart rate, and on nothing when there's neither", () => {
    const hr = Array.from({ length: 3600 }, (_, i) => 110 + (i / 3600) * 60);
    const p = effortProfile({ watts: [], heartrate: hr }, null)!;
    expect(p[89]!).toBeGreaterThan(p[0]!);
    expect(effortProfile({ watts: [], heartrate: [] }, null)).toBeNull();
  });
  it("finds a ride's FTP from either way intensity is sent", () => {
    expect(rideFtp({ icu_weighted_avg_watts: 200, icu_intensity: 80 })).toBe(250);
    expect(rideFtp({ icu_weighted_avg_watts: 200, icu_intensity: 0.8 })).toBe(250);
    expect(rideFtp({ icu_weighted_avg_watts: null, icu_intensity: 80 })).toBeNull();
  });
});
