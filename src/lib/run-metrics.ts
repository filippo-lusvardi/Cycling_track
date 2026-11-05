// What a run tells: pace and grade-adjusted curves, best times over the usual distances, drift and late fade, plus the
// training load and zones that follow from a threshold pace. Everything a run's streams give is summarised once, in a
// form that doesn't depend on the threshold, so a new threshold never has to read the streams again. Pure.
import { decoupling, fitCriticalPower, mmp } from "./analysis";
import { gapStreams } from "./gap";
import { t } from "./i18n";
import type { RideStreams } from "./intervals";
import { normalizedPower, rideMetrics, type FileTotals, type RideMetrics } from "./metrics";
import { addDays } from "./training";

/** Efforts compared on the pace curve (s). GPS pace is too unsteady for less than 30 s. */
export const RUN_DUR = [
  30, 45, 60, 90, 120, 180, 240, 300, 420, 600, 900, 1200, 1800, 2400, 3600, 5400, 7200, 10800,
  14400,
];
/** Distances with a best time (m). */
export const BEST_DISTANCES = [1000, 5000, 10000, 21097, 42195];
export const BEST_LABEL = ["1 km", "5 km", "10 km", "21.1 km", "42.2 km"];
/** Late-run fade: kilometres of flat-equivalent running already done, and the efforts (s) compared after them. */
export const FADE_KM = [0, 15, 25, 35] as const;
export const FADE_EFFORTS = [300, 1200] as const;
export type FadeKm = (typeof FADE_KM)[number];
export type RunFade = Record<FadeKm, (number | null)[]>;

/** Under this a sample is standing still (m/s). A very steep hike is about 0.4. */
export const RUN_MOVING_SPEED = 0.3;

const SPEED_BIN = 0.1;
const HR_BIN = 2;

export type RunSummary = {
  /** Best pace over each RUN_DUR (m/s), null where the run is shorter. */
  paceCurve: (number | null)[];
  /** Best grade-adjusted pace over each RUN_DUR (m/s). */
  gapCurve: (number | null)[];
  /** Fastest time over each BEST_DISTANCES (s). */
  bests: (number | null)[];
  /** Normalized grade-adjusted speed (m/s): what the load is worked out from. */
  ngp: number | null;
  /** Average grade-adjusted speed while moving (m/s). */
  gap: number | null;
  /** Metres of flat running that would have cost the same. */
  gapDistance: number;
  /** Pa:HR, % (null without heart rate or under 20 min). */
  drift: number | null;
  /** Best grade-adjusted speed per effort after each amount of work. */
  fade: RunFade;
  /** Seconds at each grade-adjusted speed (0.1 m/s bins), to get zones for any threshold. */
  gapHist: number[];
  /** Seconds at each heart rate (2 bpm bins). */
  hrHist: number[];
};

const round3 = (v: number | null) => (v != null ? Math.round(v * 1000) / 1000 : null);

function histogram(values: (number | null)[], bin: number): number[] {
  const out: number[] = [];
  for (const v of values) {
    if (v == null || v <= 0) continue;
    const i = Math.floor(v / bin);
    while (out.length <= i) out.push(0);
    out[i]!++;
  }
  return out;
}

/** Fastest time over each distance, start anywhere: two pointers along the run. */
export function bestTimes(
  distance: number[],
  time: number[],
  targets: number[] = BEST_DISTANCES,
): (number | null)[] {
  return targets.map((target) => {
    let best: number | null = null;
    let lo = 0;
    for (let hi = 0; hi < distance.length; hi++) {
      if (distance[hi]! - distance[lo]! < target) continue;
      while (distance[hi]! - distance[lo + 1]! >= target) lo++;
      const secs = time[hi]! - time[lo]!;
      if (best == null || secs < best) best = secs;
    }
    return best;
  });
}

/** Best efforts once each amount of flat-equivalent running was done. */
export function fadeOf(gap: number[]): RunFade {
  const out = {} as RunFade;
  let metres = 0;
  let i = 0;
  for (const km of FADE_KM) {
    while (i < gap.length && metres / 1000 < km) metres += gap[i++]!;
    const after =
      metres / 1000 >= km ? mmp(gap.slice(i), [...FADE_EFFORTS]) : FADE_EFFORTS.map(() => null);
    out[km] = after.map(round3);
  }
  return out;
}

