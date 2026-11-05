import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { gapFactor, gapStreams, gradeStream, runningCost } from "./gap";
import type { RideStreams } from "./intervals";
import { parseFit } from "./native/fit";
import { formatClock, formatPace, parsePace, stepsPerMinute } from "./pace";
import {
  bestOfCurves,
  bestsAmong,
  bestTimes,
  estimateThreshold,
  fadeOf,
  fadeProfile,
  fadeVerdict,
  kmSplits,
  paceZones,
  RUN_DUR,
  runLoad,
  runMetrics,
  runSummary,
  summaryRunLoad,
  thresholdTrend,
  withRunThreshold,
  zoneIndex,
} from "./run-metrics";

/** `secs` seconds at `v` m/s on a constant grade, with or without heart rate. */
const run = (secs: number, v: number, grade = 0, hr: number | null = 150): RideStreams => ({
  time: Array.from({ length: secs }, (_, i) => i),
  distance: Array.from({ length: secs }, (_, i) => i * v),
  altitude: Array.from({ length: secs }, (_, i) => 100 + i * v * grade),
  watts: Array.from({ length: secs }, () => null),
  heartrate: Array.from({ length: secs }, () => hr),
  cadence: Array.from({ length: secs }, () => 85),
  lat: [],
  lng: [],
});

describe("pace", () => {
  it("shows and reads min/km", () => {
    expect(formatPace(1000 / 272)).toBe("4:32");
    expect(formatPace(null)).toBe("–");
    expect(parsePace("4:32")).toBeCloseTo(1000 / 272);
    expect(parsePace("4.05/km")).toBeCloseTo(1000 / 245);
    expect(parsePace("nonsense")).toBe(null);
    expect(parsePace("0:30")).toBe(null);
    expect(formatClock(3725)).toBe("1:02:05");
    expect(formatClock(1421)).toBe("23:41");
  });
  it("counts both feet", () => {
    expect(stepsPerMinute(85)).toBe(170);
    expect(stepsPerMinute(172)).toBe(172);
    expect(stepsPerMinute(null)).toBe(null);
  });
});

describe("grade-adjusted pace", () => {
  it("follows Minetti's cost curve", () => {
    expect(runningCost(0)).toBeCloseTo(3.6);
    expect(gapFactor(0)).toBe(1);
    expect(gapFactor(0.1)).toBeCloseTo(1.658, 2);
    expect(gapFactor(-0.1)).toBeCloseTo(0.598, 2);
    expect(gapFactor(0.9)).toBe(gapFactor(0.45));
  });
  it("adjusts uphill, not the flat", () => {
    const flat = gapStreams(run(600, 3));
    expect(flat.gap[300]).toBeCloseTo(3);
    const up = gapStreams(run(600, 3, 0.1));
    expect(up.gap[300]).toBeCloseTo(3 * gapFactor(0.1), 1);
    expect(up.gapDistance).toBeGreaterThan(599 * 3 * 1.6);
  });
  it("treats a run with no altitude as flat", () => {
    const s = { ...run(120, 3), altitude: [] };
    expect(gradeStream(s).every((g) => g === 0)).toBe(true);
    expect(gapStreams(s).gap[60]).toBeCloseTo(3);
    const zeros = { ...run(120, 3), altitude: run(120, 3).altitude.map(() => 0) };
    expect(gapStreams(zeros).gap[60]).toBeCloseTo(3);
  });
});

