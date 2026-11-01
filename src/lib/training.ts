// Pure, browser-safe helpers for training metrics.

import { t } from "./i18n";
export type FormZone = "High risk" | "Optimal" | "Grey zone" | "Fresh" | "Transition";

/** Form (TSB) = Fitness (CTL) − Fatigue (ATL). */
export function computeForm(ctl: number, atl: number): number {
  return Math.round((ctl - atl) * 10) / 10;
}

/** Form zones as used by intervals.icu: Cirmolo passes form as % of fitness (see readiness formPercent). */
export function formZone(form: number): FormZone {
  if (form < -30) return "High risk";
  if (form < -10) return "Optimal";
  if (form <= 5) return "Grey zone";
  if (form <= 25) return "Fresh";
  return "Transition";
}

/** A form zone in the UI language. */
export const formZoneLabel = (form: number) =>
  ({
    "High risk": t("High risk", "Rischio alto"),
    Optimal: t("Optimal", "Ottimale"),
    "Grey zone": t("Grey zone", "Zona grigia"),
    Fresh: t("Fresh", "Fresco"),
    Transition: t("Transition", "Transizione"),
  })[formZone(form)];

export function formatDuration(secs?: number | null): string {
  if (!secs) return "–";
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return h ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}

/** Effort time as m:ss or h:mm:ss, for segment and climb times. */
export function formatClock(secs?: number | null): string {
  if (secs == null || !Number.isFinite(secs)) return "–";
  const s = Math.round(secs);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

export function formatKm(meters?: number | null): string {
  if (!meters) return "–";
  return `${(meters / 1000).toFixed(1)} km`;
}

/** Local calendar date (YYYY-MM-DD). Not UTC: just after midnight in Italy, UTC is still yesterday. */
export function isoDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Shift a YYYY-MM-DD date by whole days. */
export function addDays(date: string, days: number): string {
  const d = new Date(date + "T12:00:00");
  d.setDate(d.getDate() + days);
  return isoDate(d);
}

/** Days before a ride whose weigh-ins stand in when there is none on the day. */
const WEIGHT_DAYS = 3;

/**
 * Weight for per-kg numbers of a ride on `date`: the weigh-in of that day, else the mean of those in the 3 days
 * before it, else `fallback` (the weight in the intervals.icu profile).
 */
export function weightFor(
  rows: { id: string; weight: number | null }[],
  date: string,
  fallback: number | null = null,
): number | null {
  const day = date.slice(0, 10);
  const same = rows.find((r) => r.id === day && r.weight != null);
  if (same) return same.weight;
  const from = addDays(day, -WEIGHT_DAYS);
  const near = rows
    .filter((r) => r.id >= from && r.id < day && r.weight != null)
    .map((r) => r.weight!);
  if (near.length) return near.reduce((a, b) => a + b, 0) / near.length;
  return fallback;
}

// Typical intensity factor for each session RPE (CR-10); load = hours × IF² × 100, like TSS.
const RPE_IF = [0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.92, 1.0];

/** Estimated training load of a session without power data, from its duration and RPE (1–10). */
export function loadFromRpe(minutes: number, rpe: number): number {
  const f = RPE_IF[Math.min(10, Math.max(1, Math.round(rpe))) - 1]!;
  return Math.round((minutes / 60) * f * f * 100);
}