/** Everything a run's 1 Hz streams give, independent of any threshold. */
export function runSummary(
  s: Pick<RideStreams, "time" | "distance" | "altitude" | "heartrate">,
): RunSummary {
  const { speed, gap, gapDistance } = gapStreams(s);
  const moving = gap.filter((_, i) => speed[i]! >= RUN_MOVING_SPEED);
  const hasHr = s.heartrate.some((h) => h != null && h > 0);
  return {
    paceCurve: mmp(speed, RUN_DUR).map(round3),
    gapCurve: mmp(gap, RUN_DUR).map(round3),
    bests: bestTimes(s.distance, s.time),
    ngp: moving.length >= 30 ? round3(normalizedPower(moving)) : null,
    gap: moving.length ? round3(moving.reduce((a, b) => a + b, 0) / moving.length) : null,
    gapDistance: Math.round(gapDistance),
    drift: hasHr ? decoupling(gap, s.heartrate) : null,
    fade: fadeOf(gap),
    gapHist: histogram(moving, SPEED_BIN),
    hrHist: histogram(s.heartrate, HR_BIN),
  };
}

/** Zone tops as % of threshold speed (the last is open): 7 zones like the power and heart-rate ones. */
export const PACE_ZONE_PCT = [78, 88, 94, 100, 103, 111, 999];

/** Which zone a value falls in, from 0; `tops` are each zone's upper bound. */
export function zoneIndex(v: number, tops: number[]): number {
  const z = tops.findIndex((top) => v <= top);
  return z < 0 ? tops.length - 1 : z;
}

/** Seconds in each zone from a histogram; `tops` are each zone's upper bound. */
export function zonesFromHist(hist: number[], bin: number, tops: number[]): number[] {
  const out = tops.map(() => 0);
  hist.forEach((secs, i) => {
    const v = (i + 0.5) * bin;
    out[zoneIndex(v, tops)]! += secs;
  });
  return out;
}

export const paceZoneTops = (threshold: number, pct?: number[] | null) =>
  (pct ?? PACE_ZONE_PCT).map((p) => (threshold * p) / 100);

/** Seconds in each pace zone, on grade-adjusted speed. */
export const paceZones = (
  s: Pick<RunSummary, "gapHist">,
  threshold: number,
  pct?: number[] | null,
) => zonesFromHist(s.gapHist, SPEED_BIN, paceZoneTops(threshold, pct));

/** Seconds in each heart-rate zone. */
export const hrZones = (s: Pick<RunSummary, "hrHist">, tops: number[]) =>
  zonesFromHist(s.hrHist, HR_BIN, tops);

/** A last stretch shorter than this (m) gives no meaningful pace, so it isn't a split. */
const MIN_SPLIT = 50;

export type KmSplit = {
  /** Metres moved in this split: about 1000, less for the last one. */
  metres: number;
  /** Pace while moving (m/s). */
  speed: number | null;
  /** Grade-adjusted pace while moving (m/s), what zones are measured on. */
  gap: number | null;
  /** Net change in altitude (m), null without altitude. */
  climb: number | null;
  /** Average heart rate while moving, null without heart rate. */
  hr: number | null;
};

