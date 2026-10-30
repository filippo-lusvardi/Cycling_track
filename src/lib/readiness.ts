// Daily readiness score. Pure and browser-safe.
// Owner's rule: resting heart rate is not used anywhere in Cadence.
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
    comps.push({ key: "hrv", label: "HRV", weight: 0.3, score: hrvScore(i.hrvToday, i.hrvBaseline), detail: `${Math.round(i.hrvToday)} ms · ${pct >= 0 ? "+" : ""}${pct.toFixed(0)}% vs 7-day` });
  }
  const sl = sleepScore(i.sleepSecs, i.sleepQuality);
  if (sl != null) {
    const h = i.sleepSecs ? `${(i.sleepSecs / 3600).toFixed(1)} h` : "quality only";
    comps.push({ key: "sleep", label: "Sleep", weight: 0.25, score: sl, detail: h });
  }
  if (i.ctl != null && i.atl != null) {
    const tsb = i.ctl - i.atl;
    comps.push({ key: "form", label: "Form", weight: 0.25, score: formScore(tsb), detail: `TSB ${tsb >= 0 ? "+" : ""}${tsb.toFixed(0)}` });
  }
  // Only what the morning check-in asks: fatigue, stress, mood.
  const feel = [i.fatigue, i.stress, i.mood].filter((v): v is number => v != null);
  if (feel.length) {
    comps.push({ key: "feel", label: "How you feel", weight: 0.2, score: feel.map(scale4).reduce((a, b) => a + b, 0) / feel.length, detail: `${feel.length} check-in answers` });
  }
  const w = comps.reduce((s, c) => s + c.weight, 0);
  const score = w ? Math.round(comps.reduce((s, c) => s + c.score * c.weight, 0) / w) : null;
  return { score, components: comps, advice: score == null ? null : advice(score) };
}

export function advice(score: number): { title: string; text: string; tone: "pine" | "fitness" | "birch" | "lingon" } {
  if (score >= 75) return { title: "Ready for intensity", text: "Good day for threshold, VO2max or a hard group ride.", tone: "pine" };
  if (score >= 55) return { title: "Endurance day", text: "Steady Zone 2 riding; keep intensity controlled.", tone: "fitness" };
  if (score >= 40) return { title: "Go easy", text: "Short recovery spin, under 60 minutes in Zone 1.", tone: "birch" };
  return { title: "Rest", text: "Take the day off or just walk. Recovery comes first.", tone: "lingon" };
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
    return { zones: "Z4–Z5", duration: "60–120 min", text: "Threshold (e.g. 3×12 min Z4) or VO2max (5×4 min Z5) with a long Z2 warm-up." };
  if (score >= 75)
    return { zones: "Z3–Z4", duration: "60–90 min", text: "You feel good but carry a lot of load: short tempo or sweet-spot blocks, not max efforts." };
  if (score >= 55)
    return { zones: "Z2", duration: "90–150 min", text: "Steady endurance; keep surges short and below threshold." };
  if (score >= 40) return { zones: "Z1", duration: "≤ 60 min", text: "Easy spin at high cadence, or skip the bike." };
  return { zones: "Rest", duration: "—", text: "Day off. A walk and an early night help more than any ride." };
}
