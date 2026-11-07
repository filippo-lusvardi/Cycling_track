// A season: the months the goals fall in and the kinds of race, known before any date is. Real races refine it as they reach
// the calendar, and always beat the guess. Pure. The numbers are conventions (C): see Docs/workout-suggestions-evidence.md.
import { mondayOf, PRIORITY_WEIGHT } from "../focus";
import {
  FOCUSES,
  KINDS,
  profileFor,
  raceSport,
  type Focus,
  type Profile,
  type Race,
} from "../races";
import { addDays } from "../training";
import type { Phase, PlanSeason, PlanState } from "./types";

export type Period = { from: string; to: string };

/** C: a long ride takes more of the week for long races, and less close to short ones. Points of a profile's 100. */
const ENDURANCE_FROM = 35;
const SHORT_UP_TO = 10;
const LONG_SHARE_ENDURANCE = 0.45;
const LONG_SHARE_SHORT = 0.3;
/** C: weeks from the start of a count with no recovery week due. */
const FIRST_WEEKS_FREE = 2;

const nextMonth = (month: string) => {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
};

/** Months next to each other make one period. */
export function periodsOf(season: PlanSeason): Period[] {
  const months = [...new Set(season.months)].sort();
  const out: Period[] = [];
  let last: string | null = null;
  for (const month of months) {
    const to = addDays(`${nextMonth(month)}-01`, -1);
    const current = out[out.length - 1];
    if (current && last && nextMonth(last) === month) current.to = to;
    else out.push({ from: `${month}-01`, to });
    last = month;
  }
  return out;
}

const mainRaces = (races: Race[]) =>
  races
    .filter((r) => r.priority === "A" && raceSport(r) === "ride")
    .map((r) => r.date)
    .sort();

const weeksBetween = (a: string, b: string) =>
  Math.floor((Date.parse(b) - Date.parse(a)) / (7 * 864e5));

/** C: weeks before a target where each phase begins, as for a single race. */
const phaseBefore = (weeks: number, specific: number, build: number): Phase =>
  weeks <= specific ? "specific" : weeks <= build ? "build" : "base";

/**
 * A week of the season, or null once nothing is left of it. Only a real A race brings a taper: tapering towards a guessed date
 * would cost training for nothing.
 */
export function seasonWeek(
  monday: string,
  season: PlanSeason,
  races: Race[],
  state: Pick<PlanState, "buildWeeks" | "cycleStart" | "forcedRecovery">,
  weeks: { specific: number; build: number; taperDays: number },
): { phase: Phase; recovery: boolean } | null {
  const cycle = state.buildWeeks + 1;
  const forced = state.forcedRecovery === monday;
  const sunday = addDays(monday, 6);
  const mains = mainRaces(races);
  const ahead = mains.filter((d) => d >= monday);
  if (ahead.some((d) => addDays(d, -weeks.taperDays) <= sunday))
    return { phase: "taper", recovery: false };
  // C: the week after an A race is for recovery, or a run of races would never leave room for one.
  const afterMain = mains.some((d) => d < monday && d >= addDays(monday, -7));
  // So the week after that isn't another one, whatever the count says.
  const justRecovered = mains.some((d) => d < addDays(monday, -7) && d >= addDays(monday, -14));
  // C: nor does a plan start with one. The weeks are counted back from the target, so one could fall a few days in.
  const noneDue = justRecovered || monday < addDays(state.cycleStart, FIRST_WEEKS_FREE * 7);
  const periods = periodsOf(season);
  const open = (p: Period) => !ahead.some((d) => d >= p.from && d <= p.to);

  const inside = periods.find((p) => mondayOf(p.from) <= monday && monday <= p.to && open(p));
  if (inside) {
    // The rhythm starts again from a race inside the period, whose following week was the recovery.
    const raced = mains.filter((d) => d >= inside.from && d < monday).pop();
    const since = weeksBetween(raced ? addDays(mondayOf(raced), 7) : mondayOf(inside.from), monday);
    const due = since % cycle === (raced ? 0 : state.buildWeeks);
    return { phase: "specific", recovery: forced || afterMain || (due && !noneDue) };
  }

  // The next target, and the Monday its count ends on, so that no recovery week lands just before it.
  const targets = [
    ...ahead.map((date) => ({ date, anchor: mondayOf(addDays(date, -weeks.taperDays)) })),
    ...periods
      .filter((p) => p.from > monday && open(p))
      .map((p) => ({ date: p.from, anchor: mondayOf(p.from) })),
  ].sort((a, b) => a.date.localeCompare(b.date));
  const target = targets[0];
  if (!target) return null;
  const before = weeksBetween(monday, target.anchor);
  return {
    phase: phaseBefore(weeksBetween(monday, target.date), weeks.specific, weeks.build),
    recovery: forced || afterMain || (before > 0 && before % cycle === 0 && !noneDue),
  };
}

/** Nothing left of the season: no period still to end and no A race ahead. */
export const seasonOver = (season: PlanSeason, races: Race[], today: string) =>
  !periodsOf(season).some((p) => p.to >= today) && !mainRaces(races).some((d) => d >= today);