/** One entry per kilometre, in order, the last one partial. Stops count for neither time nor distance. */
export function kmSplits(
  s: Pick<RideStreams, "time" | "distance" | "altitude" | "heartrate">,
): KmSplit[] {
  const n = s.distance.length;
  if (n < 2) return [];
  const { speed, gap } = gapStreams(s);
  const hasAltitude = s.altitude.some((a) => a != null && a !== 0);
  const altitudeAt = (i: number) => (hasAltitude ? (s.altitude[i] ?? null) : null);
  const out: KmSplit[] = [];
  let [metres, secs, gapMetres, hrSum, hrCount] = [0, 0, 0, 0, 0];
  let firstAltitude = altitudeAt(0);
  let lastAltitude = firstAltitude;
  let km = 1;
  const close = () => {
    out.push({
      metres: Math.round(metres),
      speed: secs ? round3(metres / secs) : null,
      gap: secs ? round3(gapMetres / secs) : null,
      climb:
        firstAltitude != null && lastAltitude != null
          ? Math.round(lastAltitude - firstAltitude)
          : null,
      hr: hrCount ? Math.round(hrSum / hrCount) : null,
    });
    [metres, secs, gapMetres, hrSum, hrCount] = [0, 0, 0, 0, 0];
    firstAltitude = lastAltitude;
  };
  for (let i = 1; i < n; i++) {
    lastAltitude = altitudeAt(i) ?? lastAltitude;
    firstAltitude ??= lastAltitude;
    if (speed[i]! >= RUN_MOVING_SPEED) {
      const dt = s.time[i]! - s.time[i - 1]!;
      metres += speed[i]! * dt;
      secs += dt;
      gapMetres += gap[i]! * dt;
      const h = s.heartrate[i];
      if (h != null && h > 0) {
        hrSum += h;
        hrCount++;
      }
    }
    if (s.distance[i]! - s.distance[0]! >= km * 1000) {
      close();
      km++;
    }
  }
  if (metres >= MIN_SPLIT) close();
  return out;
}

/** Training load: an hour at threshold pace is 100, as with power. */
export const runLoad = (movingSecs: number, speed: number, threshold: number) =>
  (movingSecs / 3600) * (speed / threshold) ** 2 * 100;

export type RunThresholds = {
  thresholdSpeed: number | null;
  lthr: number | null;
  /** Zone tops set by hand, as % of threshold; missing means the standard ones. */
  hrPct?: number[] | null | undefined;
  pacePct?: number[] | null | undefined;
};

export type RunMetrics = RideMetrics & { run: RunSummary };

/** A run's numbers. Load follows pace when there's a threshold, else heart rate; running power isn't used. */
export function runMetrics(s: RideStreams, th: RunThresholds, file?: FileTotals): RunMetrics {
  const base = rideMetrics(
    { ...s, watts: s.watts.map(() => null) },
    { ftp: null, lthr: th.lthr, hrPct: th.hrPct },
    file,
    RUN_MOVING_SPEED,
  );
  const run = runSummary(s);
  const out: RunMetrics = { ...base, decoupling: run.drift, run };
  return withRunThreshold(out, run, th.thresholdSpeed, th.pacePct);
}

/** Load, intensity and zones from a run's summary and a threshold (from stored numbers, without its streams). */
export function withRunThreshold<
  T extends {
    moving_time: number | null;
    icu_training_load: number | null;
    icu_intensity: number | null;
    zoneTimes: number[];
  },
>(m: T, run: RunSummary, threshold: number | null, pct?: number[] | null): T {
  if (!threshold || !run.ngp || !m.moving_time) return m;
  return {
    ...m,
    icu_training_load: Math.round(runLoad(m.moving_time, run.ngp, threshold)),
    icu_intensity: Math.round((run.ngp / threshold) * 1000) / 10,
    zoneTimes: paceZones(run, threshold, pct),
  };
}

/** The fastest value per duration across several curves. */
export function bestOfCurves(curves: (number | null)[][]): (number | null)[] {
  return RUN_DUR.map((_, i) => {
    let best: number | null = null;
    for (const c of curves) {
      const v = c[i];
      if (v != null && (best == null || v > best)) best = v;
    }
    return best;
  });
}

/** Weeks of a year, each with the threshold pace of the 90 days up to it. */
export function thresholdTrend(
  runs: { date: string; curve: (number | null)[] }[],
  today: string,
  weeks = 52,
): { date: string; speed: number }[] {
  const out: { date: string; speed: number }[] = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const date = addDays(today, -7 * w);
    const since = addDays(date, -90);
    const curves = runs.filter((r) => r.date > since && r.date <= date).map((r) => r.curve);
    const fit = curves.length ? estimateThreshold(bestOfCurves(curves)) : null;
    if (fit) out.push({ date, speed: fit.speed });
  }
  return out;
}

