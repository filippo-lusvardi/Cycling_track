// Your roads: every outdoor ride's 20 m track laid on a fine grid and joined into a graph, each road knowing how many of
// your rides went along it. Two rides on the same road with a few metres of GPS between them land on the same nodes,
// since a point snaps to a node already there before it makes a new one. Routes are then walked on this graph first,
// preferring the roads you ride most, and only the gaps are left to the router. Pure (storage is in roads-app.ts).
import { haversine } from "../segments";
import type { LatLng } from "./geo";

/** About 22 m by 23 m at 46° north. */
const DLAT = 0.0002;
const DLNG = 0.0003;
const SNAP = 25;
/** Longer steps are a GPS gap (a tunnel, a lost signal): no road is drawn across them. */
const MAX_STEP = 150;

type Node = { lat: number; lng: number; edges: Map<number, number> };

export type Roads = {
  nodes: Map<number, Node>;
  /** Rides already laid on the graph. */
  rides: Set<string>;
  /** How many rides started at each node: the most is home. */
  starts: Map<number, number>;
};

export const emptyRoads = (): Roads => ({ nodes: new Map(), rides: new Set(), starts: new Map() });

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
export function addRide(r: Roads, id: string, lat: ArrayLike<number>, lng: ArrayLike<number>) {
  if (r.rides.has(id)) return;
  r.rides.add(id);
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
          a.edges.set(k, (a.edges.get(k) ?? 0) + 1);
          b.edges.set(prev, (b.edges.get(prev) ?? 0) + 1);
        }
      }
    }
    prev = k;
  }
}

/** The node nearest a point, within `max` metres. */
export function nearestNode(r: Roads, p: LatLng, max = 600): number | null {
  const [y, x] = cell(p.lat, p.lng);
  const rings = Math.ceil(max / 22);
  let best: number | null = null;
  let bd = max;
  for (let ring = 0; ring <= rings; ring++) {
    // Once something is found, a ring further out can't be closer than its inner edge.
    if (best != null && (ring - 1) * 22 > bd) break;
    for (let dy = -ring; dy <= ring; dy++)
      for (let dx = -ring; dx <= ring; dx++) {
        if (Math.max(Math.abs(dy), Math.abs(dx)) !== ring) continue;
        const n = r.nodes.get(keyOf(y + dy, x + dx));
        if (!n) continue;
        const d = haversine(p.lat, p.lng, n.lat, n.lng);
        if (d < bd) {
          bd = d;
          best = keyOf(y + dy, x + dx);
        }
      }
  }
  return best;
}

export const nodeAt = (r: Roads, k: number): LatLng => {
  const n = r.nodes.get(k)!;
  return { lat: n.lat, lng: n.lng };
};

/** A road ridden this many times costs this share of its length: the more you ride it, the cheaper. */
const weight = (count: number) => 1 / (1 + Math.log(1 + count));

class Heap {
  private a: [number, number][] = [];
  get size() {
    return this.a.length;
  }
  push(k: number, p: number) {
    const a = this.a;
    a.push([p, k]);
    let i = a.length - 1;
    while (i) {
      const j = (i - 1) >> 1;
      if (a[j]![0] <= a[i]![0]) break;
      [a[i], a[j]] = [a[j]!, a[i]!];
      i = j;
    }
  }
  pop(): number {
    const a = this.a;
    const top = a[0]![1];
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l]![0] < a[m]![0]) m = l;
        if (r < a.length && a[r]![0] < a[m]![0]) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m]!, a[i]!];
        i = m;
      }
    }
    return top;
  }
}

