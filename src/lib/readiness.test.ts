import { describe, expect, it } from "vitest";
import {
  capForLoad,
  ceiling,
  ceilingText,
  computeReadiness,
  loadCheck,
  readinessFor,
  formPercent,
  formScore,
  hrvScore,
  hrvZScore,
  readinessInputFor,
  recommendation,
  sleepScore,
} from "./readiness";
import { addDays } from "./training";

const base = {
  hrvToday: null,
  hrvBaseline: null,
  sleepSecs: null,
  sleepQuality: null,
  ctl: null,
  atl: null,
  stress: null,
  fatigue: null,
  mood: null,
};

describe("readiness", () => {
  it("has no input for resting heart rate", () => {
    expect(Object.keys(base)).not.toContain("restingHR");
  });
  it("HRV at baseline scores 50, 20% below scores 0", () => {
    expect(hrvScore(60, 60)).toBe(50);
    expect(hrvScore(48, 60)).toBeCloseTo(0);
  });
  it("form score drops when deeply fatigued", () => {
    expect(formScore(-30)).toBe(25);
    expect(formScore(10)).toBe(95);
  });
  it("returns null with no data", () => {
    expect(computeReadiness(base).score).toBeNull();
  });
  it("great sleep and feel with neutral form recommends intensity", () => {
    const r = computeReadiness({
      ...base,
      sleepSecs: 8 * 3600,
      sleepQuality: 1,
      stress: 1,
      fatigue: 1,
      ctl: 50,
      atl: 45,
    });
    expect(r.score).toBeGreaterThanOrEqual(75);
    expect(r.advice?.title).toBe("Ready for intensity");
  });
  it("HRV baseline averages the 7 days before the date, not the day itself", () => {
    const row = (id: string, hrv: number | null) => ({ ...base, id, hrv, ctl: null, atl: null });
    const rows = [
      row("2026-10-21", 10),
      row("2026-10-23", 50),
      row("2026-10-25", 60),
      row("2026-10-29", 70),
      row("2026-10-30", 99),
    ];
    const i = readinessInputFor(rows, "2026-10-30");
    expect(i.hrvToday).toBe(99);
    expect(i.hrvBaseline).toBe(60); // 21 Oct is outside the window
  });
  it("needs three HRV readings for a baseline", () => {
    const rows = [
      { ...base, id: "2026-10-29", hrv: 60 },
      { ...base, id: "2026-10-30", hrv: 70 },
    ];
    expect(readinessInputFor(rows, "2026-10-30").hrvBaseline).toBeNull();
  });
  it("tempers an intensity day when form is deeply negative", () => {
    expect(recommendation(80, 0).zones).toBe("Z4–Z5");
    expect(recommendation(80, -30).zones).toBe("Z3–Z4");
    expect(recommendation(30, 10).zones).toBe("Rest");
  });
});

describe("feel follows the check-in", () => {
  it("scores only fatigue, stress and mood; soreness and motivation in intervals.icu are ignored", () => {
    const row = { ...base, id: "2026-10-30", hrv: null, fatigue: 1, stress: 1, mood: 1 };
    const withExtras = { ...row, soreness: 4, motivation: 4 };
    const a = readinessInputFor([row], "2026-10-30");
    const b = readinessInputFor([withExtras], "2026-10-30");
    expect(computeReadiness(a).score).toBe(computeReadiness(b).score);
    expect(computeReadiness(a).components.find((c) => c.key === "feel")?.score).toBe(100);
  });
});

describe("no resting heart rate anywhere", () => {
  it("the wellness model and save schema don't carry it", async () => {
    const src = (await import("./intervals.ts?raw")).default;
    expect(src).not.toMatch(/restingHR/i);
  });
});

describe("ceiling", () => {
  const zones = { power: [150, 205, 245, 285], hr: [128, 142, 155, 165] };
  it("is the top of Z1 on an easy day and Z2 on an endurance day", () => {
    expect(ceiling(45, zones)).toEqual({ watts: 150, bpm: 128 });
    expect(ceiling(60, zones)).toEqual({ watts: 205, bpm: 142 });
    expect(ceilingText(ceiling(60, zones)!)).toBe("Stay under 205 W · 142 bpm");
  });
  it("has none on intensity and rest days", () => {
    expect(ceiling(80, zones)).toBeNull();
    expect(ceiling(30, zones)).toBeNull();
  });
  it("works with only one kind of zone, and not with none", () => {
    expect(ceiling(60, { power: [], hr: [128, 142] })).toEqual({ watts: null, bpm: 142 });
    expect(ceilingText({ watts: null, bpm: 142 })).toBe("Stay under 142 bpm");
    expect(ceiling(60, { power: [], hr: [] })).toBeNull();
  });
});

