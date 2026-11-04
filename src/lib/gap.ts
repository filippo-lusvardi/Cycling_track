// Grade-adjusted pace: the flat speed that would cost the same energy. Uses the energy cost of running on a slope from
// Minetti et al. 2002, so values differ somewhat from Strava's GAP (a model fitted to its own runners' heart rates).
// Pure.

/** Energy cost of running on a slope (J/kg/m); `grade` is a fraction, e.g. 0.1 for 10%. Measured up to ±45%. */
export function runningCost(grade: number): number {
  const i = Math.max(-0.45, Math.min(0.45, grade));
  return 155.4 * i ** 5 - 30.4 * i ** 4 - 43.3 * i ** 3 + 46.3 * i ** 2 + 19.5 * i + 3.6;
}

/** Cost on the flat (J/kg/m). */
export const FLAT_COST = 3.6;

/** How much harder than the flat a slope is: 1 on the flat, above 1 uphill. */
export const gapFactor = (grade: number) => runningCost(grade) / FLAT_COST;

type Profile = { time: number[]; distance: number[]; altitude: (number | null)[] };

/** Half of the stretch a grade is measured over (m): altitude is too noisy for less. */
const GRADE_WINDOW = 50;

/** Grade (fraction) at each sample, over ±50 m. All zeros without altitude, so GAP is plain pace (a treadmill). */
export function gradeStream({ distance, altitude }: Profile): number[] {
  const n = distance.length;
  const out = new Array<number>(n).fill(0);
  if (altitude.length < n || !altitude.some((a) => a != null && a !== 0)) return out;
  let lo = 0;
  let hi = 0;
  for (let i = 0; i < n; i++) {
    while (distance[i]! - distance[lo]! > GRADE_WINDOW) lo++;
    if (hi < i) hi = i;
    while (hi < n - 1 && distance[hi]! - distance[i]! < GRADE_WINDOW) hi++;
    const run = distance[hi]! - distance[lo]!;
    const [a, b] = [altitude[lo], altitude[hi]];
    if (run >= GRADE_WINDOW / 2 && a != null && b != null) out[i] = (b - a) / run;
    else if (i) out[i] = out[i - 1]!;
  }
  return out;
}

export type GapStreams = {
  /** Speed at each sample (m/s). */
  speed: number[];
  /** Grade-adjusted speed at each sample (m/s). */
  gap: number[];
  /** Metres of flat running that would have cost the same. */
  gapDistance: number;
};

/** Second-by-second speed and grade-adjusted speed from distance, time and altitude. */
export function gapStreams(s: Profile): GapStreams {
  const grade = gradeStream(s);
  const n = s.distance.length;
  const speed = new Array<number>(n).fill(0);
  const gap = new Array<number>(n).fill(0);
  let gapDistance = 0;
  for (let i = 1; i < n; i++) {
    const metres = Math.max(0, s.distance[i]! - s.distance[i - 1]!);
    const secs = s.time[i]! - s.time[i - 1]!;
    if (secs <= 0) continue;
    const f = gapFactor(grade[i]!);
    speed[i] = metres / secs;
    gap[i] = speed[i]! * f;
    gapDistance += metres * f;
  }
  return { speed, gap, gapDistance };
}
