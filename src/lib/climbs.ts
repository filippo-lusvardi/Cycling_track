// Automatic climb detection from distance/altitude streams. Pure and browser-safe.

export type Streams = {
  distance: number[];
  altitude: number[];
  time: number[];
  watts?: (number | null)[];
  heartrate?: (number | null)[];
};

export type ClimbCategory = "HC" | "1" | "2" | "3" | "4" | "Uncat";

export type Climb = {
  startKm: number;
  endKm: number;
  length: number; // m
  gain: number; // m
  avgGrade: number; // %
  maxGrade: number; // % over ~100m
  startAlt: number;
  topAlt: number;
  duration: number; // s
  vam: number | null; // m/h
  avgWatts: number | null;
  avgHr: number | null;
  avgSpeed: number | null; // km/h
  category: ClimbCategory;
};

const STEP = 25; // resample every 25 m
const DROP = 10; // a climb ends when we drop this far below its top
const MIN_GAIN = 25;
const MIN_LENGTH = 400;
const MIN_GRADE = 3;

/** Strava-style category from length (m) × avg grade (%). */
export function climbCategory(length: number, grade: number): ClimbCategory {
  const score = length * grade;
  if (score >= 80000) return "HC";
  if (score >= 64000) return "1";
  if (score >= 32000) return "2";
  if (score >= 16000) return "3";
  if (score >= 8000) return "4";
  return "Uncat";
}

function indexAtDistance(dist: number[], d: number, from = 0): number {
  let i = from;
  while (i < dist.length - 1 && dist[i]! < d) i++;
  return i;
}

function mean(arr: (number | null | undefined)[] | undefined, a: number, b: number): number | null {
  if (!arr) return null;
  let s = 0;
  let n = 0;
  for (let i = a; i <= b; i++) {
    const v = arr[i];
    if (v != null && Number.isFinite(v)) {
      s += v;
      n++;
    }
  }
  return n ? s / n : null;
}

export function detectClimbs(s: Streams): Climb[] {
  const { distance, altitude, time } = s;
  const n = Math.min(distance.length, altitude.length, time.length);
  if (n < 10) return [];
  const total = distance[n - 1]!;
  if (!total || total < MIN_LENGTH) return [];

  // Resample at fixed distance steps.
  const rd: number[] = [];
  const ra: number[] = [];
  const ri: number[] = [];
  let idx = 0;
  for (let d = distance[0] ?? 0; d <= total; d += STEP) {
    idx = indexAtDistance(distance, d, idx);
    const alt = altitude[idx];
    if (alt == null || !Number.isFinite(alt)) continue;
    rd.push(d);
    ra.push(alt);
    ri.push(idx);
  }
  if (rd.length < 5) return [];

  // Smooth altitude (±100 m window).
  const W = 4;
  const sa = ra.map((_, i) => {
    let sum = 0;
    let c = 0;
    for (let k = Math.max(0, i - W); k <= Math.min(ra.length - 1, i + W); k++) {
      sum += ra[k]!;
      c++;
    }
    return sum / c;
  });

  const segments: [number, number][] = [];
  let low = 0;
  let peak = 0;
  for (let j = 1; j < sa.length; j++) {
    if (sa[j]! >= sa[peak]!) {
      peak = j;
    } else if (peak > low && sa[peak]! - sa[j]! > DROP) {
      segments.push([low, peak]);
      low = j;
      peak = j;
      continue;
    }
    if (sa[j]! < sa[low]!) {
      low = j;
      if (peak < low) peak = j;
    }
  }
  if (peak > low) segments.push([low, peak]);

  const climbs: Climb[] = [];
  for (let [a, b] of segments) {
    // Trim flat lead-in: advance start while the next 100 m is under 1%.
    while (a + 4 < b && (sa[a + 4]! - sa[a]!) / (rd[a + 4]! - rd[a]!) < 0.01) a++;
    // …and the flat run-out over the top, so a false flat doesn't stretch the climb.
    while (b - 4 > a && (sa[b]! - sa[b - 4]!) / (rd[b]! - rd[b - 4]!) < 0.01) b--;
    const length = rd[b]! - rd[a]!;
    const gain = sa[b]! - sa[a]!;
    if (length < MIN_LENGTH || gain < MIN_GAIN) continue;
    const avgGrade = (gain / length) * 100;
    if (avgGrade < MIN_GRADE) continue;

    let maxGrade = 0;
    for (let k = a; k + 4 <= b; k++) {
      const g = ((sa[k + 4]! - sa[k]!) / (rd[k + 4]! - rd[k]!)) * 100;
      if (g > maxGrade) maxGrade = g;
    }
    const ia = ri[a]!;
    const ib = ri[b]!;
    const duration = time[ib]! - time[ia]!;
    climbs.push({
      startKm: rd[a]! / 1000,
      endKm: rd[b]! / 1000,
      length,
      gain,
      avgGrade,
      maxGrade: Math.max(maxGrade, avgGrade),
      startAlt: sa[a]!,
      topAlt: sa[b]!,
      duration,
      vam: duration > 0 ? (gain / duration) * 3600 : null,
      avgWatts: mean(s.watts, ia, ib),
      avgHr: mean(s.heartrate, ia, ib),
      avgSpeed: duration > 0 ? (length / duration) * 3.6 : null,
      category: climbCategory(length, avgGrade),
    });
  }
  return climbs;
}
