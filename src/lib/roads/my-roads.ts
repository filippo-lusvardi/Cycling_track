// Your roads: every outdoor ride's 20 m track laid on a fine grid and joined into a graph, each road knowing how many of
// your rides went along it. Two rides on the same road with a few metres of GPS between them land on the same nodes,
// since a point snaps to a node already there before it makes a new one. Each road counts its rides by bike: the road
// bike's map shows only road rides, gravel adds gravel rides, MTB shows them all. Pure (storage is in roads-app.ts).
import { haversine } from "../segments";

export type LatLng = { lat: number; lng: number };
/** South-west and north-east corners, as Leaflet has them. */
export type Bounds = [[number, number], [number, number]];

export const BIKES = ["road", "gravel", "mtb"] as const;
export type Bike = (typeof BIKES)[number];
/** What a ride was ridden on: e-bike and unknown rides count as road. */
export type RideBike = Bike;

/** Rides along one road: on the road bike, gravel, MTB. */
export type Counts = [number, number, number];

const SLOT: Record<RideBike, number> = { road: 0, gravel: 1, mtb: 2 };

/** The rides along a road that count for a bike's routes. */
export const countFor = (c: Counts, bike: Bike = "mtb") =>
  bike === "road" ? c[0] : bike === "gravel" ? c[0] + c[1] : c[0] + c[1] + c[2];

/** About 22 m by 23 m at 46° north. */
const DLAT = 0.0002;
const DLNG = 0.0003;
const SNAP = 25;
/** Longer steps are a GPS gap (a tunnel, a lost signal): no road is drawn across them. */
const MAX_STEP = 150;

type Node = { lat: number; lng: number; edges: Map<number, Counts> };

export type Roads = {
  nodes: Map<number, Node>;
  /** Rides already laid on the graph, with the bike they were ridden on. */
  rides: Map<string, RideBike>;
  /** How many rides started at each node: the most is home. */
  starts: Map<number, number>;
};

export const emptyRoads = (): Roads => ({ nodes: new Map(), rides: new Map(), starts: new Map() });

const cell = (lat: number, lng: number): [number, number] => [
  Math.floor(lat / DLAT),
  Math.floor(lng / DLNG),
];
const keyOf = (y: number, x: number) => (y + 600_000) * 2_000_000 + (x + 1_000_000);

function snap(r: Roads, lat: number, lng: number, create: boolean): number | null {
  const [y, x] = cell(lat, lng);
  const own = keyOf(y, x);
  if (r.nodes.has(own)) return own;
  let best: number | null = null;
  let bd = SNAP;
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      const k = keyOf(y + dy, x + dx);
      const n = r.nodes.get(k);
      if (!n) continue;
      const d = haversine(lat, lng, n.lat, n.lng);
      if (d < bd) {
        bd = d;
        best = k;
      }
    }
  if (best != null || !create) return best;
  r.nodes.set(own, { lat, lng, edges: new Map() });
  return own;
}

/** Lay a ride's track on the graph; a ride already there is skipped. */
export function addRide(
  r: Roads,
  id: string,
  lat: ArrayLike<number>,
  lng: ArrayLike<number>,
  bike: RideBike = "road",
) {
  if (r.rides.has(id)) return;
  r.rides.set(id, bike);
  const slot = SLOT[bike];
  const bump = (m: Map<number, Counts>, k: number) => {
    const c = m.get(k) ?? ([0, 0, 0] as Counts);
    c[slot] = c[slot]! + 1;
    m.set(k, c);
  };
  const seen = new Set<string>();
  let prev: number | null = null;
  for (let i = 0; i < lat.length; i++) {
    const k = snap(r, lat[i]!, lng[i]!, true)!;
    if (i === 0) r.starts.set(k, (r.starts.get(k) ?? 0) + 1);
    if (prev != null && k !== prev) {
      const a = r.nodes.get(prev)!;
      const b = r.nodes.get(k)!;
      if (haversine(a.lat, a.lng, b.lat, b.lng) <= MAX_STEP) {
        const e = prev < k ? `${prev}-${k}` : `${k}-${prev}`;
        // Each ride counts once per road, however many times it passes.
        if (!seen.has(e)) {
          seen.add(e);
          bump(a.edges, k);
          bump(b.edges, prev);
        }
      }
    }
    prev = k;
  }
}

export const nodeAt = (r: Roads, k: number): LatLng => {
  const n = r.nodes.get(k)!;
  return { lat: n.lat, lng: n.lng };
};

const tops = new WeakMap<Roads, { rides: number; by: Map<Bike, number> }>();

/** The most rides on any one road for a bike: worked out once per graph (until rides are added), not per path. */
export function mostOn(r: Roads, bike: Bike = "mtb"): number {
  let t = tops.get(r);
  if (!t || t.rides !== r.rides.size) tops.set(r, (t = { rides: r.rides.size, by: new Map() }));
  let top = t.by.get(bike);
  if (top == null) {
    top = 0;
    for (const n of r.nodes.values())
      for (const c of n.edges.values()) top = Math.max(top, countFor(c, bike));
    t.by.set(bike, top);
  }
  return top;
}

