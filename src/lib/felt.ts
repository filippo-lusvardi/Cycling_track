// How your recent activities felt, as you rated them: a small part of the crown, and a nudge to the sky. Feel is
// intervals.icu's scale, 1 strong … 5 weak. With nothing rated it has no say at all.
import { t } from "./i18n";
import { addDays } from "./training";

/** What the rating buttons say, 1 to 5. */
export const FEEL_LABEL = [
  t("Strong", "Ottima"),
  t("Good", "Buona"),
  t("Normal", "Normale"),
  t("Poor", "Scarsa"),
  t("Weak", "Pessima"),
];

/** Today counts most; three days back it has passed. */
const RECENCY = [1, 0.7, 0.4];
/** Ratings it takes to know your usual. */
const USUAL_MIN = 5;
const USUAL_DAYS = 60;
/** Points of form the sky can move for a level worse, and the most it moves each way. */
const SKY_PER_LEVEL = 5;
const SKY_DOWN = 10;
const SKY_UP = 5;

type Rated = { start_date_local: string; feel: number | null };

export type RecentFeel = {
  /** Weighted average of the last three days, 1 to 5. */
  mean: number;
  /** Ratings in it. */
  count: number;
  /** Average of the 60 days before, once there are enough. */
  usual: number | null;
  /** 0 to 100, as the crown's other parts. */
  score: number;
  /** Points added to form for the sky. */
  skyShift: number;
};

const clamp = (v: number) => Math.max(0, Math.min(100, v));
const dayOf = (a: Rated) => a.start_date_local.slice(0, 10);

export function recentFeel(acts: Rated[], date: string): RecentFeel | null {
  let sum = 0;
  let weight = 0;
  let count = 0;
  const from = addDays(date, -(RECENCY.length - 1));
  for (let i = 0; i < RECENCY.length; i++) {
    const day = addDays(date, -i);
    for (const a of acts) {
      if (a.feel == null || a.feel < 1 || dayOf(a) !== day) continue;
      sum += a.feel * RECENCY[i]!;
      weight += RECENCY[i]!;
      count++;
    }
  }
  if (!count) return null;
  const mean = sum / weight;
  const before = acts.filter(
    (a) =>
      a.feel != null && a.feel >= 1 && dayOf(a) < from && dayOf(a) >= addDays(from, -USUAL_DAYS),
  );
  const usual =
    before.length >= USUAL_MIN ? before.reduce((s, a) => s + a.feel!, 0) / before.length : null;
  // As with the check-in: half the plain scale, half how far it is from your usual.
  const plain = clamp(100 - (mean - 1) * 25);
  const score = usual == null ? plain : (plain + clamp(75 - (mean - usual) * 30)) / 2;
  const off = (mean - (usual ?? 3)) * SKY_PER_LEVEL;
  return {
    mean,
    count,
    usual,
    score,
    skyShift: Math.round(Math.max(-SKY_DOWN, Math.min(SKY_UP, -off)) * 10) / 10,
  };
}

/** The word for an average. */
export const feelWord = (mean: number) =>
  FEEL_LABEL[Math.min(4, Math.max(0, Math.round(mean) - 1))]!;
