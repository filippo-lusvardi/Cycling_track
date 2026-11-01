import { t } from "./i18n";
// Daily readiness score. Pure and browser-safe.
// Owner's rule: resting heart rate is not used anywhere in Cirmolo.
import { addDays } from "./training";

export type ReadinessInput = {
  hrvToday: number | null;
  hrvBaseline: number | null; // mean of previous 7 days
  sleepSecs: number | null;
  sleepQuality: number | null; // intervals.icu 1 = great … 4 = poor
  ctl: number | null;
  atl: number | null;
  stress: number | null; // 1 = low … 4 = extreme
  fatigue: number | null;
  mood: number | null; // 1 = great … 4 = grumpy
};

export type Component = { key: "hrv" | "sleep" | "form" | "feel"; label: string; score: number; weight: number; detail: string };

const clamp = (v: number) => Math.max(0, Math.min(100, v));
/** 1..4 scale where 1 is best → 100, 70, 40, 10. */
export const scale4 = (v: number) => clamp(100 - (v - 1) * 30);

export function hrvScore(today: number, baseline: number): number {
  return clamp(50 + (today / baseline - 1) * 250);
}

export function sleepScore(secs: number | null, quality: number | null): number | null {
  const parts: number[] = [];
  if (secs != null && secs > 0) parts.push(clamp(((secs / 3600 - 5) / 3) * 100));
  if (quality != null) parts.push(scale4(quality));
  return parts.length ? parts.reduce((a, b) => a + b, 0) / parts.length : null;
}

export function formScore(tsb: number): number {
  if (tsb > 25) return 80; // very fresh, losing fitness
  if (tsb >= 5) return 95;
  return clamp(85 + tsb * 2); // -10 → 65, -30 → 25
}

export function computeReadiness(i: ReadinessInput) {
  const comps: Component[] = [];
  if (i.hrvToday != null && i.hrvBaseline) {
    const pct = (i.hrvToday / i.hrvBaseline - 1) * 100;
    comps.push({ key: "hrv", label: "HRV", weight: 0.3, score: hrvScore(i.hrvToday, i.hrvBaseline), detail: `${Math.round(i.hrvToday)} ms · ${pct >= 0 ? "+" : ""}${pct.toFixed(0)}% ${t("vs 7-day", "vs 7 giorni")}` });
  }
  const sl = sleepScore(i.sleepSecs, i.sleepQuality);
  if (sl != null) {
    const h = i.sleepSecs ? `${(i.sleepSecs / 3600).toFixed(1)} h` : t("quality only", "solo qualità");
    comps.push({ key: "sleep", label: t("Sleep", "Sonno"), weight: 0.25, score: sl, detail: h });
  }
  if (i.ctl != null && i.atl != null) {
    const tsb = i.ctl - i.atl;
    comps.push({ key: "form", label: t("Form", "Forma"), weight: 0.25, score: formScore(tsb), detail: `TSB ${tsb >= 0 ? "+" : ""}${tsb.toFixed(0)}` });
  }
  // Only what the morning check-in asks: fatigue, stress, mood.
  const feel = [i.fatigue, i.stress, i.mood].filter((v): v is number => v != null);
  if (feel.length) {
    comps.push({ key: "feel", label: t("How you feel", "Come ti senti"), weight: 0.2, score: feel.map(scale4).reduce((a, b) => a + b, 0) / feel.length, detail: t(`${feel.length} check-in answers`, `${feel.length} risposte al check-in`) });
  }
  const w = comps.reduce((s, c) => s + c.weight, 0);
  const score = w ? Math.round(comps.reduce((s, c) => s + c.score * c.weight, 0) / w) : null;
  return { score, components: comps, advice: score == null ? null : advice(score) };
}

