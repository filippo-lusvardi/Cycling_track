// What has happened to the tree since this device last saw it: a new ride, whose sap climbs and grows its branch, and
// birds, which fly in or away when a ride's brioches change. Brioches are entered by hand after the ride, wherever
// that happens, so they're noticed by comparing counts, not by listening for the entry. Pure.
import type { TreeDay } from "./tree";

/** Ride id → how many birds this device has seen on it. Only rides still drawn as their own branch are kept. */
export type Seen = Record<string, number>;

export type BirdChange = { id: string; from: number; to: number };

export type Arrivals = {
  /** The newest ride not seen yet: its sap climbs. Other new rides are simply there. */
  sap: string | null;
  birds: BirdChange[];
  next: Seen;
};

/** `seen` is null the first time: the whole tree is simply there, so nobody gets a flock of old birds. */
export function planArrivals(days: TreeDay[], seen: Seen | null, recentDays: number): Arrivals {
  const recent = days.slice(0, recentDays).flatMap((d) => [...d.branches].reverse());
  const next: Seen = {};
  for (const b of recent) next[b.id] = b.brioches;
  if (!seen) return { sap: null, birds: [], next };
  const sap = recent.find((b) => seen[b.id] === undefined)?.id ?? null;
  const birds: BirdChange[] = [];
  for (const b of recent) {
    const before = seen[b.id];
    const from = b.id === sap ? 0 : before;
    if (from !== undefined && from !== b.brioches) birds.push({ id: b.id, from, to: b.brioches });
  }
  return { sap, birds, next };
}

/** Days without any training, sport or garden, that make a long gap. */
export const LONG_GAP_DAYS = 14;

/**
 * The last empty day before each return from a long gap, where a green shoot bursts from the old wood. Nothing for the
 * very first ride, which returns from nothing.
 */
export function returnShoots(days: TreeDay[]): Set<string> {
  const out = new Set<string>();
  let trained: number | null = null;
  days.forEach((d, i) => {
    if (!d.branches.length && !d.sprouts.length) return;
    if (trained !== null && i - trained - 1 >= LONG_GAP_DAYS && days[trained]!.branches.length)
      out.add(days[trained + 1]!.date);
    trained = i;
  });
  return out;
}

/** How many points of the ride the sap carries. */
const POINTS = 90;

type Streams = { watts: (number | null)[]; heartrate: (number | null)[] };

const percentile = (sorted: number[], p: number) =>
  sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;

/**
 * The ride as effort from 0 to 1, from its power (against FTP, so a steady easy ride stays calm) or, without power,
 * its heart rate (against its own highest). Null when the ride has neither.
 */
export function effortProfile(s: Streams, ftp: number | null): number[] | null {
  const present = (x: (number | null)[]) => x.filter((v): v is number => v != null && v > 0);
  const hasPower = present(s.watts).length > s.watts.length * 0.2 && s.watts.length > 0;
  const raw = hasPower ? s.watts : s.heartrate;
  const values = present(raw).sort((a, b) => a - b);
  if (values.length < POINTS) return null;
  const top = percentile(values, 0.98);
  if (top <= 0) return null;
  const scale = hasPower
    ? (v: number) => v / (ftp ? ftp * 1.2 : top)
    : (v: number) => (v - top * 0.5) / (top * 0.5);
  return Array.from({ length: POINTS }, (_, i) => {
    const from = Math.floor((i * raw.length) / POINTS);
    const to = Math.max(from + 1, Math.floor(((i + 1) * raw.length) / POINTS));
    const sum = raw.slice(from, to).reduce<number>((a, v) => a + (v ?? 0), 0);
    return Math.min(1, Math.max(0, scale(sum / (to - from))));
  });
}

/** FTP as this ride knew it, from its weighted power and intensity. */
export function rideFtp(a: {
  icu_weighted_avg_watts: number | null;
  icu_intensity: number | null;
}) {
  if (!a.icu_weighted_avg_watts || !a.icu_intensity) return null;
  const f = a.icu_intensity > 3 ? a.icu_intensity / 100 : a.icu_intensity;
  return a.icu_weighted_avg_watts / f;
}
