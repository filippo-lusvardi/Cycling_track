// What was planned against what happened. intervals.icu may say itself which activity went with which event; otherwise any
// ride that day counts, whatever its name or length, the closest in length first, each activity used once. A hard or long
// session that moved a day either way is found too, by a ride like it. Pure.
import { addDays } from "../training";
import { isSport } from "../sport";
import type { Activity } from "../intervals";
import type { Execution } from "./execution";
import type { PlannedDay, SessionOutcome } from "./types";

/** C: a long ride a day off counts as the long session from this share of it. */
const LONG_ENOUGH = 0.75;
const dayOf = (a: Activity) => a.start_date_local.slice(0, 10);

export type MatchablePlanned = Pick<PlannedDay, "date" | "workout"> & {
  /** The activity intervals.icu paired with this event, when it says. */
  pairedActivityId?: string | null;
  /** Hard and long sessions are looked for a day either way too. */
  role?: PlannedDay["role"] | "easy" | undefined;
};

export function matchSessions(
  planned: MatchablePlanned[],
  acts: Activity[],
  /** Which rides were hard: without it, a hard session is only found on its own day. */
  hard?: (a: Activity) => boolean,
) {
  const usedActs = new Set<string>();
  const matches = new Map<string, Activity>();
  const byId = new Map(acts.map((a) => [String(a.id), a]));
  const take = (date: string, a: Activity) => {
    matches.set(date, a);
    usedActs.add(String(a.id));
  };
  const free = (a: Activity) => isSport(a, "ride") && !usedActs.has(String(a.id));
  for (const p of planned) {
    const paired = p.pairedActivityId ? byId.get(p.pairedActivityId) : undefined;
    if (paired) take(p.date, paired);
  }
  for (const p of planned) {
    const seconds = p.workout?.seconds;
    if (!seconds || matches.has(p.date)) continue;
    const best = acts
      .filter((a) => dayOf(a) === p.date && free(a))
      .sort(
        (x, y) =>
          Math.abs((x.moving_time ?? 0) - seconds) - Math.abs((y.moving_time ?? 0) - seconds),
      )[0];
    if (best) take(p.date, best);
  }
  // Only once every day has had its own rides: a ride is never taken from the session of its day.
  for (const p of planned) {
    const seconds = p.workout?.seconds;
    if (!seconds || matches.has(p.date) || (p.role !== "hard" && p.role !== "long")) continue;
    const near = [addDays(p.date, -1), addDays(p.date, 1)];
    const like = (a: Activity) =>
      p.role === "hard" ? !!hard?.(a) : (a.moving_time ?? 0) >= seconds * LONG_ENOUGH;
    const found = acts.find((a) => near.includes(dayOf(a)) && free(a) && like(a));
    if (found) take(p.date, found);
  }
  return matches;
}

/** The planned days that have passed, each with what happened. */
export function outcomesOf(
  planned: (MatchablePlanned & { role: PlannedDay["role"] })[],
  acts: Activity[],
  today: string,
  executions: ReadonlyMap<string, Execution | null> = new Map(),
): SessionOutcome[] {
  const matches = matchSessions(planned, acts);
  return planned.flatMap((p): SessionOutcome[] => {
    if (!p.workout || p.date >= today) return [];
    const act = matches.get(p.date);
    return [
      {
        date: p.date,
        hard: p.role === "hard",
        plannedSeconds: p.workout.seconds,
        doneSeconds: act ? (act.moving_time ?? 0) : null,
        rating: act?.planRating ?? null,
        execution: act ? (executions.get(String(act.id)) ?? null) : null,
      },
    ];
  });
}

/** What would change between two versions of a week: never today or before. */
export function diffWeek(before: PlannedDay[], after: PlannedDay[], today: string) {
  const old = new Map(before.map((d) => [d.date, d]));
  return after.flatMap((d) => {
    if (d.date <= today) return [];
    const was = old.get(d.date);
    if ((was?.workout?.id ?? null) === (d.workout?.id ?? null)) return [];
    return [{ date: d.date, from: was?.workout ?? null, to: d.workout }];
  });
}
