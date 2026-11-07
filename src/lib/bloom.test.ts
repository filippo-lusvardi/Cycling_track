import { describe, expect, it } from "vitest";
import { bloomedRides, bloomOn, bloomStarts } from "./bloom";
import { addDays } from "./training";

const START = "2026-01-01";
/** A year of fitness and fatigue, from the day's load, the way the two are computed. */
function year(load: (i: number) => number, days = 365) {
  let ctl = 30;
  let atl = 30;
  return Array.from({ length: days }, (_, i) => {
    const l = load(i);
    ctl += (l - ctl) / 42;
    atl += (l - atl) / 7;
    return { id: addDays(START, i), ctl, atl };
  });
}
const END = addDays(START, 364);

describe("bloom", () => {
  it("never comes while fatigue stays above fitness, however fit", () => {
    expect(
      bloomStarts(
        year((i) => 40 + i * 0.25),
        END,
      ),
    ).toEqual([]);
  });

  it("comes after a block and a taper, not before", () => {
    const load = (i: number) => (i < 150 ? 70 : i < 157 ? 15 : 60);
    const starts = bloomStarts(year(load), END);
    expect(starts.length).toBeGreaterThan(0);
    expect(starts[0]! >= addDays(START, 149)).toBe(true);
  });

  it("stays rare across a normal year of blocks and rest weeks", () => {
    const load = (i: number) => (i % 28 >= 21 ? 25 : 65) + (i % 7 === 0 ? -65 : 0);
    expect(bloomStarts(year(load), END).length).toBeLessThanOrEqual(6);
  });

  it("does not come with fitness far below the year's best", () => {
    const load = (i: number) => (i < 100 ? 90 : 20);
    const rows = year(load, 300);
    const starts = bloomStarts(rows, addDays(START, 299));
    const late = starts.filter((s) => s > addDays(START, 160));
    expect(late).toEqual([]);
  });

  it("flowers for three days, sheds for two, then ends", () => {
    const rows = year((i) => (i < 150 ? 70 : i < 157 ? 15 : 60));
    const start = bloomStarts(rows, END)[0]!;
    expect(bloomOn(rows, start)).toEqual({ start, stage: "full" });
    expect(bloomOn(rows, addDays(start, 2))?.stage).toBe("full");
    expect(bloomOn(rows, addDays(start, 3))?.stage).toBe("falling");
    expect(bloomOn(rows, addDays(start, 4))?.stage).toBe("falling");
    expect(bloomOn(rows, addDays(start, 5))).toBeNull();
  });

  it("is not switched off by what's ridden on the day", () => {
    const rows = year((i) => (i < 150 ? 70 : i < 157 ? 15 : 60));
    const start = bloomStarts(rows, END)[0]!;
    const hard = rows.map((r) => (r.id === start ? { ...r, atl: r.ctl * 2 } : r));
    expect(bloomOn(hard, start)?.start).toBe(start);
  });

  it("marks only the rides inside a bloom", () => {
    const rows = year((i) => (i < 150 ? 70 : i < 157 ? 15 : 60));
    const start = bloomStarts(rows, END)[0]!;
    const days = [
      { date: addDays(start, 1), branches: [{ id: "in" }] },
      { date: addDays(start, 30), branches: [{ id: "out" }] },
    ];
    expect([...bloomedRides(days, rows, END)]).toEqual(["in"]);
  });

  it("ignores missing days and too short a history", () => {
    expect(bloomStarts([{ id: START, ctl: null, atl: null }], END)).toEqual([]);
    expect(
      bloomStarts(
        year(() => 70, 30),
        addDays(START, 29),
      ),
    ).toEqual([]);
  });
});
