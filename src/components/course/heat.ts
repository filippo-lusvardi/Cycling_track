// Your roads as a heat map, in the app's own data colours: cyan where you've been once or twice, gold on roads you
// ride often, orange then red only on your everyday ones; each with a soft halo of its colour.
import type { MapLine } from "@/components/RouteMap";
import type { RoadLine, Roads } from "@/lib/course/my-roads";

/** The most rides on any one road: the top of the scale. */
export function mostRidden(r: Roads): number {
  let top = 1;
  for (const n of r.nodes.values()) for (const c of n.edges.values()) top = Math.max(top, c);
  return top;
}

/** 0–1: how ridden a road is against the most ridden one, on a log scale so a few rides already show. */
export const heat = (rides: number, top: number) =>
  top > 1 ? Math.min(1, Math.log(1 + rides) / Math.log(1 + top)) : 0.5;

export const heatColor = (h: number) =>
  h < 0.35 ? "var(--z3)" : h < 0.65 ? "var(--z4)" : h < 0.85 ? "var(--z5)" : "var(--z6)";

/** Halo and line for each road; quieter under a route already drawn. */
export function heatLines(lines: RoadLine[], top: number, dim: boolean): MapLine[] {
  const halos: MapLine[] = [];
  const cores: MapLine[] = [];
  for (const l of lines) {
    const h = heat(l.rides, top);
    const color = heatColor(h);
    halos.push({ lat: l.lat, lng: l.lng, color, weight: 8 + h * 8, opacity: dim ? 0.1 : 0.2 });
    cores.push({ lat: l.lat, lng: l.lng, color, weight: 2 + h * 3, opacity: dim ? 0.5 : 0.95 });
  }
  // All halos first, so no halo lies over another road's line.
  return [...halos, ...cores];
}
