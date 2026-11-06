// Ride streams reduced to a few hundred points for charting speed, power, heart rate and cadence along the distance.

type Streams = {
  time: number[];
  distance: number[];
  watts: (number | null)[];
  heartrate: (number | null)[];
  cadence?: (number | null)[] | undefined;
  /** W′ balance per sample (% of W′), when CP is known. */
  wbal?: number[] | undefined;
  /** Grade-adjusted speed per sample (m/s), on runs. */
  gap?: number[] | undefined;
};

export type SeriesPoint = {
  km: number;
  speed: number | null;
  watts: number | null;
  hr: number | null;
  /** Null all along when nothing measured it: a stream of zeros is a missing sensor, not a chart. */
  cadence: number | null;
  /** Lowest W′ balance in the bucket (% of W′): the deepest point of an effort must not be averaged away. */
  wbal: number | null;
  /** Grade-adjusted speed (km/h), on runs. */
  gap?: number | null;
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
  const cadence = s.cadence?.some((c) => c != null && c > 0) ? s.cadence : null;
  for (let i = 0; i + 1 < n; i += step) {
    const j = Math.min(i + step, n - 1);
    const dt = s.time[j]! - s.time[i]!;
    const dd = s.distance[j]! - s.distance[i]!;
    out.push({
      km: (s.distance[i]! + dd / 2) / 1000,
      speed: dt > 0 ? (dd / dt) * 3.6 : null,
      watts: mean(s.watts.slice(i, j)),
      hr: mean(s.heartrate.slice(i, j)),
      cadence: cadence ? mean(cadence.slice(i, j)) : null,
      wbal: s.wbal?.length ? Math.min(...s.wbal.slice(i, j)) : null,
      ...(s.gap ? { gap: (mean(s.gap.slice(i, j)) ?? 0) * 3.6 } : {}),
    });
  }
  return out;
}

/**
 * The heart-rate y axis: from 80 bpm, or from the activity's lowest reading when that is under 80.
 * A 0 is a sensor dropout, not a reading. Ticks are spelled out because Recharts would round the start down.
 */
export function hrAxis(
  activity: (number | null)[],
  top: number | null,
): { domain: [number, number]; ticks: number[] } {
  let low = 80;
  for (const x of activity) if (x != null && x > 0 && x < low) low = x;
  const from = Math.floor(low);
  const step = (top ?? from) - from > 100 ? 40 : 20;
  const to = Math.max(from + step, Math.ceil((top ?? from) / step) * step);
  const ticks = [from];
  for (let v = (Math.floor(from / step) + 1) * step; v <= to; v += step)
    if (v - from >= step / 2) ticks.push(v);
  return { domain: [from, to], ticks };
}
