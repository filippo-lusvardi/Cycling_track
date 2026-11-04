import { t } from "./i18n";
import { formatPace } from "./pace";
import { PACE_ZONE_PCT } from "./run-metrics";
import { checkInOn } from "./settings";
import { byMain } from "./sport";
// Daily readiness score. Pure and browser-safe.
// Owner's rule: resting heart rate is not used anywhere in Cirmolo.
import { addDays } from "./training";

export type ReadinessInput = {
  hrvToday: number | null;
  /** Mean of the previous 7 days: the fallback until there is a 60-day band. */
  hrvBaseline: number | null;
  /** Mean and SD of ln(HRV) over the 60 days before (≥ 14 readings): your normal band. */
  hrvLnMean?: number | null;
  hrvLnSd?: number | null;
  /** Mean of ln(HRV) over the last 7 days, today included (≥ 3 readings): the trend HRV-guided training follows. */
  hrvLn7?: number | null;
  sleepSecs: number | null;
  sleepQuality: number | null; // intervals.icu 1 = great … 4 = poor
  /** Median of the 30 nights before (≥ 10): your own need. */
  sleepUsual?: number | null;
  /** Seconds short of your usual over the 3 nights before last night. */
  sleepDebt?: number;
  ctl: number | null;
  atl: number | null;
  stress: number | null; // 1 = low … 4 = extreme
  fatigue: number | null;
  mood: number | null; // 1 = great … 4 = grumpy
  /** Median answers of the 30 days before (≥ 5 each), so answers count against your normal. */
  feelUsual?: { fatigue: number | null; stress: number | null; mood: number | null };
};

export type Component = {
  key: "hrv" | "sleep" | "form" | "feel";
  label: string;
  score: number;
  weight: number;
  detail: string;
};
export type Confidence = "high" | "medium" | "low";

const clamp = (v: number) => Math.max(0, Math.min(100, v));
/** 1..4 scale where 1 is best → 100, 70, 40, 10. */
export const scale4 = (v: number) => clamp(100 - (v - 1) * 30);

/** HRV against the previous 7 days' mean, in %: the fallback until 60 days of readings give a personal band. */
export function hrvScore(today: number, baseline: number): number {
  return clamp(50 + (today / baseline - 1) * 250);
}

/** Half an SD each side of the mean: the smallest worthwhile change, inside which a morning is just normal. */
const SWC = 0.5;
/** SD floor for ln(HRV): a very regular rider must not make every small wobble an alarm. */
const MIN_LN_SD = 0.03;

/**
 * Score of an ln(HRV) z-score: inside your normal band 70–85, above it up to 100, then 40 at −1 SD and 10 at −2 SD
 * (the band and slopes of HRV-guided training studies, e.g. Javaloyes 2019).
 */
export function hrvZScore(z: number): number {
  if (z >= SWC) return clamp(85 + (z - SWC) * 10);
  if (z >= -SWC) return 77.5 + 15 * z;
  if (z >= -1) return 70 + (z + SWC) * 60;
  return clamp(40 + (z + 1) * 30);
}

/** Sleep against your own need: 100 at or over it, 76 at 90%, 52 at 80%; the debt of the nights before costs up to 30. */
export function sleepScore(
  secs: number | null,
  quality: number | null,
  usual: number | null = null,
  debt = 0,
): number | null {
  const parts: number[] = [];
  if (secs != null && secs > 0)
    parts.push(clamp(100 - (1 - secs / (usual ?? DEFAULT_SLEEP)) * 240));
  if (quality != null) parts.push(scale4(quality));
  if (!parts.length) return null;
  return clamp(parts.reduce((a, b) => a + b, 0) / parts.length - Math.min(30, (debt / 3600) * 10));
}
/** Sleep need before there are ten nights to learn yours from. */
const DEFAULT_SLEEP = 7.5 * 3600;

/** Form as % of fitness, as intervals.icu shows it by default; plain points below fitness 10, where % swings wildly. */
export function formPercent(ctl: number, atl: number): number {
  return ctl >= 10 ? ((ctl - atl) / ctl) * 100 : ctl - atl;
}

