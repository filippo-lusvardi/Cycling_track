// Incremental segment index. Pure: storage and downloads live in segment-engine.ts.
//
// Each ride is summarised once (map cells it passes + detected climbs). Climbs are grouped across rides
// as they arrive; a group's segment is the stretch all its members share. Cells make "which rides can
// pass this segment?" a set lookup, so new rides and new segments only touch what they overlap.
import { detectClimbs } from "./climbs";
import type { MainSport } from "./sport";
import { coverage, findAttempts, haversine, samePath, type Attempt, type Path, type Segment, type Trace, type TrackLike } from "./segments";

export const CELL = 0.005; // degrees, ≈ 550 m north–south

export const cellOf = (lat: number, lng: number) =>
  (Math.floor(lat / CELL) + 20000) * 100000 + (Math.floor(lng / CELL) + 40000);

/** The cell of a point and its 8 neighbours (a pin near a cell border may be passed from the next cell). */
export function cellsAround(lat: number, lng: number): number[] {
  const out: number[] = [];
  for (const dy of [-1, 0, 1]) for (const dx of [-1, 0, 1]) out.push(cellOf(lat + dy * CELL, lng + dx * CELL));
  return out;
}

export type ClimbRec = { lat: number[]; lng: number[]; dist: number[]; alt: number[] };
export type RideSummary = { id: string; name: string | null; date: string; cells: number[]; climbs: ClimbRec[] };

const indexAt = (dist: number[], m: number) => {
  const i = dist.findIndex((d) => d >= m);
  return i < 0 ? dist.length - 1 : i;
};

export function summarizeRide(t: TrackLike): RideSummary {
  const cells = new Set<number>();
  for (let i = 0; i < t.lat.length; i++) cells.add(cellOf(t.lat[i]!, t.lng[i]!));
  const climbs = detectClimbs({ distance: t.dist, altitude: t.alt, time: t.time }).map((c) => {
    const i0 = indexAt(t.dist, c.startKm * 1000), i1 = indexAt(t.dist, c.endKm * 1000);
    return { lat: t.lat.slice(i0, i1 + 1), lng: t.lng.slice(i0, i1 + 1), dist: t.dist.slice(i0, i1 + 1), alt: t.alt.slice(i0, i1 + 1) };
  });
  return { id: t.id, name: t.name, date: t.date, cells: [...cells], climbs };
}

/** A recurring climb: a representative detection, the shared core [c0, c1] of it, and the rides that detected it. */
export type Group = { id: string; rideId: string; climb: ClimbRec; core: [number, number]; members: string[] };

type Box = [number, number, number, number];
const boxes = new WeakMap<Path, Box>();
function box(p: Path): Box {
  let b = boxes.get(p);
  if (!b) {
    b = [Infinity, Infinity, -Infinity, -Infinity];
    for (let i = 0; i < p.lat.length; i++) {
      b[0] = Math.min(b[0], p.lat[i]!); b[1] = Math.min(b[1], p.lng[i]!);
      b[2] = Math.max(b[2], p.lat[i]!); b[3] = Math.max(b[3], p.lng[i]!);
    }
    boxes.set(p, b);
  }
  return b;
}
const M = 0.0005; // ≈ 50 m margin
const boxesMeet = (a: Box, b: Box) => a[0] <= b[2] + M && b[0] <= a[2] + M && a[1] <= b[3] + M && b[1] <= a[3] + M;

/** Points (≈ 40 m) to step inside the shared road when a trim moves an end, so pins sit clearly on it. */
const INSET = 2;

/** Shrink a group's core to [first, last] of its climb, unless that would leave less than half of it. */
function shrink(g: Group, first: number, last: number): boolean {
  const core: [number, number] = [
    first > g.core[0] ? first + INSET : g.core[0],
    last < g.core[1] ? last - INSET : g.core[1],
  ];
  const d = g.climb.dist;
  if (core[1] <= core[0] || d[core[1]]! - d[core[0]]! < 0.5 * (d.at(-1)! - d[0]!)) return false;
  if (core[0] === g.core[0] && core[1] === g.core[1]) return false;
  g.core = core;
  return true;
}

const corePath = (g: Group): Path => ({ lat: g.climb.lat.slice(g.core[0], g.core[1] + 1), lng: g.climb.lng.slice(g.core[0], g.core[1] + 1) });

/**
 * Add one ride's climbs to the groups (in place). A climb joins a group when ≥ 70% of each runs along the
 * other. Every group is then trimmed to the road it shares with this ride's climbs wherever they cover ≥ 70%
 * of it (so a half climb is trimmed by full ascents that reached it from another road too), and a new group
 * is trimmed to the shared part of the existing groups that contain it. Cores never drop below half the
 * representative climb, so one odd ride can't collapse a segment. Returns the ids of new or moved groups.
 */
export function addRideToGroups(groups: Group[], r: RideSummary): Set<string> {
  const touched = new Set<string>();
  r.climbs.forEach((c, k) => {
    let g = groups.find((x) => boxesMeet(box(x.climb), box(c)) && samePath(x.climb, c));
    if (g) {
      if (!g.members.includes(r.id)) g.members.push(r.id);
    } else {
      g = { id: `auto-${r.id}-${k}`, rideId: r.id, climb: c, core: [0, c.lat.length - 1], members: [r.id] };
      for (const o of groups) {
        if (!boxesMeet(box(o.climb), box(c))) continue;
        const cov = coverage(c, corePath(o));
        if (cov.frac >= 0.7) shrink(g, cov.first, cov.last);
      }
      groups.push(g);
      touched.add(g.id);
    }
    for (const o of groups) {
      if (o.id !== g.id && !boxesMeet(box(o.climb), box(c))) continue;
      const cov = coverage(corePath(o), c);
      if (cov.frac >= 0.7 && shrink(o, o.core[0] + cov.first, o.core[0] + cov.last)) touched.add(o.id);
    }
  });
  return touched;
}

