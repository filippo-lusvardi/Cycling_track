// The weeks after the next one: their shape only. They say where things are heading and are redrawn as things change. Pure.
import type { Race } from "../races";
import { addDays } from "../training";
import { weekSeconds } from "./layout";
import { goalRace, weekShape, type WeekShape } from "./phase";
import type { PlanGoal, PlanSettings, PlanState } from "./types";

const ROLLING_WEEKS = 8;
const MOST_WEEKS = 40;

export type OutlineWeek = WeekShape & { seconds: number };

export function outline(
  monday: string,
  goal: PlanGoal,
  races: Race[],
  state: PlanState,
  settings: PlanSettings,
): OutlineWeek[] {
  const race = goal === "race" ? goalRace(races, monday) : null;
  const weeks: OutlineWeek[] = [];
  for (let i = 0; i < (race ? MOST_WEEKS : ROLLING_WEEKS); i++) {
    const m = addDays(monday, 7 * i);
    if (race && m > race.date) break;
    const shape = weekShape(m, goal, races, state);
    weeks.push({ ...shape, seconds: weekSeconds(shape, state, settings) });
  }
  return weeks;
}