describe("run summary", () => {
  it("finds the fastest stretch over a distance anywhere in the run", () => {
    // 1 km slow, 1 km fast, 1 km slow.
    const time: number[] = [0];
    const dist: number[] = [0];
    for (const [km, v] of [
      [1, 2.5],
      [1, 5],
      [1, 2.5],
    ] as const)
      for (let d = 0; d < km * 1000; d += v) {
        dist.push(dist.at(-1)! + v);
        time.push(time.at(-1)! + 1);
      }
    const [best, tooLong] = bestTimes(dist, time, [1000, 5000]);
    expect(best).toBeCloseTo(200, -1);
    expect(tooLong).toBe(null);
  });
  it("measures fade after work done, and only when reached", () => {
    const fade = fadeOf(Array.from({ length: 7200 }, (_, i) => (i < 5000 ? 3 : 2.5)));
    expect(fade[0][0]).toBeCloseTo(3);
    expect(fade[15][0]).toBeCloseTo(2.5);
    expect(fade[35]).toEqual([null, null]);
  });
  it("sums up a steady run", () => {
    const s = runSummary(run(3600, 3));
    expect(s.gapCurve[RUN_DUR.indexOf(1200)]).toBeCloseTo(3, 1);
    expect(s.ngp).toBeCloseTo(3, 1);
    expect(s.drift).toBeCloseTo(0, 0);
    expect(s.gapCurve.at(-1)).toBe(null);
    expect(s.bests[0]).toBeCloseTo(333, -1);
    expect(s.bests[2]).toBeCloseTo(3333, -1);
    expect(runSummary(run(3600, 3, 0, null)).drift).toBe(null);
  });
  it("puts easy running in low zones", () => {
    const s = runSummary(run(1000, 3));
    const z = paceZones(s, 4);
    expect(z[0]).toBeGreaterThan(900); // 75% of threshold
    expect(paceZones(s, 2.8)[3]).toBe(0);
    expect(paceZones(s, 2.8)[5]).toBeGreaterThan(900); // 107%
  });
});

describe("km splits", () => {
  it("gives a row per kilometre and a partial last one", () => {
    const rows = kmSplits(run(1001, 2.5));
    expect(rows.map((r) => r.metres)).toEqual([1000, 1000, 500]);
    expect(rows[0]!.speed).toBeCloseTo(2.5, 2);
    expect(rows[0]!.hr).toBe(150);
  });

  it("leaves out a tail too short to have a pace", () => {
    expect(kmSplits(run(410, 2.5)).length).toBe(1);
  });

  it("measures the net climb and the harder grade-adjusted pace uphill", () => {
    const [up] = kmSplits(run(500, 2.5, 0.05));
    expect(up!.climb).toBe(50);
    expect(up!.gap!).toBeGreaterThan(up!.speed!);
  });

  it("doesn't count a stop against the pace", () => {
    const s = run(401, 2.5);
    const stopped: RideStreams = {
      ...s,
      time: [...s.time.slice(0, 200), ...s.time.slice(200).map((t) => t + 300)],
      heartrate: s.heartrate,
    };
    expect(kmSplits(stopped)[0]!.speed).toBeCloseTo(2.5, 1);
  });

  it("leaves heart rate and altitude empty when they weren't recorded", () => {
    const s = { ...run(500, 2.5, 0, null), altitude: Array.from({ length: 500 }, () => 0) };
    const [row] = kmSplits(s);
    expect(row!.hr).toBeNull();
    expect(row!.climb).toBeNull();
  });

  it("has nothing to show without a track", () => {
    expect(kmSplits(run(1, 2.5))).toEqual([]);
  });
});

describe("zone index", () => {
  it("finds the zone, with anything past the end in the last", () => {
    expect(zoneIndex(1, [2, 4])).toBe(0);
    expect(zoneIndex(2, [2, 4])).toBe(0);
    expect(zoneIndex(3, [2, 4])).toBe(1);
    expect(zoneIndex(9, [2, 4])).toBe(1);
  });
});

describe("run load", () => {
  it("is 100 for an hour at threshold", () => {
    expect(runLoad(3600, 3.5, 3.5)).toBeCloseTo(100);
  });
  it("counts a run with no heart rate, given a threshold", () => {
    const m = runMetrics(run(3600, 3, 0, null), { thresholdSpeed: 3.5, lthr: null });
    expect(m.icu_training_load).toBeCloseTo(73, -1);
    expect(m.icu_intensity).toBeCloseTo(85.7, 0);
    expect(m.zoneTimes.reduce((a, b) => a + b, 0)).toBeGreaterThan(3500);
  });
  it("falls back to heart rate, then to nothing", () => {
    expect(
      runMetrics(run(3600, 3), { thresholdSpeed: null, lthr: 165 }).icu_training_load,
    ).toBeGreaterThan(70);
    expect(
      runMetrics(run(3600, 3, 0, null), { thresholdSpeed: null, lthr: null }).icu_training_load,
    ).toBe(null);
  });
  it("ignores running power", () => {
    const m = runMetrics(
      { ...run(1800, 3), watts: Array.from({ length: 1800 }, () => 280) },
      { thresholdSpeed: 3.5, lthr: null },
    );
    expect(m.icu_average_watts).toBe(null);
    expect(m.curve).toEqual([]);
    expect(m.icu_ftp).toBe(null);
  });
  it("keeps a slow steep hike moving", () => {
    expect(
      runMetrics(run(600, 0.4, 0.25), { thresholdSpeed: 3, lthr: null }).moving_time,
    ).toBeGreaterThan(590);
  });
  it("recomputes from the summary alone", () => {
    const r = runMetrics(run(3600, 3, 0, null), { thresholdSpeed: null, lthr: null });
    const next = withRunThreshold(r, r.run, 3);
    expect(next.icu_training_load).toBeCloseTo(100, -1);
    expect(withRunThreshold(r, r.run, null)).toBe(r);
  });
  it("estimates from summary numbers when that's all there is", () => {
    expect(summaryRunLoad(3600, 3, 3)).toBe(100);
    expect(summaryRunLoad(3600, null, 3)).toBe(null);
    expect(summaryRunLoad(3600, 3, null)).toBe(null);
  });
});

