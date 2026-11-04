// What intervals.icu computes for an account, done by Cirmolo for rides it stores itself (uploaded ride files):
// per-ride load, intensity, zones and power curve, and day-by-day fitness and fatigue. Pure functions.
import { DUR, decoupling, fitCriticalPower, mmp } from "./analysis";
import type { RideStreams } from "./intervals";
import { addDays } from "./training";

type Num = number | null;

/** Samples at any rate (time in s from the start) → one per second; gaps longer than `maxGap` s stay empty (a stop). */
export function toOneHz(s: RideStreams, maxGap = 10): RideStreams {
  const n = s.time.length;
  const out: RideStreams = {
    time: [],
    distance: [],
    altitude: [],
    watts: [],
    heartrate: [],
    cadence: [],
    lat: [],
    lng: [],
  };
  if (!n) return out;
  const t0 = s.time[0]!;
  const last = Math.round(s.time[n - 1]! - t0);
  let j = 0;
  for (let sec = 0; sec <= last; sec++) {
    while (j + 1 < n && s.time[j + 1]! - t0 <= sec) j++;
    const gap = sec - (s.time[j]! - t0);
    const keep = gap <= maxGap;
    const at = <T>(a: T[]) => (a.length ? a[j] : undefined);
    out.time.push(sec);
    // Along the way between two samples: holding it would read as stopping and then jumping.
    const d = at(s.distance);
    const dNext = s.distance[j + 1];
    const span = j + 1 < n ? s.time[j + 1]! - s.time[j]! : 0;
    out.distance.push(
      d != null && dNext != null && span > 0 && span <= maxGap
        ? d + ((dNext - d) * gap) / span
        : (d ?? out.distance.at(-1) ?? 0),
    );
    out.altitude.push(at(s.altitude) ?? out.altitude.at(-1) ?? 0);
    out.watts.push(keep ? (at(s.watts) ?? null) : null);
    out.heartrate.push(keep ? (at(s.heartrate) ?? null) : null);
    out.cadence.push(keep ? (at(s.cadence) ?? null) : null);
    if (s.lat.length) {
      out.lat.push(at(s.lat) ?? out.lat.at(-1) ?? 0);
      out.lng.push(at(s.lng) ?? out.lng.at(-1) ?? 0);
    }
  }
  return out;
}

/** Normalized power: the 4th-power mean of the 30 s rolling average (Coggan). */
export function normalizedPower(watts: Num[]): number | null {
  if (watts.length < 30 || !watts.some((w) => w != null && w > 0)) return null;
  let sum = 0;
  let acc = 0;
  let n = 0;
  for (let i = 0; i < watts.length; i++) {
    sum += watts[i] ?? 0;
    if (i >= 30) sum -= watts[i - 30] ?? 0;
    if (i >= 29) {
      acc += (sum / 30) ** 4;
      n++;
    }
  }
  return (acc / n) ** 0.25;
}

/** Seconds in each zone, lowest first; `tops` are each zone's upper bound (the last one open-ended). */
export function zoneTimes(values: Num[], tops: number[]): number[] {
  const out = tops.map(() => 0);
  if (!tops.length) return out;
  for (const v of values) {
    if (v == null || v <= 0) continue;
    const i = tops.findIndex((top) => v <= top);
    out[i < 0 ? tops.length - 1 : i]!++;
  }
  return out;
}

/** intervals.icu's default 7 power zones, as % of FTP (zone tops; Z7 is open). */
export const POWER_ZONE_PCT = [55, 75, 90, 105, 120, 150, 999];
/** Friel's 7 heart-rate zones as % of threshold heart rate (zone tops; the last is open). */
export const HR_ZONE_PCT = [81, 89, 93, 99, 102, 106, 999];

export type Thresholds = { ftp: number | null; lthr: number | null };

export const powerZoneTops = (ftp: number | null) =>
  ftp ? POWER_ZONE_PCT.map((p) => Math.round((ftp * p) / 100)) : [];
export const hrZoneTops = (lthr: number | null) =>
  lthr ? HR_ZONE_PCT.map((p) => Math.round((lthr * p) / 100)) : [];

const mean = (xs: Num[]) => {
  let s = 0,
    c = 0;
  for (const x of xs)
    if (x != null && x > 0) {
      s += x;
      c++;
    }
  return c ? s / c : null;
};

export type RideMetrics = {
  moving_time: number;
  distance: number;
  total_elevation_gain: number;
  average_speed: number | null;
  max_speed: number | null;
  icu_average_watts: number | null;
  icu_weighted_avg_watts: number | null;
  icu_intensity: number | null;
  icu_training_load: number | null;
  icu_ftp: number | null;
  joules: number | null;
  average_heartrate: number | null;
  max_heartrate: number | null;
  average_cadence: number | null;
  zoneTimes: number[];
  decoupling: number | null;
  /** Mean-maximal power at each of analysis.ts's DUR durations (null where the ride is shorter). */
  curve: (number | null)[];
};

/** The summary a ride file carries: the device's own numbers, trusted over what the streams would add up to. */
export type FileTotals = {
  moving: number | null;
  distance: number | null;
  ascent: number | null;
};

/**
 * Everything the app reads off a ride, from 1 Hz streams. Load is TSS from power when there's an FTP, else an
 * hrTSS-style load from heart rate against threshold heart rate; zones follow power, else heart rate.
 */