/** The group's segment: pins at the ends of its shared core. */
export function groupSegment(g: Group): Segment {
  const [c0, c1] = g.core;
  const { lat, lng, dist, alt } = g.climb;
  const length = dist[c1]! - dist[c0]!;
  const gain = Math.max(0, alt[c1]! - alt[c0]!);
  const grade = length > 0 ? (gain / length) * 100 : 0;
  return {
    id: g.id,
    name: `Climb ${(length / 1000).toFixed(1)} km @ ${grade.toFixed(1)}%`,
    source: "auto",
    lat1: lat[c0]!, lng1: lng[c0]!, lat2: lat[c1]!, lng2: lng[c1]!,
    length, gain, grade,
  };
}

/** Path and profile of the group's core, distances from 0. */
export function groupTrace(g: Group): Trace {
  const [c0, c1] = g.core;
  const d0 = g.climb.dist[c0]!;
  return {
    lat: g.climb.lat.slice(c0, c1 + 1),
    lng: g.climb.lng.slice(c0, c1 + 1),
    dist: g.climb.dist.slice(c0, c1 + 1).map((d) => d - d0),
    alt: g.climb.alt.slice(c0, c1 + 1),
  };
}

/** Whether a ride's cells could contain both pins of a segment (cheap pre-check before `findAttempts`). */
export function mayPass(cells: Set<number>, s: Segment): boolean {
  return cellsAround(s.lat1, s.lng1).some((c) => cells.has(c)) && cellsAround(s.lat2, s.lng2).some((c) => cells.has(c));
}

/** Pins and length: when this changes, a segment's cached efforts are stale. */
export const segSig = (s: Segment) =>
  `${s.lat1.toFixed(5)},${s.lng1.toFixed(5)},${s.lat2.toFixed(5)},${s.lng2.toFixed(5)},${Math.round(s.length)}`;

/** Cached efforts of one segment, valid while `sig` matches, covering rides processed up to `upTo`. */
export type EffortRec = {
  sig: string;
  upTo: number;
  attempts: Attempt[];
  /** The fastest ride's path and profile. */
  trace: Trace | null;
  /** The fastest run's: a climb shared by both sports can be two different lines. */
  runTrace?: Trace | null;
};

/** A climb's efforts in one sport: times are only ever compared within a sport. */
export const attemptsIn = (r: EffortRec | undefined, sport: MainSport) =>
  (r?.attempts ?? []).filter((a) => (a.sport ?? "ride") === sport);

export const traceIn = (r: EffortRec | undefined, sport: MainSport) =>
  (sport === "run" ? r?.runTrace : r?.trace) ?? null;

/** How many activities went through, in one sport or (without one) in any. */
export const ridesIn = (r: EffortRec | undefined, sport?: MainSport) =>
  r ? new Set((sport ? attemptsIn(r, sport) : r.attempts).map((a) => a.trackId)).size : 0;

/** The path and profile of one effort, for the map and altimetry. */
export function traceOf(t: TrackLike, a: Pick<Attempt, "i0" | "i1">): Trace {
  const d0 = t.dist[a.i0]!;
  return {
    lat: t.lat.slice(a.i0, a.i1 + 1),
    lng: t.lng.slice(a.i0, a.i1 + 1),
    dist: t.dist.slice(a.i0, a.i1 + 1).map((d) => d - d0),
    alt: t.alt.slice(a.i0, a.i1 + 1),
  };
}

/**
 * A climb starred before groups existed keeps the pins of the one ride it came from. Link it to the group
 * whose climb passes near both its pins (max(300 m, 15% of its length)), with a similar length, so it
 * follows the shared stretch.
 */
export function groupForSaved(s: Segment, groups: Group[]): Group | null {
  const direct = groups.find((g) => g.id === s.id);
  if (direct) return direct;
  if (s.source !== "auto") return null;
  // A star from one ride's detection can start a few hundred metres back on that ride's own approach road.
  const tol = Math.max(300, 0.15 * s.length);
  const near = (g: Group, lat: number, lng: number) => g.climb.lat.some((la, i) => haversine(la, g.climb.lng[i]!, lat, lng) <= tol);
  let best: { g: Group; d: number } | null = null;
  const P = (tol / 111000) * 1.5; // both pins must sit inside the group's climb box before the point-by-point check
  for (const g of groups) {
    const b = box(g.climb);
    const inBox = (la: number, lo: number) => la >= b[0] - P && la <= b[2] + P && lo >= b[1] - P && lo <= b[3] + P;
    if (!inBox(s.lat1, s.lng1) || !inBox(s.lat2, s.lng2)) continue;
    const seg = groupSegment(g);
    if (Math.abs(seg.length - s.length) > 0.4 * Math.max(seg.length, s.length)) continue;
    if (!near(g, s.lat1, s.lng1) || !near(g, s.lat2, s.lng2)) continue;
    const d = haversine(seg.lat1, seg.lng1, s.lat1, s.lng1) + haversine(seg.lat2, seg.lng2, s.lat2, s.lng2);
    if (!best || d < best.d) best = { g, d };
  }
  return best?.g ?? null;
}

/** All-at-once version of what the engine does incrementally: recurring climbs over a set of tracks. */
export function autoSegments(tracks: TrackLike[]): (Segment & { rides: number })[] {
  const groups: Group[] = [];
  for (const t of tracks) addRideToGroups(groups, summarizeRide(t));
  return groups.map((g) => {
    const seg = groupSegment(g);
    return { ...seg, rides: tracks.filter((t) => findAttempts(t, seg).length > 0).length };
  });
}
