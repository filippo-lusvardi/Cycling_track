// Dose ladders: for each kind of hard work, the built-in workouts in order of how much work they hold. The dose moves in
// small steps, and the session changes only when the dose reaches another rung. Your own workouts stay out, since they
// may use targets some devices can't follow. Pure.
import type { SuggestWorkout } from "../suggest";
import { parseWorkout, type Thresholds } from "../workout";
import type { DoseKind } from "./types";

/** The intensity (share of threshold) from which a step counts as that kind's work. */
const WORK_FROM: Record<DoseKind, number> = {
  tempo: 0.76,
  threshold: 0.88,
  vo2: 1.0,
  anaerobic: 1.2,
};
/** For one kind of bike or a race day, not for everybody's week. */
const NOT_FOR_LADDERS = /aero-builder|ironman|70-3|big-gear|torque|low-cadence|climb-sim|fatigue/;
const RACE_ONLY = /race/;
/** Rungs this close count as the same step, so what's picked can rotate. */
const SAME_RUNG = 0.15;

export type Rung = { workout: SuggestWorkout; work: number };

export function workSeconds(w: SuggestWorkout, kind: DoseKind, th: Thresholds = {}) {
  const blocks = parseWorkout(w.description, "ride", th).blocks;
  return blocks
    .filter((b) => (b.from + b.to) / 2 >= WORK_FROM[kind])
    .reduce((n, b) => n + b.seconds, 0);
}

export function ladderFor(
  pool: SuggestWorkout[],
  kind: DoseKind,
  raceAhead: boolean,
  th: Thresholds = {},
): Rung[] {
  return pool
    .filter(
      (w) =>
        !w.mine &&
        w.kind === kind &&
        !NOT_FOR_LADDERS.test(w.id) &&
        (raceAhead || !RACE_ONLY.test(w.id)),
    )
    .map((workout) => ({ workout, work: workSeconds(workout, kind, th) }))
    .filter((r) => r.work > 0)
    .sort((a, b) => a.work - b.work || a.workout.id.localeCompare(b.workout.id));
}

/**
 * The largest rung at or under the dose that fits the time, or the smallest that fits when the dose is under them all.
 * Among rungs that are close, what wasn't done lately comes first.
 */
export function pickRung(
  ladder: Rung[],
  dose: number,
  maxSeconds: number,
  recent: ReadonlySet<string> = new Set(),
): Rung | null {
  const fits = ladder.filter((r) => r.workout.seconds <= maxSeconds);
  if (!fits.length) return null;
  const under = fits.filter((r) => r.work <= dose);
  if (!under.length) return fits[0]!;
  const top = under[under.length - 1]!.work;
  const close = under.filter((r) => r.work >= top * (1 - SAME_RUNG));
  return close.find((r) => !recent.has(r.workout.id)) ?? close[close.length - 1]!;
}
