// What the plan page shows and proposes, from the note, the calendar and the ride history. Pure: reading never changes
// anything, and a proposal is worked out afresh each time rather than kept.
import { mondayOf } from "../focus";
import { isPlanned, type Activity, type PlannedEvent } from "../intervals";
import type { Race } from "../races";
import { comingBack, hardActivity, hardEvent, hrvLowWeek, type SuggestInput } from "../suggest";
import { addDays } from "../training";
import type { Execution } from "./execution";
import { applyReview, lowMornings, review, rollWeek } from "./evaluate";
import { easyRide, layoutWeek, longRide, recoveryRide, weekSeconds, type TakenDay } from "./layout";
import { matchSessions } from "./match";
import { textHash, type NoteSession, type PlanNote } from "./note";
import { weekShape } from "./phase";
import {
  racesChanged,
  seasonFocus,
  seasonLongShare,
  seasonOver,
  seasonProfile,
  seenRacesOf,
} from "./season";
import { history } from "./start-level";
import { riddenEnough, steppedVolume } from "./volume";
import type {
  PlanSettings,
  PlanState,
  PlanWorkout,
  PlannedDay,
  Review,
  SessionOutcome,
} from "./types";

/** E: Nuuttila's evaluation days. */
const REVIEW_DAYS = [1, 4];
const OUTCOME_DAYS = 7;
const HARD_LOOK_BACK = 3;
const dayOf = (a: Activity) => a.start_date_local.slice(0, 10);
const weekDates = (monday: string) => Array.from({ length: 7 }, (_, i) => addDays(monday, i));

/**
 * The plan's sessions as the calendar has them now: moved ones where they went, deleted ones gone, edited ones left alone.
 * `cleared` holds the days someone emptied by hand, which a check won't fill again.
 */
export function reconcile(note: PlanNote, calendar: PlannedEvent[], oldest: string) {
  const byId = new Map(calendar.map((e) => [e.id, e]));
  const edited = new Set<string>();
  const cleared = new Set(note.declined ?? []);
  const sessions = note.sessions.flatMap((s): NoteSession[] => {
    const e = s.eventId ? byId.get(s.eventId) : undefined;
    if (!e) {
      if (s.date < oldest) return [s];
      cleared.add(s.date);
      return [];
    }
    if (e.date !== s.date) cleared.add(s.date);
    if (textHash(e.description ?? "") !== s.textHash) edited.add(e.date);
    return [{ ...s, date: e.date }];
  });
  return { sessions, edited, cleared };
}

const settingsFor = (note: PlanNote, monday: string): PlanSettings =>
  note.weekOverride?.monday === monday
    ? { ...note.settings, week: note.weekOverride.week }
    : note.settings;

export type PlanContext = { note: PlanNote; input: SuggestInput; calendar: PlannedEvent[] };

/** New weeks since the note was last saved, taken into account. */
export function catchUp(ctx: PlanContext): PlanState {
  const { note, input } = ctx;
  const now = mondayOf(input.today);
  let state = note.state;
  const low = lowMornings(input.wellness, input.today) >= 3;
  let m = state.weekRolled ?? mondayOf(state.startedOn);
  while (m < now) {
    const shape = weekShape(m, note.settings, input.races, state);
    const dates = weekDates(m);
    const seconds = note.sessions
      .filter((s) => dates.includes(s.date))
      .reduce((n, s) => n + s.seconds, 0);
    const planned = weekSeconds(shape, state, note.settings);
    const steady = state.lowersThisCycle === 0 && riddenEnough(input.acts, m, planned);
    state = rollWeek(state, {
      monday: m,
      recovery: shape.recovery,
      seconds: seconds || state.lastBuildSeconds,
      lowEnding: low,
    });
    m = addDays(m, 7);
    // The season's climb, for weeks that went as they should.
    if (steady && !low)
      state = {
        ...state,
        weeklySeconds: steppedVolume(state.weeklySeconds, m, note.settings, input.races, state),
      };
  }
  return { ...state, weekRolled: now };
}

function offDates(input: SuggestInput) {
  const off = new Set<string>();
  for (const e of input.offEvents)
    for (let d = e.date; d <= (e.end ?? e.date); d = addDays(d, 1)) off.add(d);
  return off;
}

