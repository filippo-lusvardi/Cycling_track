import { describe, expect, it } from "vitest";
import { fitTrend, polyFit } from "./trend";

const xs = Array.from({ length: 20 }, (_, i) => i * 10);

describe("trend", () => {
  it("solves an exact polynomial", () => {
    const c = polyFit([0, 1, 2, 3], [1, 2, 5, 10], 2)!;
    c.forEach((v, i) => expect(v).toBeCloseTo([1, 0, 1][i]!, 6));
  });
  it("needs four points and a spread of days", () => {
    expect(fitTrend([1, 2, 3], [1, 2, 3])).toBeNull();
    expect(fitTrend([5, 5, 5, 5], [1, 2, 3, 4])).toBeNull();
  });
  it("stays linear on a straight improvement with noise", () => {
    const ys = xs.map((x, i) => 12 - x * 0.01 + (i % 2 ? 0.05 : -0.05));
    const f = fitTrend(xs, ys)!;
    expect(f.degree).toBe(1);
    expect(f.at(100)).toBeCloseTo(11, 1);
  });
  it("bends when improvement levels off", () => {
    // Fast gains, then a plateau: a straight line misses both ends.
    const ys = xs.map((x) => 10 + 4 * Math.exp(-x / 40));
    const f = fitTrend(xs, ys)!;
    expect(f.degree).toBeGreaterThan(1);
    expect(f.at(0)).toBeCloseTo(14, 0);
    expect(f.at(190)).toBeCloseTo(10, 0);
  });
  it("is not dragged by a few slow easy-day passes", () => {
    const ys = xs.map((x) => 12 - x * 0.01);
    ys[5] = 20;
    ys[12] = 19;
    const f = fitTrend(xs, ys)!;
    expect(f.at(50)).toBeCloseTo(11.5, 0);
    expect(f.at(120)).toBeCloseTo(10.8, 0);
  });
  it("keeps few points linear, however they lie", () => {
    expect(fitTrend([0, 10, 20, 30, 40], [5, 1, 6, 0, 7])!.degree).toBe(1);
  });
});
