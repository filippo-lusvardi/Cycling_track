// How long a climb takes at a power, from the steady-speed model (Martin et al. 1998): gravity, rolling and air against what
// reaches the wheel. It ignores wind, fatigue and pacing, so what it gives is a range, and your own passes correct it. Pure.
import { valueAt } from "./analysis";
import type { PowerCurve } from "./intervals";
import type { Attempt } from "./segments";

const G = 9.81;
/** Bike, shoes, bottles: not measured, so a typical figure. */
const EQUIPMENT_KG = 9;
const CRR = 0.005;
/** Hands on the hoods, at climbing speed. */
const CDA = 0.4;
/** Air at about 800 m. */
const RHO = 1.1;
const DRIVETRAIN = 0.975;
/** How far your own passes may correct the model: beyond this, they say more about the day than the rider. */
const CORRECTION = [0.8, 1.3] as const;

export type Climb = { length: number; gain: number };

const median = (v: number[]) => {
  const s = [...v].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

function powerAtSpeed(v: number, kg: number, climb: Climb) {
  const grade = climb.gain / climb.length;
  const slope = Math.atan(grade);
  const mass = kg + EQUIPMENT_KG;
  const resist = mass * G * (Math.sin(slope) + CRR * Math.cos(slope));
  return ((resist + 0.5 * RHO * CDA * v * v) * v) / DRIVETRAIN;
}

/** Seconds at this power, by the model alone. */
export function modelSeconds(watts: number, kg: number, climb: Climb): number {
  let lo = 0.1;
  let hi = 30;
  for (let i = 0; i < 50; i++) {
    const v = (lo + hi) / 2;
    if (powerAtSpeed(v, kg, climb) < watts) lo = v;
    else hi = v;
  }
  return climb.length / ((lo + hi) / 2);
}

/** Your passes against the model: above 1, you take longer than it says. */
export function correctionFrom(attempts: Attempt[], kg: number, climb: Climb) {
  const seen = attempts.flatMap((a) =>
    a.avgWatts && a.duration > 0 ? [a.duration / modelSeconds(a.avgWatts, kg, climb)] : [],
  );
  if (!seen.length) return { factor: 1, passes: 0 };
  const factor = Math.min(CORRECTION[1], Math.max(CORRECTION[0], median(seen)));
  return { factor, passes: seen.length };
}

const spread = (passes: number) => (passes >= 3 ? 0.03 : passes ? 0.05 : 0.07);

export type TimeRange = { secs: number; low: number; high: number };

export function timeAtPower(
  watts: number,
  kg: number,
  climb: Climb,
  attempts: Attempt[],
): TimeRange {
  const { factor, passes } = correctionFrom(attempts, kg, climb);
  const secs = modelSeconds(watts, kg, climb) * factor;
  const by = spread(passes);
  return { secs, low: secs * (1 - by), high: secs * (1 + by) };
}

/** The power that gets you up in this time. */
export function powerForTime(secs: number, kg: number, climb: Climb, attempts: Attempt[]) {
  const { factor, passes } = correctionFrom(attempts, kg, climb);
  const speed = climb.length / (secs / factor);
  const watts = powerAtSpeed(speed, kg, climb);
  const by = spread(passes);
  return { watts, low: watts * (1 - by), high: watts * (1 + by) };
}

/** The power your curve says you can hold for as long as the climb takes at that power. */
export function holdablePower(
  curve: PowerCurve | undefined,
  kg: number,
  climb: Climb,
  attempts: Attempt[],
): number | null {
  let secs = climb.length / 4;
  let watts: number | null = null;
  const { factor } = correctionFrom(attempts, kg, climb);
  for (let i = 0; i < 12; i++) {
    const held = valueAt(curve, Math.round(secs));
    if (!held) return null;
    watts = held;
    secs = modelSeconds(held, kg, climb) * factor;
  }
  return watts;
}