/** Where most of your rides start. */
export function homeOf(r: Roads): LatLng | null {
  let best: number | null = null;
  let most = 0;
  for (const [k, c] of r.starts)
    if (c > most) {
      most = c;
      best = k;
    }
  return best != null && r.nodes.has(best) ? nodeAt(r, best) : null;
}

export type RoadLine = { lat: number[]; lng: number[]; rides: number };

/** Your roads as lines to draw, inside a box: chains of nodes joined end to end where nothing branches. */
export function roadLines(r: Roads, box: Bounds, minRides = 1, bike: Bike = "mtb"): RoadLine[] {
  const [[s, w], [n, e]] = box;
  const inside = (k: number) => {
    const p = r.nodes.get(k)!;
    return p.lat >= s && p.lat <= n && p.lng >= w && p.lng <= e;
  };
  const used = new Set<string>();
  const ek = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);
  const count = (a: number, b: number) => countFor(r.nodes.get(a)!.edges.get(b)!, bike);
  const degree = (k: number) => {
    let d = 0;
    for (const c of r.nodes.get(k)!.edges.values()) if (countFor(c, bike)) d++;
    return d;
  };
  const out: RoadLine[] = [];
  const walk = (a: number, b: number) => {
    const line: RoadLine = { lat: [], lng: [], rides: count(a, b) };
    const add = (k: number) => {
      const p = r.nodes.get(k)!;
      line.lat.push(p.lat);
      line.lng.push(p.lng);
    };
    add(a);
    let prev = a;
    let cur = b;
    for (;;) {
      used.add(ek(prev, cur));
      add(cur);
      if (degree(cur) !== 2) break;
      const next = [...r.nodes.get(cur)!.edges.keys()].find((m) => m !== prev && count(cur, m))!;
      if (used.has(ek(cur, next))) break;
      const c = count(cur, next);
      // A chain keeps one count; where it changes, a new line starts.
      if (c !== line.rides) break;
      prev = cur;
      cur = next;
    }
    if (line.rides >= minRides) out.push(line);
    return cur;
  };
  for (const [k, node] of r.nodes) {
    if (!inside(k)) continue;
    for (const m of node.edges.keys()) {
      if (used.has(ek(k, m)) || !count(k, m)) continue;
      walk(k, m);
    }
  }
  return out;
}

// --- a compact form for IndexedDB ---

export type PackedRoads = {
  /** 2: counts by bike (version 1 had one count per road and goes). */
  v: 2;
  keys: Float64Array;
  lat: Float32Array;
  lng: Float32Array;
  /** Edges once each (a < b) as indexes into `keys`, and their counts: road, gravel, MTB, one after another. */
  ea: Uint32Array;
  eb: Uint32Array;
  ec: Uint16Array;
  rides: [string, RideBike][];
  starts: [number, number][];
};

export function packRoads(r: Roads): PackedRoads {
  const keys = [...r.nodes.keys()];
  const index = new Map(keys.map((k, i) => [k, i]));
  const ea: number[] = [],
    eb: number[] = [],
    ec: number[] = [];
  for (const [k, n] of r.nodes)
    for (const [m, c] of n.edges)
      if (k < m) {
        ea.push(index.get(k)!);
        eb.push(index.get(m)!);
        ec.push(...c.map((x) => Math.min(65535, x)));
      }
  return {
    v: 2,
    keys: Float64Array.from(keys),
    lat: Float32Array.from(keys, (k) => r.nodes.get(k)!.lat),
    lng: Float32Array.from(keys, (k) => r.nodes.get(k)!.lng),
    ea: Uint32Array.from(ea),
    eb: Uint32Array.from(eb),
    ec: Uint16Array.from(ec),
    rides: [...r.rides],
    starts: [...r.starts],
  };
}

export function unpackRoads(p: PackedRoads): Roads {
  const r = emptyRoads();
  p.keys.forEach((k, i) => r.nodes.set(k, { lat: p.lat[i]!, lng: p.lng[i]!, edges: new Map() }));
  for (let i = 0; i < p.ea.length; i++) {
    const a = p.keys[p.ea[i]!]!,
      b = p.keys[p.eb[i]!]!;
    const c: Counts = [p.ec[3 * i]!, p.ec[3 * i + 1]!, p.ec[3 * i + 2]!];
    r.nodes.get(a)!.edges.set(b, c);
    r.nodes.get(b)!.edges.set(a, [...c]);
  }
  for (const [id, bike] of p.rides) r.rides.set(id, bike);
  for (const [k, c] of p.starts) r.starts.set(k, c);
  return r;
}
