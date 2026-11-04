// A shared ride's page for the forest: its summary, and (when the member shares maps) its route and altitude
// profile with the first and last kilometre cut off, so nobody learns where rides start and end; heart rate and
// power only when the member shares them. Pure.
//   forests/{fid}/trees/{uid}/rides/{rideId}   StoredRidePage
import type { Activity } from "../intervals";
import { haversine, type Segment, type Trace, type TrackLike } from "../segments";
import { thin } from "./leaderboard";
import type { SharedRide } from "./types";

/** Metres hidden at each end of a route shown to friends (home is usually at one of them). */
export const PRIVACY_ZONE = 1000;
/** Only rides this recent get a page in the forest; older ones stay on the tree as branches. */
export const RIDE_PAGE_DAYS = 365;

/** Heart rate (bpm) and power (W) of a ride, each null when it wasn't recorded. */
export type RideEffort = {
  avgHr: number | null;
  maxHr: number | null;
  avgWatts: number | null;
  maxWatts: number | null;
  np: number | null;
};

export type RidePage = SharedRide & {
  /** The route without its first and last kilometre (thinned out), or null: indoor, too short, or maps not shared. */
  route: Trace | null;
  /** Null unless the member shares heart rate and power (and the ride has some). */
  effort: RideEffort | null;
};

/** A ride's heart rate and power; max power comes from the stored track's 1 s samples when there is one. */
export function effortOf(
  a: Pick<
    Activity,
    "average_heartrate" | "max_heartrate" | "icu_average_watts" | "icu_weighted_avg_watts"
  >,
  track: Pick<TrackLike, "watts"> | null,
): RideEffort | null {
  const round = (v: number | null | undefined) => (v != null && v > 0 ? Math.round(v) : null);
  const peak = track?.watts?.reduce<number>((m, w) => Math.max(m, w ?? 0), 0);
  const e: RideEffort = {
    avgHr: round(a.average_heartrate),
    maxHr: round(a.max_heartrate),
    avgWatts: round(a.icu_average_watts),
    maxWatts: round(peak),
    np: round(a.icu_weighted_avg_watts),
  };
  return Object.values(e).some((v) => v != null) ? e : null;
}

/** The track between PRIVACY_ZONE from its start and PRIVACY_ZONE before its end, or null when nothing is left. */
export function trimEnds(
  t: Required<Pick<TrackLike, "lat" | "lng" | "dist" | "alt">>,
): Trace | null {
  const total = t.dist.at(-1) ?? 0;
  if (total < PRIVACY_ZONE * 2 + 500) return null;
  const keep = t.dist.flatMap((d, i) =>
    d >= PRIVACY_ZONE && d <= total - PRIVACY_ZONE ? [i] : [],
  );
  if (keep.length < 2) return null;
  const d0 = t.dist[keep[0]!]!;
  return {
    lat: keep.map((i) => t.lat[i]!),
    lng: keep.map((i) => t.lng[i]!),
    dist: keep.map((i) => t.dist[i]! - d0),
    alt: keep.map((i) => t.alt[i]!),
  };
}

export function ridePage(
  ride: SharedRide,
  track: Pick<TrackLike, "lat" | "lng" | "dist" | "alt"> | null,
  maps: boolean,
  effort: RideEffort | null = null,
): RidePage {
  const route =
    maps && track?.lat?.length && track.dist && track.alt
      ? trimEnds({ lat: track.lat, lng: track.lng!, dist: track.dist, alt: track.alt })
      : null;
  return { ...ride, route: route ? thin(route, 400) : null, effort };
}

/** A route as text, about a quarter of the size of its number lists: each point's change from the one before, in
 * metres and 1e-5 degrees, written like Google's encoded polylines. */
export function packRoute(t: Trace): string {
  let out = "";
  const last = [0, 0, 0, 0];
  for (let i = 0; i < t.lat.length; i++) {
    const now = [
      Math.round(t.lat[i]! * 1e5),
      Math.round(t.lng[i]! * 1e5),
      Math.round(t.dist[i]!),
      Math.round(t.alt[i]!),
    ];
    now.forEach((n, k) => {
      const d = n - last[k]!;
      last[k] = n;
      let v = d < 0 ? ~(d * 2) : d * 2;
      for (; v >= 32; v = Math.floor(v / 32)) out += String.fromCharCode((32 | (v % 32)) + 63);
      out += String.fromCharCode(v + 63);
    });
  }
  return out;
}

export function unpackRoute(s: string): Trace {
  const last = [0, 0, 0, 0];
  const t: Trace = { lat: [], lng: [], dist: [], alt: [] };
  let at = 0;
  const next = () => {
    let v = 0;
    let bit = 1;
    let c: number;
    do {
      c = s.charCodeAt(at++) - 63;
      v += (c & 31) * bit;
      bit *= 32;
    } while (c >= 32);
    return v % 2 ? -(v + 1) / 2 : v / 2;
  };
  while (at < s.length) {
    for (let k = 0; k < 4; k++) last[k] = last[k]! + next();
    t.lat.push(last[0]! / 1e5);
    t.lng.push(last[1]! / 1e5);
    t.dist.push(last[2]!);
    t.alt.push(last[3]!);
  }
  return t;
}

/** A ride page as Firestore holds it. App versions from before `path` read `route: null` as "no map". */
export type StoredRidePage = Omit<RidePage, "route"> & { route: null; path?: string };

export const toStoredPage = (p: RidePage): StoredRidePage =>
  p.route ? { ...p, route: null, path: packRoute(p.route) } : { ...p, route: null };

/** Back to a page with its route; those published before `path` still hold `route` as number lists. */
export function fromStoredPage(
  d: Omit<RidePage, "route"> & { route?: Trace | null; path?: string },
): RidePage {
  const { path, route, ...page } = d;
  return { ...page, route: path ? unpackRoute(path) : (route ?? null) };
}

/** Where a climb lies on a shared route: start and finish indices and distances along the route. */
export type RouteSpan = { i0: number; i1: number; from: number; to: number };

/**
 * Where a forest climb lies on a shared ride's route, or null when it isn't there (or falls in a hidden end). The
 * route is thinned (points can be a few hundred metres apart), so the start and finish pins are matched to the
 * nearest points with a tolerance of about one point spacing, and the covered distance must fit the climb's length.
 */
export function climbOnRoute(
  route: Trace,
  c: Pick<Segment, "lat1" | "lng1" | "lat2" | "lng2" | "length">,
): RouteSpan | null {
  const n = route.lat.length;
  if (n < 2 || !(c.length > 0)) return null;
  const tol = Math.max(80, (route.dist[n - 1]! / (n - 1)) * 1.5);
  let best: RouteSpan | null = null;
  let bestErr = Infinity;
  for (let a = 0; a < n; a++) {
    const da = haversine(route.lat[a]!, route.lng[a]!, c.lat1, c.lng1);
    if (da > tol) continue;
    for (let b = a + 1; b < n && route.dist[b]! - route.dist[a]! <= c.length * 1.3 + tol; b++) {
      const db = haversine(route.lat[b]!, route.lng[b]!, c.lat2, c.lng2);
      if (db > tol) continue;
      const off = Math.abs(route.dist[b]! - route.dist[a]! - c.length);
      if (off > c.length * 0.2 + tol) continue;
      const err = off + da + db;
      if (err < bestErr) {
        bestErr = err;
        best = { i0: a, i1: b, from: route.dist[a]!, to: route.dist[b]! };
      }
    }
  }
  return best;
}