/** The last day the season reaches, for the outline. */
export function seasonEnd(season: PlanSeason, races: Race[]) {
  const ends = [...periodsOf(season).map((p) => p.to), ...mainRaces(races)].sort();
  return ends[ends.length - 1] ?? null;
}

const blend = (parts: { profile: Profile; weight: number }[]): Profile | null => {
  const total = parts.reduce((n, x) => n + x.weight, 0);
  if (!total) return null;
  return Object.fromEntries(
    FOCUSES.map((f) => [f, parts.reduce((n, x) => n + x.profile[f] * x.weight, 0) / total]),
  ) as Profile;
};

/**
 * What the season asks for now. Real races replace the declared kinds: A races up to the end of the next period, B races inside
 * it, since one preparation race on the way shouldn't change what the season is about.
 */
export function seasonProfile(season: PlanSeason, races: Race[], today: string): Profile | null {
  const next = periodsOf(season).find((p) => p.to >= today);
  const real = races.filter((r) => {
    if (r.date < today || !r.info || raceSport(r) !== "ride") return false;
    if (r.priority === "A") return !next || r.date <= next.to;
    return r.priority === "B" && !!next && r.date >= next.from && r.date <= next.to;
  });
  if (real.length)
    return blend(
      real.map((r) => ({ profile: profileFor(r.info!), weight: PRIORITY_WEIGHT[r.priority] })),
    );
  if (!next) return null;
  return blend(
    season.kinds.map((kind) => ({
      profile: profileFor({
        discipline: KINDS[kind].discipline,
        kind,
        minutes: null,
        sprint: false,
      }),
      weight: 1,
    })),
  );
}

/** What the hard sessions work on: the biggest demand beyond the base. Worked out from the races alone, so it holds still. */
export function seasonFocus(profile: Profile): Focus {
  const hard: Focus[] = ["aerobic", "vo2", "anaerobic", "sprint"];
  return hard.reduce((a, b) => (profile[b] > profile[a] ? b : a));
}

/** The long ride's share of the week, when the season has a say in it. */
export function seasonLongShare(profile: Profile | null, phase: Phase): number | undefined {
  if (!profile || (phase !== "build" && phase !== "specific")) return undefined;
  if (profile.base >= ENDURANCE_FROM) return LONG_SHARE_ENDURANCE;
  if (phase === "specific" && profile.base <= SHORT_UP_TO) return LONG_SHARE_SHORT;
  return undefined;
}

const seenLine = (r: Race) =>
  [
    r.date,
    r.id,
    r.priority,
    r.info?.kind ?? "",
    r.info?.minutes ?? "",
    r.info?.sprint ? "s" : "",
  ].join("|");

/** The races as the plan last took them into account, for the note. */
export const seenRacesOf = (races: Race[], today: string) =>
  races
    .filter((r) => r.date >= today && raceSport(r) === "ride")
    .map(seenLine)
    .sort();

/** A race added, moved, changed or removed since then. One that has simply gone by doesn't count. */
export function racesChanged(seen: string[] | undefined, races: Race[], today: string) {
  if (!seen) return false;
  const now = seenRacesOf(races, today);
  return (
    now.some((line) => !seen.includes(line)) ||
    seen.some((line) => line.slice(0, 10) >= today && !now.includes(line))
  );
}

/** The twelve months from this one on, for choosing a season. */
export const monthsFrom = (first: string) => {
  const out = [first];
  while (out.length < 12) out.push(nextMonth(out[out.length - 1]!));
  return out;
};

/**
 * The months to store when a season is edited. The editor only shows months still to come, so a period under way keeps its past
 * months, and with them the count of its recovery weeks. Periods already over are of no more use, and go.
 */
export function editedMonths(stored: string[], picked: string[], thisMonth: string) {
  const running: string[] = [];
  if (picked.includes(thisMonth)) {
    const past = [...stored].filter((m) => m < thisMonth).sort();
    let joined = thisMonth;
    for (const m of past.reverse()) {
      if (nextMonth(m) !== joined) break;
      running.push(m);
      joined = m;
    }
  }
  return [...new Set([...running, ...picked])].sort();
}

/** What the season is heading for now: the earlier of the next A race and the next period with none. Null inside a period with no A race left, and once it's over. */
export function nextTarget(
  season: PlanSeason,
  races: Race[],
  today: string,
): { race: Race } | { month: string } | null {
  const mains = races
    .filter((r) => r.priority === "A" && raceSport(r) === "ride" && r.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date));
  const open = (p: Period) => !mains.some((r) => r.date >= p.from && r.date <= p.to);
  const periods = periodsOf(season).filter(open);
  if (periods.some((p) => p.from <= today && today <= p.to)) return null;
  const race = mains[0];
  const period = periods.find((p) => p.from > today);
  if (race && (!period || race.date <= period.from)) return { race };
  return period ? { month: period.from } : null;
}
