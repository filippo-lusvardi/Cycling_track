// "Un'ora con salite corte e ripide da qui": loops from a wish. The wish becomes a target length and rules for the
// climbs; loops are drawn through climbs you already know that fit the rules (each taken uphill), or as triangles out
// from the start when none fit, laid on your roads; each is routed, timed and scored, and the best three that differ
// are kept. Pure apart from the router passed in.
import type { Climb } from "../climbs";
import { coverage } from "../segments";
import type { Router } from "./brouter";
import { lineClimbs, lineSeconds, distanceFor, type Rider } from "./estimate";
import { bearing, between, gainOf, offset, selfOverlap, type LatLng } from "./geo";
import { nearestNode, nodeAt, type Roads } from "./my-roads";
import { planRoute, type PlanOptions, type Planned } from "./plan";

export type ClimbWish = "short" | "long" | "steep" | "gentle" | "flat";
export const CLIMB_WISHES: ClimbWish[] = ["short", "long", "steep", "gentle", "flat"];

export type Wish = {
  /** How long (s) or how far (m); one of them. */
  seconds?: number | undefined;
  meters?: number | undefined;
  climbs: ClimbWish[];
  /** Metres to climb in all, when said. */
  gain?: number | undefined;
  start: LatLng;
  options: PlanOptions;
};

/** A climb you have ridden, from the segment analysis: where it starts and tops out. */
export type KnownClimb = {
  id: string;
  name: string;
  start: LatLng;
  top: LatLng;
  length: number;
  /** Average grade, %. */
  grade: number;
};

export type Proposal = {
  key: string;
  checkpoints: LatLng[];
  planned: Planned;
  seconds: number;
  climbs: Climb[];
  /** Known climbs the loop was drawn through. */
  through: KnownClimb[];
  score: number;
};

/** Short: under 2.5 km. Long: over 5 km. Steep: 7% or more. Gentle: under 5.5%. */
export function fits(c: { length: number; grade: number }, wish: ClimbWish[]): boolean {
  if (wish.includes("short") && c.length >= 2500) return false;
  if (wish.includes("long") && c.length <= 5000) return false;
  if (wish.includes("steep") && c.grade < 7) return false;
  if (wish.includes("gentle") && c.grade >= 5.5) return false;
  return true;
}

const wantsClimbs = (w: ClimbWish[]) => w.some((x) => x !== "flat");
const hilly = (w: Wish) => wantsClimbs(w.climbs) || (w.gain ?? 0) > 0;

export function targetMeters(w: Wish, r: Rider): number {
  return w.meters ?? distanceFor(w.seconds ?? 3600, r, hilly(w));
}

/** Road bends: a loop on the map is about this much longer than its corners joined straight. */
const BENDS = 1.3;
const MAX_LOOPS = 6;

type Draft = {
  key: string;
  checkpoints: LatLng[];
  through: KnownClimb[];
  scale?: (k: number) => Draft;
};

/** Loops through known climbs: one, two or three of them, taken around the start in order of direction. */
export function climbLoops(w: Wish, target: number, known: KnownClimb[], seed = 0): Draft[] {
  if (!wantsClimbs(w.climbs)) return [];
  const reach = target * 0.45;
  const near = known
    .filter(
      (c) => fits(c, w.climbs) && c.length < target * 0.5 && between(w.start, c.start) < reach,
    )
    .sort((a, b) => between(w.start, a.start) - between(w.start, b.start))
    .slice(0, 12);
  const combos: KnownClimb[][] = [];
  for (let i = 0; i < near.length; i++) {
    combos.push([near[i]!]);
    for (let j = i + 1; j < near.length; j++) {
      combos.push([near[i]!, near[j]!]);
      for (let k = j + 1; k < near.length; k++) combos.push([near[i]!, near[j]!, near[k]!]);
    }
  }
  const drafts = combos.flatMap((cs) => {
    const ordered = [...cs].sort((a, b) => bearing(w.start, a.start) - bearing(w.start, b.start));
    const pts = [w.start, ...ordered.flatMap((c) => [c.start, c.top]), w.start];
    const est = pts.reduce((s, p, i) => (i ? s + between(pts[i - 1]!, p) : 0), 0) * BENDS;
    const err = Math.abs(est - target) / target;
    if (est < target * 0.55 || est > target * 1.35) return [];
    return [
      {
        key: ordered.map((c) => c.id).join("+"),
        checkpoints: pts.slice(0, -1),
        through: ordered,
        rank: err - 0.08 * ordered.length,
      },
    ];
  });
  drafts.sort((a, b) => a.rank - b.rank);
  // Another round skips the loops already offered.
  return drafts.slice(seed * 3, seed * 3 + MAX_LOOPS).map(({ rank: _rank, ...d }) => d);
}

