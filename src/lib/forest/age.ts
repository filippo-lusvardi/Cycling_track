// How tall a member's tree stands in a forest scene: like a real forest, old trees stand higher, and so do trees
// that have carried their rider many kilometres. Pure.
import type { Activity } from "../intervals";
import { isSport, type MainSport } from "../sport";
import type { TreeHeader } from "./types";

const DAY = 86_400_000;

/**
 * Years since the member's first ride ever, or null when unknown (a seedling). Headers published before `since`
 * existed fall back to the middle of their first year of shared rides.
 */
export function treeAge(header: Pick<TreeHeader, "since" | "years"> | undefined, today: string) {
  const since = header?.since ?? (header?.years?.[0] ? `${header.years[0]}-07-01` : null);
  if (!since) return null;
  return Math.max(0, (Date.parse(today) - Date.parse(since)) / DAY / 365.25);
}

/** Tallest a tree grows, relative to an average one: capped so a crown never reaches the names behind it. */
export const MAX_GROWTH = 1.5;
const MIN_GROWTH = 0.55;

/**
 * Kilometres that count the same: runners cover less ground, so a year of running stands as tall as a year of riding.
 */
const KM_SCALE: Record<MainSport, number> = { ride: 11_000, run: 3_000 };

/**
 * Height factor from age (years) and kilometres ridden in all, weighed equally: about 0.55 for a new rider, 1 for
 * a year and a half and ~7,500 km, then slowing down toward MAX_GROWTH (5 years and 30,000 km ≈ 1.42), so small
 * differences stay subtle and a veteran clearly stands out. Without kilometres (older headers) age alone counts;
 * 1 when nothing is known.
 */
export function growth(
  age: number | null,
  km: number | null = null,
  sport: MainSport = "ride",
): number {
  if (age == null && km == null) return 1;
  const fromAge = age != null ? 1 - Math.exp(-age / 2.2) : null;
  const fromKm = km != null ? 1 - Math.exp(-km / KM_SCALE[sport]) : null;
  const g = fromAge != null && fromKm != null ? (fromAge + fromKm) / 2 : (fromAge ?? fromKm)!;
  return MIN_GROWTH + (MAX_GROWTH - MIN_GROWTH) * g;
}

/** A member's tree height factor from their published header (1 for a seedling). */
export const treeGrowth = (header: TreeHeader | undefined, today: string) =>
  header ? growth(treeAge(header, today), header.km ?? null, header.sport ?? "ride") : 1;

/** The first ride ever and the kilometres ridden in all, for the tree's height in forests (see ./age). */
export function lifetime(
  acts: Activity[],
  sport: MainSport = "ride",
): { since: string | null; km: number } {
  let since: string | null = null;
  let metres = 0;
  for (const a of acts) {
    if (!isSport(a, sport)) continue;
    const d = a.start_date_local.slice(0, 10);
    if (since == null || d < since) since = d;
    metres += a.distance ?? 0;
  }
  return { since, km: Math.round(metres / 1000) };
}
