// Building what a member publishes into a forest, and turning it back into a tree on a friend's device. Pure.
import type { Activity, PlannedEvent, Wellness } from "../intervals";
import type { Crown } from "../tree";
import type { SharedCrown, SharedRide, TreeHeader, TreeYearDoc } from "./types";

export const toSharedRide = (a: Activity): SharedRide => ({
  id: a.id,
  name: a.name,
  type: a.type,
  start_date_local: a.start_date_local,
  moving_time: a.moving_time,
  distance: a.distance,
  total_elevation_gain: a.total_elevation_gain,
  icu_training_load: a.icu_training_load,
  icu_intensity: a.icu_intensity,
  trainer: a.trainer,
  brioches: a.brioches,
});

export const toSharedCrown = (c: Crown): SharedCrown => ({
  score: c.score,
  estimated: c.estimated,
  season: c.season,
  seasonPhase: c.seasonPhase,
  seasonLabel: c.seasonLabel,
  leaves: c.leaves,
  ctl: c.ctl,
  atl: c.atl,
  form: c.form,
  formPct: c.formPct,
  weather: c.weather,
  weatherPhase: c.weatherPhase,
});

const dayIndex = (date: string) => {
  const y = Number(date.slice(0, 4));
  return Math.round(
    (Date.UTC(y, Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10))) - Date.UTC(y, 0, 1)) /
      86_400_000,
  );
};
const dateOf = (year: string, i: number) =>
  new Date(Date.UTC(Number(year), 0, 1 + i)).toISOString().slice(0, 10);

/** One doc per year: the shared rides, and fitness/fatigue for each day of it. */
export function yearDocs(rides: SharedRide[], wellness: Wellness[]): Record<string, TreeYearDoc> {
  const out: Record<string, TreeYearDoc> = {};
  const year = (y: string) => (out[y] ??= { rides: [], ctl: [], atl: [] });
  for (const r of rides) year(r.start_date_local.slice(0, 4)).rides.push(r);
  for (const w of wellness) {
    if (w.ctl == null && w.atl == null) continue;
    const doc = year(w.id.slice(0, 4));
    const i = dayIndex(w.id);
    while (doc.ctl.length <= i) {
      doc.ctl.push(null);
      doc.atl.push(null);
    }
    doc.ctl[i] = w.ctl != null ? Math.round(w.ctl * 10) / 10 : null;
    doc.atl[i] = w.atl != null ? Math.round(w.atl * 10) / 10 : null;
  }
  for (const d of Object.values(out))
    d.rides.sort((a, b) => b.start_date_local.localeCompare(a.start_date_local));
  return out;
}

export const offStretches = (events: PlannedEvent[]): TreeHeader["off"] =>
  events
    .filter((e) => e.category === "SICK" || e.category === "INJURED")
    .map((e) => ({ start: e.date, end: e.end ?? e.date, kind: e.category as "SICK" | "INJURED" }));

/** A published tree back as the inputs the tree is drawn from, on a friend's device. */
export function fromSnapshot(header: TreeHeader, years: Record<string, TreeYearDoc>) {
  const acts: Activity[] = Object.values(years)
    .flatMap((y) => y.rides)
    .map((r) => ({
      ...r,
      icu_average_watts: null,
      icu_weighted_avg_watts: null,
      average_heartrate: null,
      max_heartrate: null,
      calories: null,
      joules: null,
      average_speed: null,
      zoneTimes: [0, 0, 0, 0, 0, 0, 0],
      decoupling: null,
      efficiency: null,
      feel: null,
      garmin: null,
    }))
    .sort((a, b) => b.start_date_local.localeCompare(a.start_date_local));
  const wellness: Wellness[] = Object.entries(years).flatMap(([y, d]) =>
    d.ctl.flatMap((ctl, i) =>
      ctl == null && d.atl[i] == null
        ? []
        : [
            {
              id: dateOf(y, i),
              ctl,
              atl: d.atl[i] ?? null,
              rampRate: null,
              weight: null,
              bodyFat: null,
              hrv: null,
              sleepSecs: null,
              sleepQuality: null,
              soreness: null,
              fatigue: null,
              stress: null,
              mood: null,
              motivation: null,
              eftp: null,
              wPrime: null,
              pMax: null,
              comments: null,
            },
          ],
    ),
  );
  const off: PlannedEvent[] = header.off.map((o, i) => ({
    id: `off-${i}`,
    date: o.start,
    end: o.end > o.start ? o.end : null,
    category: o.kind,
    type: null,
    name: null,
    description: null,
    moving_time: null,
    icu_training_load: null,
  }));
  const crown: Crown | null = header.crown
    ? {
        ...header.crown,
        confidence: "high",
        advice: null,
        signals: [],
        load: { level: 0, ratio: null, ramp: null, returning: false, reasons: [] },
      }
    : null;
  return { acts, wellness, off, crown, sport: header.sport ?? ("ride" as const) };
}

/** A short stable fingerprint, to skip writing what a forest already has. */
export function fingerprint(v: unknown): string {
  const s = JSON.stringify(v);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return `${s.length}:${(h >>> 0).toString(36)}`;
}
