// How much a season's weeks hold: where to start, from last year and the time left, and how the volume climbs from there. Pure.
// Tags and sources as in Docs/workout-suggestions-evidence.md, section 10: no study sets these numbers, some are bounded by one.
import { mondayOf } from "../focus";
import type { Activity } from "../intervals";
import type { Race } from "../races";
import { isSport } from "../sport";
import { addDays } from "../training";
import { weekShape } from "./phase";
import { seasonOver } from "./season";
import { availableSeconds, history } from "./start-level";
import type { PlanSettings, PlanState } from "./types";

const YEAR_WEEKS = 52;
/** Fewer weeks ridden than this say too little about a year. */
const YEAR_WEEKS_NEEDED = 26;
const BEST_STRETCH = 4;
/** How far over last year's best a season aims, in percent: the rider's choice, seeing the hours it means. Only coaching rules of thumb give a figure (C). */
export const CLIMB_PERCENT = { least: 5, most: 15, usual: 5 } as const;
/** I: the step a build week takes when working back from the peak: over 3+1 cycles, gentler than Almquist's +43% in 12 weeks. */
const PLANNED_STEP = 1.04;
/** I: the most a week may take to catch up, as the slower arm of Buist 2008. The faster arm's 24% wasn't more harmful, in novice runners. */
const MOST_STEP = 1.1;
/** C: a long way out, a start no lower than this share of a usual week last year. A partial cut is better than stopping, but no study says how much. */
const START_FROM_USUAL = 0.6;
/** I: and no more than this over what the last weeks really held, about the faster arm of Buist 2008. */
const START_OVER_RECENT = 1.2;
const LOWEST_CEILING = 2 * 3600;
/** I: with no year to read, the peak is at most this far over the start, about Almquist's +43%. */
const PEAK_OVER_START = 1.4;
/** I: a week ridden at less than this share of what it held doesn't move the volume on. Almquist's bar for compliance. */
const RIDDEN_ENOUGH = 0.85;
const HISTORY_WEEKS = 8;
const QUARTER = 15 * 60;

const quarter = (s: number) => Math.round(s / QUARTER) * QUARTER;
/** Peaks are shown in hours and move a percent at a time, so quarters would hide the steps. */
const fiveMinutes = (s: number) => Math.round(s / 300) * 300;
const dayOf = (a: Activity) => a.start_date_local.slice(0, 10);

/** Rides of the 52 full weeks before this one: a usual week, and the best four in a row. Null when too few were ridden. */
export function yearVolume(acts: Activity[], today: string) {
  const monday = mondayOf(today);
  const totals = Array.from({ length: YEAR_WEEKS }, () => 0);
  for (const a of acts) {
    if (!isSport(a, "ride") || dayOf(a) >= monday) continue;
    const i = Math.floor((Date.parse(monday) - Date.parse(mondayOf(dayOf(a)))) / (7 * 864e5)) - 1;
    if (i >= 0 && i < YEAR_WEEKS) totals[i]! += a.moving_time ?? 0;
  }
  const active = totals.filter(Boolean);
  if (active.length < YEAR_WEEKS_NEEDED) return null;
  let best = 0;
  for (let i = 0; i + BEST_STRETCH <= YEAR_WEEKS; i++)
    best = Math.max(
      best,
      totals.slice(i, i + BEST_STRETCH).reduce((n, s) => n + s, 0),
    );
  return {
    usualSeconds: active.reduce((n, s) => n + s, 0) / active.length,
    bestSeconds: best / BEST_STRETCH,
  };
}

type Rhythm = Pick<PlanState, "buildWeeks" | "cycleStart" | "forcedRecovery">;

/** The weeks from this one on where volume can still climb: before the specific phase, leaving out recovery. */
export function rampWeeks(first: string, settings: PlanSettings, races: Race[], state: Rhythm) {
  const { season } = settings;
  if (settings.goal !== "season" || !season || seasonOver(season, races, first)) return 0;
  let n = 0;
  for (let m = first; m < addDays(first, 7 * 60); m = addDays(m, 7)) {
    const shape = weekShape(m, settings, races, state);
    if (shape.phase !== "base" && shape.phase !== "build") break;
    if (!shape.recovery) n++;
  }
  return n;
}

