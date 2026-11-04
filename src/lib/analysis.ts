// Pure training-analysis helpers. Browser-safe.
import { t } from "./i18n";
import type { PowerCurve } from "./intervals";

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

export type WeekRow = {
  week: string;
  hours: number;
  km: number;
  elevation: number;
  load: number;
  monotony: number | null;
  strain: number | null;
};

type ActLike = {
  start_date_local: string;
  moving_time: number | null;
  distance: number | null;
  icu_training_load: number | null;
  total_elevation_gain?: number | null;
};

export function weeklyTotals(acts: ActLike[]): WeekRow[] {
  const map = new Map<
    string,
    { hours: number; km: number; elevation: number; load: number; daily: number[] }
  >();
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
      return {
        week,
        hours: r.hours,
        km: r.km,
        elevation: r.elevation,
        load: r.load,
        monotony: mono,
        strain: mono != null ? r.load * mono : null,
      };
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

export function distributionLabel(
  f: { low: number; mid: number; high: number },
  /** The Italian word for threshold is "FTP" on the bike, "soglia" on foot. */
  thresholdWord = t("Threshold", "FTP"),
): string {
  const pi = polarizationIndex(f);
  if (pi != null && pi > 2 && f.high > f.mid) return t("Polarized", "Polarizzata");
  if (f.low > f.mid && f.mid > f.high) return t("Pyramidal", "Piramidale");
  if (f.mid >= f.high && f.mid > 0.2) return thresholdWord;
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
export function fitCriticalPower(
  points: { secs: number; watts: number }[],
): { cp: number; wPrime: number; r2: number } | null {
  const pts = points.filter((p) => p.secs >= 180 && p.secs <= 1200 && p.watts > 0);
  if (pts.length < 3) return null;
  const xs = pts.map((p) => p.secs);
  const ys = pts.map((p) => p.watts * p.secs);
  const n = pts.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0,
    sxx = 0,
    syy = 0;
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

/** Nelder–Mead minimum of `f` from `x0`, with a first simplex `step` along each axis. Small and dependency-free. */
export function nelderMead(
  f: (x: number[]) => number,
  x0: number[],
  step: number[],
  iters = 2000,
): number[] {
  const n = x0.length;
  let pts = [x0, ...x0.map((_, i) => x0.map((v, j) => (i === j ? v + step[i]! : v)))].map((x) => ({
    x,
    y: f(x),
  }));
  const at = (c: number[], d: number[], k: number) => c.map((v, i) => v + k * (d[i]! - v));
  for (let it = 0; it < iters; it++) {
    pts.sort((a, b) => a.y - b.y);
    const best = pts[0]!;
    const worst = pts[n]!;
    if (Math.abs(worst.y - best.y) <= 1e-12 * (Math.abs(best.y) + 1e-12)) break;
    const c = x0.map((_, i) => pts.slice(0, n).reduce((s, p) => s + p.x[i]!, 0) / n);
    const r = at(c, worst.x, -1);
    const fr = f(r);
    if (fr < best.y) {
      const e = at(c, worst.x, -2);
      const fe = f(e);
      pts[n] = fe < fr ? { x: e, y: fe } : { x: r, y: fr };
    } else if (fr < pts[n - 1]!.y) pts[n] = { x: r, y: fr };
    else {
      const k = at(c, worst.x, 0.5);
      const fk = f(k);
      if (fk < worst.y) pts[n] = { x: k, y: fk };
      else
        pts = pts.map((p, i) =>
          i === 0 ? p : { x: at(best.x, p.x, 0.5), y: f(at(best.x, p.x, 0.5)) },
        );
    }
  }
  return pts.sort((a, b) => a.y - b.y)[0]!.x;
}

export type OmPD = { cp: number; wPrime: number; pmax: number; a: number; r2: number };

/** Past this duration (s) the OmPD curve falls log-linearly below CP. */
const OMPD_TCP = 1800;

/** Watts the omni-domain power-duration model (Puchowicz, Baker & Clarke 2020) gives for `t` seconds. */
export function omPD(m: Pick<OmPD, "cp" | "wPrime" | "pmax" | "a">, t: number): number {
  const p = (m.wPrime / t) * (1 - Math.exp((-t * (m.pmax - m.cp)) / m.wPrime)) + m.cp;
  return t > OMPD_TCP ? p - m.a * Math.log(t / OMPD_TCP) : p;
}

/**
 * CP, W′ (J), sprint power and long-duration decay from mean-maximal points over the whole curve (a few seconds to
 * hours). Residuals are relative, so a 5 s sprint counts as much as a 1 h effort. Null without enough of the curve.
 */
export function fitOmPD(points: { secs: number; watts: number }[]): OmPD | null {
  const pts = points.filter((p) => p.watts > 0 && p.secs >= 1);
  if (pts.length < 6 || !pts.some((p) => p.secs <= 10) || !pts.some((p) => p.secs >= 600))
    return null;
  const lin = fitCriticalPower(pts);
  const pmax0 = Math.max(...pts.map((p) => p.watts));
  const x0 = [
    lin?.cp ?? 0.8 * (pts.find((p) => p.secs >= 1200)?.watts ?? pmax0 / 4),
    lin?.wPrime ?? 20000,
    pmax0,
    5,
  ];
  const cost = ([cp, wPrime, pmax, a]: number[]) => {
    if (!(cp! > 0 && wPrime! > 1000 && pmax! > cp! && a! >= 0)) return Infinity;
    let s = 0;
    for (const p of pts)
      s +=
        ((omPD({ cp: cp!, wPrime: wPrime!, pmax: pmax!, a: a! }, p.secs) - p.watts) / p.watts) ** 2;
    return s;
  };
  const [cp, wPrime, pmax, a] = nelderMead(cost, x0, [x0[0]! * 0.1, x0[1]! * 0.2, x0[2]! * 0.1, 5]);
  if (!Number.isFinite(cost([cp!, wPrime!, pmax!, a!]))) return null;
  const m = { cp: cp!, wPrime: wPrime!, pmax: pmax!, a: a! };
  const mean = pts.reduce((s, p) => s + p.watts, 0) / pts.length;
  const ssTot = pts.reduce((s, p) => s + (p.watts - mean) ** 2, 0);
  const ssRes = pts.reduce((s, p) => s + (omPD(m, p.secs) - p.watts) ** 2, 0);
  return { ...m, r2: ssTot ? 1 - ssRes / ssTot : 1 };
}

/** Durations (s) read off a power curve for fitting and charting. */
export const DUR = [
  1, 2, 3, 5, 8, 10, 15, 20, 30, 45, 60, 90, 120, 180, 240, 300, 420, 600, 900, 1200, 1800, 2400,
  3600, 5400, 7200, 10800,
];

/** Watts at duration d on an intervals.icu curve (exact or next longer duration). */
export function valueAt(c: PowerCurve | undefined, d: number): number | null {
  if (!c) return null;
  const i = c.secs.findIndex((s) => s >= d);
  return i >= 0 && c.watts[i] ? c.watts[i]! : null;
}

export type CurveFit =
  | (OmPD & { omni: true })
  | { cp: number; wPrime: number; pmax: null; a: 0; r2: number; omni: false };

/** CP and W′ from a power curve: the omni-domain model on the whole curve, else the 3–20 min linear fit. */
export function curveFit(c: PowerCurve | undefined): CurveFit | null {
  const pts = DUR.map((d) => ({ secs: d, watts: valueAt(c, d) ?? 0 }));
  const om = fitOmPD(pts);
  if (om) return { ...om, omni: true };
  const lin = fitCriticalPower(pts);
  return lin ? { ...lin, pmax: null, a: 0, omni: false } : null;
}

/**
 * W′ balance (J) every second of a 1 Hz ride, Skiba's 2012 model: work above CP is spent, and each spent joule comes
 * back exponentially with τ = 546·e^(−0.01·D_CP) + 316 s, D_CP being how far under CP the ride's easier seconds were.
 * Done recursively, so it is linear in the ride's length. Validated on amateurs; elite riders recover faster.
 */
export function wbal(watts: (number | null)[], cp: number, wPrime: number): number[] {
  let under = 0;
  let n = 0;
  for (const w of watts) {
    if (w != null && w < cp) {
      under += w;
      n++;
    }
  }
  const dcp = n ? cp - under / n : 0;
  const decay = Math.exp(-1 / (546 * Math.exp(-0.01 * dcp) + 316));
  const out: number[] = [];
  let spent = 0;
  for (const w of watts) {
    spent = spent * decay + Math.max(0, (w ?? 0) - cp);
    out.push(wPrime - spent);
  }
  return out;
}

/**
 * Aerobic decoupling (Pw:HR, %): how much power per heartbeat drops from the first to the second
 * half of a ride. Under 5% on a steady endurance ride means a solid aerobic base. Needs ≥ 20 min.
 */
export function decoupling(watts: (number | null)[], hr: (number | null)[]): number | null {
  const n = Math.min(watts.length, hr.length);
  if (n < 1200) return null;
  const ef = (from: number, to: number) => {
    let p = 0,
      h = 0,
      c = 0;
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
