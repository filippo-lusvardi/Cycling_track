// How long a route takes you: the steady-speed model (lib/climb-predict) over every 100 m of it, at an easy outdoor
// power, then corrected by how your own outdoor rides compare with the same model. The correction carries everything
// the model leaves out (stops at junctions, wind, traffic, how you ride descents), so the estimate is yours. Pure.
import { detectClimbs, type Climb } from "../climbs";
import { modelSeconds } from "../climb-predict";
import { gradeChunks } from "../profile";
import type { Line } from "./geo";

export type Rider = {
  /** The power you ride a route at, on average while pedalling. */
  watts: number;
  kg: number;
  /** Your rides against the model: above 1 you take longer than it says. */
  factor: number;
};

/** An easy day out: a share of FTP that the correction then fits to how you actually ride. */
export const EASY_SHARE = 0.62;
const DEFAULT_FTP = 220;
const DEFAULT_KG = 72;
/** Descents: a little pedalling, and no faster than this (m/s, 54 km/h). */
const DESCENT_SHARE = 0.3;
const MAX_SPEED = 15;
const FACTOR = [0.7, 1.6] as const;

export function riderFrom(
  ftp: number | null | undefined,
  kg: number | null | undefined,
  factor = 1,
): Rider {
  return {
    watts: Math.round((ftp && ftp > 50 ? ftp : DEFAULT_FTP) * EASY_SHARE),
    kg: kg && kg > 30 ? kg : DEFAULT_KG,
    factor,
  };
}

/** Speed (m/s) on a grade (fraction), before the correction. */
export function speedOn(grade: number, r: Pick<Rider, "watts" | "kg">): number {
  const watts = grade < -0.02 ? r.watts * DESCENT_SHARE : r.watts;
  const secs = modelSeconds(Math.max(1, watts), r.kg, { length: 100, gain: grade * 100 });
  return Math.min(MAX_SPEED, 100 / secs);
}

/** Seconds from the start at every point of the line. */
export function lineTimes(l: Pick<Line, "dist" | "alt">, r: Rider): number[] {
  const n = l.dist.length;
  const time = new Array<number>(n).fill(0);
  if (n < 2) return time;
  const chunks = gradeChunks(l.dist, l.alt);
  for (const c of chunks) {
    const v = speedOn(c.grade / 100, r) / r.factor;
    for (let i = c.i0 + 1; i <= c.i1; i++)
      time[i] = time[i - 1]! + (l.dist[i]! - l.dist[i - 1]!) / v;
  }
  return time;
}

export const lineSeconds = (l: Pick<Line, "dist" | "alt">, r: Rider) => lineTimes(l, r).at(-1) ?? 0;

/** Moving time of a recorded track: the steps where you were going faster than walking. */
export function movingSeconds(t: { dist: ArrayLike<number>; time: ArrayLike<number> }): number {
  let s = 0;
  for (let i = 1; i < t.dist.length; i++) {
    const dt = t.time[i]! - t.time[i - 1]!;
    const dd = t.dist[i]! - t.dist[i - 1]!;
    if (dt > 0 && dd / dt > 1.5) s += dt;
  }
  return s;
}

const median = (v: number[]) => {
  const s = [...v].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

/** The correction from your recent outdoor rides (their 20 m tracks): the median of moving time over the model's. */
export function calibrate(
  tracks: { dist: ArrayLike<number>; alt: ArrayLike<number>; time: ArrayLike<number> }[],
  r: Pick<Rider, "watts" | "kg">,
): number {
  const seen = tracks.flatMap((t) => {
    const dist = Array.from(t.dist);
    if ((dist.at(-1) ?? 0) < 10_000) return [];
    const model = lineSeconds({ dist, alt: Array.from(t.alt) }, { ...r, factor: 1 });
    const moving = movingSeconds(t);
    return model > 0 && moving > 0 ? [moving / model] : [];
  });
  if (!seen.length) return 1;
  return Math.min(FACTOR[1], Math.max(FACTOR[0], median(seen)));
}

/** How far you go in this time on the flat, and a bit less where the route climbs. */
export function distanceFor(seconds: number, r: Rider, hilly: boolean): number {
  return seconds * (speedOn(0, r) / r.factor) * (hilly ? 0.8 : 1);
}

/** The climbs of a planned line, from its estimated times. */
export function lineClimbs(l: Line, r: Rider): Climb[] {
  return detectClimbs({ distance: l.dist, altitude: l.alt, time: lineTimes(l, r) });
}