describe("load check", () => {
  const day = (id: string, ctl: number, atl: number) => ({ ...base, id, hrv: null, ctl, atl });
  // Coming back: fitness 36 → 42 in a week, fatigue 64 (the ramp in the Analysis chart, 1 Nov 2026).
  const rows = [day("2026-10-25", 36, 40), day("2026-11-01", 42, 64)];
  it("flags fatigue far above fitness and a steep ramp, easy rides or not", () => {
    const l = loadCheck(rows, "2026-11-01");
    expect(l.ratio).toBeCloseTo(1.52, 2);
    expect(l.ramp).toBe(6);
    expect(l.level).toBe(2);
    expect(l.reasons).toHaveLength(2);
  });
  it("is stricter coming back from a break", () => {
    const mild = [day("2026-10-25", 40, 44), day("2026-11-01", 44.5, 55)];
    expect(loadCheck(mild, "2026-11-01").level).toBe(0);
    expect(loadCheck(mild, "2026-11-01", true).level).toBe(1);
  });
  it("caps readiness: no intensity on caution, go easy when it's too much", () => {
    const fresh = { ...base, sleepSecs: 8 * 3600, sleepQuality: 1, fatigue: 1, stress: 1, mood: 1 };
    const r = readinessFor(
      [
        { ...fresh, id: "2026-10-25", hrv: null, ctl: 36, atl: 40 },
        { ...fresh, id: "2026-11-01", hrv: null, ctl: 42, atl: 64 },
      ],
      "2026-11-01",
    );
    expect(r.uncapped).toBeGreaterThan(54);
    expect(r.score).toBe(54);
    expect(r.advice?.title).toBe("Go easy");
    expect(capForLoad(90, { level: 1, ratio: 1.35, ramp: 2, returning: false, reasons: [] })).toBe(
      74,
    );
  });
  it("leaves a steady load alone, and ignores tiny fitness", () => {
    expect(
      loadCheck([day("2026-10-25", 50, 52), day("2026-11-01", 52, 58)], "2026-11-01").level,
    ).toBe(0);
    expect(loadCheck([day("2026-11-01", 5, 20)], "2026-11-01").ratio).toBeNull();
  });
});

