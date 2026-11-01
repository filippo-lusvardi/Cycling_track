// Pure training-analysis helpers. Browser-safe.
import { t } from "./i18n";

export function mondayOf(dateStr: string): string {
  const d = new Date(dateStr.slice(0, 10) + "T00:00:00Z");
  const dow = (d.getUTCDay() + 6) % 7; // 0 = Monday
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

/** Foster monotony: mean daily load / SD of daily load across a 7-day week (rest days count as 0). */
export function monotony(dailyLoads: number[]): number | null {
  const days = [...dailyLoads, ...Array(Math.max(0, 7 - dailyLoads.length)).fill(0)].slice(0, 7);
  const m = days.reduce((s, v) => s + v, 0) / 7;
  const sd = Math.sqrt(days.reduce((s, v) => s + (v - m) ** 2, 0) / 7);
  if (sd === 0) return null;
  return m / sd;
}

export type WeekRow = { week: string; hours: number; km: number; elevation: number; load: number; monotony: number | null; strain: number | null };

type ActLike = {
  start_date_local: string; moving_time: number | null; distance: number | null; icu_training_load: number | null;
  total_elevation_gain?: number | null;
};

export function weeklyTotals(acts: ActLike[]): WeekRow[] {
  const map = new Map<string, { hours: number; km: number; elevation: number; load: number; daily: number[] }>();
  for (const a of acts) {
    if (!a.start_date_local) continue;
    const wk = mondayOf(a.start_date_local);
    const row = map.get(wk) ?? { hours: 0, km: 0, elevation: 0, load: 0, daily: Array(7).fill(0) };
    const dow = (new Date(a.start_date_local.slice(0, 10) + "T00:00:00Z").getUTCDay() + 6) % 7;
    row.hours += (a.moving_time ?? 0) / 3600;
    row.km += (a.distance ?? 0) / 1000;
    row.elevation += a.total_elevation_gain ?? 0;
    row.load += a.icu_training_load ?? 0;
    row.daily[dow] += a.icu_training_load ?? 0;
    map.set(wk, row);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, r]) => {
      const mono = monotony(r.daily);
      return { week, hours: r.hours, km: r.km, elevation: r.elevation, load: r.load, monotony: mono, strain: mono != null ? r.load * mono : null };
    });
}

/** Seiler 3-zone split from 7 power zones: Z1–Z2 low, Z3 moderate, Z4+ high. Returns fractions. */
export function threeZone(z: number[]): { low: number; mid: number; high: number } | null {
  const low = (z[0] ?? 0) + (z[1] ?? 0);
  const mid = z[2] ?? 0;
  const high = z.slice(3).reduce((s, v) => s + (v ?? 0), 0);
  const t = low + mid + high;
  if (!t) return null;
  return { low: low / t, mid: mid / t, high: high / t };
}

/** Treff polarization index: log10(f1 / f2 × f3 × 100). > 2 means polarized. */
export function polarizationIndex(f: { low: number; mid: number; high: number }): number | null {
  if (f.mid === 0 || f.high === 0) return null;
  return Math.log10((f.low / f.mid) * f.high * 100);
}

export function distributionLabel(f: { low: number; mid: number; high: number }): string {
  const pi = polarizationIndex(f);
  if (pi != null && pi > 2 && f.high > f.mid) return t("Polarized", "Polarizzata");
  if (f.low > f.mid && f.mid > f.high) return t("Pyramidal", "Piramidale");
  if (f.mid >= f.high && f.mid > 0.2) return t("Threshold", "FTP");
  if (f.high > 0.2) return t("High intensity", "Alta intensità");
  return t("Base / low intensity", "Base / bassa intensità");
}

export const ZONE_NAMES = [
  t("Recovery", "Recupero"),
  t("Endurance", "Fondo"),
  "Tempo",
  t("Threshold", "FTP"),
  "VO2max",
  t("Anaerobic", "Anaerobico"),
  t("Neuromuscular", "Neuromuscolare"),
];

/** Mean-maximal power for each duration (s) from a 1 Hz watts stream; null where the ride is too short. */
export function mmp(watts: (number | null)[], durations: number[]): (number | null)[] {
  const pre = [0];
  for (const w of watts) pre.push(pre.at(-1)! + (w != null && w > 0 ? w : 0));
  return durations.map((d) => {
    if (d < 1 || d > watts.length) return null;
    let best = 0;
    for (let i = d; i < pre.length; i++) best = Math.max(best, pre[i]! - pre[i - d]!);
    return best / d;
  });
}

/**
 * Critical Power and W′ from mean-maximal efforts between 3 and 20 minutes, via the linear
 * work–time model: work = CP · t + W′. Returns W′ in joules.
 */
export function fitCriticalPower(points: { secs: number; watts: number }[]): { cp: number; wPrime: number; r2: number } | null {
  const pts = points.filter((p) => p.secs >= 180 && p.secs <= 1200 && p.watts > 0);
  if (pts.length < 3) return null;
  const xs = pts.map((p) => p.secs);
  const ys = pts.map((p) => p.watts * p.secs);
  const n = pts.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i]! - mx) * (ys[i]! - my);
    sxx += (xs[i]! - mx) ** 2;
    syy += (ys[i]! - my) ** 2;
  }
  if (sxx === 0) return null;
  const cp = sxy / sxx;
  const wPrime = my - cp * mx;
  if (cp <= 0 || wPrime <= 0) return null;
  return { cp, wPrime, r2: syy ? (sxy * sxy) / (sxx * syy) : 1 };
}

/**
 * Aerobic decoupling (Pw:HR, %): how much power per heartbeat drops from the first to the second
 * half of a ride. Under 5% on a steady endurance ride means a solid aerobic base. Needs ≥ 20 min.
 */
export function decoupling(watts: (number | null)[], hr: (number | null)[]): number | null {
  const n = Math.min(watts.length, hr.length);
  if (n < 1200) return null;
  const ef = (from: number, to: number) => {
    let p = 0, h = 0, c = 0;
    for (let i = from; i < to; i++) {
      const b = hr[i];
      if (b == null || b <= 0) continue;
      p += watts[i] ?? 0;
      h += b;
      c++;
    }
    return c && h ? p / h : null;
  };
  const half = Math.floor(n / 2);
  const first = ef(0, half);
  const second = ef(half, n);
  if (!first || second == null) return null;
  return ((first - second) / first) * 100;
}
