// Durability: the power you still have after hours of work (Mateo-March et al., record power profile under fatigue).
// Pure and browser-safe.
import { mmp } from "./analysis";

/** Work done before the effort, in kJ per kg of body weight; 0 is fresh. */
export const BUCKETS = [0, 15, 30, 45] as const;
/** Efforts compared, in seconds. */
export const EFFORTS = [60, 300, 1200] as const;

export type Bucket = (typeof BUCKETS)[number];
/** Best watts per effort once each bucket's work was done; null when the ride never got there with enough left. */
export type RideDurability = Record<Bucket, (number | null)[]>;

/** A ride's best 1, 5 and 20 min power after 0, 15, 30 and 45 kJ/kg (1 Hz watts, rider's weight in kg). */
export function durabilityOf(watts: (number | null)[], kg: number): RideDurability {
  const out = {} as RideDurability;
  let joules = 0;
  let i = 0;
  for (const b of BUCKETS) {
    while (i < watts.length && joules / 1000 / kg < b) joules += Math.max(0, watts[i++] ?? 0);
    out[b] = joules / 1000 / kg >= b ? mmp(watts.slice(i), [...EFFORTS]) : EFFORTS.map(() => null);
  }
  return out;
}

export type DurabilityProfile = {
  /** Best watts per bucket (rows) and effort (columns) across the rides. */
  best: Record<Bucket, (number | null)[]>;
  /** Drop from fresh in %, per bucket and effort (positive = less power). */
  drop: Record<Bucket, (number | null)[]>;
  rides: number;
  /** Rides that got past each bucket with a 20 min effort still to measure. */
  reached: Record<Bucket, number>;
};

/** Best of every ride per bucket, and how far each sits under the fresh best. */
export function durabilityProfile(rides: RideDurability[]): DurabilityProfile {
  const best = {} as DurabilityProfile["best"];
  const drop = {} as DurabilityProfile["drop"];
  for (const b of BUCKETS)
    best[b] = EFFORTS.map((_, k) => {
      const v = rides.map((r) => r[b][k]).filter((x): x is number => x != null && x > 0);
      return v.length ? Math.max(...v) : null;
    });
  for (const b of BUCKETS)
    drop[b] = EFFORTS.map((_, k) => {
      const fresh = best[0][k];
      const v = best[b][k];
      return fresh && v != null ? ((fresh - v) / fresh) * 100 : null;
    });
  const reached = Object.fromEntries(
    BUCKETS.map((b) => [b, rides.filter((r) => r[b][2] != null).length]),
  ) as DurabilityProfile["reached"];
  return { best, drop, rides: rides.length, reached };
}

export type DurabilityVerdict = "strong" | "average" | "fades";

/** From the 5 min drop after 30 kJ/kg: under 5% holds well, over 10% fades (the spread seen in trained riders). */
export function durabilityVerdict(p: DurabilityProfile): DurabilityVerdict | null {
  const d = p.drop[30][1];
  if (d == null) return null;
  return d < 5 ? "strong" : d <= 10 ? "average" : "fades";
}
