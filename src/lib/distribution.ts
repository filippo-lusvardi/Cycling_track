// How a ride's or a stretch's time was spread over power and heart rate: buckets for the histogram, zones for the sums. Pure.
import { zoneIndex } from "./run-metrics";

export type DistMetric = "power" | "hr";
export type Bucket = { start: number; secs: number };

export const BUCKET: Record<DistMetric, number> = { power: 25, hr: 5 };

/** Seconds per bucket, lowest first. A 0 isn't a value: no pedalling, or the sensor dropping out. */
export function histogramOf(values: (number | null)[], bucket: number): Bucket[] {
  const by = new Map<number, number>();
  for (const v of values) {
    if (v == null || v <= 0) continue;
    const start = Math.floor(v / bucket) * bucket;
    by.set(start, (by.get(start) ?? 0) + 1);
  }
  return [...by.entries()].sort((a, b) => a[0] - b[0]).map(([start, secs]) => ({ start, secs }));
}

/** A stream's buckets, in the form intervals.icu gives them: on power, the first bucket holds the zeros as well. */
export function streamBuckets(values: (number | null)[], metric: DistMetric): Bucket[] {
  return histogramOf(
    metric === "power" ? values.map((v) => (v === 0 ? 1 : v)) : values,
    BUCKET[metric],
  );
}

/** What a chart draws: power's first bucket is coasting, a bar so big it would flatten the rest, so it's said apart. */
export function apartCoasting(buckets: Bucket[], metric: DistMetric) {
  if (metric !== "power") return { buckets, coasting: 0 };
  return {
    buckets: buckets.filter((b) => b.start > 0),
    coasting: buckets.find((b) => b.start === 0)?.secs ?? 0,
  };
}

export function mergeHistograms(all: Bucket[][]): Bucket[] {
  const by = new Map<number, number>();
  for (const h of all) for (const b of h) by.set(b.start, (by.get(b.start) ?? 0) + b.secs);
  return [...by.entries()].sort((a, b) => a[0] - b[0]).map(([start, secs]) => ({ start, secs }));
}

/**
 * The buckets to draw: empty ones between filled, so the axis stays even, and the thin tail folded into one last bucket,
 * so a single sprint doesn't stretch the chart. `open` is that last bucket, if there is one.
 */
export function drawnBuckets(
  buckets: Bucket[],
  bucket: number,
  tail = 0.002,
): { buckets: Bucket[]; open: boolean } {
  if (!buckets.length) return { buckets: [], open: false };
  const total = buckets.reduce((n, b) => n + b.secs, 0);
  let keep = buckets.length;
  let folded = 0;
  while (keep > 1 && (folded + buckets[keep - 1]!.secs) / total <= tail) {
    folded += buckets[keep - 1]!.secs;
    keep--;
  }
  const shown = buckets.slice(0, keep);
  const out: Bucket[] = [];
  for (let s = shown[0]!.start, i = 0; s <= shown.at(-1)!.start; s += bucket) {
    if (shown[i]?.start === s) out.push(shown[i++]!);
    else out.push({ start: s, secs: 0 });
  }
  if (folded) out.push({ start: shown.at(-1)!.start + bucket, secs: folded });
  return { buckets: out, open: folded > 0 };
}

/** Seconds in each zone, from buckets; `tops` are each zone's upper bound. */
export function zonesOfBuckets(buckets: Bucket[], bucket: number, tops: number[]): number[] {
  const out = tops.map(() => 0);
  for (const b of buckets) out[zoneIndex(b.start + bucket / 2, tops)]! += b.secs;
  return out;
}

/** Sums zone times across activities; a shorter list counts as zeros. */
export function sumZones(lists: (number[] | undefined)[]): number[] {
  const out: number[] = [];
  for (const l of lists) l?.forEach((s, i) => (out[i] = (out[i] ?? 0) + s));
  return out;
}

/** The zones with most time, as they read in a row: "Z2 41% · Z1 26% · Z4 19%". */
export function topZones(secs: number[], n = 3): string {
  const total = secs.reduce((a, b) => a + b, 0);
  if (!total) return "";
  return secs
    .map((s, i) => ({ s, i }))
    .filter((z) => z.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, n)
    .map((z) => `Z${z.i + 1} ${Math.round((z.s / total) * 100)}%`)
    .join(" · ");
}