/** Along your roads from one node to another, preferring the ones you ride most; null when they don't connect. */
export function roadPath(r: Roads, from: number, to: number, maxNodes = 400_000): LatLng[] | null {
  const goal = r.nodes.get(to);
  if (!goal || !r.nodes.has(from)) return null;
  let top = 0;
  for (const n of r.nodes.values()) for (const c of n.edges.values()) top = Math.max(top, c);
  const hw = weight(top);
  const h = (k: number) => {
    const n = r.nodes.get(k)!;
    return haversine(n.lat, n.lng, goal.lat, goal.lng) * hw;
  };
  const cost = new Map<number, number>([[from, 0]]);
  const back = new Map<number, number>();
  const done = new Set<number>();
  const open = new Heap();
  open.push(from, h(from));
  while (open.size && done.size < maxNodes) {
    const k = open.pop();
    if (done.has(k)) continue;
    if (k === to) {
      const path: LatLng[] = [];
      for (let c: number | undefined = to; c != null; c = back.get(c)) path.push(nodeAt(r, c));
      return path.reverse();
    }
    done.add(k);
    const n = r.nodes.get(k)!;
    const g = cost.get(k)!;
    for (const [m, count] of n.edges) {
      if (done.has(m)) continue;
      const o = r.nodes.get(m)!;
      const c = g + haversine(n.lat, n.lng, o.lat, o.lng) * weight(count);
      if (c < (cost.get(m) ?? Infinity)) {
        cost.set(m, c);
        back.set(m, k);
        open.push(m, c + h(m));
      }
    }
  }
  return null;
}

/** How many of your rides went along the road at this point: 0 when it isn't one of yours. */
export function ridesAt(r: Roads, p: LatLng, tol = 30): number {
  const k = nearestNode(r, p, tol);
  if (k == null) return 0;
  let most = 0;
  for (const c of r.nodes.get(k)!.edges.values()) most = Math.max(most, c);
  return most;
}

/** The share of a line's points that lie on your roads. */
export function ownShare(r: Roads, line: { lat: number[]; lng: number[] }): number {
  if (!line.lat.length || !r.nodes.size) return 0;
  let on = 0;
  let n = 0;
  // Every 5th point is plenty at 20 m spacing or finer.
  for (let i = 0; i < line.lat.length; i += 5) {
    n++;
    if (nearestNode(r, { lat: line.lat[i]!, lng: line.lng[i]! }, 30) != null) on++;
  }
  return n ? on / n : 0;
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
export function roadLines(
  r: Roads,
  box: [[number, number], [number, number]],
  minRides = 1,
): RoadLine[] {
  const [[s, w], [n, e]] = box;
  const inside = (k: number) => {
    const p = r.nodes.get(k)!;
    return p.lat >= s && p.lat <= n && p.lng >= w && p.lng <= e;
  };
  const used = new Set<string>();
  const ek = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);
  const degree = (k: number) => r.nodes.get(k)!.edges.size;
  const out: RoadLine[] = [];
  const walk = (a: number, b: number) => {
    const line: RoadLine = { lat: [], lng: [], rides: r.nodes.get(a)!.edges.get(b)! };
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
      const next = [...r.nodes.get(cur)!.edges.keys()].find((m) => m !== prev)!;
      if (used.has(ek(cur, next))) break;
      const c = r.nodes.get(cur)!.edges.get(next)!;
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
      if (used.has(ek(k, m))) continue;
      walk(k, m);
    }
  }
  return out;
}

// --- a compact form for IndexedDB ---

export type PackedRoads = {
  v: 1;
  keys: Float64Array;
  lat: Float32Array;
  lng: Float32Array;
  /** Edges once each (a < b) as indexes into `keys`, and their counts. */
  ea: Uint32Array;
  eb: Uint32Array;
  ec: Uint16Array;
  rides: string[];
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
        ec.push(Math.min(65535, c));
      }
  return {
    v: 1,
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
    r.nodes.get(a)!.edges.set(b, p.ec[i]!);
    r.nodes.get(b)!.edges.set(a, p.ec[i]!);
  }
  for (const id of p.rides) r.rides.add(id);
  for (const [k, c] of p.starts) r.starts.set(k, c);
  return r;
}
