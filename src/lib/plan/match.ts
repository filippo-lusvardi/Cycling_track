// What was planned against what happened. intervals.icu may say itself which activity went with which event; otherwise the
// same day, a ride, the closest in length within reason (C), each activity used once. Pure.
import { isSport } from "../sport";
import type { Activity } from "../intervals";
import type { Execution } from "./execution";
import type { PlannedDay, SessionOutcome } from "./types";

const SIMILAR = 0.4;
const dayOf = (a: Activity) => a.start_date_local.slice(0, 10);

export type MatchablePlanned = Pick<PlannedDay, "date" | "workout"> & {
  /** The activity intervals.icu paired with this event, when it says. */
  pairedActivityId?: string | null;
};

export function matchSessions(planned: MatchablePlanned[], acts: Activity[]) {
  const usedActs = new Set<string>();
  const matches = new Map<string, Activity>();
  const byId = new Map(acts.map((a) => [String(a.id), a]));
  for (const p of planned) {
    const paired = p.pairedActivityId ? byId.get(p.pairedActivityId) : undefined;
    if (paired) {
      matches.set(p.date, paired);
      usedActs.add(String(paired.id));
    }
  }
  for (const p of planned) {
    const seconds = p.workout?.seconds;
    if (!seconds || matches.has(p.date)) continue;
    const candidates = acts
      .filter((a) => dayOf(a) === p.date && isSport(a, "ride") && !usedActs.has(String(a.id)))
      .map((a) => ({ a, gap: Math.abs((a.moving_time ?? 0) - seconds) / seconds }))
      .filter((c) => c.gap <= SIMILAR)
      .sort((x, y) => x.gap - y.gap);
    if (candidates[0]) {
      matches.set(p.date, candidates[0].a);
      usedActs.add(String(candidates[0].a.id));
    }
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
