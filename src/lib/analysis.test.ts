import { describe, expect, it } from "vitest";
import { climbCategory, detectClimbs } from "./climbs";
import { decoupling, fitCriticalPower, mmp, monotony, polarizationIndex, threeZone, weeklyTotals } from "./analysis";

function profile() {
  // 1 km flat, 2 km at 5% (100 m gain), 1 km descent; 1 sample every 10 m at 5 m/s.
  const distance: number[] = [];
  const altitude: number[] = [];
  const time: number[] = [];
  for (let d = 0; d <= 4000; d += 10) {
    distance.push(d);
    time.push(d / 5);
    if (d <= 1000) altitude.push(200);
    else if (d <= 3000) altitude.push(200 + (d - 1000) * 0.05);
    else altitude.push(300 - (d - 3000) * 0.08);
  }
  return { distance, altitude, time };
}

describe("climb detection", () => {
  it("finds one 2 km climb at ~5% with ~100 m gain", () => {
    const climbs = detectClimbs(profile());
    expect(climbs).toHaveLength(1);
    expect(climbs[0]!.gain).toBeGreaterThan(85);
    expect(climbs[0]!.gain).toBeLessThan(105);
    expect(climbs[0]!.avgGrade).toBeGreaterThan(4.3);
    expect(climbs[0]!.avgGrade).toBeLessThan(5.5);
    expect(climbs[0]!.length).toBeGreaterThan(1800);
    expect(climbs[0]!.length).toBeLessThan(2200);
  });
  it("ends the climb where a flat summit starts", () => {
    const distance = Array.from({ length: 501 }, (_, i) => i * 10);
    const altitude = distance.map((d) => (d < 1000 ? 0 : d < 3000 ? (d - 1000) * 0.06 : 120 + (d - 3000) * 0.002));
    const [c] = detectClimbs({ distance, altitude, time: distance });
    expect(c!.endKm).toBeGreaterThan(2.8);
    expect(c!.endKm).toBeLessThan(3.2);
    expect(c!.avgGrade).toBeGreaterThan(5);
  });
  it("ignores a flat ride", () => {
    const distance = Array.from({ length: 500 }, (_, i) => i * 10);
    expect(detectClimbs({ distance, altitude: distance.map(() => 100), time: distance })).toHaveLength(0);
  });
  it("categorises by length × grade like Strava", () => {
    expect(climbCategory(2000, 5)).toBe("4");
    expect(climbCategory(5000, 4)).toBe("3");
    expect(climbCategory(10000, 7)).toBe("1");
    expect(climbCategory(15000, 8)).toBe("HC");
    expect(climbCategory(1000, 4)).toBe("Uncat");
  });
});

describe("load analysis", () => {
  it("monotony is mean / SD of daily load including rest days", () => {
    expect(monotony([70, 70, 70, 70, 70, 70, 0])).toBeCloseTo(2.449, 2);
    expect(monotony([0, 0, 0, 0, 0, 0, 0])).toBeNull();
  });
  it("groups activities into Monday-start weeks", () => {
    const rows = weeklyTotals([
      { start_date_local: "2026-10-26T08:00:00", moving_time: 3600, distance: 30000, icu_training_load: 50, total_elevation_gain: 400 },
      { start_date_local: "2026-11-01T08:00:00", moving_time: 7200, distance: 60000, icu_training_load: 100, total_elevation_gain: 850 },
      { start_date_local: "2026-11-02T08:00:00", moving_time: 3600, distance: 20000, icu_training_load: 40 },
    ]);
    expect(rows.map((r) => r.week)).toEqual(["2026-10-26", "2026-11-02"]);
    expect(rows[0]!.load).toBe(150);
    expect(rows[0]!.hours).toBe(3);
    expect(rows[0]!.elevation).toBe(1250);
  });
  it("polarization index above 2 for an 80/5/15 split", () => {
    const f = threeZone([4000, 4000, 500, 1000, 500])!;
    expect(f.low).toBeCloseTo(0.8);
    expect(polarizationIndex(f)!).toBeGreaterThan(2);
  });
});

describe("power analysis", () => {
  it("MMP finds the best rolling average for each duration", () => {
    const w = [...Array(60).fill(150), ...Array(10).fill(400), ...Array(60).fill(150)];
    const [p1, p10, p60, p999] = mmp(w, [1, 10, 60, 999]);
    expect(p1).toBe(400);
    expect(p10).toBe(400);
    expect(p60).toBeCloseTo((10 * 400 + 50 * 150) / 60);
    expect(p999).toBeNull();
  });
  it("recovers CP and W′ from a hyperbolic power–duration curve", () => {
    const pts = [180, 300, 480, 720, 1200].map((secs) => ({ secs, watts: 250 + 20000 / secs }));
    const fit = fitCriticalPower(pts)!;
    expect(fit.cp).toBeCloseTo(250, 0);
    expect(fit.wPrime / 1000).toBeCloseTo(20, 1);
    expect(fit.r2).toBeGreaterThan(0.99);
  });
  it("ignores efforts outside 3–20 minutes for CP", () => {
    expect(fitCriticalPower([{ secs: 5, watts: 900 }, { secs: 60, watts: 500 }, { secs: 3600, watts: 230 }])).toBeNull();
  });
  it("decoupling is the drop in power per heartbeat from first to second half", () => {
    const w = Array(3600).fill(200);
    const hr = [...Array(1800).fill(130), ...Array(1800).fill(136.5)];
    expect(decoupling(w, hr)).toBeCloseTo(4.76, 1);
    expect(decoupling(w.slice(0, 600), hr.slice(0, 600))).toBeNull();
  });
});