/** Triangles out from the start in a few directions, their corners moved onto your roads. */
export function triangleLoops(
  w: Wish,
  target: number,
  roads: Roads | null,
  count: number,
  seed = 0,
): Draft[] {
  const make = (dir: number, side: number): Draft => {
    const corner = (b: number) => {
      const p = offset(w.start, b, side);
      if (!w.options.myRoads || !roads) return p;
      const k = nearestNode(roads, p, side * 0.3);
      return k == null ? p : nodeAt(roads, k);
    };
    return {
      key: `tri-${dir}-${Math.round(side)}`,
      checkpoints: [w.start, corner(dir - 30), corner(dir + 30)],
      through: [],
      scale: (k) => make(dir, side * k),
    };
  };
  const side = target / (3 * BENDS);
  const out: Draft[] = [];
  for (let i = 0; i < count; i++) out.push(make((seed * 25 + (i * 360) / count) % 360, side));
  return out;
}

export function scoreOf(
  w: Wish,
  target: number,
  p: { planned: Planned; seconds: number; climbs: Climb[] },
) {
  const meters = p.planned.line.dist.at(-1) ?? 0;
  const err = w.seconds
    ? Math.abs(p.seconds - w.seconds) / w.seconds
    : Math.abs(meters - target) / target;
  let s = err * 3;
  const climbs = p.climbs.map((c) => ({ length: c.length, grade: c.avgGrade }));
  if (wantsClimbs(w.climbs)) {
    const ok = climbs.filter((c) => fits(c, w.climbs)).length;
    s += ok ? -0.1 * Math.min(ok, 3) : 1.2;
    // Short climbs asked: a long one in the way counts against.
    if (w.climbs.includes("short")) s += 0.3 * climbs.filter((c) => c.length > 5000).length;
  }
  const gain = gainOf(p.planned.line.alt);
  if (w.climbs.includes("flat") && meters > 0) s += gain / meters / 0.01;
  if (w.gain) s += Math.abs(gain - w.gain) / w.gain;
  if (w.options.myRoads) s += (1 - p.planned.own) * 0.8;
  s += selfOverlap(p.planned.line);
  return s;
}

export async function generate(
  w: Wish,
  deps: { route: Router; roads: Roads | null; rider: Rider; known: KnownClimb[] },
  seed = 0,
  signal?: AbortSignal,
): Promise<Proposal[]> {
  const target = targetMeters(w, deps.rider);
  const options: PlanOptions = { ...w.options, loop: true };
  const drafts = climbLoops(w, target, deps.known, seed);
  drafts.push(
    ...triangleLoops(w, target, deps.roads, Math.max(2, MAX_LOOPS - drafts.length), seed),
  );
  const done: Proposal[] = [];
  const run = async (d: Draft) => {
    try {
      const planned = await planRoute(d.checkpoints, options, deps, signal);
      const seconds = lineSeconds(planned.line, deps.rider);
      const climbs = lineClimbs(planned.line, deps.rider);
      const p = {
        key: d.key,
        checkpoints: d.checkpoints,
        planned,
        seconds,
        climbs,
        through: d.through,
        score: 0,
      };
      p.score = scoreOf(w, target, p);
      done.push(p);
      return p;
    } catch (e) {
      if (signal?.aborted) throw e;
      return null;
    }
  };
  for (const d of drafts.slice(0, MAX_LOOPS)) await run(d);
  // A triangle that came out too long or too short is drawn again at the size that fits, once.
  const off = drafts
    .slice(0, MAX_LOOPS)
    .flatMap((d) => {
      const p = done.find((x) => x.key === d.key);
      if (!p || !d.scale) return [];
      const got = w.seconds ? p.seconds / w.seconds : (p.planned.line.dist.at(-1) ?? 0) / target;
      return Math.abs(got - 1) > 0.15 ? [{ d, got }] : [];
    })
    .slice(0, 3);
  for (const { d, got } of off) await run(d.scale!(1 / got));
  return pickDistinct(done, 3);
}

/** The best ones, leaving out any that runs mostly along a better one. */
export function pickDistinct(ps: Proposal[], n: number): Proposal[] {
  const out: Proposal[] = [];
  for (const p of [...ps].sort((a, b) => a.score - b.score)) {
    if (out.some((q) => coverage(p.planned.line, q.planned.line, 40).frac > 0.75)) continue;
    out.push(p);
    if (out.length === n) break;
  }
  return out;
}
