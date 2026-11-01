// Ride streams reduced to a few hundred points for charting speed, power and heart rate along the distance.

type Streams = {
  time: number[];
  distance: number[];
  watts: (number | null)[];
  heartrate: (number | null)[];
  /** W′ balance per sample (% of W′), when CP is known. */
  wbal?: number[] | undefined;
};

export type SeriesPoint = {
  km: number;
  speed: number | null;
  watts: number | null;
  hr: number | null;
  /** Lowest W′ balance in the bucket (% of W′): the deepest point of an effort must not be averaged away. */
  wbal: number | null;
};

const mean = (xs: (number | null | undefined)[]) => {
  let sum = 0;
  let n = 0;
  for (const x of xs)
    if (x != null) {
      sum += x;
      n++;
    }
  return n ? sum / n : null;
};

/**
 * Consecutive samples averaged into about `points` buckets (at least 5 samples each, which also smooths power).
 * Speed is each bucket's distance over its elapsed time, so stops show as slow stretches.
 */
export function rideSeries(s: Streams, points = 500): SeriesPoint[] {
  const n = Math.min(s.time.length, s.distance.length);
  const step = Math.max(5, Math.ceil(n / points));
  const out: SeriesPoint[] = [];
  for (let i = 0; i + 1 < n; i += step) {
    const j = Math.min(i + step, n - 1);
    const dt = s.time[j]! - s.time[i]!;
    const dd = s.distance[j]! - s.distance[i]!;
    out.push({
      km: (s.distance[i]! + dd / 2) / 1000,
      speed: dt > 0 ? (dd / dt) * 3.6 : null,
      watts: mean(s.watts.slice(i, j)),
      hr: mean(s.heartrate.slice(i, j)),
      wbal: s.wbal?.length ? Math.min(...s.wbal.slice(i, j)) : null,
    });
  }
  return out;
}