describe("threshold pace", () => {
  it("fits critical speed from hard efforts", () => {
    const cs = 3.6;
    const dPrime = 180;
    const curve = RUN_DUR.map((t) => cs + dPrime / t);
    const fit = estimateThreshold(curve)!;
    expect(fit.speed).toBeCloseTo(cs, 3);
    expect(fit.dPrime).toBeCloseTo(dPrime, 0);
  });
  it("falls back to the best 20 minutes", () => {
    const curve = RUN_DUR.map((t) => (t <= 1200 ? 3 : null));
    // All efforts alike: distance grows linearly with no D′ to speak of.
    const fit = estimateThreshold(curve)!;
    expect(fit.speed).toBeCloseTo(2.85, 2);
    expect(fit.cs).toBe(null);
  });
  it("needs long enough efforts and a plausible speed", () => {
    expect(estimateThreshold(RUN_DUR.map((t) => (t < 180 ? 3 : null)))).toBe(null);
    expect(estimateThreshold(RUN_DUR.map(() => 0.5))).toBe(null);
  });
  it("takes the best of many runs", () => {
    expect(
      bestOfCurves([
        [3, null],
        [2, 4],
      ]).slice(0, 2),
    ).toEqual([3, 4]);
  });
});

describe("a real run file", () => {
  it("reads the sample run, which has no heart rate", async () => {
    const buf = readFileSync("Docs/Corsa_serale.fit");
    const parsed = await parseFit(
      buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer,
      "Corsa_serale.fit",
    );
    const m = runMetrics(parsed.streams, { thresholdSpeed: 3.2, lthr: null });
    expect(m.distance).toBeGreaterThan(1000);
    expect(m.icu_training_load).toBeGreaterThan(0);
    expect(m.run.gap).toBeGreaterThan(1);
    expect(m.run.gap).toBeLessThan(7);
    expect(m.average_heartrate).toBe(null);
  });
});

describe("run analysis", () => {
  it("compares late pace with fresh", () => {
    const f = fadeProfile([
      { 0: [4, 3.8], 15: [3.8, 3.6], 25: [3.4, 3.2], 35: [null, null] },
      { 0: [3.5, 3.4], 15: [3.5, null], 25: [null, null], 35: [null, null] },
    ]);
    expect(f.best[0]).toEqual([4, 3.8]);
    expect(f.drop[25][0]).toBeCloseTo(15);
    expect(f.drop[35][0]).toBe(null);
    expect(f.reached[15]).toBe(1);
    expect(fadeVerdict(f)).toBe("fades");
  });
  it("says nothing about fade before any run got there", () => {
    const f = fadeProfile([{ 0: [4, 3.8], 15: [null, null], 25: [null, null], 35: [null, null] }]);
    expect(fadeVerdict(f)).toBe(null);
  });
  it("finds the run behind each best time", () => {
    const b = bestsAmong([
      { id: "a", bests: [240, 1300, null, null, null] },
      { id: "b", bests: [230, 1350, 2800, null, null] },
    ]);
    expect(b[0]).toEqual({ secs: 230, id: "b" });
    expect(b[1]).toEqual({ secs: 1300, id: "a" });
    expect(b[3]).toBe(null);
  });
  it("trends the threshold over the weeks", () => {
    const curve = RUN_DUR.map((t) => 3.6 + 180 / t);
    const trend = thresholdTrend([{ date: "2026-10-01", curve }], "2026-10-20", 4);
    expect(trend.length).toBe(3);
    expect(trend.at(-1)!.speed).toBeCloseTo(3.6);
  });
});
