// Where a plan starts: from the last 8 weeks when there are enough of them, otherwise from one question. Pure.
import { mondayOf } from "../focus";
import { isSport } from "../sport";
import { addDays } from "../training";
import type { Activity } from "../intervals";
import type { Doses, PlanSettings, PlanState } from "./types";

export type Experience = "new" | "some" | "experienced";

const HISTORY_WEEKS = 8;
const WEEKS_NEEDED = 4;
/** C: where each amount of riding starts, in seconds of work per session. Short on purpose: raising is cheap. */
const DOSES: Record<Experience, Doses> = {
  new: { tempo: 20 * 60, threshold: 15 * 60, vo2: 8 * 60, anaerobic: 3 * 60 },
  some: { tempo: 30 * 60, threshold: 25 * 60, vo2: 12 * 60, anaerobic: 5 * 60 },
  experienced: { tempo: 40 * 60, threshold: 40 * 60, vo2: 18 * 60, anaerobic: 6 * 60 },
};
/** C: what a week holds with no history to read it from. */
const NO_HISTORY_HOURS: Record<Experience, number> = { new: 2.5, some: 4, experienced: 6 };
/** C: back from time off, sessions start this much shorter. */
const COMING_BACK = 0.7;

const dayOf = (a: Activity) => a.start_date_local.slice(0, 10);

export function history(acts: Activity[], today: string) {
  const since = addDays(mondayOf(today), -HISTORY_WEEKS * 7);
  const rides = acts.filter((a) => isSport(a, "ride") && dayOf(a) >= since && dayOf(a) < today);
  const weeks = new Map<string, number>();
  for (const a of rides) {
    const w = mondayOf(dayOf(a));
    weeks.set(w, (weeks.get(w) ?? 0) + (a.moving_time ?? 0));
  }
  const totals = [...weeks.values()];
  return {
    activeWeeks: totals.length,
    usualSeconds: totals.length ? totals.reduce((a, b) => a + b, 0) / totals.length : 0,
    longestSeconds: rides.reduce((m, a) => Math.max(m, a.moving_time ?? 0), 0),
  };
}

/** Whether there's too little to go by, so the one question is worth asking. */
export const needsExperience = (acts: Activity[], today: string) =>
  history(acts, today).activeWeeks < WEEKS_NEEDED;

/** C: hours a week say roughly how much work a session can hold. */
const levelOf = (hours: number): Experience =>
  hours < 4 ? "new" : hours < 8 ? "some" : "experienced";

export const availableSeconds = (s: PlanSettings) => s.week.reduce((n, d) => n + d.minutes * 60, 0);

export function startState(input: {
  today: string;
  acts: Activity[];
  settings: PlanSettings;
  experience?: Experience | undefined;
  comingBack?: boolean | undefined;
  /** The volume to start from, when it was chosen. */
  weeklySeconds?: number | undefined;
}): PlanState {
  const { today, acts, settings } = input;
  const h = history(acts, today);
  const enough = h.activeWeeks >= WEEKS_NEEDED;
  const level = enough ? levelOf(h.usualSeconds / 3600) : (input.experience ?? "new");
  const wanted = enough ? h.usualSeconds : NO_HISTORY_HOURS[level] * 3600;
  const scale = input.comingBack ? COMING_BACK : 1;
  const weeklySeconds = Math.min(input.weeklySeconds ?? wanted * scale, availableSeconds(settings));
  const doses = Object.fromEntries(
    Object.entries(DOSES[level]).map(([k, v]) => [k, v * scale]),
  ) as Doses;
  const cycleStart = mondayOf(today);
  return {
    startedOn: today,
    cycleStart,
    buildWeeks: 3,
    weeklySeconds,
    lastBuildSeconds: weeklySeconds,
    doses,
    beforeLower: null,
    hardCap: input.comingBack ? 1 : 2,
    hardGap: 2,
    lowersThisCycle: 0,
    cleanCycles: 0,
    forcedRecovery: null,
    lastReview: null,
  };
}
