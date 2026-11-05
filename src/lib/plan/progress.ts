// How the plan has gone: its sessions with what happened, and each finished week in a line. Pure.
import { mondayOf } from "../focus";
import type { Activity } from "../intervals";
import { addDays } from "../training";
import { reconcile, workoutOf, type PlanContext } from "./engine";
import type { Execution } from "./execution";
import { matchSessions } from "./match";
import type { NoteWeek, PlanNote } from "./note";
import { weekShape } from "./phase";
import type { PlanWorkout, PlannedDay } from "./types";

export type SessionLine = {
  date: string;
  role: PlannedDay["role"];
  /** Null when the calendar in hand doesn't reach back to it. */
  workout: PlanWorkout | null;
  seconds: number;
  act: Activity | null;
  /** 0–100, when the ride had power to compare with the workout. */
  score: number | null;
};

export type Scores = ReadonlyMap<string, Execution | null> | null;

/** The plan's sessions from `from` to `to`, oldest first. `oldest`: how far back the calendar in hand goes. */
export function sessionLines(
  ctx: PlanContext,
  from: string,
  to: string,
  scores: Scores,
  oldest: string = from,
): SessionLine[] {
  const { sessions } = reconcile(ctx.note, ctx.calendar, oldest);
  const byId = new Map(ctx.calendar.map((e) => [e.id, e]));
  const within = sessions
    .filter((s) => s.date >= from && s.date <= to)
    .sort((a, b) => a.date.localeCompare(b.date));
  const matches = matchSessions(
    within.map((s) => ({
      date: s.date,
      workout: { seconds: s.seconds } as PlanWorkout,
      pairedActivityId: (s.eventId && byId.get(s.eventId)?.pairedActivityId) || null,
    })),
    ctx.input.acts,
  );
  return within.map((s) => {
    const e = s.eventId ? byId.get(s.eventId) : undefined;
    const act = matches.get(s.date) ?? null;
    return {
      date: s.date,
      role: s.role,
      workout: e ? workoutOf(e, s) : null,
      seconds: s.seconds,
      act,
      score: act ? (scores?.get(String(act.id))?.score ?? null) : null,
    };
  });
}

const mean = (xs: number[]) =>
  xs.length ? Math.round(xs.reduce((n, x) => n + x, 0) / xs.length) : null;

/** A finished week in a line, or null when nothing was planned in it. */
export function weekLine(ctx: PlanContext, monday: string, lines: SessionLine[]): NoteWeek | null {
  if (!lines.length) return null;
  const { note, input } = ctx;
  const shape = weekShape(monday, note.settings.goal, input.races, note.state);
  const score = mean(lines.flatMap((l) => (l.score != null ? [l.score] : [])));
  return {
    monday,
    phase: shape.phase,
    ...(shape.recovery ? { recovery: true } : {}),
    planned: lines.length,
    done: lines.filter((l) => l.act).length,
    seconds: lines.reduce((n, l) => n + (l.act?.moving_time ?? 0), 0),
    ...(score != null ? { score } : {}),
  };
}

/** The finished weeks not written down yet, oldest first: those the note's sessions still reach. */
export function weeksDue(note: PlanNote, today: string): string[] {
  const kept = new Set((note.pastWeeks ?? []).map((w) => w.monday));
  const thisWeek = mondayOf(today);
  const first = mondayOf(note.state.startedOn);
  const out: string[] = [];
  for (let m = addDays(thisWeek, -28); m < thisWeek; m = addDays(m, 7))
    if (m >= first && !kept.has(m)) out.push(m);
  return out;
}

/** The finished weeks, most recent first: those written down, and those that haven't been yet. */
export function pastWeekLines(ctx: PlanContext, scores: Scores, oldest: string): NoteWeek[] {
  const { note, input } = ctx;
  const live = weeksDue(note, input.today).flatMap((m) => {
    const line = weekLine(ctx, m, sessionLines(ctx, m, addDays(m, 6), scores, oldest));
    return line ? [line] : [];
  });
  return [...(note.pastWeeks ?? []), ...live].sort((a, b) => b.monday.localeCompare(a.monday));
}
