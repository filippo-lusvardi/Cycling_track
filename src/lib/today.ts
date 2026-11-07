// What the Today page opens with: the sessions still to do, and whether today's crown agrees with them.
import type { Activity, PlannedEvent } from "./intervals";
import { sportOfActivity } from "./sport";
import type { WorkoutBlock } from "./workout";

/** Less time than this above the day's zones is a few strides, not a harder session. */
const CLASH_SECONDS = 180;

const isRace = (e: PlannedEvent) => e.category.startsWith("RACE");

/** Today's sessions not yet done: not paired with an activity, and no activity of that sport today. */
export function pendingSessions(planned: PlannedEvent[], todaysActs: Activity[]): PlannedEvent[] {
  return planned.filter(
    (e) =>
      !isRace(e) &&
      !e.pairedActivityId &&
      !todaysActs.some((a) => sportOfActivity(a) === sportOfActivity(e)),
  );
}

/** The highest zone in a recommendation's "Z3–Z4"; none, as on a rest day, means 0. */
export const topZone = (zones: string) =>
  Math.max(0, ...[...zones.matchAll(/Z(\d)/g)].map((m) => Number(m[1])));

/** Whether a workout spends real time above the zones today's crown advises. */
export function planClash(blocks: WorkoutBlock[], zones: string): boolean {
  const top = topZone(zones);
  const above = blocks
    .filter((b) => b.zone != null && b.zone > top)
    .reduce((s, b) => s + b.seconds, 0);
  return above >= CLASH_SECONDS;
}

export type UpcomingDay = { date: string; event: PlannedEvent | null };

/** These dates with the session planned on each; empty when none of them has one. */
export function upcomingDays(planned: PlannedEvent[], dates: string[]): UpcomingDay[] {
  const out = dates.map((date) => ({
    date,
    event: planned.find((e) => e.date === date) ?? null,
  }));
  return out.some((d) => d.event) ? out : [];
}

/** How hard a session is, as a fraction of threshold, from its load and length. */
export const intensityOf = (load: number, seconds: number) =>
  seconds > 0 ? Math.sqrt(load / ((seconds / 3600) * 100)) : 0;
