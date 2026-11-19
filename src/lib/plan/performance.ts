// How the rider is doing, from signals that track performance better than the load model (Training-Evidence §12 and
// Known gaps): critical power and W′ from the best efforts, durability under fatigue, and aerobic efficiency on steady easy
// rides. Trends only: nothing here is projected forward. Pure.
import { mondayOf } from "../focus";
import { fitCriticalPower } from "../analysis";
import { BUCKETS, durabilityProfile, EFFORTS, type RideDurability } from "../durability";
import type { Activity, PowerCurve } from "../intervals";
import { isSport } from "../sport";
import { addDays } from "../training";

/** Weeks of trend shown, and the window each critical power point is read from. */
export const TREND_WEEKS = 12;
export const CP_WINDOW_DAYS = 42;
/** E: field fits are good only with a clean line through the 3–20 min bests; a 1 min best spoils them, so it's left out. */
const CP_FIT = 0.9;
/** I: from this intensity (% of FTP) a ride had efforts that can move the critical power. */
const HARD_FROM = 88;
/** C: what counts as a steady easy ride for efficiency: long enough for heart rate to settle, easy enough to compare. */
const STEADY_SECS = 45 * 60;
const STEADY_BELOW = 75;

export type CpPoint = { date: string; cp: number; wPrime: number };

/** Critical power and W′ from one power curve's 3–20 min bests, when they make a clean line. */
export function cpOf(curve: Pick<PowerCurve, "secs" | "watts"> | null | undefined) {
  if (!curve) return null;
  const fit = fitCriticalPower(curve.secs.map((secs, i) => ({ secs, watts: curve.watts[i] ?? 0 })));
  return fit && fit.r2 > CP_FIT ? { cp: Math.round(fit.cp), wPrime: Math.round(fit.wPrime) } : null;
}

/** The days the critical power windows end on, oldest first: every two weeks back from today. */
export function cpWindows(today: string, weeks = TREND_WEEKS) {
  return Array.from({ length: Math.floor(weeks / 2) + 1 }, (_, i) => {
    const to = addDays(today, -14 * (Math.floor(weeks / 2) - i));
    return { from: addDays(to, -CP_WINDOW_DAYS + 1), to };
  });
}

export function cpTrend(curves: { to: string; curve: PowerCurve | null }[]): CpPoint[] {
  return curves.flatMap(({ to, curve }) => {
    const fit = cpOf(curve);
    return fit ? [{ date: to, ...fit }] : [];
  });
}

/** Days since the last ride with efforts hard enough to move the critical power, or null when none in the history. */
export function daysSinceHard(acts: readonly Activity[], today: string) {
  const last = acts
    .filter((a) => isSport(a, "ride") && (a.icu_intensity ?? 0) >= HARD_FROM)
    .map((a) => a.start_date_local.slice(0, 10))
    .filter((d) => d <= today)
    .sort()
    .at(-1);
  if (!last) return null;
  return Math.round(
    (new Date(`${today}T12:00:00`).getTime() - new Date(`${last}T12:00:00`).getTime()) / 864e5,
  );
}

export type EfficiencyPoint = {
  monday: string;
  /** Median watts per heartbeat (normalized power ÷ average heart rate). */
  efficiency: number;
  /** Median decoupling, %. */
  decoupling: number | null;
  rides: number;
};

const median = (v: number[]) => {
  if (!v.length) return null;
  const s = [...v].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

const indoor = (a: Activity) => a.trainer || a.type === "VirtualRide";

/**
 * Week by week, how many watts each heartbeat buys on steady easy rides: power at a given heart rate tracks fitness
 * (Lamberts' submaximal test). Indoors and outdoors apart, since heat and cooling change heart rate.
 */
export function efficiencyTrend(acts: readonly Activity[], today: string, weeks = TREND_WEEKS) {
  const from = addDays(mondayOf(today), -7 * (weeks - 1));
  const steady = acts.filter(
    (a) =>
      isSport(a, "ride") &&
      a.efficiency != null &&
      a.efficiency > 0 &&
      a.average_heartrate != null &&
      (a.moving_time ?? 0) >= STEADY_SECS &&
      a.icu_intensity != null &&
      a.icu_intensity < STEADY_BELOW &&
      a.start_date_local.slice(0, 10) >= from &&
      a.start_date_local.slice(0, 10) <= today,
  );
  const series = (rides: Activity[]): EfficiencyPoint[] => {
    const byWeek = new Map<string, Activity[]>();
    for (const a of rides) {
      const m = mondayOf(a.start_date_local.slice(0, 10));
      byWeek.set(m, [...(byWeek.get(m) ?? []), a]);
    }
    return [...byWeek.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([monday, list]) => ({
        monday,
        efficiency: Math.round(median(list.map((a) => a.efficiency!))! * 100) / 100,
        decoupling: median(list.flatMap((a) => (a.decoupling != null ? [a.decoupling] : []))),
        rides: list.length,
      }));
  };
  return {
    indoor: series(steady.filter(indoor)),
    outdoor: series(steady.filter((a) => !indoor(a))),
  };
}

export type DurabilityPoint = {
  /** The first Monday of the four weeks. */
  monday: string;
  /** Power lost after 15 and 30 kJ/kg, % of fresh, for the 5 and 20 min bests; null where no ride got there. */
  drop: Record<15 | 30, [number | null, number | null]>;
  rides: number;
};

const FIVE = EFFORTS.indexOf(300);
const TWENTY = EFFORTS.indexOf(1200);

/** Durability in blocks of four weeks: the fresh bests and the bests after work, from the long rides in each block. */
export function durabilityTrend(
  rides: readonly { date: string; durability: RideDurability }[],
  today: string,
  weeks = TREND_WEEKS,
): DurabilityPoint[] {
  const blocks = Math.ceil(weeks / 4);
  const first = addDays(mondayOf(today), -7 * (blocks * 4 - 1));
  return Array.from({ length: blocks }, (_, i) => addDays(first, 28 * i)).flatMap((monday) => {
    const end = addDays(monday, 27);
    const inBlock = rides.filter((r) => r.date >= monday && r.date <= end);
    if (!inBlock.length) return [];
    const p = durabilityProfile(inBlock.map((r) => r.durability));
    const at = (b: (typeof BUCKETS)[number]): [number | null, number | null] => [
      round1(p.drop[b][FIVE]),
      round1(p.drop[b][TWENTY]),
    ];
    return [{ monday, drop: { 15: at(15), 30: at(30) }, rides: inBlock.length }];
  });
}

const round1 = (v: number | null | undefined) => (v == null ? null : Math.round(v * 10) / 10);
