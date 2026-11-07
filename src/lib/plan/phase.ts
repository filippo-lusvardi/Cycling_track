// Which part of the season a week belongs to, counted back from the goal so a recovery week never lands on a taper. Pure.
import { differenceInCalendarDays, parseISO } from "date-fns";
import { dayRole, mondayOf } from "../focus";
import type { Race } from "../races";
import { addDays } from "../training";
import { seasonWeek } from "./season";
import type { Phase, PlanSettings, PlanState } from "./types";

/** C: weeks before a race where each phase begins. */
const SPECIFIC_WEEKS = 6;
const BUILD_WEEKS = 14;
/** C: a rolling season: one cycle of base, then two of build. */
const ROLLING = 3;
/** The days of an A race's taper, as in `dayRole`. */
const TAPER_DAYS = 10;

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
  { goal, season }: Pick<PlanSettings, "goal" | "season">,
  races: Race[],
  state: Pick<PlanState, "buildWeeks" | "cycleStart" | "forcedRecovery">,
): WeekShape {
  if (goal === "season" && season) {
    const week = seasonWeek(monday, season, races, state, {
      specific: SPECIFIC_WEEKS,
      build: BUILD_WEEKS,
      taperDays: TAPER_DAYS,
    });
    if (week) return { monday, ...week };
  }
  const cycle = state.buildWeeks + 1;
  const forced = state.forcedRecovery === monday;
  const race = goal === "race" ? goalRace(races, monday) : null;
  if (race) {
    const inTaper = Array.from({ length: 7 }, (_, i) => addDays(monday, i)).some(
      (d) => dayRole([race], d)?.role === "sharpen" || d === race.date,
    );
    if (inTaper) return { monday, phase: "taper", recovery: false };
    const taperWeek = mondayOf(addDays(race.date, -TAPER_DAYS));
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
