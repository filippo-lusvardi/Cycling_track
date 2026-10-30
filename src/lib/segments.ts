// GPS segment detection & matching across rides. Pure and browser-safe.
import { climbCategory } from "./climbs";

export type Segment = {
  id: string;
  name: string;
  source: "auto" | "custom";
  lat1: number; lng1: number;
  lat2: number; lng2: number;
  length: number; // m
  gain?: number;
  grade?: number;
};

export type TrackLike = {
  id: string; name: string | null; date: string;
  lat: number[]; lng: number[]; dist: number[]; time: number[]; alt: number[];
  watts: (number | null)[]; hr: (number | null)[]; cad?: (number | null)[];
};

export type Attempt = {
  trackId: string; trackName: string | null; date: string;
  duration: number; avgWatts: number | null; avgHr: number | null; avgCad: number | null; speed: number;
  gain: number; vam: number | null;
  /** Start and finish indices of the effort in the track, to draw its path and profile. */
  i0: number; i1: number;
};

const R = 6371000;
export function haversine(la1: number, lo1: number, la2: number, lo2: number): number {
  const r = Math.PI / 180;
  const dLa = (la2 - la1) * r;
  const dLo = (lo2 - lo1) * r;
  const a = Math.sin(dLa / 2) ** 2 + Math.cos(la1 * r) * Math.cos(la2 * r) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

const TOL = 40; // m from start/finish pin
const avg = (a: (number | null)[], i: number, j: number) => {
  let s = 0, n = 0;
  for (let k = i; k <= j; k++) { const v = a[k]; if (v != null && v > 0) { s += v; n++; } }
  return n ? s / n : null;
};

/** Every pass through the segment in one track (start pin → finish pin, length within ±15%). */
export function findAttempts(t: TrackLike, s: Segment): Attempt[] {
  const out: Attempt[] = [];
  const n = t.lat.length;
  let i = 0;
  const dLat = TOL / 111000; // degrees; cheap reject before the trigonometry
  while (i < n) {
    if (Math.abs(t.lat[i]! - s.lat1) > dLat || haversine(t.lat[i]!, t.lng[i]!, s.lat1, s.lng1) > TOL) { i++; continue; }
    // best start index within the start bubble
    let a = i, bestA = Infinity;
    while (i < n && haversine(t.lat[i]!, t.lng[i]!, s.lat1, s.lng1) <= TOL) {
      const d = haversine(t.lat[i]!, t.lng[i]!, s.lat1, s.lng1);
      if (d < bestA) { bestA = d; a = i; }
      i++;
    }
    let b = -1, bestB = Infinity;
    for (let j = a + 1; j < n && t.dist[j]! - t.dist[a]! <= s.length * 1.3; j++) {
      const d = haversine(t.lat[j]!, t.lng[j]!, s.lat2, s.lng2);
      if (d <= TOL && d < bestB) { bestB = d; b = j; }
    }
    if (b > 0) {
      const covered = t.dist[b]! - t.dist[a]!;
      const duration = t.time[b]! - t.time[a]!;
      if (Math.abs(covered - s.length) <= s.length * 0.15 && duration > 0) {
        const gain = Math.max(0, t.alt[b]! - t.alt[a]!);
        out.push({
          trackId: t.id, trackName: t.name, date: t.date, duration,
          avgWatts: avg(t.watts, a, b), avgHr: avg(t.hr, a, b), avgCad: t.cad ? avg(t.cad, a, b) : null,
          speed: (covered / duration) * 3.6, gain, vam: gain > 0 ? (gain / duration) * 3600 : null,
          i0: a, i1: b,
        });
        i = b + 1;
      }
    }
  }
  return out;
}

export function pointAtKm(t: Pick<TrackLike, "dist" | "lat" | "lng">, km: number) {
  const d = km * 1000;
  let i = 0;
  while (i < t.dist.length - 1 && t.dist[i]! < d) i++;
  return { lat: t.lat[i]!, lng: t.lng[i]! };
}

export type Path = { lat: number[]; lng: number[] };

/**
 * How much of path `a` runs along path `b` (within `tol` m): the covered fraction of a's points and the
 * first/last covered index of a. Uses a coarse grid over b, so it's linear in the number of points.
 */
export function coverage(a: Path, b: Path, tol = 30): { frac: number; first: number; last: number } {
  const none = { frac: 0, first: -1, last: -1 };
  if (!a.lat.length || !b.lat.length) return none;
  const cLat = tol / 111320;
  const cLng = tol / (111320 * Math.cos((b.lat[0]! * Math.PI) / 180));
  const grid = new Map<string, number[]>();
  for (let k = 0; k < b.lat.length; k++) {
    const key = `${Math.floor(b.lat[k]! / cLat)},${Math.floor(b.lng[k]! / cLng)}`;
    (grid.get(key) ?? grid.set(key, []).get(key)!).push(k);
  }
  let n = 0, first = -1, last = -1;
  for (let i = 0; i < a.lat.length; i++) {
    const gy = Math.floor(a.lat[i]! / cLat), gx = Math.floor(a.lng[i]! / cLng);
    let near = false;
    for (let dy = -1; dy <= 1 && !near; dy++)
      for (let dx = -1; dx <= 1 && !near; dx++)
        for (const k of grid.get(`${gy + dy},${gx + dx}`) ?? [])
          if (haversine(a.lat[i]!, a.lng[i]!, b.lat[k]!, b.lng[k]!) <= tol) { near = true; break; }
    if (near) { n++; if (first < 0) first = i; last = i; }
  }
  return { frac: n / a.lat.length, first, last };
}

/** Same climb: at least `min` of each path runs along the other. A half climb (≈50%) stays its own segment. */
export const samePath = (a: Path, b: Path, min = 0.7) => coverage(a, b).frac >= min && coverage(b, a).frac >= min;

const slice = (t: Path, i0: number, i1: number): Path => ({ lat: t.lat.slice(i0, i1 + 1), lng: t.lng.slice(i0, i1 + 1) });
const indexAtKm = (t: Pick<TrackLike, "dist">, km: number) => {
  const i = t.dist.findIndex((d) => d >= km * 1000);
  return i < 0 ? t.dist.length - 1 : i;
};

/** A segment between two distances (km) of a track. */
export function segmentFromRange(
  t: Pick<TrackLike, "dist" | "lat" | "lng" | "alt">, startKm: number, endKm: number,
  source: Segment["source"], name?: string,
): Segment {
  const p1 = pointAtKm(t, startKm);
  const p2 = pointAtKm(t, endKm);
  const length = (endKm - startKm) * 1000;
  const i = t.dist.findIndex((d) => d >= startKm * 1000);
  const j = t.dist.findIndex((d) => d >= endKm * 1000);
  const gain = i >= 0 ? Math.max(0, t.alt[j >= 0 ? j : t.alt.length - 1]! - t.alt[i]!) : 0;
  const grade = length > 0 ? (gain / length) * 100 : 0;
  return {
    id: `${source}-${p1.lat.toFixed(4)},${p1.lng.toFixed(4)}-${p2.lat.toFixed(4)},${p2.lng.toFixed(4)}`,
    name: name ?? `${source === "auto" ? "Climb" : "Segment"} ${(length / 1000).toFixed(1)} km @ ${grade.toFixed(1)}%`,
    source, lat1: p1.lat, lng1: p1.lng, lat2: p2.lat, lng2: p2.lng, length, gain, grade,
  };
}

type StreamsLike = {
  distance: number[]; time: number[]; altitude: number[]; lat: (number | null)[]; lng: (number | null)[];
  watts: (number | null)[]; heartrate: (number | null)[]; cadence?: (number | null)[];
};

/** Track down-sampled to one point every `step` metres, skipping samples without GPS. */
export function trackFromStreams(meta: { id: string; name: string | null; date: string }, s: StreamsLike, step = 20): Required<TrackLike> {
  const t: Required<TrackLike> = { ...meta, lat: [], lng: [], dist: [], time: [], alt: [], watts: [], hr: [], cad: [] };
  let last = -Infinity;
  for (let k = 0; k < s.distance.length; k++) {
    const la = s.lat[k];
    const lo = s.lng[k];
    if (la == null || lo == null) continue;
    if (s.distance[k]! - last < step && k !== s.distance.length - 1) continue;
    last = s.distance[k]!;
    t.lat.push(la); t.lng.push(lo); t.dist.push(s.distance[k]!); t.time.push(s.time[k]!);
    t.alt.push(s.altitude[k] ?? 0); t.watts.push(s.watts[k] ?? null); t.hr.push(s.heartrate[k] ?? null);
    t.cad.push(s.cadence?.[k] ?? null);
  }
  return t;
}

/** Whether a saved segment is the climb found at [startKm, endKm] on this track. */
export function isClimbOnTrack(t: TrackLike, s: Segment, startKm: number, endKm: number): boolean {
  const a = findAttempts(t, s)[0];
  return !!a && samePath(slice(t, a.i0, a.i1), slice(t, indexAtKm(t, startKm), indexAtKm(t, endKm)));
}

export type Trace = { lat: number[]; lng: number[]; dist: number[]; alt: number[] };

/** "3.7 km · 5.0% · 188 m · Cat 3": the stats line shown under a segment's name. */
export function segmentSummary(s: Pick<Segment, "length" | "grade" | "gain">): string {
  const parts = [`${(s.length / 1000).toFixed(1)} km`];
  if (s.grade != null) parts.push(`${s.grade.toFixed(1)}%`);
  if (s.gain != null) parts.push(`${Math.round(s.gain)} m`);
  const cat = s.grade != null ? climbCategory(s.length, s.grade) : "Uncat";
  if (cat !== "Uncat") parts.push(cat === "HC" ? "HC" : `Cat ${cat}`);
  return parts.join(" · ");
}
