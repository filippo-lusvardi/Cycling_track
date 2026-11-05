// What the plan page does to the calendar and the note. Calendar first, note after: a failure part way leaves the
// calendar right and the note catches up from it on the next reconcile.
import { deleteEvent, getRideWatts, replacePlanned, scheduleWorkout } from "../source";
import type { SuggestInput } from "../suggest";
import { executionOf, type Execution } from "./execution";
import {
  catchUp,
  daysToFill,
  fillDue,
  proposalFor,
  reconcile,
  ridesToCompare,
  workoutById,
  type PlanContext,
  type Proposal,
  type ProposalChange,
} from "./engine";
import { textHash, type NoteSession, type PlanNote } from "./note";
import { sessionLines, weekLine, weeksDue } from "./progress";
import { loadPlan, savePlan, type StoredPlan } from "./store";
import type { PlanWorkout, PlannedDay } from "./types";
import { addDays } from "../training";

const entry = (w: PlanWorkout) => ({ name: w.name, type: w.type, description: w.description });

const sessionOf = (
  date: string,
  role: PlannedDay["role"],
  w: PlanWorkout,
  eventId: string,
): NoteSession => ({
  date,
  role: role === "long" || role === "hard" ? role : "easy",
  workoutId: w.id,
  seconds: w.seconds,
  eventId,
  textHash: textHash(w.description),
});

/** Writes these days to the calendar. Whatever got through is returned, along with what stopped the rest. */
async function placeDays(days: PlannedDay[]) {
  const added: NoteSession[] = [];
  let failure: unknown = null;
  for (const d of days) {
    if (!d.workout) continue;
    try {
      added.push(
        sessionOf(d.date, d.role, d.workout, await scheduleWorkout(entry(d.workout), d.date)),
      );
    } catch (err) {
      failure = err;
      break;
    }
  }
  return { added, failure };
}

/**
 * A check: the next seven days go on the calendar, and a review with nothing to ask is noted. Sessions already there change
 * only by accepting a proposal. It's read fresh first, so two devices opening at once don't write the days twice.
 */
export async function runCheck(
  ctx: PlanContext,
  executions: ReadonlyMap<string, Execution | null>,
  today: string,
) {
  const fresh = await loadPlan(today);
  if (!fresh || !fillDue(fresh.note, today)) return 0;
  const context = { ...ctx, note: fresh.note };
  const proposal = proposalFor(context, executions);
  const settle = proposal?.silent ? proposal : null;
  const state = settle ? { ...settle.state, lastReview: today } : catchUp(context);
  const { added, failure } = await placeDays(daysToFill(context, state));
  const { sessions, cleared } = reconcile(fresh.note, ctx.calendar, addDays(today, -14));
  const pastWeeks = await writeDownWeeks(context, today);
  const note: PlanNote = {
    ...fresh.note,
    pastWeeks,
    sessions: [...sessions, ...added],
    declined: [...cleared],
    state,
    // If something didn't get through, the next opening tries again.
    ...(failure ? {} : { lastFill: today }),
    ...(settle
      ? { replan: false, reviews: [...fresh.note.reviews, { ...settle.review, on: today }] }
      : {}),
  };
  await savePlan(note, today, fresh);
  if (failure) throw failure;
  return added.length;
}

/** How far back the calendar reaches when a check runs (see usePlan). */
const CHECK_CALENDAR_DAYS = 21;

/** Finished weeks, each into a line before its sessions drop off the note. Their rides are only read here, once. */
async function writeDownWeeks(ctx: PlanContext, today: string) {
  const known = ctx.note.pastWeeks ?? [];
  const due = weeksDue(ctx.note, today);
  if (!due.length) return known;
  const oldest = addDays(today, -CHECK_CALENDAR_DAYS);
  const scores = await compareRides(
    ridesToCompare(ctx, CHECK_CALENDAR_DAYS).filter(
      (r) => r.act.start_date_local.slice(0, 10) >= due[0]!,
    ),
    ctx.input.th.ftp,
  );
  const added = due.flatMap((m) => {
    const line = weekLine(ctx, m, sessionLines(ctx, m, addDays(m, 6), scores, oldest));
    return line ? [line] : [];
  });
  return [...known, ...added];
}

/** The first days of a new plan. */
export async function fillNow(stored: StoredPlan, ctx: PlanContext, today: string) {
  const { added, failure } = await placeDays(daysToFill(ctx, stored.note.state));
  await savePlan(
    {
      ...stored.note,
      sessions: [...stored.note.sessions, ...added],
      ...(failure ? {} : { lastFill: today }),
    },
    today,
    stored,
  );
  if (failure) throw failure;
}

