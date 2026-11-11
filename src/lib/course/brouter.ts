// Roads between points, from BRouter's public server (brouter.de): free, no key, called from the browser. It answers with
// the route's positions and altitudes. One request at a time, and every answer is kept on this device, so a route opened
// again or a checkpoint put back costs nothing.
import type { LatLng, Line } from "./geo";
import { cumulative, joinLines } from "./geo";

const SERVER = "https://brouter.de/brouter";

/** Road bike on the road, or on cycle paths and quiet lanes where there are some. */
export type RouteProfile = "road" | "cyclepaths";

const PROFILE: Record<RouteProfile, string> = {
  road: "fastbike",
  cyclepaths: "trekking",
};

/** BRouter takes a few dozen points per request; longer lists go in pieces that share their ends. */
const MAX_POINTS = 40;

export class RoutingError extends Error {}

type GeoJson = { features?: { geometry?: { coordinates?: number[][] } }[] };

/** The line in a BRouter GeoJSON answer. */
export function parseBrouter(json: GeoJson): Line {
  const c = json.features?.[0]?.geometry?.coordinates ?? [];
  const lat = c.map((p) => p[1]!);
  const lng = c.map((p) => p[0]!);
  // A point without altitude (outside the elevation data) takes the one before it.
  const alt: number[] = [];
  for (const p of c) alt.push(Number.isFinite(p[2]) ? p[2]! : (alt.at(-1) ?? 0));
  return { lat, lng, alt, dist: cumulative(lat, lng) };
}

const key = (points: LatLng[], profile: RouteProfile) =>
  `${profile}|${points.map((p) => `${p.lng.toFixed(5)},${p.lat.toFixed(5)}`).join("|")}`;

// --- the device's cache (IndexedDB), loaded lazily so tests and the server never touch it ---

type Cache = { get(k: string): Promise<Line | undefined>; set(k: string, v: Line): Promise<void> };
let cache: Promise<Cache> | null = null;

function openCache(): Promise<Cache> {
  cache ??= import("idb-keyval").then(({ createStore, get, set, keys, clear }) => {
    const store = createStore("cadence-courses", "brouter");
    let writes = 0;
    return {
      get: (k) => get<Line>(k, store).catch(() => undefined),
      async set(k, v) {
        // Now and then, start over once the cache grows past a few hundred routes.
        if (++writes % 50 === 0 && (await keys(store)).length > 400) await clear(store);
        await set(k, v, store).catch(() => {});
      },
    };
  });
  return cache;
}

let queue: Promise<unknown> = Promise.resolve();

/** One request after another: the public server is shared by everyone. */
function inTurn<T>(job: () => Promise<T>): Promise<T> {
  const run = queue.then(job, job);
  queue = run.catch(() => {});
  return run;
}

async function fetchPiece(
  points: LatLng[],
  profile: RouteProfile,
  signal?: AbortSignal,
): Promise<Line> {
  const k = key(points, profile);
  const store = typeof indexedDB === "undefined" ? null : await openCache();
  const hit = await store?.get(k);
  if (hit) return hit;
  const url =
    `${SERVER}?lonlats=${points.map((p) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join("|")}` +
    `&profile=${PROFILE[profile]}&alternativeidx=0&format=geojson`;
  const line = await inTurn(async () => {
    const res = await fetch(url, signal ? { signal } : {});
    const text = await res.text();
    if (!res.ok) throw new RoutingError(text.slice(0, 200) || `BRouter ${res.status}`);
    return parseBrouter(JSON.parse(text) as GeoJson);
  });
  if (line.lat.length < 2) throw new RoutingError("empty route");
  await store?.set(k, line);
  return line;
}

/** The road through these points, in order. */
export async function routeThrough(
  points: LatLng[],
  profile: RouteProfile,
  signal?: AbortSignal,
): Promise<Line> {
  if (points.length < 2) throw new RoutingError("two points at least");
  const pieces: LatLng[][] = [];
  for (let i = 0; i < points.length - 1; i += MAX_POINTS - 1)
    pieces.push(points.slice(i, i + MAX_POINTS));
  const lines: Line[] = [];
  for (const p of pieces) if (p.length > 1) lines.push(await fetchPiece(p, profile, signal));
  return joinLines(lines);
}

export type Router = typeof routeThrough;
