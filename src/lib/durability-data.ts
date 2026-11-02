// Durability over recent long rides: each ride's numbers are worked out once and kept in IndexedDB.
import { get, set } from "idb-keyval";
import {
  durabilityOf,
  durabilityProfile,
  type DurabilityProfile,
  type RideDurability,
} from "./durability";
import type { Activity } from "./intervals";
import { getActivities, getAthlete, getRideWatts, getWellness } from "./source";
import { addDays, isoDate, weightFor } from "./training";

/** Days of rides looked at, and the shortest ride that can reach the fatigue buckets. */
export const DURABILITY_DAYS = 90;
const MIN_SECS = 2 * 3600;

const isLongPowerRide = (a: Activity) =>
  (a.type ?? "").includes("Ride") &&
  a.icu_average_watts != null &&
  (a.moving_time ?? 0) >= MIN_SECS;

async function rideDurability(a: Activity, kg: number): Promise<RideDurability> {
  // The weight is part of the key: a corrected weigh-in recomputes the ride.
  const key = `durability:v1:${a.id}:${kg}`;
  const hit = await get<RideDurability>(key).catch(() => undefined);
  if (hit) return hit;
  const d = durabilityOf(await getRideWatts(a.id), kg);
  await set(key, d).catch(() => {});
  return d;
}

export async function getDurability(): Promise<DurabilityProfile & { missingWeight: number }> {
  const newest = isoDate(new Date());
  const oldest = addDays(newest, -DURABILITY_DAYS);
  // From 3 days earlier, so the first rides can fall back on the weigh-ins just before them.
  const [acts, wellness, athlete] = await Promise.all([
    getActivities({ oldest, newest }),
    getWellness({ oldest: addDays(oldest, -3), newest }),
    getAthlete().catch(() => null),
  ]);
  const rides = acts.filter(isLongPowerRide);
  const out: RideDurability[] = [];
  let missingWeight = 0;
  for (const a of rides) {
    const kg = weightFor(wellness, a.start_date_local, athlete?.weight ?? null);
    if (!kg) {
      missingWeight++;
      continue;
    }
    out.push(await rideDurability(a, kg));
  }
  return { ...durabilityProfile(out), missingWeight };
}
