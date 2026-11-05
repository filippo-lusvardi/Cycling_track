// The review, twice a week: raise, hold or lower. How it feels comes first, and heart rate variability can only hold or
// lower. Missing data never raises anything. The approach follows Nuuttila 2022; the thresholds are conventions (C). Pure.
import { addDays } from "../training";
import type { Wellness } from "../intervals";
import type { Doses, PlanState, Review, ReviewResult, SessionOutcome } from "./types";

/** E: Nuuttila's steps: up in small amounts, down decisively. */
const RAISE = 1.05;
const LOWER = 0.75;
/** C: a week grows at most this much over the last build week. */
const MOST_GROWTH = 1.1;
/** C: at least this much of a hard session done for it to count as done. */
const DONE = 0.9;
/** C: a check-in this low on average (1 best, 4 worst) is a low morning. */
const LOW_MORNING = 3;
const LOW_MORNINGS = 3;
const LOOK_BACK_MORNINGS = 4;
const MISSED_LIMIT = 2;

/** Mornings of the last four with a low check-in. */
export function lowMornings(
  wellness: (Pick<Wellness, "id"> &
    Partial<Pick<Wellness, "sleepQuality" | "fatigue" | "stress" | "mood">>)[],
  today: string,
) {
  const from = addDays(today, -(LOOK_BACK_MORNINGS - 1));
  return wellness.filter((w) => {
    if (w.id < from || w.id > today) return false;
    const answers = [w.sleepQuality, w.fatigue, w.stress, w.mood].filter(
      (a): a is number => a != null,
    );
    if (!answers.length) return false;
    return answers.reduce((a, b) => a + b, 0) / answers.length >= LOW_MORNING;
  }).length;
}

export type ReviewInput = {
  outcomes: SessionOutcome[];
  lowMornings: number;
  hrvLow: boolean;
  recoveryWeek: boolean;
  off: boolean;
  /** The last review's date: sessions up to it have had their say, and are only context now. */
  since?: string | null | undefined;
};

const done = (o: SessionOutcome) =>
  o.doneSeconds != null && o.doneSeconds >= o.plannedSeconds * DONE;

/**
 * "Too hard" after riding well over the target says the riding was hard, not that the plan was: it doesn't count. With
 * no power to compare, the rating stands.
 */
const wentOver = (o: SessionOutcome) =>
  o.execution?.verdict === "over" && (o.rating === "harder" || o.rating === "failed");
export const credibleRating = (o: SessionOutcome) => (wentOver(o) ? null : o.rating);

export function review(input: ReviewInput): Review {
  const { outcomes, hrvLow } = input;
  const byDate = [...outcomes].sort((a, b) => a.date.localeCompare(b.date));
  const lowFeel = input.lowMornings >= LOW_MORNINGS;
  const isNew = (o: SessionOutcome) => !input.since || o.date > input.since;
  if (input.off) return { result: "hold", reason: "off" };

  if (byDate.some((o) => isNew(o) && o.hard && credibleRating(o) === "failed"))
    return { result: "lower", reason: "failed" };
  const rated = byDate.filter((o) => credibleRating(o));
  const lastTwo = rated.slice(-2);
  if (lastTwo.length === 2 && lastTwo.some(isNew) && lastTwo.every((o) => o.rating === "harder"))
    return { result: "lower", reason: "harder-twice" };
  if (lowFeel) return { result: "lower", reason: hrvLow ? "hrv-and-feel" : "low-mornings" };

  if (input.recoveryWeek) return { result: "hold", reason: "recovery-week" };
  if (byDate.filter((o) => o.doneSeconds == null).length >= MISSED_LIMIT)
    return { result: "hold", reason: "missed" };
  const hard = byDate.filter((o) => o.hard && isNew(o));
  if (hard.some(wentOver)) return { result: "hold", reason: "went-over" };
  if (!hard.length || hard.some((o) => !o.rating)) return { result: "hold", reason: "no-ratings" };
  if (!hard.every(done)) return { result: "hold", reason: "not-all-done" };
  // "Fine" on a session ridden well under the target doesn't show it could go further.
  if (hard.some((o) => o.execution?.verdict === "under"))
    return { result: "hold", reason: "under-target" };
  if (hard.some((o) => o.rating === "harder") || input.lowMornings > 0)
    return { result: "hold", reason: "mixed" };
  if (hrvLow) return { result: "hold", reason: "low-hrv" };
  return { result: "raise", reason: "good" };
}

const scale = (d: Doses, k: number) =>
  Object.fromEntries(Object.entries(d).map(([n, v]) => [n, v * k])) as Doses;

/** The Monday after `date`. */
const nextMonday = (date: string) => {
  const day = (new Date(`${date}T12:00:00`).getDay() + 6) % 7;
  return addDays(date, 7 - day);
};

/** What a review changes. Two lowers in a cycle bring recovery forward and shorten the cycles: recovery is learned. */
export function applyReview(state: PlanState, result: ReviewResult, today: string): PlanState {
  const next: PlanState = { ...state, lastReview: today };
  if (result === "raise") {
    next.doses = scale(state.doses, RAISE);
    next.weeklySeconds = Math.min(
      state.weeklySeconds * RAISE,
      state.lastBuildSeconds * MOST_GROWTH,
    );
    return next;
  }
  if (result === "lower") {
    next.beforeLower = state.beforeLower ?? state.doses;
    next.doses = scale(state.doses, LOWER);
    next.weeklySeconds = state.weeklySeconds * LOWER;
    next.hardCap = 1;
    next.lowersThisCycle = state.lowersThisCycle + 1;
    if (next.lowersThisCycle >= 2) {
      next.forcedRecovery = nextMonday(today);
      next.buildWeeks = 2;
      next.hardGap = 3;
    }
  }
  return next;
}

/** A new week begins. After a recovery week the level comes back, and the rhythm eases again after two clean cycles. */
export function rollWeek(
  state: PlanState,
  finished: { monday: string; recovery: boolean; seconds: number; lowEnding: boolean },
): PlanState {
  if (!finished.recovery) return { ...state, lastBuildSeconds: finished.seconds };
  const clean = state.lowersThisCycle === 0;
  const cleanCycles = clean ? state.cleanCycles + 1 : 0;
  const eased = cleanCycles >= 2;
  return {
    ...state,
    // A recovery week brought forward starts the count again; otherwise the season's rhythm keeps going.
    cycleStart:
      state.forcedRecovery === finished.monday ? addDays(finished.monday, 7) : state.cycleStart,
    doses: state.beforeLower && !finished.lowEnding ? state.beforeLower : state.doses,
    weeklySeconds: finished.lowEnding
      ? state.weeklySeconds
      : Math.max(state.weeklySeconds, state.lastBuildSeconds),
    beforeLower: null,
    hardCap: 2,
    lowersThisCycle: 0,
    cleanCycles,
    buildWeeks: eased ? 3 : state.buildWeeks,
    hardGap: eased ? 2 : state.hardGap,
    forcedRecovery: null,
  };
}