/** The end of the plan: its note and the sessions still to come. Rides done, and anything rewritten by hand, stay. */
export async function deletePlan(stored: StoredPlan, ctx: PlanContext, today: string) {
  const { sessions, edited } = reconcile(stored.note, ctx.calendar, addDays(today, -14));
  const doneToday = ctx.input.acts.some((a) => a.start_date_local.slice(0, 10) === today);
  for (const s of sessions) {
    if (!s.eventId || s.date < today || edited.has(s.date) || (s.date === today && doneToday))
      continue;
    await deleteEvent(s.eventId);
  }
  await deleteEvent(stored.id);
}

async function applyChange(sessions: NoteSession[], c: ProposalChange) {
  const rest = sessions.filter((s) => s.date !== c.date);
  const was = sessions.find((s) => s.date === c.date);
  if (c.to && c.eventId) {
    await replacePlanned(c.eventId, entry(c.to));
    return [...rest, sessionOf(c.date, was?.role ?? "easy", c.to, c.eventId)];
  }
  if (c.to) {
    const id = await scheduleWorkout(entry(c.to), c.date);
    return [...rest, sessionOf(c.date, "easy", c.to, id)];
  }
  if (c.eventId) await deleteEvent(c.eventId);
  return rest;
}

export async function acceptProposal(
  stored: StoredPlan,
  ctx: PlanContext,
  p: Proposal,
  today: string,
) {
  let sessions = reconcile(stored.note, ctx.calendar, addDays(today, -14)).sessions;
  const undo = p.changes.map((c) => ({ date: c.date, workoutId: c.from?.id ?? null }));
  for (const c of p.changes) sessions = await applyChange(sessions, c);
  const note: PlanNote = {
    ...stored.note,
    sessions,
    state: { ...p.state, lastReview: today },
    undo,
    undoState: stored.note.state,
    replan: false,
    reviews: [...stored.note.reviews, { ...p.review, on: today, accepted: true }],
  };
  await savePlan(note, today, stored);
}

/** Nothing moves: the review is noted, and the next one starts from here. */
export async function keepPlan(
  stored: StoredPlan,
  state: PlanNote["state"],
  p: Proposal,
  today: string,
) {
  const note: PlanNote = {
    ...stored.note,
    state: { ...state, lastReview: today },
    replan: false,
    reviews: [...stored.note.reviews, { ...p.review, on: today, accepted: false }],
  };
  await savePlan(note, today, stored);
}

export async function undoLast(
  stored: StoredPlan,
  ctx: PlanContext,
  pool: SuggestInput["pool"],
  today: string,
) {
  let sessions = reconcile(stored.note, ctx.calendar, addDays(today, -14)).sessions;
  for (const u of stored.note.undo) {
    if (u.date <= today) continue;
    const index = (new Date(`${u.date}T12:00:00`).getDay() + 6) % 7;
    const indoor = stored.note.settings.week[index]?.indoor ?? false;
    const to = u.workoutId ? workoutById(u.workoutId, pool, indoor) : null;
    const eventId = sessions.find((s) => s.date === u.date)?.eventId ?? null;
    sessions = await applyChange(sessions, { date: u.date, from: null, to, eventId });
  }
  const note: PlanNote = {
    ...stored.note,
    sessions,
    state: stored.note.undoState ?? stored.note.state,
    undo: [],
    undoState: null,
  };
  await savePlan(note, today, stored);
}

export async function swapToday(
  stored: StoredPlan,
  c: { date: string; eventId: string; to: PlanWorkout },
  today: string,
) {
  await replacePlanned(c.eventId, entry(c.to));
  const sessions = stored.note.sessions.map((s) =>
    s.eventId === c.eventId ? sessionOf(c.date, "easy", c.to, c.eventId) : s,
  );
  await savePlan({ ...stored.note, sessions }, today, stored);
}

/** How the rides went against their workouts, by activity id. A ride whose power can't be read is judged as a whole. */
export async function compareRides(
  rides: { act: { id: string; icu_weighted_avg_watts: number | null }; description: string }[],
  ftp: number | null | undefined,
) {
  const out = new Map<string, Execution | null>();
  await Promise.all(
    rides.map(async ({ act, description }) => {
      const watts = await getRideWatts(act.id).catch(() => null);
      out.set(
        act.id,
        executionOf({ description, ftp, watts, weightedWatts: act.icu_weighted_avg_watts }),
      );
    }),
  );
  return out;
}