export type VolumeSuggestion = {
  startSeconds: number;
  /** What the season climbs to, as stored: if the days later hold more, it goes on. */
  peakSeconds: number;
  /** What it reaches with the days chosen, to say so. */
  reachSeconds: number;
  /** The percent over last year's best it was worked out with; null when there's no year to read, so nothing to choose. */
  climbPercent: number | null;
  /** What it's based on, to say so: null when there's no year to read. */
  lastYearBest: number | null;
  /** Weeks to where the volume should be reached. */
  weeks: number;
  /** The days chosen hold less than the season would climb to. */
  limitedByDays: boolean;
  /** What a week has held lately. */
  recentSeconds: number;
};

/** Where to start and what to climb to: worked back from last year's best, then held to what the last weeks really were. */
export function suggestVolume(input: {
  acts: Activity[];
  today: string;
  settings: PlanSettings;
  races: Race[];
  state: Rhythm;
  /** What the plan would start from with no year to read. */
  fallbackSeconds: number;
  /** Over last year's best; kept between the least and the most. */
  climbPercent?: number | undefined;
}): VolumeSuggestion {
  const { acts, today, settings, races, state } = input;
  const free = availableSeconds(settings);
  const monday = mondayOf(today);
  const weeks = rampWeeks(addDays(monday, 7), settings, races, state);
  const year = yearVolume(acts, today);
  const growth = PLANNED_STEP ** weeks;
  if (!year) {
    const start = Math.min(input.fallbackSeconds, free);
    return {
      startSeconds: quarter(start),
      peakSeconds: quarter(start * Math.min(growth, PEAK_OVER_START)),
      reachSeconds: quarter(Math.min(start * Math.min(growth, PEAK_OVER_START), free)),
      climbPercent: null,
      lastYearBest: null,
      weeks,
      limitedByDays: false,
      recentSeconds: quarter(
        (history(acts, today).usualSeconds * history(acts, today).activeWeeks) / HISTORY_WEEKS,
      ),
    };
  }
  // Worked back from what the year says, not from the days chosen: few free hours limit the climb, not where it starts.
  const percent = Math.min(
    CLIMB_PERCENT.most,
    Math.max(CLIMB_PERCENT.least, input.climbPercent ?? CLIMB_PERCENT.usual),
  );
  const wanted = year.bestSeconds * (1 + percent / 100);
  const peak = Math.min(wanted, free);
  const h = history(acts, today);
  const recent = (h.usualSeconds * h.activeWeeks) / HISTORY_WEEKS;
  const ceiling = Math.max(recent * START_OVER_RECENT, LOWEST_CEILING);
  const start = Math.min(
    Math.max(wanted / growth, year.usualSeconds * START_FROM_USUAL),
    ceiling,
    peak,
  );
  return {
    startSeconds: quarter(start),
    peakSeconds: fiveMinutes(wanted),
    reachSeconds: fiveMinutes(peak),
    climbPercent: percent,
    lastYearBest: quarter(year.bestSeconds),
    weeks,
    limitedByDays: wanted > free,
    recentSeconds: quarter(recent),
  };
}

/**
 * The volume for the week starting `next`: one even step towards the peak, recomputed each time, so a race added or a week
 * lowered simply changes the steps left. It holds through recovery and from the specific phase on.
 */
export function steppedVolume(
  weeklySeconds: number,
  next: string,
  settings: PlanSettings,
  races: Race[],
  state: Rhythm,
) {
  const wanted = settings.season?.peakSeconds;
  if (settings.goal !== "season" || !wanted) return weeklySeconds;
  // Up to what the days hold: if they later hold more, the climb goes on from there.
  const peak = Math.min(wanted, availableSeconds(settings));
  if (weeklySeconds >= peak) return weeklySeconds;
  const shape = weekShape(next, settings, races, state);
  if (shape.recovery) return weeklySeconds;
  const left = rampWeeks(next, settings, races, state);
  if (!left) return weeklySeconds;
  const step = Math.min((peak / weeklySeconds) ** (1 / left), MOST_STEP);
  return Math.min(weeklySeconds * step, peak);
}

/** Whether a finished week was ridden enough for the volume to move on. Missing rides never raise anything. */
export function riddenEnough(acts: Activity[], monday: string, plannedSeconds: number) {
  const end = addDays(monday, 7);
  const done = acts
    .filter((a) => isSport(a, "ride") && dayOf(a) >= monday && dayOf(a) < end)
    .reduce((n, a) => n + (a.moving_time ?? 0), 0);
  return plannedSeconds > 0 && done >= plannedSeconds * RIDDEN_ENOUGH;
}
