// The bloom: a few days, rarely and with no warning, when the whole crown flowers. It comes at real peak form, fitness
// near the best of the last year while fresh, so a hard block alone can't bring it and neither can rest alone. It is
// never explained in the app. Pure, and worked out from fitness and fatigue only, so a friend's device finds the same
// days from what a forest already shares.
import { formPercent } from "./readiness";
import { addDays } from "./training";

export type BloomStage = "full" | "falling";
export type Bloom = {
  /** The bloom's first day, which also seeds its flowers. */ start: string;
  stage: BloomStage;
};

/** First guesses, not measured on real histories: how close to the year's best, how fresh (% of fitness), and how rare. */
const NEAR_BEST = 0.95;
const FRESH_PCT = 5;
const MIN_FITNESS = 25;
const MIN_HISTORY_DAYS = 60;
const BEST_WINDOW_DAYS = 365;
const MIN_GAP_DAYS = 60;
const FULL_DAYS = 3;
const FALLING_DAYS = 2;

type Row = { id: string; ctl: number | null; atl: number | null };

/**
 * The first day of every bloom up to `today`, oldest first. A day is judged on the morning, from the evening before,
 * so a ride can't switch off the bloom it's ridden in.
 */
export function bloomStarts(wellness: Row[], today: string): string[] {
  const rows = wellness
    .filter((w): w is Row & { ctl: number; atl: number } => w.ctl != null && w.atl != null)
    .sort((a, b) => a.id.localeCompare(b.id));
  const starts: string[] = [];
  let last = "";
  rows.forEach((row, i) => {
    const day = addDays(row.id, 1);
    if (day > today || i < MIN_HISTORY_DAYS || row.ctl < MIN_FITNESS) return;
    if (last && day < addDays(last, MIN_GAP_DAYS)) return;
    if (formPercent(row.ctl, row.atl) < FRESH_PCT) return;
    const from = addDays(row.id, -BEST_WINDOW_DAYS);
    let best = 0;
    for (let k = i; k >= 0 && rows[k]!.id >= from; k--) best = Math.max(best, rows[k]!.ctl);
    if (row.ctl < best * NEAR_BEST) return;
    starts.push(day);
    last = day;
  });
  return starts;
}

/** Today's bloom, if one is open. */
export function bloomOn(wellness: Row[], today: string): Bloom | null {
  const start = bloomStarts(wellness, today).at(-1);
  if (!start) return null;
  if (today < addDays(start, FULL_DAYS)) return { start, stage: "full" };
  return today < addDays(start, FULL_DAYS + FALLING_DAYS) ? { start, stage: "falling" } : null;
}

/** The rides ridden inside a bloom: they keep a few blossoms on their branch for good. */
export function bloomedRides(
  days: { date: string; branches: { id: string }[] }[],
  wellness: Row[],
  today: string,
): Set<string> {
  const inBloom = new Set<string>();
  for (const start of bloomStarts(wellness, today))
    for (let i = 0; i < FULL_DAYS + FALLING_DAYS; i++) inBloom.add(addDays(start, i));
  return new Set(days.flatMap((d) => (inBloom.has(d.date) ? d.branches.map((b) => b.id) : [])));
}
