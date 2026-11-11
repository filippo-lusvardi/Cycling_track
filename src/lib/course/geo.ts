// Small geometry for routes: points, lines with distance and altitude, thinning, bounds. Pure.
import { haversine } from "../segments";

export type LatLng = { lat: number; lng: number };

/** A drawn route: positions, altitude (m) and distance from the start (m), all the same length. */
export type Line = { lat: number[]; lng: number[]; alt: number[]; dist: number[] };

export const emptyLine = (): Line => ({ lat: [], lng: [], alt: [], dist: [] });

export const between = (a: LatLng, b: LatLng) => haversine(a.lat, a.lng, b.lat, b.lng);

/** Distances along the points from their positions. */
export function cumulative(lat: number[], lng: number[]): number[] {
  const d: number[] = [];
  let sum = 0;
  for (let i = 0; i < lat.length; i++) {
    if (i) sum += haversine(lat[i - 1]!, lng[i - 1]!, lat[i]!, lng[i]!);
    d.push(sum);
  }
  return d;
}

/** One line after another; a repeated joining point is dropped. */
export function joinLines(parts: Line[]): Line {
  const out = emptyLine();
  for (const p of parts) {
    if (!p.lat.length) continue;
    const skip =
      out.lat.length && between(lastOf(out), { lat: p.lat[0]!, lng: p.lng[0]! }) < 1 ? 1 : 0;
    for (let i = skip; i < p.lat.length; i++) {
      const prev = out.lat.length - 1;
      const step = prev < 0 ? 0 : haversine(out.lat[prev]!, out.lng[prev]!, p.lat[i]!, p.lng[i]!);
      out.lat.push(p.lat[i]!);
      out.lng.push(p.lng[i]!);
      out.alt.push(p.alt[i]!);
      out.dist.push(prev < 0 ? 0 : out.dist[prev]! + step);
    }
  }
  return out;
}

export const lastOf = (l: Pick<Line, "lat" | "lng">): LatLng => ({
  lat: l.lat.at(-1)!,
  lng: l.lng.at(-1)!,
});

/** The line every `step` metres (altitude interpolated), for storing and for the FIT file. */
export function resample(l: Line, step = 20): Line {
  const n = l.dist.length;
  if (n < 2) return { lat: [...l.lat], lng: [...l.lng], alt: [...l.alt], dist: [...l.dist] };
  const out = emptyLine();
  const total = l.dist[n - 1]!;
  let j = 0;
  for (let d = 0; d < total + step; d += step) {
    const at = Math.min(d, total);
    while (j < n - 2 && l.dist[j + 1]! < at) j++;
    const span = l.dist[j + 1]! - l.dist[j]!;
    const f = span > 0 ? Math.min(1, Math.max(0, (at - l.dist[j]!) / span)) : 0;
    out.lat.push(l.lat[j]! + (l.lat[j + 1]! - l.lat[j]!) * f);
    out.lng.push(l.lng[j]! + (l.lng[j + 1]! - l.lng[j]!) * f);
    out.alt.push(l.alt[j]! + (l.alt[j + 1]! - l.alt[j]!) * f);
    out.dist.push(at);
    if (at === total) break;
  }
  return out;
}

/** Points along a path every `step` metres or so, first and last kept: the vias that pin a route to it. */
export function thin(path: LatLng[], step: number): LatLng[] {
  if (path.length <= 2) return [...path];
  const out = [path[0]!];
  let run = 0;
  for (let i = 1; i < path.length - 1; i++) {
    run += between(path[i - 1]!, path[i]!);
    if (run >= step) {
      out.push(path[i]!);
      run = 0;
    }
  }
  const last = path.at(-1)!;
  // A via just before the end only makes a kink.
  if (out.length > 1 && between(out.at(-1)!, last) < step / 3) out.pop();
  out.push(last);
  return out;
}

export const pathLength = (p: LatLng[]) =>
  p.reduce((s, q, i) => (i ? s + between(p[i - 1]!, q) : 0), 0);

/** Metres climbed, with a small dead band so altitude noise on the flat doesn't add up. */
export function gainOf(alt: number[], band = 3): number {
  let gain = 0;
  let ref = alt[0] ?? 0;
  for (const a of alt) {
    if (a > ref + band) {
      gain += a - ref;
      ref = a;
    } else if (a < ref - band) ref = a;
  }
  return gain;
}

export type Bounds = [[number, number], [number, number]];

export function boundsOf(...ps: Pick<Line, "lat" | "lng">[]): Bounds | null {
  let a = Infinity,
    b = Infinity,
    c = -Infinity,
    d = -Infinity;
  for (const p of ps)
    for (let i = 0; i < p.lat.length; i++) {
      a = Math.min(a, p.lat[i]!);
      c = Math.max(c, p.lat[i]!);
      b = Math.min(b, p.lng[i]!);
      d = Math.max(d, p.lng[i]!);
    }
  return Number.isFinite(a)
    ? [
        [a, b],
        [c, d],
      ]
    : null;
}

/** The point `m` metres away on a bearing (degrees from north). */
export function offset(p: LatLng, bearing: number, m: number): LatLng {
  const r = (bearing * Math.PI) / 180;
  return {
    lat: p.lat + (Math.cos(r) * m) / 111320,
    lng: p.lng + (Math.sin(r) * m) / (111320 * Math.cos((p.lat * Math.PI) / 180)),
  };
}

export const bearing = (a: LatLng, b: LatLng) => {
  const dx = (b.lng - a.lng) * Math.cos((a.lat * Math.PI) / 180);
  const dy = b.lat - a.lat;
  return ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
};

/** The index of the line's point nearest `p`, searching from `from` on (checkpoints come in order). */
export function nearestIndex(l: Pick<Line, "lat" | "lng">, p: LatLng, from = 0): number {
  let best = from;
  let bd = Infinity;
  for (let i = from; i < l.lat.length; i++) {
    const d = haversine(l.lat[i]!, l.lng[i]!, p.lat, p.lng);
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return best;
}

/**
 * How much of the line runs twice over the same road (an out-and-back): the share of points within `tol` m of a point
 * at least 1 km away along it.
 */
export function selfOverlap(l: Line, tol = 25): number {
  const n = l.lat.length;
  if (n < 3) return 0;
  const cLat = tol / 111320;
  const cLng = tol / (111320 * Math.cos((l.lat[0]! * Math.PI) / 180));
  const grid = new Map<string, number[]>();
  for (let i = 0; i < n; i++) {
    const k = `${Math.floor(l.lat[i]! / cLat)},${Math.floor(l.lng[i]! / cLng)}`;
    (grid.get(k) ?? grid.set(k, []).get(k)!).push(i);
  }
  let twice = 0;
  for (let i = 0; i < n; i++) {
    const gy = Math.floor(l.lat[i]! / cLat),
      gx = Math.floor(l.lng[i]! / cLng);
    let hit = false;
    for (let dy = -1; dy <= 1 && !hit; dy++)
      for (let dx = -1; dx <= 1 && !hit; dx++)
        for (const j of grid.get(`${gy + dy},${gx + dx}`) ?? [])
          if (
            Math.abs(l.dist[j]! - l.dist[i]!) > 1000 &&
            haversine(l.lat[i]!, l.lng[i]!, l.lat[j]!, l.lng[j]!) <= tol
          ) {
            hit = true;
            break;
          }
    if (hit) twice++;
  }
  return twice / n;
}
