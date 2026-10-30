import { describe, expect, it } from "vitest";
import { computeReadiness, formScore, hrvScore, readinessInputFor, recommendation } from "./readiness";

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