/** What the plan must work around: rides done, and what's on the calendar that isn't the plan's or still to be changed. */
function takenIn(ctx: PlanContext, monday: string, ownEvents: Set<string>, frozen: NoteSession[]) {
  const { input, calendar } = ctx;
  const dates = weekDates(monday);
  const taken: TakenDay[] = [];
  for (const a of input.acts) {
    if (!dates.includes(dayOf(a)) || dayOf(a) > input.today) continue;
    taken.push({ date: dayOf(a), seconds: a.moving_time ?? 0, hard: hardActivity(input, a) });
  }
  for (const e of calendar) {
    if (!isPlanned(e) || ownEvents.has(e.id) || !dates.includes(e.date)) continue;
    if (e.date < input.today || e.category.startsWith("RACE")) continue;
    taken.push({ date: e.date, seconds: e.moving_time ?? 0, hard: hardEvent(e, input.pool) });
  }
  for (const s of frozen)
    if (!taken.some((t) => t.date === s.date))
      taken.push({
        date: s.date,
        seconds: s.seconds,
        hard: s.role === "hard",
        long: s.role === "long",
      });
  return taken;
}

/**
 * A layout of this week with this state. Today stays as it is, and so does anything rewritten by hand; with `keepPlaced`,
 * so does everything already on the calendar, and only the days still empty are worked out around it.
 */
export function layoutFor(ctx: PlanContext, monday: string, state: PlanState, keepPlaced = false) {
  const { note, input } = ctx;
  const { sessions, edited } = reconcile(note, ctx.calendar, addDays(input.today, -14));
  const dates = weekDates(monday);
  const own = new Set(sessions.flatMap((s) => (s.eventId ? [s.eventId] : [])));
  const frozen = sessions.filter(
    (s) =>
      dates.includes(s.date) &&
      s.date >= input.today &&
      (keepPlaced || s.date === input.today || edited.has(s.date)),
  );
  const settings = settingsFor(note, monday);
  const lookBack = addDays(monday, -HARD_LOOK_BACK);
  const hardBefore = [
    ...input.acts
      .filter((a) => dayOf(a) < monday && dayOf(a) >= lookBack && hardActivity(input, a))
      .map(dayOf),
    ...sessions
      .filter(
        (s) => s.role === "hard" && s.date < monday && s.date >= lookBack && s.date >= input.today,
      )
      .map((s) => s.date),
  ];
  const recentIds = new Set(
    sessions
      .filter((s) => s.date >= addDays(monday, -14) && s.date < monday)
      .map((s) => s.workoutId),
  );
  const shape = weekShape(monday, settings, input.races, state);
  const season = settings.goal === "season" ? settings.season : undefined;
  const profile = season ? seasonProfile(season, input.races, input.today) : null;
  const preparing = shape.phase === "build" || shape.phase === "specific";
  return layoutWeek({
    today: input.today,
    shape,
    longShare: seasonLongShare(profile, shape.phase),
    raceAhead: !!season && preparing && !seasonOver(season, input.races, input.today),
    settings,
    state,
    focus: profile && !input.focusPinned ? seasonFocus(profile) : input.focus,
    pool: input.pool,
    races: input.races,
    taken: takenIn(ctx, monday, own, frozen),
    off: offDates(input),
    recentHard: hardBefore,
    recentIds,
    longestSeconds: history(input.acts, input.today).longestSeconds,
    th: input.th,
  });
}

export const workoutOf = (e: PlannedEvent, s: NoteSession): PlanWorkout => ({
  id: s.workoutId,
  name: e.name ?? "",
  type: e.type ?? "Ride",
  description: e.description ?? "",
  seconds: s.seconds,
  load: e.icu_training_load ?? 0,
  kind: s.role === "hard" ? "threshold" : "endurance",
});

/** How far ahead real sessions go: as far as the devices look. */
export const WINDOW_DAYS = 7;
const windowDates = (from: string) =>
  Array.from({ length: WINDOW_DAYS }, (_, i) => addDays(from, i));

/** The days from today, in a layout, with the week each one belongs to worked out once. */
function layoutDays(ctx: PlanContext, state: PlanState, keepPlaced: boolean) {
  const out = new Map<string, PlannedDay>();
  for (const date of windowDates(ctx.input.today)) {
    const monday = mondayOf(date);
    if (!out.has(monday + "*")) {
      for (const d of layoutFor(ctx, monday, state, keepPlaced)) out.set(d.date, d);
      out.set(monday + "*", { date: monday, role: "rest", workout: null });
    }
  }
  return out;
}

