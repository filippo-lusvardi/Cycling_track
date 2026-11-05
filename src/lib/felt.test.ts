import { describe, expect, it } from "vitest";
import { recentFeel } from "./felt";
import { computeReadiness } from "./readiness";

const today = "2026-11-05";
const a = (date: string, feel: number | null) => ({ start_date_local: `${date}T09:00:00`, feel });
const usual = (feel: number) =>
  Array.from({ length: 6 }, (_, i) => a(`2026-10-${String(10 + i).padStart(2, "0")}`, feel));

describe("recentFeel", () => {
  it("has no say with nothing rated, or only old ratings", () => {
    expect(recentFeel([a(today, null)], today)).toBeNull();
    expect(recentFeel([a("2026-11-01", 1)], today)).toBeNull();
  });

  it("weighs today most", () => {
    const r = recentFeel([a(today, 1), a("2026-11-03", 5)], today)!;
    expect(r.mean).toBeCloseTo((1 + 5 * 0.4) / 1.4);
    expect(r.count).toBe(2);
  });

  it("scores against the plain scale until your usual is known", () => {
    expect(recentFeel([a(today, 1)], today)!.score).toBe(100);
    expect(recentFeel([a(today, 3)], today)!.score).toBe(50);
    expect(recentFeel([a(today, 5)], today)!.score).toBe(0);
  });

  it("counts against your usual once known", () => {
    const easy = recentFeel([a(today, 3), ...usual(3)], today)!;
    const worse = recentFeel([a(today, 3), ...usual(1)], today)!;
    expect(easy.usual).toBe(3);
    expect(worse.score).toBeLessThan(easy.score);
  });

  it("moves the sky a little, and less up than down", () => {
    expect(recentFeel([a(today, 3)], today)!.skyShift).toBe(-0);
    expect(recentFeel([a(today, 4)], today)!.skyShift).toBe(-5);
    expect(recentFeel([a(today, 5)], today)!.skyShift).toBe(-10);
    expect(recentFeel([a(today, 1)], today)!.skyShift).toBe(5);
    expect(recentFeel([a(today, 5), ...usual(1)], today)!.skyShift).toBe(-10);
  });
});

describe("in the crown", () => {
  const base = {
    hrvToday: null,
    hrvBaseline: null,
    sleepSecs: null,
    sleepQuality: null,
    ctl: 40,
    atl: 40,
    stress: null,
    fatigue: null,
    mood: null,
  };
  it("changes nothing without ratings", () => {
    expect(computeReadiness(base).components.map((c) => c.key)).toEqual(["form"]);
  });

  it("joins as a part, and moves the score", () => {
    const low = computeReadiness({ ...base, felt: recentFeel([a(today, 5)], today) });
    const high = computeReadiness({ ...base, felt: recentFeel([a(today, 1)], today) });
    expect(low.components.map((c) => c.key)).toEqual(["form", "felt"]);
    expect(low.score!).toBeLessThan(high.score!);
  });
});
