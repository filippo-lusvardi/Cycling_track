// The training plan's vocabulary. Rule tags as in the wiki page Training-Evidence: E evidence, I inference, C convention.
import { z } from "zod";
import type { RaceKind } from "../races";
import type { WorkoutKind } from "../workout-templates";
import type { Execution } from "./execution";

export const PLAN_GOALS = ["race", "season", "fitter", "healthy"] as const;
export type PlanGoal = (typeof PLAN_GOALS)[number];

const dayPlanSchema = z.object({
  /** The time available; 0 is a rest day. */
  minutes: z.number().int().min(0).max(720),
  indoor: z.boolean(),
  long: z.boolean(),
});
export type DayPlan = z.infer<typeof dayPlanSchema>;

/** The kinds of race a cycling season can be made of. */
export const SEASON_KINDS = [
  "road",
  "crit",
  "tt",
  "climb",
  "granfondo",
  "stage",
  "xco",
  "xcc",
  "marathon",
  "mtbclimb",
] as const satisfies readonly RaceKind[];

const seasonSchema = z.object({
  /** "2027-05": months next to each other make one period. */
  months: z.array(z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/)),
  /** May be empty: not known yet. */
  kinds: z.array(z.enum(SEASON_KINDS)),
  /** The weekly volume the season climbs to, by the specific phase. */
  peakSeconds: z.number().positive().optional(),
});
export type PlanSeason = z.infer<typeof seasonSchema>;

export const planSettingsSchema = z.object({
  goal: z.enum(PLAN_GOALS),
  /** Monday to Sunday. */
  week: z.array(dayPlanSchema).length(7),
  /** Only with the season goal; without it, a season goal goes on as a rolling plan. */
  season: seasonSchema.optional(),
});
export type PlanSettings = z.infer<typeof planSettingsSchema>;

/** Settings stored as JSON: anything unreadable counts as none, so it can never stop an account from loading. */
export function parsePlanSettings(json: string | null | undefined): PlanSettings | null {
  if (!json) return null;
  try {
    return planSettingsSchema.parse(JSON.parse(json));
  } catch {
    return null;
  }
}

export type Phase = "base" | "build" | "specific" | "taper" | "maintain";

/** The kinds of hard work with a dose. */
export const DOSE_KINDS = ["tempo", "threshold", "vo2", "anaerobic"] as const;
export type DoseKind = (typeof DOSE_KINDS)[number];
/** Seconds of work per session, for each kind. */
export type Doses = Record<DoseKind, number>;

export type PlanState = {
  startedOn: string;
  /** The Monday the current cycle's count starts from. */
  cycleStart: string;
  /** C: build weeks before each recovery week. */
  buildWeeks: 2 | 3;
  /** The usual size of a build week, in seconds. */
  weeklySeconds: number;
  /** The size of the last build week: growth is measured from it, never from a recovery week. */
  lastBuildSeconds: number;
  doses: Doses;
  /** The doses before this cycle's first step down, to come back to after recovery. */
  beforeLower: Doses | null;
  /** Hard sessions a week, at most. */
  hardCap: 1 | 2;
  /** The fewest days from one hard day to the next: 2 leaves a day between them. */
  hardGap: 2 | 3;
  lowersThisCycle: number;
  /** Cycles in a row with no step down. */
  cleanCycles: number;
  /** A Monday whose week was made a recovery week early. */
  forcedRecovery: string | null;
  lastReview: string | null;
  /** The Monday of the last week taken into account. */
  weekRolled?: string | null | undefined;
};

export const RATINGS = ["easier", "expected", "harder", "failed"] as const;
export type Rating = (typeof RATINGS)[number];

export type DayRoleInPlan = "past" | "rest" | "long" | "hard" | "easy" | "taken" | "race";

export type PlanWorkout = {
  id: string;
  name: string;
  /** Ride or VirtualRide, so the sync filters on intervals.icu send it to the right device. */
  type: string;
  description: string;
  seconds: number;
  load: number;
  kind: WorkoutKind;
};

export type PlannedDay = {
  date: string;
  role: DayRoleInPlan;
  workout: PlanWorkout | null;
};

export type SessionOutcome = {
  date: string;
  hard: boolean;
  plannedSeconds: number;
  /** Null when no activity matched it. */
  doneSeconds: number | null;
  rating: Rating | null;
  /** How the ride compared with the workout, when there's power to tell. */
  execution?: Execution | null;
};

export type ReviewResult = "raise" | "hold" | "lower";
export type ReviewReason =
  | "failed"
  | "harder-twice"
  | "low-mornings"
  | "hrv-and-feel"
  | "good"
  | "off"
  | "missed"
  | "recovery-week"
  | "no-ratings"
  | "not-all-done"
  | "low-hrv"
  | "went-over"
  | "under-target"
  | "days-changed"
  | "races-changed"
  | "mixed";
export type Review = { result: ReviewResult; reason: ReviewReason };