export type ThresholdFit = {
  /** Threshold speed (m/s). */
  speed: number;
  /** Critical speed and D′ (m), when the efforts allow fitting them. */
  cs: number | null;
  dPrime: number | null;
};

/**
 * Threshold pace from a grade-adjusted curve: critical speed from the 3–20 minute efforts (distance = CS·t + D′), else
 * 95% of the best 20 minutes. Null without efforts that long, or if the result isn't a plausible running speed.
 */
export function estimateThreshold(curve: (number | null)[]): ThresholdFit | null {
  const fit = fitCriticalPower(RUN_DUR.map((secs, i) => ({ secs, watts: curve[i] ?? 0 })));
  const plausible = (v: number) => v >= 1.2 && v <= 7;
  // A D′ of almost nothing means no hard efforts to fit: every duration at one steady pace.
  if (fit && fit.r2 > 0.9 && fit.wPrime >= 20 && plausible(fit.cp))
    return { speed: fit.cp, cs: fit.cp, dPrime: fit.wPrime };
  const twenty = curve[RUN_DUR.indexOf(1200)];
  return twenty && plausible(twenty * 0.95)
    ? { speed: twenty * 0.95, cs: null, dPrime: null }
    : null;
}

/**
 * A summary-only estimate for a run with no load of its own (intervals.icu sets none without a threshold pace or heart
 * rate there): average speed against the threshold. Slightly low on hills and intervals.
 */
export const summaryRunLoad = (
  movingSecs: number | null,
  speed: number | null,
  threshold: number | null,
) => (movingSecs && speed && threshold ? Math.round(runLoad(movingSecs, speed, threshold)) : null);

export const RUN_ZONE_NAMES = [
  t("Recovery", "Recupero"),
  t("Endurance", "Fondo"),
  "Tempo",
  t("Threshold", "Soglia"),
  t("Above threshold", "Sopra soglia"),
  "VO2max",
  t("Anaerobic", "Anaerobico"),
];

export type FadeProfile = {
  /** Best speed per amount of work done (rows) and effort (columns), across the runs. */
  best: RunFade;
  /** Drop from fresh in %, per row and effort (positive = slower). */
  drop: RunFade;
  /** Runs that got past each amount of work with a 20 min effort still to measure. */
  reached: Record<FadeKm, number>;
  runs: number;
};

/** Best of every run per amount of work, and how far each sits under the fresh best. */
export function fadeProfile(fades: RunFade[]): FadeProfile {
  const best = {} as RunFade;
  const drop = {} as RunFade;
  const reached = {} as Record<FadeKm, number>;
  for (const km of FADE_KM) {
    best[km] = FADE_EFFORTS.map((_, k) => {
      const v = fades.map((f) => f[km][k]).filter((x): x is number => x != null && x > 0);
      return v.length ? Math.max(...v) : null;
    });
    reached[km] = fades.filter((f) => f[km][1] != null).length;
  }
  for (const km of FADE_KM)
    drop[km] = FADE_EFFORTS.map((_, k) => {
      const [fresh, v] = [best[0][k], best[km][k]];
      return fresh && v != null ? ((fresh - v) / fresh) * 100 : null;
    });
  return { best, drop, reached, runs: fades.length };
}

export type FadeVerdict = "strong" | "average" | "fades";

/** The 5 min drop after 25 km (15 km if none got that far): under 5% holds well, over 10% fades. */
export function fadeVerdict(p: FadeProfile): FadeVerdict | null {
  const d = p.drop[25][0] ?? p.drop[15][0];
  if (d == null) return null;
  return d < 5 ? "strong" : d <= 10 ? "average" : "fades";
}

/** The fastest time per distance among runs, with the run that set it. */
export function bestsAmong<T extends { id: string; bests: (number | null)[] }>(runs: T[]) {
  return BEST_DISTANCES.map((_, i) => {
    let best: { secs: number; id: string } | null = null;
    for (const r of runs) {
      const v = r.bests[i];
      if (v != null && (!best || v < best.secs)) best = { secs: v, id: r.id };
    }
    return best;
  });
}