export function rideMetrics(s: RideStreams, th: Thresholds, file?: FileTotals): RideMetrics {
  const n = s.time.length;
  const dist = file?.distance ?? s.distance.at(-1) ?? 0;
  // Moving: seconds where the distance advanced (or power/cadence say you were pedalling, on a trainer).
  let moving = 0;
  let maxSpeed = 0;
  let gain = 0;
  let alt = s.altitude[0] ?? 0;
  for (let i = 1; i < n; i++) {
    const v = (s.distance[i] ?? 0) - (s.distance[i - 1] ?? 0);
    if (v > 0.5 || (s.watts[i] ?? 0) > 0 || (s.cadence[i] ?? 0) > 0) moving++;
    // Over 5 s, as Strava and Garmin report it: second by second, GPS jumps read as sprints.
    if (i >= 5)
      maxSpeed = Math.max(maxSpeed, ((s.distance[i] ?? 0) - (s.distance[i - 5] ?? 0)) / 5);
    // Climbing counted in 2 m steps, so GPS/barometer jitter doesn't add up to phantom metres.
    const a = s.altitude[i] ?? alt;
    if (a - alt >= 2) {
      gain += a - alt;
      alt = a;
    } else if (alt - a >= 2) alt = a;
  }
  // The file's moving time, unless a timer left running through a stop puts it well past what the streams show.
  if (file?.moving != null && (!moving || file.moving <= moving * 1.1))
    moving = Math.round(file.moving);
  gain = file?.ascent ?? gain;
  const hasPower = s.watts.some((w) => w != null && w > 0);
  const np = hasPower ? normalizedPower(s.watts) : null;
  const avgW = hasPower ? mean(s.watts.map((w) => w ?? 0)) : null;
  const intensity = np && th.ftp ? np / th.ftp : null;
  const avgHr = mean(s.heartrate);
  const hours = moving / 3600;
  const load =
    intensity != null
      ? hours * intensity * intensity * 100
      : avgHr && th.lthr
        ? hours * (avgHr / th.lthr) ** 2 * 100
        : null;
  const tops = hasPower && th.ftp ? powerZoneTops(th.ftp) : hrZoneTops(th.lthr);
  const zoneSource = hasPower && th.ftp ? s.watts : s.heartrate;
  return {
    moving_time: moving,
    distance: dist,
    total_elevation_gain: Math.round(gain),
    average_speed: moving ? dist / moving : null,
    max_speed: maxSpeed || null,
    icu_average_watts: avgW != null ? Math.round(avgW) : null,
    icu_weighted_avg_watts: np != null ? Math.round(np) : null,
    icu_intensity: intensity != null ? Math.round(intensity * 1000) / 10 : null,
    icu_training_load: load != null ? Math.round(load) : null,
    icu_ftp: th.ftp,
    joules: hasPower ? s.watts.reduce<number>((a, w) => a + (w ?? 0), 0) : null,
    average_heartrate: avgHr != null ? Math.round(avgHr) : null,
    max_heartrate: s.heartrate.reduce<number>((a, h) => Math.max(a, h ?? 0), 0) || null,
    average_cadence: mean(s.cadence) != null ? Math.round(mean(s.cadence)!) : null,
    zoneTimes: tops.length ? zoneTimes(zoneSource, tops) : [0, 0, 0, 0, 0, 0, 0],
    decoupling: hasPower ? decoupling(s.watts, s.heartrate) : null,
    curve: hasPower ? mmp(s.watts, DUR).map((w) => (w != null ? Math.round(w) : null)) : [],
  };
}

/** Training load from average power or heart rate alone, for rides with only summary numbers (no streams yet). */
export function summaryLoad(
  movingSecs: number,
  np: number | null,
  avgHr: number | null,
  th: Thresholds,
): number | null {
  const hours = movingSecs / 3600;
  if (np && th.ftp) return Math.round(hours * (np / th.ftp) ** 2 * 100);
  if (avgHr && th.lthr) return Math.round(hours * (avgHr / th.lthr) ** 2 * 100);
  return null;
}

const CTL_DAYS = 42;
const ATL_DAYS = 7;

export type FitnessDay = { ctl: number; atl: number; rampRate: number };

/**
 * Fitness (CTL) and fatigue (ATL) for each day from `from` to `to`, as intervals.icu computes them: exponentially
 * weighted averages of daily load over 42 and 7 days, starting from zero on the first day with any load.
 */
export function fitnessSeries(
  loads: Map<string, number>,
  from: string,
  to: string,
): Map<string, FitnessDay> {
  const out = new Map<string, FitnessDay>();
  const days = [...loads.keys()].sort();
  let d = days[0] && days[0] < from ? days[0] : from;
  let ctl = 0;
  let atl = 0;
  const kc = 1 - Math.exp(-1 / CTL_DAYS);
  const ka = 1 - Math.exp(-1 / ATL_DAYS);
  const history: number[] = [];
  for (; d <= to; d = addDays(d, 1)) {
    const load = loads.get(d) ?? 0;
    ctl += (load - ctl) * kc;
    atl += (load - atl) * ka;
    history.push(ctl);
    if (d >= from) {
      const weekAgo = history.length > 7 ? history[history.length - 8]! : 0;
      out.set(d, {
        ctl: Math.round(ctl * 10) / 10,
        atl: Math.round(atl * 10) / 10,
        rampRate: Math.round((ctl - weekAgo) * 10) / 10,
      });
    }
  }
  return out;
}

/** The best of several rides' power curves (DUR-indexed), duration by duration. */
export function bestCurve(curves: (number | null)[][]): (number | null)[] {
  return DUR.map((_, i) => {
    let best: number | null = null;
    for (const c of curves) {
      const w = c[i];
      if (w != null && (best == null || w > best)) best = w;
    }
    return best;
  });
}

/** Estimated FTP from a power curve: critical power from the 3–20 minute efforts. */
export function estimateFtp(curve: (number | null)[]): number | null {
  const fit = fitCriticalPower(DUR.map((secs, i) => ({ secs, watts: curve[i] ?? 0 })));
  return fit && fit.r2 > 0.9 ? Math.round(fit.cp) : null;
}
