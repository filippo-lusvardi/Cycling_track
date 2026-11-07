// The plan's memory: one note on the calendar, on intervals.icu for those who use it, so a plan costs Cirmolo's own database
// nothing. Sessions are the calendar's workouts and ratings are lines on activities: the note holds only what's left, by
// reference, and old entries drop off so it stays small.
import { z } from "zod";
import { t } from "../i18n";
import { addDays } from "../training";
import {
  DOSE_KINDS,
  planSettingsSchema,
  type Phase,
  type PlanSettings,
  type PlanState,
  type Review,
} from "./types";

export const PLAN_NOTE_NAME = "Cirmolo plan";
const VERSION = 1;
const MARK = "--- cirmolo plan data ---";
const KEEP_SESSION_DAYS = 28;
const KEEP_REVIEWS = 30;
/** Finished weeks in a line each: small enough for the note, long enough to look back on half a year. */
const KEEP_WEEKS = 26;
/** A note this old moves up, since the calendar is only searched so far back. */
export const NOTE_SEARCH_DAYS = 400;
const MOVE_AFTER_DAYS = 300;

export type NoteSession = {
  date: string;
  role: "hard" | "long" | "easy";
  /** Enough to rebuild the workout: its id in the library, or the plan's own ride with its length in it. */
  workoutId: string;
  seconds: number;
  /** The event on the calendar: the plan only ever changes the ones it put there. */
  eventId: string | null;
  /** The text as sent, to see whether someone has changed it since. */
  textHash: number;
};

export type NoteReview = Review & { on: string; accepted?: boolean | undefined };

/** A finished week in a line, written down while its sessions and rides can still be read. */
export type NoteWeek = {
  monday: string;
  phase: Phase;
  recovery?: boolean | undefined;
  planned: number;
  done: number;
  seconds: number;
  /** Mean of the sessions that had power to compare. */
  score?: number | undefined;
};

export type PlanNote = {
  settings: PlanSettings;
  state: PlanState;
  sessions: NoteSession[];
  reviews: NoteReview[];
  /** What the last accepted change replaced, for going back. */
  undo: { date: string; workoutId: string | null }[];
  /** What the state was before that change. */
  undoState?: PlanState | null | undefined;
  /** Other days just for one week. */
  weekOverride?: { monday: string; week: PlanSettings["week"] } | null | undefined;
  /** The days changed, so the week may want redrawing. */
  replan?: boolean | undefined;
  /** The last check that wrote the next seven days to the calendar. */
  lastFill?: string | null | undefined;
  /** Days someone cleared by hand: a check doesn't fill them again. */
  declined?: string[] | undefined;
  pastWeeks?: NoteWeek[] | undefined;
  /** A season's races as last taken into account, to notice when they change. */
  seenRaces?: string[] | undefined;
};

const dosesSchema = z.object(
  Object.fromEntries(DOSE_KINDS.map((k) => [k, z.number().nonnegative()])) as Record<
    (typeof DOSE_KINDS)[number],
    z.ZodNumber
  >,
);
const stateSchema = z.object({
  startedOn: z.string(),
  cycleStart: z.string(),
  buildWeeks: z.union([z.literal(2), z.literal(3)]),
  weeklySeconds: z.number(),
  lastBuildSeconds: z.number(),
  doses: dosesSchema,
  beforeLower: dosesSchema.nullable(),
  hardCap: z.union([z.literal(1), z.literal(2)]),
  hardGap: z.union([z.literal(2), z.literal(3)]),
  lowersThisCycle: z.number(),
  cleanCycles: z.number(),
  forcedRecovery: z.string().nullable(),
  lastReview: z.string().nullable(),
  weekRolled: z.string().nullable().optional(),
});
const noteSchema = z.object({
  v: z.literal(VERSION),
  settings: planSettingsSchema,
  state: stateSchema,
  sessions: z.array(
    z.object({
      date: z.string(),
      role: z.enum(["hard", "long", "easy"]),
      workoutId: z.string(),
      seconds: z.number(),
      eventId: z.string().nullable(),
      textHash: z.number(),
    }),
  ),
  reviews: z.array(
    z.object({
      on: z.string(),
      result: z.enum(["raise", "hold", "lower"]),
      reason: z.string(),
      accepted: z.boolean().optional(),
    }),
  ),
  undo: z.array(z.object({ date: z.string(), workoutId: z.string().nullable() })),
  undoState: stateSchema.nullable().optional(),
  weekOverride: z
    .object({ monday: z.string(), week: planSettingsSchema.shape.week })
    .nullable()
    .optional(),
  replan: z.boolean().optional(),
  lastFill: z.string().nullable().optional(),
  declined: z.array(z.string()).optional(),
  pastWeeks: z
    .array(
      z.object({
        monday: z.string(),
        phase: z.enum(["base", "build", "specific", "taper", "maintain"]),
        recovery: z.boolean().optional(),
        planned: z.number(),
        done: z.number(),
        seconds: z.number(),
        score: z.number().optional(),
      }),
    )
    .optional(),
  seenRaces: z.array(z.string()).optional(),
});

/** A short fingerprint, to notice a changed text. */
export function textHash(text: string) {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (Math.imul(h, 31) + text.charCodeAt(i)) | 0;
  return h;
}

const round = (s: PlanState): PlanState => {
  const whole = (d: PlanState["doses"]) =>
    Object.fromEntries(Object.entries(d).map(([k, v]) => [k, Math.round(v)])) as PlanState["doses"];
  return {
    ...s,
    weeklySeconds: Math.round(s.weeklySeconds),
    lastBuildSeconds: Math.round(s.lastBuildSeconds),
    doses: whole(s.doses),
    beforeLower: s.beforeLower && whole(s.beforeLower),
  };
};

/** The text of the note: a sentence for anyone who finds it on their calendar, then the data. */
export function writeNote(note: PlanNote, today: string) {
  const data = {
    v: VERSION,
    ...note,
    state: round(note.state),
    sessions: note.sessions.filter((s) => s.date >= addDays(today, -KEEP_SESSION_DAYS)),
    reviews: note.reviews.slice(-KEEP_REVIEWS),
    declined: note.declined?.filter((d) => d >= today),
    pastWeeks: note.pastWeeks?.slice(-KEEP_WEEKS),
  };
  const intro = t(
    "Cirmolo keeps your training plan here. Deleting this note starts the plan over.",
    "Cirmolo tiene qui il tuo piano di allenamento. Se elimini questa nota, il piano riparte da zero.",
  );
  return `${intro}\n\n${MARK}\n${JSON.stringify(data)}`;
}

/** Null for anything that can't be read whole: a plan half understood is worse than none. */
export function readNote(description: string | null | undefined): PlanNote | null {
  const at = description?.indexOf(MARK) ?? -1;
  if (at < 0) return null;
  try {
    const { v: _, ...note } = noteSchema.parse(JSON.parse(description!.slice(at + MARK.length)));
    return note as PlanNote;
  } catch {
    return null;
  }
}

/** Where the note should sit: on the plan's first day, until that's about to fall out of the search. */
export const noteDate = (startedOn: string, current: string | null, today: string) => {
  const from = current ?? startedOn;
  return from < addDays(today, -MOVE_AFTER_DAYS) ? today : from;
};