/** Score of form in % of fitness: fresh is best, −10% 65, −30% 25 (intervals.icu's zones, scaled to your fitness). */
export function formScore(pct: number): number {
  if (pct > 25) return 80; // very fresh, losing fitness
  if (pct >= 5) return 95;
  return clamp(85 + pct * 2);
}

/** A check-in answer: half the plain 1–4 scale, half how far it is from your usual answer (one worse → −30). */
function feelScore(v: number, usual: number | null | undefined): number {
  const abs = scale4(v);
  return usual == null ? abs : (abs + clamp(85 - (v - usual) * 30)) / 2;
}

const pct = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(0)}%`;
const hours = (secs: number) => `${(secs / 3600).toFixed(1)} h`;

export function computeReadiness(i: ReadinessInput) {
  const comps: Component[] = [];
  let banded = false;
  if (i.hrvToday != null && i.hrvLnMean != null && i.hrvLnSd != null) {
    banded = true;
    const sd = Math.max(i.hrvLnSd, MIN_LN_SD);
    const z = (Math.log(i.hrvToday) - i.hrvLnMean) / sd;
    let score = hrvZScore(z);
    // A week under the band holds the score down even on a good morning.
    const z7 = i.hrvLn7 != null ? (i.hrvLn7 - i.hrvLnMean) / sd : null;
    const lowWeek = z7 != null && z7 < -SWC;
    if (lowWeek) score = Math.min(score, hrvZScore(z7));
    const [lo, hi] = [Math.exp(i.hrvLnMean - SWC * sd), Math.exp(i.hrvLnMean + SWC * sd)];
    comps.push({
      key: "hrv",
      label: "HRV",
      weight: 0.3,
      score,
      detail:
        `${Math.round(i.hrvToday)} ms · ${t("normal", "normale")} ${Math.round(lo)}–${Math.round(hi)}` +
        (lowWeek ? t(" · 7-day trend under it", " · media 7 giorni sotto") : ""),
    });
  } else if (i.hrvToday != null && i.hrvBaseline) {
    comps.push({
      key: "hrv",
      label: "HRV",
      weight: 0.3,
      score: hrvScore(i.hrvToday, i.hrvBaseline),
      detail: `${Math.round(i.hrvToday)} ms · ${pct((i.hrvToday / i.hrvBaseline - 1) * 100)} ${t("vs 7-day", "vs 7 giorni")}`,
    });
  }
  const sl = sleepScore(i.sleepSecs, i.sleepQuality, i.sleepUsual ?? null, i.sleepDebt ?? 0);
  if (sl != null) {
    const parts = [i.sleepSecs ? hours(i.sleepSecs) : t("quality only", "solo qualità")];
    if (i.sleepUsual) parts.push(`${t("usual", "solito")} ${hours(i.sleepUsual)}`);
    if ((i.sleepDebt ?? 0) >= 1800)
      parts.push(
        t(
          `${hours(i.sleepDebt!)} short over 3 nights`,
          `${hours(i.sleepDebt!)} in meno in 3 notti`,
        ),
      );
    comps.push({
      key: "sleep",
      label: t("Sleep", "Sonno"),
      weight: 0.25,
      score: sl,
      detail: parts.join(" · "),
    });
  }
  if (i.ctl != null && i.atl != null) {
    const tsb = i.ctl - i.atl;
    const p = formPercent(i.ctl, i.atl);
    comps.push({
      key: "form",
      label: t("Form", "Forma"),
      weight: 0.25,
      score: formScore(p),
      detail: `TSB ${tsb >= 0 ? "+" : ""}${tsb.toFixed(0)}${i.ctl >= 10 ? ` (${pct(p)})` : ""}`,
    });
  }
  // Only what the morning check-in asks: fatigue, stress, mood.
  const feel = (["fatigue", "stress", "mood"] as const)
    .filter((k) => i[k] != null)
    .map((k) => feelScore(i[k]!, i.feelUsual?.[k]));
  if (feel.length) {
    comps.push({
      key: "feel",
      label: t("How you feel", "Come ti senti"),
      weight: 0.2,
      score: feel.reduce((a, b) => a + b, 0) / feel.length,
      detail:
        t(`${feel.length} check-in answers`, `${feel.length} risposte al check-in`) +
        (i.feelUsual ? t(" · vs your usual", " · rispetto al solito") : ""),
    });
  }
  const w = comps.reduce((s, c) => s + c.weight, 0);
  const score = w ? Math.round(comps.reduce((s, c) => s + c.score * c.weight, 0) / w) : null;
  // High: HRV in its own band, sleep against its own need, and at least three inputs. Low: one input or none.
  const confidence: Confidence =
    comps.length >= 3 && banded && i.sleepUsual != null
      ? "high"
      : comps.length >= 2
        ? "medium"
        : "low";
  return { score, components: comps, advice: score == null ? null : advice(score), confidence };
}

export function advice(score: number): {
  title: string;
  text: string;
  tone: "pine" | "fitness" | "birch" | "lingon";
} {
  if (score >= 75)
    return {
      title: t("Ready for intensity", "Giornata da intensità"),
      text: byMain(
        t(
          "Good day for threshold, VO2max or a hard group ride.",
          "Buona giornata per lavori a FTP, VO2max o un'uscita di gruppo forte.",
        ),
        t(
          "Good day for threshold, intervals or a hard hill session.",
          "Buona giornata per lavori di soglia, ripetute o una seduta dura in salita.",
        ),
      ),
      tone: "pine",
    };
  if (score >= 55)
    return {
      title: t("Endurance day", "Giornata di fondo"),
      text: byMain(
        t(
          "Steady Z2 riding; keep the intensity under control.",
          "Pedalata regolare in Z2; tieni l'intensità sotto controllo.",
        ),
        t(
          "Steady Z2 running; keep the intensity under control.",
          "Corsa regolare in Z2; tieni l'intensità sotto controllo.",
        ),
      ),
      tone: "fitness",
    };
  if (score >= 40)
    return {
      title: t("Go easy", "Vai piano"),
      text: byMain(
        t(
          "Short recovery spin, under 60 minutes in Z1.",
          "Breve pedalata di recupero, meno di 60 minuti in Z1.",
        ),
        t(
          "Short recovery jog, under 40 minutes in Z1.",
          "Breve corsetta di recupero, meno di 40 minuti in Z1.",
        ),
      ),
      tone: "birch",
    };
  return {
    title: t("Rest", "Riposo"),
    text: t(
      "Take the day off or just walk. Recovery comes first.",
      "Giorno di riposo o solo una camminata. Prima il recupero.",
    ),
    tone: "lingon",
  };
}

type WellnessLike = {
  id: string;
  hrv: number | null;
  sleepSecs: number | null;
  sleepQuality: number | null;
  ctl: number | null;
  atl: number | null;
  stress: number | null;
  fatigue: number | null;
  mood: number | null;
};

/** The rows without the check-in's answers: a part with no input drops out and the others share its weight. */
export const withoutAnswers = <T extends WellnessLike>(rows: T[]): T[] =>
  rows.map((r) => ({ ...r, sleepQuality: null, fatigue: null, stress: null, mood: null }));

/** The rows readiness reads on this account: the answers count only while the check-in is on. */
export const readinessRows = <T extends WellnessLike>(rows: T[]): T[] =>
  checkInOn() ? rows : withoutAnswers(rows);

const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
const sdOf = (v: number[]) => {
  const m = mean(v);
  return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1));
};
const median = (v: number[]) => {
  const s = [...v].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

/** Days of HRV that make your normal band, and the readings it needs. */
export const HRV_BAND_DAYS = 60;
const HRV_BAND_MIN = 14;

/**
 * Readiness inputs for one day, each with your own baseline from the days before it (never the day itself):
 * a 60-day ln(HRV) band and 7-day trend, 30-day sleep need and the debt of the 3 nights before, 30-day usual answers.
 */
export function readinessInputFor(rows: WellnessLike[], date: string): ReadinessInput {
  const day = rows.find((r) => r.id === date);
  const before = (days: number) => rows.filter((r) => r.id >= addDays(date, -days) && r.id < date);
  const prev7 = before(7)
    .filter((r) => r.hrv != null)
    .map((r) => r.hrv!);
  const band = before(HRV_BAND_DAYS)
    .filter((r) => r.hrv != null && r.hrv > 0)
    .map((r) => Math.log(r.hrv!));
  const last7 = rows
    .filter((r) => r.id > addDays(date, -7) && r.id <= date && r.hrv != null && r.hrv > 0)
    .map((r) => Math.log(r.hrv!));
  const nights = before(30)
    .filter((r) => r.sleepSecs)
    .map((r) => r.sleepSecs!);
  const usual = nights.length >= 10 ? median(nights) : null;
  const debt = usual
    ? before(3).reduce((s, r) => s + (r.sleepSecs ? Math.max(0, usual - r.sleepSecs) : 0), 0)
    : 0;
  const answers = (k: "fatigue" | "stress" | "mood") => {
    const v = before(30)
      .filter((r) => r[k] != null)
      .map((r) => r[k]!);
    return v.length >= 5 ? median(v) : null;
  };
  const feelUsual = {
    fatigue: answers("fatigue"),
    stress: answers("stress"),
    mood: answers("mood"),
  };
  return {
    hrvToday: day?.hrv ?? null,
    hrvBaseline: prev7.length >= 3 ? mean(prev7) : null,
    hrvLnMean: band.length >= HRV_BAND_MIN ? mean(band) : null,
    hrvLnSd: band.length >= HRV_BAND_MIN ? sdOf(band) : null,
    hrvLn7: last7.length >= 3 ? mean(last7) : null,
    sleepSecs: day?.sleepSecs ?? null,
    sleepQuality: day?.sleepQuality ?? null,
    sleepUsual: usual,
    sleepDebt: debt,
    ctl: day?.ctl ?? null,
    atl: day?.atl ?? null,
    stress: day?.stress ?? null,
    fatigue: day?.fatigue ?? null,
    mood: day?.mood ?? null,
    ...(Object.values(feelUsual).some((v) => v != null) ? { feelUsual } : {}),
  };
}

/**
 * Load limits on fatigue (ATL) against fitness (CTL): how fast load is rising, whatever its intensity. Long easy
 * weeks count as much as hard ones, because ATL and CTL come from training load, which includes volume.
 * Coming back from injury, illness or a long break, the limits are stricter.
 */
const LOAD_LIMITS = {
  normal: { ratio: [1.3, 1.5], ramp: [6, 8] },
  returning: { ratio: [1.2, 1.4], ramp: [4, 6] },
} as const;
/** Readiness can't go above this at each load level: caution rules out intensity, too much means go easy. */
const LOAD_CAP = [100, 74, 54] as const;

export type LoadCheck = {
  /** 0 fine, 1 caution, 2 too much. */
  level: 0 | 1 | 2;
  /** Fatigue ÷ fitness (acute:chronic load ratio). */
  ratio: number | null;
  /** Fitness gained over the last 7 days. */
  ramp: number | null;
  returning: boolean;
  reasons: string[];
};

/** Is the load rising faster than the body adapts? From the wellness rows up to `date`. */
export function loadCheck(rows: WellnessLike[], date: string, returning = false): LoadCheck {
  const near = (d: string) =>
    [...rows]
      .filter((r) => r.id <= d && r.id > addDays(d, -3) && r.ctl != null)
      .sort((a, b) => b.id.localeCompare(a.id))[0];
  const now = near(date);
  const before = near(addDays(date, -7));
  const lim = LOAD_LIMITS[returning ? "returning" : "normal"];
  // Below fitness 10 the ratio swings wildly from a single ride, so it isn't used.
  const ratio = now?.ctl != null && now.atl != null && now.ctl >= 10 ? now.atl / now.ctl : null;
  const ramp = now?.ctl != null && before?.ctl != null ? now.ctl - before.ctl : null;
  const lvl = (v: number | null, [c, d]: readonly [number, number]) =>
    v == null ? 0 : v >= d ? 2 : v >= c ? 1 : 0;
  const [lr, lp] = [lvl(ratio, lim.ratio), lvl(ramp, lim.ramp)];
  const reasons: string[] = [];
  if (lr)
    reasons.push(
      t(
        `Fatigue (${Math.round(now!.atl!)}) is ${ratio!.toFixed(1)}× your fitness (${Math.round(now!.ctl!)}).`,
        `La fatica (${Math.round(now!.atl!)}) è ${ratio!.toFixed(1)}× il tuo fitness (${Math.round(now!.ctl!)}).`,
      ),
    );
  if (lp)
    reasons.push(
      t(
        `Fitness rose ${ramp!.toFixed(0)} points in a week. Up to ${lim.ramp[0] - 1} is safer.`,
        `Il fitness è salito di ${ramp!.toFixed(0)} punti in una settimana. Fino a ${lim.ramp[0] - 1} è più sicuro.`,
      ),
    );
  return { level: Math.max(lr, lp) as LoadCheck["level"], ratio, ramp, returning, reasons };
}

/** A readiness score held under the load cap. */
export const capForLoad = (score: number, load: LoadCheck) => Math.min(score, LOAD_CAP[load.level]);

/** Readiness for a day: the morning feel, held down when the load is rising too fast. */
export function readinessFor(rows: WellnessLike[], date: string, returning = false) {
  const r = computeReadiness(readinessInputFor(rows, date));
  const load = loadCheck(rows, date, returning);
  const score = r.score == null ? null : capForLoad(r.score, load);
  return { ...r, score, advice: score == null ? null : advice(score), load, uncapped: r.score };
}

/**
 * Concrete session suggestion from the readiness score, tempered by Form (TSB). `minutes` (the longest suggested) and
 * `intensity` (a typical intensity factor for those zones) size the fuelling.
 */
export function recommendation(
  score: number,
  tsb: number | null,
): { zones: string; duration: string; text: string; minutes: number; intensity: number } {
  const loaded = tsb != null && tsb < -25;
  if (score >= 75 && !loaded)
    return {
      zones: "Z4–Z5",
      duration: "60–120 min",
      minutes: 120,
      intensity: 0.8,
      text: t(
        "A good day for a hard session, after a long Z2 warm-up.",
        "Una buona giornata per una seduta intensa, dopo un lungo riscaldamento in Z2.",
      ),
    };
  if (score >= 75)
    return {
      zones: "Z3–Z4",
      duration: "60–90 min",
      minutes: 90,
      intensity: 0.8,
      text: t(
        "You feel good, but you carry a lot of load: tempo or sweet spot, no all-out efforts.",
        "Ti senti bene, ma hai molto carico: tempo o sweet spot, niente sforzi massimali.",
      ),
    };
  if (score >= 55)
    return {
      zones: "Z2",
      duration: "90–150 min",
      minutes: 150,
      intensity: 0.65,
      text: t(
        "Steady endurance. Keep climbs and surges below threshold.",
        "Fondo regolare. Salite e accelerazioni sotto soglia.",
      ),
    };
  if (score >= 40)
    return {
      zones: "Z1",
      duration: "≤ 60 min",
      minutes: 60,
      intensity: 0.55,
      text: byMain(
        t(
          "An easy spin at high cadence, or a day off the bike.",
          "Pedalata facile e agile, oppure un giorno senza bici.",
        ),
        t(
          "A short easy jog, a walk, or a day off.",
          "Una breve corsa lenta, una camminata o un giorno di riposo.",
        ),
      ),
    };
  return {
    zones: t("Rest", "Riposo"),
    duration: "—",
    minutes: 0,
    intensity: 0,
    text: t(
      byMain(
        "Day off. A walk and an early night help more than any ride.",
        "Day off. A walk and an early night help more than any run.",
      ),
      "Giorno di riposo. Una camminata e a letto presto aiutano più di qualsiasi allenamento.",
    ),
  };
}

/**
 * Today's upper limit on an easy or endurance day: the top of Z1 or Z2 in your intervals.icu zones (watts and
 * bpm). Null on intensity and rest days, or when neither zone set is known.
 */
export function ceiling(
  score: number,
  zones: { power: number[]; hr: number[] },
  /** Threshold speed (m/s), for a runner: a pace limit instead of watts. */
  threshold?: number | null,
  /** Pace zone tops set by hand, as % of threshold; the standard ones otherwise. */
  pacePct?: number[] | null,
): Ceiling | null {
  const zone = score >= 75 ? null : score >= 55 ? 1 : score >= 40 ? 0 : null;
  if (zone == null) return null;
  const watts = zones.power[zone] ?? null;
  const bpm = zones.hr[zone] ?? null;
  const pace = threshold ? (threshold * (pacePct ?? PACE_ZONE_PCT)[zone]!) / 100 : null;
  if (pace != null) return { watts: null, bpm, pace };
  return watts == null && bpm == null ? null : { watts, bpm };
}

export type Ceiling = { watts: number | null; bpm: number | null; pace?: number | null };

export const ceilingText = (c: Ceiling) =>
  c.pace != null
    ? // A pace limit reads the other way round: faster is a smaller number, so "under" would mislead.
      `${t("Stay slower than", "Non andare più forte di")} ${formatPace(c.pace)}/km${c.bpm != null ? ` · ${t("under", "sotto")} ${c.bpm} bpm` : ""}`
    : `${t("Stay under", "Resta sotto")} ${[c.watts != null && `${c.watts} W`, c.bpm != null && `${c.bpm} bpm`].filter(Boolean).join(" · ")}`;

/** Ranks (1-based, ties averaged), for a Spearman correlation. */
function ranks(v: number[]): number[] {
  const order = v.map((x, i) => [x, i] as const).sort((a, b) => a[0] - b[0]);
  const r = Array<number>(v.length);
  for (let i = 0; i < order.length;) {
    let j = i;
    while (j + 1 < order.length && order[j + 1]![0] === order[i]![0]) j++;
    for (let k = i; k <= j; k++) r[order[k]![1]] = (i + j) / 2 + 1;
    i = j + 1;
  }
  return r;
}

/** Spearman rank correlation of two equally long series; null under 3 points or with no spread. */
export function spearman(a: number[], b: number[]): number | null {
  if (a.length < 3 || a.length !== b.length) return null;
  const [ra, rb] = [ranks(a), ranks(b)];
  const [ma, mb] = [mean(ra), mean(rb)];
  let sab = 0;
  let saa = 0;
  let sbb = 0;
  for (let i = 0; i < ra.length; i++) {
    sab += (ra[i]! - ma) * (rb[i]! - mb);
    saa += (ra[i]! - ma) ** 2;
    sbb += (rb[i]! - mb) ** 2;
  }
  return saa && sbb ? sab / Math.sqrt(saa * sbb) : null;
}

/** Rated rides needed before the check says anything. */
export const ACCURACY_MIN_RIDES = 10;

/**
 * How well readiness has matched the rides that followed: each rated ride's feel (intervals.icu 1 strong … 5 weak)
 * against that morning's readiness, as a Spearman correlation (positive = higher readiness, better rides).
 * The morning uses the day before's fitness and fatigue, since intervals.icu's row for the day already has the ride.
 */
export function readinessAccuracy(
  rows: WellnessLike[],
  rides: { start_date_local: string; feel: number | null }[],
  from: string,
): { r: number | null; rides: number } {
  const pairs: [number, number][] = [];
  const byDay = new Map<string, number>();
  for (const a of rides) {
    const d = a.start_date_local.slice(0, 10);
    // One feel per day: the first rated ride.
    if (a.feel != null && d >= from && !byDay.has(d)) byDay.set(d, a.feel);
  }
  for (const [d, feel] of byDay) {
    const prev = rows.find((r) => r.id === addDays(d, -1));
    const morning = rows.map((r) =>
      r.id === d ? { ...r, ctl: prev?.ctl ?? r.ctl, atl: prev?.atl ?? r.atl } : r,
    );
    const score = readinessFor(morning, d).score;
    if (score != null) pairs.push([score, 6 - feel]);
  }
  if (pairs.length < ACCURACY_MIN_RIDES) return { r: null, rides: pairs.length };
  return {
    r: spearman(
      pairs.map((p) => p[0]),
      pairs.map((p) => p[1]),
    ),
    rides: pairs.length,
  };
}
