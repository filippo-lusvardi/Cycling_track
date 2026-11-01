import { describe, expect, it } from "vitest";
import { earlySignals } from "./signals";
import { addDays } from "./training";

const today = "2026-10-31";
type Row = Parameters<typeof earlySignals>[0][number];
const row = (back: number, extra: Partial<Row> = {}): Row => ({
  id: addDays(today, -back),
  atl: null,
  hrv: null,
  sleepSecs: null,
  fatigue: null,
  stress: null,
  mood: null,
  ...extra,
});
const days = (n: number, f: (back: number) => Partial<Row>) =>
  Array.from({ length: n }, (_, i) => row(i, f(i)));
const keys = (rows: Row[]) => earlySignals(rows, today).map((s) => s.key);

describe("early signals", () => {
  it("are quiet with no data or steady data", () => {
    expect(keys([])).toEqual([]);
    expect(keys(days(35, () => ({ hrv: 60, sleepSecs: 8 * 3600, fatigue: 2 })))).toEqual([]);
  });
  // Real HRV wobbles from day to day: 54 and 66 ms on alternate mornings (an SD of about 0.1 in ln).
  const usual = (b: number) => (b % 2 ? 54 : 66);
  it("flag a week of HRV under your normal band, noting rising load", () => {
    const rows = days(67, (b) => ({ hrv: b < 7 ? 52 : usual(b), atl: b === 0 ? 70 : 50 }));
    const s = earlySignals(rows, today);
    expect(s.map((x) => x.key)).toEqual(["hrv"]);
    expect(s[0]!.text).toMatch(/load went up/);
  });
  it("ignore a small HRV dip and a single bad morning", () => {
    expect(keys(days(67, (b) => ({ hrv: b < 7 ? 58 : usual(b) })))).toEqual([]);
    expect(keys(days(67, (b) => ({ hrv: b === 0 ? 30 : b < 7 ? 60 : usual(b) })))).toEqual([]);
  });
  it("flag fatigue high on 3 of the last 4 check-ins, not 2", () => {
    expect(keys(days(4, (b) => ({ fatigue: b === 2 ? 2 : 3 })))).toEqual(["fatigue"]);
    expect(keys(days(4, (b) => ({ fatigue: b < 2 ? 3 : 2 })))).toEqual([]);
  });
  it("skip unanswered days but forget answers older than ten days", () => {
    const rows = [row(0, { stress: 4 }), row(3, { stress: 3 }), row(6, { stress: 3 })];
    expect(keys(rows)).toEqual(["stress"]);
    expect(keys([row(0, { stress: 4 }), row(3, { stress: 3 }), row(12, { stress: 3 })])).toEqual(
      [],
    );
  });
  it("flag short nights against your own usual sleep", () => {
    const rows = days(28, (b) => ({ sleepSecs: b < 4 && b !== 1 ? 6 * 3600 : 7.5 * 3600 }));
    expect(keys(rows)).toEqual(["sleep"]);
    // A short sleeper sleeping as usual is fine.
    expect(keys(days(28, () => ({ sleepSecs: 6 * 3600 })))).toEqual([]);
  });
  it("never look at resting heart rate", async () => {
    const src = (await import("./signals.ts?raw")).default;
    expect(src).not.toMatch(/restingHR/i);
  });
});
