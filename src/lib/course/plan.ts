// A route through checkpoints: each stretch between two of them goes along your roads where they connect them without a
// long detour, and the router fills the rest. The path on your roads is handed to the router as vias every ~1.5 km, so
// the line that comes back follows real roads and carries their altitude. Pure apart from the router passed in.
import type { RouteProfile, Router } from "./brouter";
import { between, nearestIndex, pathLength, thin, type LatLng, type Line } from "./geo";
import { nearestNode, ownShare, roadPath, type Roads } from "./my-roads";

export type PlanOptions = {
  /** Prefer the roads you usually ride. */
  myRoads: boolean;
  /** Cycle paths and quiet lanes where there are some. */
  cyclepaths: boolean;
  /** Back to the first checkpoint at the end. */
  loop: boolean;
};

export const DEFAULT_OPTIONS: PlanOptions = { myRoads: true, cyclepaths: false, loop: false };

export const profileOf = (o: PlanOptions): RouteProfile => (o.cyclepaths ? "cyclepaths" : "road");

export type Planned = {
  line: Line;
  /** Where each checkpoint falls on the line (an index), the closing one of a loop included. */
  stops: number[];
  /** Share of the line on your roads (0–1). */
  own: number;
};

/** How far your roads may stretch a leg against the straight line (×1.3 for a road's usual bends) before it's a detour. */
export const DETOUR = 1.35;
const VIA_EVERY = 1500;
/** How far off your roads a checkpoint may be for the leg still to join them. */
const REACH = 500;

/** The points to send the router for one leg: its ends, and your roads between them when they're worth it. */
export function legVias(a: LatLng, b: LatLng, roads: Roads | null): LatLng[] {
  if (!roads?.nodes.size) return [a, b];
  const na = nearestNode(roads, a, REACH);
  const nb = nearestNode(roads, b, REACH);
  if (na == null || nb == null || na === nb) return [a, b];
  const path = roadPath(roads, na, nb);
  if (!path) return [a, b];
  const along = between(a, path[0]!) + pathLength(path) + between(path.at(-1)!, b);
  const crow = between(a, b);
  if (along > DETOUR * 1.3 * crow + 300) return [a, b];
  const inner = thin(path, VIA_EVERY).slice(1, -1);
  return [a, ...inner, b];
}

/** All the vias of a route through checkpoints (closing the loop when asked). */
export function routeVias(checkpoints: LatLng[], o: PlanOptions, roads: Roads | null): LatLng[] {
  const pts = o.loop && checkpoints.length > 1 ? [...checkpoints, checkpoints[0]!] : checkpoints;
  const out: LatLng[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const leg = legVias(pts[i]!, pts[i + 1]!, o.myRoads ? roads : null);
    out.push(...(i ? leg.slice(1) : leg));
  }
  return out;
}

/** Each checkpoint's place on the line, in order. */
export function stopsOn(line: Line, checkpoints: LatLng[], loop: boolean): number[] {
  const pts = loop && checkpoints.length > 1 ? [...checkpoints, checkpoints[0]!] : checkpoints;
  const stops: number[] = [];
  let from = 0;
  pts.forEach((p, i) => {
    const k =
      i === pts.length - 1 ? line.lat.length - 1 : i === 0 ? 0 : nearestIndex(line, p, from);
    stops.push(k);
    from = k;
  });
  return stops;
}

export async function planRoute(
  checkpoints: LatLng[],
  o: PlanOptions,
  deps: { route: Router; roads: Roads | null },
  signal?: AbortSignal,
): Promise<Planned> {
  const vias = routeVias(checkpoints, o, deps.roads);
  const line = await deps.route(vias, profileOf(o), signal);
  return {
    line,
    stops: stopsOn(line, checkpoints, o.loop),
    own: deps.roads ? ownShare(deps.roads, line) : 0,
  };
}