describe("personal baselines", () => {
  const day = (id: string, extra: object = {}) => ({ ...base, id, hrv: null, ...extra });
  const date = "2026-10-31";
  // 60 days of HRV alternating 54 / 66 ms: ln mean ≈ 4.09, SD ≈ 0.10.
  const history = Array.from({ length: 60 }, (_, i) =>
    day(addDays(date, -60 + i), { hrv: i % 2 ? 54 : 66 }),
  );

  it("scores HRV against your own band: normal, low, and a week under it", () => {
    expect(hrvZScore(0)).toBe(77.5);
    expect(hrvZScore(-1)).toBe(40);
    expect(hrvZScore(-2)).toBe(10);
    expect(hrvZScore(2)).toBe(100);
    const normal = computeReadiness(readinessInputFor([...history, day(date, { hrv: 60 })], date));
    const hrv = normal.components.find((c) => c.key === "hrv")!;
    expect(hrv.score).toBeGreaterThan(70);
    expect(hrv.detail).toMatch(/normal 57–63/);
    const low = computeReadiness(readinessInputFor([...history, day(date, { hrv: 48 })], date));
    expect(low.components.find((c) => c.key === "hrv")!.score).toBeLessThan(35);
    // A good morning after a week under the band is held down by the week.
    const week = history.map((r) => (r.id > addDays(date, -7) ? { ...r, hrv: 50 } : r));
    const held = computeReadiness(readinessInputFor([...week, day(date, { hrv: 66 })], date));
    expect(held.components.find((c) => c.key === "hrv")!.detail).toMatch(/7-day trend/);
    expect(held.components.find((c) => c.key === "hrv")!.score).toBeLessThan(60);
  });

  it("falls back to the 7-day comparison until the band has 14 readings", () => {
    const i = readinessInputFor([...history.slice(-5), day(date, { hrv: 60 })], date);
    expect(i.hrvLnMean).toBeNull();
    expect(computeReadiness(i).components[0]!.detail).toMatch(/vs 7-day/);
  });

  it("scores sleep against your usual and counts the debt of the nights before", () => {
    expect(sleepScore(6 * 3600, null, 6 * 3600)).toBe(100);
    expect(sleepScore(6 * 3600, null)).toBeCloseTo(52); // 80% of the default 7.5 h
    expect(sleepScore(8 * 3600, null, 8 * 3600, 3 * 3600)).toBe(70);
    const nights = Array.from({ length: 30 }, (_, i) =>
      day(addDays(date, -30 + i), { sleepSecs: i >= 27 ? 5 * 3600 : 8 * 3600 }),
    );
    const i = readinessInputFor([...nights, day(date, { sleepSecs: 8 * 3600 })], date);
    expect(i.sleepUsual).toBe(8 * 3600);
    expect(i.sleepDebt).toBe(9 * 3600);
    expect(computeReadiness(i).components[0]!.detail).toMatch(/9.0 h short/);
  });

  it("reads form as a share of fitness", () => {
    expect(formPercent(100, 120)).toBe(-20);
    expect(formPercent(40, 48)).toBe(-20);
    expect(formScore(formPercent(100, 130))).toBe(25);
    expect(formPercent(5, 15)).toBe(-10); // tiny fitness: plain points
  });

  it("weighs check-in answers against your usual ones", () => {
    const usual = Array.from({ length: 10 }, (_, i) => day(addDays(date, -10 + i), { stress: 3 }));
    const asUsual = computeReadiness(readinessInputFor([...usual, day(date, { stress: 3 })], date));
    const worse = computeReadiness(readinessInputFor([...usual, day(date, { stress: 4 })], date));
    const plain = computeReadiness(readinessInputFor([day(date, { stress: 3 })], date));
    expect(asUsual.components[0]!.score).toBeGreaterThan(plain.components[0]!.score);
    expect(worse.components[0]!.score).toBeLessThan(asUsual.components[0]!.score);
  });

  it("says how much the score has behind it", () => {
    expect(computeReadiness({ ...base, ctl: 50, atl: 50 }).confidence).toBe("low");
    expect(computeReadiness({ ...base, ctl: 50, atl: 50, fatigue: 2 }).confidence).toBe("medium");
    const nights = Array.from({ length: 60 }, (_, i) =>
      day(addDays(date, -60 + i), { hrv: i % 2 ? 54 : 66, sleepSecs: 8 * 3600 }),
    );
    const full = readinessInputFor(
      [...nights, day(date, { hrv: 60, sleepSecs: 8 * 3600, ctl: 50, atl: 50 })],
      date,
    );
    expect(computeReadiness(full).confidence).toBe("high");
  });
});

describe("accuracy check", () => {
  it("ranks like Spearman", async () => {
    const { spearman } = await import("./readiness");
    expect(spearman([1, 2, 3, 4], [10, 20, 30, 40])).toBeCloseTo(1);
    expect(spearman([1, 2, 3, 4], [4, 3, 2, 1])).toBeCloseTo(-1);
    expect(spearman([1, 1, 1], [1, 2, 3])).toBeNull();
  });
  it("matches readiness with how the day's ride felt", async () => {
    const { readinessAccuracy } = await import("./readiness");
    const date = "2026-10-31";
    // Good mornings (fatigue 1) before strong rides (feel 1), bad ones (fatigue 4) before weak rides (feel 5).
    const rows = Array.from({ length: 20 }, (_, i) => ({
      ...base,
      id: addDays(date, -i),
      hrv: null,
      fatigue: i % 2 ? 4 : 1,
    }));
    const rides = rows.map((r, i) => ({
      start_date_local: `${r.id}T09:00:00`,
      feel: i % 2 ? 5 : 1,
    }));
    const acc = readinessAccuracy(rows, rides, addDays(date, -90));
    expect(acc.rides).toBe(20);
    expect(acc.r).toBeGreaterThan(0.9);
    expect(readinessAccuracy(rows, rides.slice(0, 5), addDays(date, -90)).r).toBeNull();
  });
});