/** What a check writes: sessions for the days of the next seven still empty, and not cleared by hand. */
export function daysToFill(ctx: PlanContext, state: PlanState): PlannedDay[] {
  const { sessions, cleared } = reconcile(ctx.note, ctx.calendar, addDays(ctx.input.today, -14));
  const placed = new Set(sessions.map((s) => s.date));
  const layout = layoutDays(ctx, state, true);
  return windowDates(ctx.input.today).flatMap((date) => {
    const d = layout.get(date);
    return d?.workout && !placed.has(date) && !cleared.has(date) ? [d] : [];
  });
}

export type WindowDay = PlannedDay & {
  /** Not on the calendar yet: it goes there at the next check. */
  upcoming?: boolean;
};

/** The next seven days as they stand: the calendar's sessions, then what the plan expects for the days after its last check. */
export function windowFor(ctx: PlanContext, state: PlanState): WindowDay[] {
  const { input, note, calendar } = ctx;
  const { sessions, cleared } = reconcile(note, calendar, addDays(input.today, -14));
  const byId = new Map(calendar.map((e) => [e.id, e]));
  const layout = layoutDays(ctx, state, true);
  const horizon = note.lastFill ? addDays(note.lastFill, WINDOW_DAYS - 1) : null;
  return windowDates(input.today).map((date): WindowDay => {
    const s = sessions.find((x) => x.date === date);
    const e = s?.eventId ? byId.get(s.eventId) : undefined;
    if (s && e) return { date, role: s.role, workout: workoutOf(e, s) };
    const d = layout.get(date) ?? { date, role: "rest" as const, workout: null };
    if (d.role === "race" || d.role === "taken") return d;
    if (!cleared.has(date) && d.workout && (!horizon || date > horizon))
      return { ...d, upcoming: true };
    return { date, role: "rest", workout: null };
  });
}

/** The latest review day up to today. */
export function lastReviewDay(today: string) {
  for (let i = 0; i < 7; i++) {
    const d = addDays(today, -i);
    if (REVIEW_DAYS.includes(new Date(`${d}T12:00:00`).getDay())) return d;
  }
  return today;
}

const seasonRacesChanged = (note: PlanNote, races: Race[], today: string) =>
  note.settings.goal === "season" && racesChanged(note.seenRaces, races, today);

/** Whether a check has come round since the next seven days were last written. */
export const fillDue = (note: PlanNote, today: string, races: Race[]) =>
  ((!!note.replan || seasonRacesChanged(note, races, today)) && note.lastFill !== today) ||
  lastReviewDay(today) > (note.lastFill ?? note.state.startedOn);

/** Whether a review has come round since the last one. */
export function reviewDue(state: PlanState, today: string) {
  for (let i = 0; i < 7; i++) {
    const d = addDays(today, -i);
    const day = new Date(`${d}T12:00:00`).getDay();
    if (REVIEW_DAYS.includes(day)) return d > (state.lastReview ?? state.startedOn);
  }
  return false;
}

export function outcomesFor(
  ctx: PlanContext,
  executions: ReadonlyMap<string, Execution | null>,
): SessionOutcome[] {
  const { input, calendar } = ctx;
  const { sessions } = reconcile(ctx.note, calendar, addDays(input.today, -14));
  const from = addDays(input.today, -OUTCOME_DAYS);
  const recent = sessions.filter((s) => s.date >= from && s.date < input.today);
  const byId = new Map(calendar.map((e) => [e.id, e]));
  const planned = recent.map((s) => ({
    date: s.date,
    workout: { seconds: s.seconds } as PlanWorkout,
    pairedActivityId: (s.eventId && byId.get(s.eventId)?.pairedActivityId) || null,
  }));
  const matches = matchSessions(planned, input.acts);
  return recent.map((s) => {
    const act = matches.get(s.date);
    return {
      date: s.date,
      hard: s.role === "hard",
      plannedSeconds: s.seconds,
      doneSeconds: act ? (act.moving_time ?? 0) : null,
      rating: act?.planRating ?? null,
      execution: act ? (executions.get(String(act.id)) ?? null) : null,
    };
  });
}

/** The rides behind the sessions of the last week, or of the last `days`, that have a workout to compare with. */
export function ridesToCompare(ctx: PlanContext, days: number = OUTCOME_DAYS) {
  const { input, calendar } = ctx;
  const { sessions } = reconcile(ctx.note, calendar, addDays(input.today, -14));
  const from = addDays(input.today, -days);
  const byId = new Map(calendar.map((e) => [e.id, e]));
  const recent = sessions.filter((s) => s.date >= from && s.date < input.today);
  const matches = matchSessions(
    recent.map((s) => ({
      date: s.date,
      workout: { seconds: s.seconds } as PlanWorkout,
      pairedActivityId: (s.eventId && byId.get(s.eventId)?.pairedActivityId) || null,
    })),
    input.acts,
  );
  return recent.flatMap((s) => {
    const act = matches.get(s.date);
    const e = s.eventId ? byId.get(s.eventId) : undefined;
    return act && e?.description ? [{ act, description: e.description }] : [];
  });
}

