import { describe, expect, it } from "vitest";
import { capForLoad, ceiling, ceilingText, computeReadiness, loadCheck, readinessFor, formScore, hrvScore, readinessInputFor, recommendation } from "./readiness";

const base = { hrvToday: null, hrvBaseline: null, sleepSecs: null, sleepQuality: null, ctl: null, atl: null, stress: null, fatigue: null, mood: null };

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
    const r = computeReadiness({ ...base, sleepSecs: 8 * 3600, sleepQuality: 1, stress: 1, fatigue: 1, ctl: 50, atl: 45 });
    expect(r.score).toBeGreaterThanOrEqual(75);
    expect(r.advice?.title).toBe("Ready for intensity");
  });
  it("HRV baseline averages the 7 days before the date, not the day itself", () => {
    const row = (id: string, hrv: number | null) => ({ ...base, id, hrv, ctl: null, atl: null });
    const rows = [row("2026-10-21", 10), row("2026-10-23", 50), row("2026-10-25", 60), row("2026-10-29", 70), row("2026-10-30", 99)];
    const i = readinessInputFor(rows, "2026-10-30");
    expect(i.hrvToday).toBe(99);
    expect(i.hrvBaseline).toBe(60); // 21 Oct is outside the window
  });
  it("needs three HRV readings for a baseline", () => {
    const rows = [{ ...base, id: "2026-10-29", hrv: 60 }, { ...base, id: "2026-10-30", hrv: 70 }];
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
    const r = readinessFor([{ ...fresh, id: "2026-10-25", hrv: null, ctl: 36, atl: 40 }, { ...fresh, id: "2026-11-01", hrv: null, ctl: 42, atl: 64 }], "2026-11-01");
    expect(r.uncapped).toBeGreaterThan(54);
    expect(r.score).toBe(54);
    expect(r.advice?.title).toBe("Go easy");
    expect(capForLoad(90, { level: 1, ratio: 1.35, ramp: 2, returning: false, reasons: [] })).toBe(74);
  });
  it("leaves a steady load alone, and ignores tiny fitness", () => {
    expect(loadCheck([day("2026-10-25", 50, 52), day("2026-11-01", 52, 58)], "2026-11-01").level).toBe(0);
    expect(loadCheck([day("2026-11-01", 5, 20)], "2026-11-01").ratio).toBeNull();
  });
});
