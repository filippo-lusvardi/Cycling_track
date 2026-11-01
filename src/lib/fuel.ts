// Fuelling: the carbohydrate a ride burns and how much of it to eat on the bike, counted in brioches. Pure.
// Burn is physiology (work → energy → the carbohydrate share at each intensity); the intake targets are the
// ACSM / GSSI guidelines by duration. Both are estimates: gut tolerance and the day's breakfast matter too.

/** Carbohydrate in one brioche (an Italian cornetto is about 40–50 g). */
export const BRIOCHE_G = 45;

/**
 * Typical power in each intervals.icu power zone as a share of FTP (Coggan zones, near each zone's middle), to split
 * a ride's energy between zones from its time in them.
 */
const ZONE_POWER = [0.45, 0.65, 0.83, 0.98, 1.13, 1.35, 1.7];
/**
 * Share of energy from carbohydrate in each zone: about 35–40% at easy endurance, three quarters around threshold,
 * nearly all of it above (Romijn 1993, van Loon 2001).
 */
const ZONE_CHO = [0.35, 0.5, 0.7, 0.85, 0.95, 1, 1];
/** Without power zones, a middle-of-endurance share. */
const DEFAULT_CHO = 0.6;

type RideLike = {
  moving_time: number | null;
  icu_average_watts: number | null;
  /** Total work (J), when intervals.icu gives it. */
  joules?: number | null;
  calories: number | null;
  icu_intensity: number | null;
  zoneTimes: number[];
};

/** Share of a ride's energy that came from carbohydrate, from its time in each power zone. */
export function choShare(zoneTimes: number[]): number {
  let energy = 0;
  let cho = 0;
  zoneTimes.forEach((secs, i) => {
    const e = secs * (ZONE_POWER[i] ?? 1);
    energy += e;
    cho += e * (ZONE_CHO[i] ?? 1);
  });
  return energy > 0 ? cho / energy : DEFAULT_CHO;
}

/**
 * Energy burned (kcal). With power: work in kJ is very nearly kcal burned, since a cyclist turns about 24% of the
 * energy into work and 1 kcal is 4.184 kJ. Without power, intervals.icu's calorie estimate.
 */
export function kcalOf(a: RideLike): number | null {
  const kj =
    a.joules != null
      ? a.joules / 1000
      : a.icu_average_watts != null && a.moving_time
        ? (a.icu_average_watts * a.moving_time) / 1000
        : null;
  return kj ?? a.calories ?? null;
}

/** Grams of carbohydrate burned on a ride (4 kcal per gram). */
export function carbsBurned(a: RideLike): number | null {
  const kcal = kcalOf(a);
  return kcal != null ? (kcal * choShare(a.zoneTimes)) / 4 : null;
}

export type Target = { low: number; high: number; grams: number };

/**
 * What to eat on the bike (g) for a ride of `secs` at intensity factor `intensity` (0–1, e.g. 0.7):
 * under 75 min nothing is needed; up to 2.5 h 30–60 g an hour; longer 60–90 g an hour. Harder rides sit higher in
 * the band.
 */
export function intakeTarget(secs: number, intensity: number | null): Target {
  const h = secs / 3600;
  if (h < 1.25) return { low: 0, high: 0, grams: 0 };
  const [lo, hi] = h <= 2.5 ? [30, 60] : [60, 90];
  const k = intensity == null ? 0.5 : Math.min(1, Math.max(0, (intensity - 0.6) / 0.25));
  return { low: lo * h, high: hi * h, grams: (lo + (hi - lo) * k) * h };
}

export const briochesFor = (grams: number) => Math.round(grams / BRIOCHE_G);

export type FuelVerdict = "under" | "ok" | "over";

export type RideFuel = {
  burned: number | null;
  eaten: number;
  target: Target;
  verdict: FuelVerdict | null;
  /** Brioches more (positive) or fewer (negative) for a ride like this one. */
  advice: number;
};

/** A ride's fuelling: burned, eaten (brioches logged) and what the guidelines suggest. */
export function rideFuel(a: RideLike, brioches: number): RideFuel {
  const target = intakeTarget(
    a.moving_time ?? 0,
    a.icu_intensity != null ? a.icu_intensity / 100 : null,
  );
  const eaten = brioches * BRIOCHE_G;
  const verdict: FuelVerdict | null = !target.high
    ? null
    : eaten < target.low
      ? "under"
      : eaten > target.high + BRIOCHE_G
        ? "over"
        : "ok";
  return {
    burned: carbsBurned(a),
    eaten,
    target,
    verdict,
    advice: briochesFor(target.grams) - brioches,
  };
}
