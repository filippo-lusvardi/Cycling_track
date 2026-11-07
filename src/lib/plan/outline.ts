// The weeks after the next one: their shape only. They say where things are heading and are redrawn as things change. Pure.
import type { Race } from "../races";
import { addDays } from "../training";
import { weekSeconds } from "./layout";
import { goalRace, weekShape, type WeekShape } from "./phase";
import { seasonEnd, seasonOver } from "./season";
import { steppedVolume } from "./volume";
import type { PlanGoal, PlanSettings, PlanState } from "./types";

const ROLLING_WEEKS = 8;
const MOST_WEEKS = 40;
/** Late autumn to the following autumn. */
const SEASON_WEEKS = 56;

export type OutlineWeek = WeekShape & { seconds: number };

export type WeekGroup = {
  /** The first Monday. */
  monday: string;
  phase: OutlineWeek["phase"];
  weeks: number;
  /** A usual week of the group. Recovery weeks are left out of it: they belong to the weeks around them. */
  seconds: number;
  recoveries: number;
};

/** How close weeks must be to read as the same on the road. */
const SIMILAR = 0.1;

/** Weeks next to each other in the same phase and of about the same size, as one. A long road stays readable this way. */
export function groupWeeks(weeks: OutlineWeek[]): WeekGroup[] {
  const groups: (WeekGroup & { sizes: number[] })[] = [];
  for (const w of weeks) {
    const last = groups[groups.length - 1];
    const fits =
      !!last &&
      last.phase === w.phase &&
      (w.recovery ||
        !last.sizes.length ||
        Math.abs(w.seconds - last.sizes[0]!) <= last.sizes[0]! * SIMILAR);
    const group = fits
      ? last
      : groups[
          groups.push({
            monday: w.monday,
            phase: w.phase,
            weeks: 0,
            seconds: 0,
            recoveries: 0,
            sizes: [],
          }) - 1
        ]!;
    group.weeks++;
    if (w.recovery) group.recoveries++;
    else group.sizes.push(w.seconds);
  }
  // A group of recovery weeks alone keeps its own size.
  const size = (g: (typeof groups)[number]) =>
    g.sizes.length
      ? g.sizes.reduce((n, s) => n + s, 0) / g.sizes.length
      : (weeks.find((w) => w.monday === g.monday)?.seconds ?? 0);
  return groups.map(({ sizes: _, ...g }, i) => ({ ...g, seconds: size(groups[i]!) }));
}

export function outline(
  monday: string,
  goal: PlanGoal,
  races: Race[],
  state: PlanState,
  settings: PlanSettings,
): OutlineWeek[] {
  const race = goal === "race" ? goalRace(races, monday) : null;
  const season = goal === "season" ? settings.season : undefined;
  const end = season && !seasonOver(season, races, monday) ? seasonEnd(season, races) : null;
  const weeks: OutlineWeek[] = [];
  const most = end ? SEASON_WEEKS : race ? MOST_WEEKS : ROLLING_WEEKS;
  let weeklySeconds = state.weeklySeconds;
  for (let i = 0; i < most; i++) {
    const m = addDays(monday, 7 * i);
    if ((race && m > race.date) || (end && m > end)) break;
    const shape = weekShape(m, { goal, season }, races, state);
    // Ahead, a season climbs as if each week goes as it should.
    if (i && season) {
      const full = { ...settings, goal, season };
      weeklySeconds = steppedVolume(weeklySeconds, m, full, races, state);
    }
    weeks.push({ ...shape, seconds: weekSeconds(shape, { ...state, weeklySeconds }, settings) });
  }
  return weeks;
}
