import { describe, expect, it } from "vitest";
import {
  atTime,
  effortSeries,
  gapSeries,
  splitsOnTrace,
  timeAtDist,
  toSplits,
  type EffortSeries,
} from "./ghost";
import type { TrackLike } from "./segments";

/** A 1 km straight effort at constant speed (m/s), sampled every `every` metres. */
function effort(speed: number, every = 20, startAt = 0): EffortSeries {
  const d: number[] = [];
  for (let x = 0; x <= 1000; x += every) d.push(x);
  if (d.at(-1) !== 1000) d.push(1000);
  return {
    d,
    t: d.map((x) => x / speed + startAt),
    lat: d.map((x) => 45 + x / 111000),
    lng: d.map(() => 11),
  };
}

describe("ghost race", () => {
  it("rebases time and distance to the effort's start", () => {
    const n = 100;
    const t: TrackLike = {
      id: "r",
      name: null,
      date: "2026-10-01",
      lat: Array.from({ length: n }, (_, i) => 45 + i / 1000),
      lng: Array(n).fill(11),
      dist: Array.from({ length: n }, (_, i) => i * 20),
      time: Array.from({ length: n }, (_, i) => 1000 + i * 4),
      alt: Array(n).fill(0),
      watts: [],
      hr: [],
    };
    const s = effortSeries(t, { i0: 10, i1: 20 });
    expect(s.t[0]).toBe(0);
    expect(s.d[0]).toBe(0);
    expect(s.d.at(-1)).toBe(200);
    expect(s.t.at(-1)).toBe(40);
  });

  it("positions follow time and stay at the finish", () => {
    const s = effort(5); // 200 s for 1 km
    expect(atTime(s, 100).d).toBeCloseTo(500);
    expect(atTime(s, 999).d).toBe(1000);
    expect(atTime(s, -5).d).toBe(0);
  });

  it("gap grows linearly between a 5 m/s and a 4 m/s effort", () => {
    const g = gapSeries(effort(5), effort(4));
    expect(g[0]!.gap).toBeCloseTo(0);
    expect(g.find((p) => p.d === 500)!.gap).toBeCloseTo(500 / 4 - 500 / 5); // 25 s behind
    expect(g.at(-1)!.d).toBe(1000);
    expect(g.at(-1)!.gap).toBeCloseTo(50);
  });

  it("handles uneven sampling", () => {
    const s = effort(5, 37);
    expect(timeAtDist(s, 500)).toBeCloseTo(100);
    expect(atTime(s, 150).d).toBeCloseTo(750);
  });
});

describe("splits", () => {
  it("keep the ends, stay within the limit and carry no positions", () => {
    const s = toSplits(effort(5, 1), 50);
    expect(s.t).toHaveLength(50);
    expect(s.d[0]).toBe(0);
    expect(s.d.at(-1)).toBe(1000);
    expect(s.t.at(-1)).toBe(200);
    expect(Object.keys(s).sort()).toEqual(["d", "t"]);
  });

  it("place an effort on the climb's route, finishing at its end even if GPS measured it longer", () => {
    const trace = { lat: [45, 45.01, 45.02], lng: [11, 11, 11], dist: [0, 500, 1000] };
    const s = splitsOnTrace({ t: [0, 50, 100], d: [0, 550, 1100] }, trace);
    expect(s.lat[0]).toBeCloseTo(45);
    expect(s.lat[1]).toBeCloseTo(45.01);
    expect(s.lat.at(-1)).toBeCloseTo(45.02);
    expect(atTime(s, 100).d).toBe(1100);
  });
});
