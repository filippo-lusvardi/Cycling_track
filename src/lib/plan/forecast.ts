// Where fitness, fatigue and form head with the sessions the plan has in hand, then with the weeks of the outline. A load
// estimate, not a performance prediction: the fitness–fatigue model predicts performance poorly (Training-Evidence §12),
// and the plan never steers by it. Pure.
import { isPlanned } from "../intervals";
import { stepFitness } from "../metrics";
import { addDays, computeForm } from "../training";
import type { PlanContext, WindowDay } from "./engine";
import type { OutlineWeek } from "./outline";

/** How far back the chart starts, and how many outline weeks it reaches into. */
export const FORECAST_PAST_DAYS = 21;
export const FORECAST_WEEKS = 6;
/** A load per hour for when the plan has nothing in hand to learn it from: an easy-to-steady ride. */
const FALLBACK_LOAD_PER_HOUR = 50;

export type ForecastKind = "past" | "planned" | "estimated";
export type ForecastPoint = {
  date: string;
  fitness: number;
  fatigue: number;
  form: number;
  kind: ForecastKind;
};
export type DayLoad = { load: number; estimated: boolean };

type WellnessRow = { id: string; ctl: number | null; atl: number | null };

/**
 * The load of each day ahead: the window's sessions and other planned workouts as they are, today's rides once ridden,
 * then each outline week after the window spread over its riding days in proportion to the time each one has.
 */
export function forecastLoads(
  ctx: PlanContext,
  days: WindowDay[],
  ahead: OutlineWeek[],
  until?: string,
): Map<string, DayLoad> {
  const { input, calendar, note } = ctx;
  const out = new Map<string, DayLoad>();
  const todays = input.acts.filter((a) => a.start_date_local.slice(0, 10) === input.today);
  // Ridden today: what was ridden counts, not what was planned.
  if (todays.length)
    out.set(input.today, {
      load: todays.reduce((n, a) => n + (a.icu_training_load ?? 0), 0),
      estimated: false,
    });
  const planSeconds = days.reduce((n, d) => n + (d.workout?.seconds ?? 0), 0);
  const planLoad = days.reduce((n, d) => n + (d.workout?.load ?? 0), 0);
  const perSecond =
    planSeconds && planLoad ? planLoad / planSeconds : FALLBACK_LOAD_PER_HOUR / 3600;
  for (const d of days) {
    if (d.date === input.today && todays.length) continue;
    const other = calendar
      .filter((e) => isPlanned(e) && e.date === d.date && !e.category.startsWith("RACE"))
      .reduce((n, e) => n + (e.icu_training_load ?? 0), 0);
    // A day the plan left to something else ("taken") counts that something; a plan day counts its own workout.
    const load = d.role === "taken" ? other : (d.workout?.load ?? 0);
    out.set(d.date, { load, estimated: false });
  }
  const last = days.at(-1)?.date ?? input.today;
  const free = note.settings.week.reduce((n, w) => n + w.minutes, 0);
  for (const w of ahead.slice(0, FORECAST_WEEKS)) {
    for (let i = 0; i < 7; i++) {
      const date = addDays(w.monday, i);
      if (date <= last || (until && date > until)) continue;
      const share = free ? note.settings.week[i]!.minutes / free : 0;
      out.set(date, { load: w.seconds * perSecond * share, estimated: true });
    }
  }
  return out;
}

/** The last weeks as intervals.icu has them, then day by day forward from the latest known fitness and fatigue. */
export function forecast(
  wellness: readonly WellnessRow[],
  today: string,
  loads: ReadonlyMap<string, DayLoad>,
): ForecastPoint[] {
  const known = wellness
    // Up to yesterday: today's row may hold some of today's riding and none of its plan, so today is worked out here.
    .filter((w) => w.ctl != null && w.atl != null && w.id < today)
    .sort((a, b) => a.id.localeCompare(b.id));
  const from = addDays(today, -FORECAST_PAST_DAYS);
  const point = (date: string, ctl: number, atl: number, kind: ForecastKind): ForecastPoint => ({
    date,
    fitness: Math.round(ctl * 10) / 10,
    fatigue: Math.round(atl * 10) / 10,
    form: computeForm(ctl, atl),
    kind,
  });
  const out = known.filter((w) => w.id >= from).map((w) => point(w.id, w.ctl!, w.atl!, "past"));
  const start = known.at(-1);
  if (!start) return out;
  let { ctl, atl } = { ctl: start.ctl!, atl: start.atl! };
  const end = [...loads.keys()].sort().at(-1);
  for (let d = addDays(start.id, 1); end && d <= end; d = addDays(d, 1)) {
    const day = loads.get(d);
    ({ ctl, atl } = stepFitness(ctl, atl, day?.load ?? 0));
    out.push(point(d, ctl, atl, day?.estimated ? "estimated" : "planned"));
  }
  return out;
}