export type ProposalChange = {
  date: string;
  from: PlanWorkout | null;
  to: PlanWorkout | null;
  eventId: string | null;
};
export type Proposal = {
  review: Review;
  state: PlanState;
  changes: ProposalChange[];
  /** Nothing on the calendar changes: it can just be noted, with nothing to ask. */
  silent: boolean;
  /** A season's races as this proposal took them into account. */
  seenRaces?: string[] | undefined;
};

/** What this state would change among the sessions already on the calendar, after today. */
function changesFor(ctx: PlanContext, state: PlanState): ProposalChange[] {
  const { input, calendar } = ctx;
  const { sessions, edited } = reconcile(ctx.note, calendar, addDays(input.today, -14));
  const byId = new Map(calendar.map((e) => [e.id, e]));
  const layout = layoutDays(ctx, state, false);
  return windowDates(input.today).flatMap((date): ProposalChange[] => {
    if (date <= input.today || edited.has(date)) return [];
    const s = sessions.find((x) => x.date === date);
    const e = s?.eventId ? byId.get(s.eventId) : undefined;
    if (!s || !e) return [];
    const to = layout.get(date)?.workout ?? null;
    if (to?.id === s.workoutId) return [];
    return [{ date, from: workoutOf(e, s), to, eventId: s.eventId }];
  });
}

/** What a review would change, when one is due or the days were changed. Null when there's nothing to decide. */
export function proposalFor(
  ctx: PlanContext,
  executions: ReadonlyMap<string, Execution | null>,
): Proposal | null {
  const { note, input } = ctx;
  const state = catchUp(ctx);
  const seen =
    note.settings.goal === "season" ? { seenRaces: seenRacesOf(input.races, input.today) } : {};
  const changedRaces = seasonRacesChanged(note, input.races, input.today);
  if (note.replan || changedRaces) {
    const changes = changesFor(ctx, state);
    return {
      review: { result: "hold", reason: note.replan ? "days-changed" : "races-changed" },
      state,
      changes,
      silent: !changes.length,
      ...seen,
    };
  }
  if (!reviewDue(state, input.today)) return null;
  const monday = mondayOf(input.today);
  const shape = weekShape(monday, note.settings, input.races, state);
  const outcome = review({
    outcomes: outcomesFor(ctx, executions),
    lowMornings: lowMornings(input.wellness, input.today),
    hrvLow: hrvLowWeek(input),
    recoveryWeek: shape.recovery,
    off: comingBack(input) && input.offEvents.some((e) => (e.end ?? e.date) >= input.today),
    since: state.lastReview,
  });
  const next = applyReview(state, outcome.result, input.today);
  const changes = changesFor(ctx, next);
  return { review: outcome, state: next, changes, silent: !changes.length, ...seen };
}

/** An easier ride in place of today's hard session, of a length that fits it. */
export function easierToday(day: PlannedDay): PlanWorkout | null {
  if (day.role !== "hard" || !day.workout) return null;
  const indoor = day.workout.type === "VirtualRide";
  const seconds = Math.floor(Math.min(day.workout.seconds, 60 * 60) / (15 * 60)) * 15 * 60;
  return seconds >= 30 * 60 ? recoveryRide(Math.min(seconds, 45 * 60), indoor) : null;
}

/** A workout from what the note keeps of it, for going back. */
export function workoutById(
  id: string,
  pool: SuggestInput["pool"],
  indoor: boolean,
): PlanWorkout | null {
  const made = /^plan-(long|easy|recovery)-(\d+)$/.exec(id);
  if (made) {
    const seconds = Number(made[2]) * 60;
    const make = { long: longRide, easy: easyRide, recovery: recoveryRide }[made[1]!]!;
    return make(seconds, indoor);
  }
  const w = pool.find((p) => p.id === id);
  return w
    ? {
        id: w.id,
        name: w.name,
        type: indoor ? "VirtualRide" : "Ride",
        description: w.description,
        seconds: w.seconds,
        load: w.load,
        kind: w.kind,
      }
    : null;
}
