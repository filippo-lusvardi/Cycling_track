// Ghost race: two efforts on the same segment replayed on a shared clock. Pure and browser-safe.
import type { Attempt, TrackLike } from "./segments";

/** One effort as time (s) and distance (m) from its start, with its positions. */
export type EffortSeries = { t: number[]; d: number[]; lat: number[]; lng: number[] };

export function effortSeries(track: TrackLike, a: Pick<Attempt, "i0" | "i1">): EffortSeries {
  const t0 = track.time[a.i0]!;
  const d0 = track.dist[a.i0]!;
  return {
    t: track.time.slice(a.i0, a.i1 + 1).map((v) => v - t0),
    d: track.dist.slice(a.i0, a.i1 + 1).map((v) => v - d0),
    lat: track.lat.slice(a.i0, a.i1 + 1),
    lng: track.lng.slice(a.i0, a.i1 + 1),
  };
}

export const duration = (s: EffortSeries) => s.t.at(-1) ?? 0;

/** Index k with xs[k] <= x < xs[k + 1] (xs ascending), clamped to the ends. */
function bracket(xs: number[], x: number): number {
  let lo = 0, hi = xs.length - 1;
  if (x <= xs[0]!) return 0;
  if (x >= xs[hi]!) return Math.max(0, hi - 1);
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (xs[mid]! <= x) lo = mid;
    else hi = mid;
  }
  return lo;
}

const lerp = (a: number, b: number, f: number) => a + (b - a) * f;

/** Where the rider was `t` seconds into the effort (stays at the finish once done). */
export function atTime(s: EffortSeries, t: number): { d: number; lat: number; lng: number } {
  if (s.t.length < 2) return { d: s.d[0] ?? 0, lat: s.lat[0] ?? 0, lng: s.lng[0] ?? 0 };
  const tc = Math.min(Math.max(t, 0), duration(s));
  const k = bracket(s.t, tc);
  const span = s.t[k + 1]! - s.t[k]!;
  const f = span > 0 ? (tc - s.t[k]!) / span : 0;
  return { d: lerp(s.d[k]!, s.d[k + 1]!, f), lat: lerp(s.lat[k]!, s.lat[k + 1]!, f), lng: lerp(s.lng[k]!, s.lng[k + 1]!, f) };
}

/** Seconds into the effort when the rider reached distance `d` (m from the start). */
export function timeAtDist(s: EffortSeries, d: number): number {
  if (s.d.length < 2) return 0;
  const k = bracket(s.d, d);
  const span = s.d[k + 1]! - s.d[k]!;
  const f = span > 0 ? Math.min(1, Math.max(0, (d - s.d[k]!) / span)) : 0;
  return lerp(s.t[k]!, s.t[k + 1]!, f);
}

/** Time gap of b behind a (s; negative = b ahead) every `step` metres along the shorter of the two. */
export function gapSeries(a: EffortSeries, b: EffortSeries, step = 50): { d: number; gap: number }[] {
  const end = Math.min(a.d.at(-1) ?? 0, b.d.at(-1) ?? 0);
  const out: { d: number; gap: number }[] = [];
  for (let d = 0; d < end; d += step) out.push({ d, gap: timeAtDist(b, d) - timeAtDist(a, d) });
  if (end > 0) out.push({ d: end, gap: timeAtDist(b, end) - timeAtDist(a, end) });
  return out;
}
