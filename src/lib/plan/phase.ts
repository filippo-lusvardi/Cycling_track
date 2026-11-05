// Which part of the season a week belongs to, counted back from the goal so a recovery week never lands on a taper. Pure.
import { differenceInCalendarDays, parseISO } from "date-fns";
import { dayRole, mondayOf } from "../focus";
import type { Race } from "../races";
import { addDays } from "../training";
import type { Phase, PlanGoal, PlanState } from "./types";

/** C: weeks before a race where each phase begins. */
const SPECIFIC_WEEKS = 6;
const BUILD_WEEKS = 14;
/** C: a rolling season: one cycle of base, then two of build. */
const ROLLING = 3;

export type WeekShape = { monday: string; phase: Phase; recovery: boolean };

const weeksBetween = (a: string, b: string) =>
  Math.floor(differenceInCalendarDays(parseISO(b), parseISO(a)) / 7);

/** The race a plan works toward: the next A, otherwise the next B. */
export function goalRace(races: Race[], today: string): Race | null {
  const ahead = races
    .filter((r) => r.date >= today && r.priority !== "C")
    .sort((a, b) => a.date.localeCompare(b.date));
  return ahead.find((r) => r.priority === "A") ?? ahead[0] ?? null;
}

export function weekShape(
  monday: string,
  goal: PlanGoal,
  races: Race[],
  state: Pick<PlanState, "buildWeeks" | "cycleStart" | "forcedRecovery">,
): WeekShape {
  const cycle = state.buildWeeks + 1;
  const forced = state.forcedRecovery === monday;
  const race = goal === "race" ? goalRace(races, monday) : null;
  if (race) {
    const inTaper = Array.from({ length: 7 }, (_, i) => addDays(monday, i)).some(
      (d) => dayRole([race], d)?.role === "sharpen" || d === race.date,
    );
    if (inTaper) return { monday, phase: "taper", recovery: false };
    const taperWeek = mondayOf(addDays(race.date, -10));
    const before = weeksBetween(monday, taperWeek);
    const toRace = weeksBetween(monday, race.date);
    const phase = toRace <= SPECIFIC_WEEKS ? "specific" : toRace <= BUILD_WEEKS ? "build" : "base";
    return { monday, phase, recovery: forced || (before > 0 && before % cycle === 0) };
  }
  const since = Math.max(0, weeksBetween(state.cycleStart, monday));
  const recovery = forced || since % cycle === state.buildWeeks;
  if (goal === "healthy") return { monday, phase: "maintain", recovery };
  const phase = Math.floor(since / cycle) % ROLLING === 0 ? "base" : "build";
  return { monday, phase, recovery };
}