export function advice(score: number): { title: string; text: string; tone: "pine" | "fitness" | "birch" | "lingon" } {
  if (score >= 75)
    return {
      title: t("Ready for intensity", "Pronto per l'intensità"),
      text: t("Good day for threshold, VO2max or a hard group ride.", "Buona giornata per lavori a FTP, VO2max o un'attività di gruppo intensa."),
      tone: "pine",
    };
  if (score >= 55)
    return {
      title: t("Endurance day", "Giornata di fondo"),
      text: t("Steady Zone 2 riding; keep intensity controlled.", "Pedalata regolare in Zona 2; tieni l'intensità sotto controllo."),
      tone: "fitness",
    };
  if (score >= 40)
    return {
      title: t("Go easy", "Vai piano"),
      text: t("Short recovery spin, under 60 minutes in Zone 1.", "Breve attività di scarico, meno di 60 minuti in Zona 1."),
      tone: "birch",
    };
  return {
    title: t("Rest", "Riposo"),
    text: t("Take the day off or just walk. Recovery comes first.", "Prenditi un giorno libero o fai solo una camminata. Il recupero viene prima."),
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

/** Readiness inputs for one day; the HRV baseline is the mean of the 7 days before it (needs ≥ 3 readings). */
export function readinessInputFor(rows: WellnessLike[], date: string): ReadinessInput {
  const day = rows.find((r) => r.id === date);
  const from = addDays(date, -7);
  const prev = rows.filter((r) => r.id >= from && r.id < date && r.hrv != null).map((r) => r.hrv!);
  return {
    hrvToday: day?.hrv ?? null,
    hrvBaseline: prev.length >= 3 ? prev.reduce((a, b) => a + b, 0) / prev.length : null,
    sleepSecs: day?.sleepSecs ?? null,
    sleepQuality: day?.sleepQuality ?? null,
    ctl: day?.ctl ?? null,
    atl: day?.atl ?? null,
    stress: day?.stress ?? null,
    fatigue: day?.fatigue ?? null,
    mood: day?.mood ?? null,
  };
}

export const readinessFor = (rows: WellnessLike[], date: string) => computeReadiness(readinessInputFor(rows, date));

/** Concrete session suggestion from the readiness score, tempered by Form (TSB). */
export function recommendation(score: number, tsb: number | null): { zones: string; duration: string; text: string } {
  const loaded = tsb != null && tsb < -25;
  if (score >= 75 && !loaded)
    return { zones: "Z4–Z5", duration: "60–120 min", text: t("Threshold (e.g. 3×12 min Z4) or VO2max (5×4 min Z5) with a long Z2 warm-up.", "FTP (es. 3×12 min Z4) o VO2max (5×4 min Z5) con un lungo riscaldamento in Z2.") };
  if (score >= 75)
    return { zones: "Z3–Z4", duration: "60–90 min", text: t("You feel good but carry a lot of load: short tempo or sweet-spot blocks, not max efforts.", "Ti senti bene ma hai molto carico: brevi blocchi tempo o sweet-spot, niente sforzi massimali.") };
  if (score >= 55)
    return { zones: "Z2", duration: "90–150 min", text: t("Steady endurance; keep surges short and below threshold.", "Fondo regolare; accelerazioni brevi e sotto FTP.") };
  if (score >= 40) return { zones: "Z1", duration: "≤ 60 min", text: t("Easy spin at high cadence, or skip the bike.", "Pedalata facile ad alta cadenza, oppure niente bici.") };
  return { zones: t("Rest", "Riposo"), duration: "—", text: t("Day off. A walk and an early night help more than any ride.", "Giorno libero. Una camminata e andare a letto presto aiutano più di qualsiasi attività.") };
}

/**
 * Today's upper limit on an easy or endurance day: the top of Z1 or Z2 in your intervals.icu zones (watts and
 * bpm). Null on intensity and rest days, or when neither zone set is known.
 */
export function ceiling(score: number, zones: { power: number[]; hr: number[] }): { watts: number | null; bpm: number | null } | null {
  const zone = score >= 75 ? null : score >= 55 ? 1 : score >= 40 ? 0 : null;
  if (zone == null) return null;
  const watts = zones.power[zone] ?? null;
  const bpm = zones.hr[zone] ?? null;
  return watts == null && bpm == null ? null : { watts, bpm };
}

export const ceilingText = (c: { watts: number | null; bpm: number | null }) =>
  `${t("Stay under", "Resta sotto")} ${[c.watts != null && `${c.watts} W`, c.bpm != null && `${c.bpm} bpm`].filter(Boolean).join(" · ")}`;
