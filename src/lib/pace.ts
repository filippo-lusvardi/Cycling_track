// Running pace: speeds are kept in m/s everywhere and shown as min/km. Pure.

/** "4:32" for a speed in m/s; "–" when there's none. */
export function formatPace(speed: number | null | undefined): string {
  if (!speed || speed <= 0) return "–";
  const secs = Math.round(1000 / speed);
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
}

/** "4:32/km". */
export const paceLabel = (speed: number | null | undefined) =>
  speed && speed > 0 ? `${formatPace(speed)}/km` : "–";

/** "4:32", "4.32", "4:05/km" → m/s; null when it isn't a plausible pace (2 to 20 min/km). */
export function parsePace(text: string): number | null {
  const m = /^(\d{1,2})[:.,](\d{1,2})(?:\s*\/?\s*km)?$/.exec(text.trim().toLowerCase());
  if (!m || Number(m[2]) > 59) return null;
  const secs = Number(m[1]) * 60 + Number(m[2]);
  return secs >= 120 && secs <= 1200 ? 1000 / secs : null;
}

/** "23:41", "1:42:05": a time in seconds. */
export function formatClock(secs: number | null | undefined): string {
  if (secs == null || secs < 0) return "–";
  const s = Math.round(secs);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/** Steps a minute: FIT files and intervals.icu count a running cadence per leg, so usual values under 120 are doubled. */
export const stepsPerMinute = (cadence: number | null | undefined) =>
  !cadence || cadence <= 0 ? null : cadence < 120 ? Math.round(cadence * 2) : Math.round(cadence);
