// Every example the Legend shows must do something when typed, in both languages and for both main sports. A "+" or a
// description stands for a name of your own, so those aren't typed as they are.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Activity, Wellness } from "./intervals";

const today = "2026-11-05";
const act = (id: string, type: string, date: string, km: number) =>
  ({
    id,
    name: id,
    type,
    start_date_local: `${date}T09:00:00`,
    moving_time: 3600,
    distance: km * 1000,
    total_elevation_gain: 300,
    icu_training_load: 60,
    icu_intensity: 70,
    brioches: 0,
  }) as unknown as Activity;

async function setUp(lang: "en" | "it", sport: "ride" | "run") {
  vi.resetModules();
  localStorage.clear();
  localStorage.setItem("cadence_language", JSON.stringify(lang));
  localStorage.setItem("cadence_main_sport", JSON.stringify(sport));
  const { ASK_GUIDE } = await import("./guides");
  const { allEntries, alternatives, whenEntries } = await import("./ask");
  const { intentEntries, liveEntries } = await import("./ask-intents");
  const type = sport === "run" ? "Run" : "Ride";
  const acts = [act("oggi", type, today, 10), act("ieri", type, "2026-11-04", 12)];
  const wellness = [
    { id: today, ctl: 40, atl: 45, weight: 70, hrv: 60, sleepSecs: 26000 },
  ] as unknown as Wellness[];
  const curves = [{ id: "42d", label: "42", secs: [1200], watts: [270] }] as never;
  const zones = { power: [150, 200, 250], hr: [120, 140, 160] };
  const races = [{ id: "r", name: "Race", date: "2026-12-01", category: "RACE_B" }] as never;
  const entries = [
    ...allEntries({
      today,
      garden: true,
      acts,
      wellness,
      races,
      climbs: [],
      forests: [],
      params: {
        sport,
        runs: sport === "run",
        rideZones: zones,
        runZones: zones,
        thresholds: { ftp: 250, lthr: 165, maxHr: 190, weight: 70 },
        runThreshold: 3.5,
        paceTops: [80, 90, 100],
        curves,
        wellness,
      },
    } as never),
    ...liveEntries({ today, sport, checkIn: true, acts, wellness, score: 80, zones, races }),
  ];
  const { buildPool } = await import("./suggest");
  const suggest = {
    today,
    sport,
    focus: "aerobic" as const,
    races: [],
    events: [],
    offEvents: [],
    acts,
    wellness,
    score: 80,
    form: 0,
    th: { ftp: 250, pace: 3.5 },
    pool: buildPool([], sport, { ftp: 250, pace: 3.5 }),
  };
  const found = (q: string) =>
    alternatives(q, null, [
      ...intentEntries(q, {
        today,
        sport,
        native: true,
        climbs: [],
        acts,
        curves,
        offEvents: [],
        runs: [],
        suggest,
      }),
      ...whenEntries(q, today).filter((e) => e.exact),
      ...entries,
    ]);
  const chips = ASK_GUIDE.flatMap((g) => g.points ?? []).filter(
    (p) => !p.includes(" + ") && !/^(the name of|il nome di)/.test(p),
  );
  return { chips, found };
}

describe("the Legend's search examples", () => {
  beforeEach(() => localStorage.clear());
  for (const lang of ["en", "it"] as const)
    for (const sport of ["ride", "run"] as const)
      it(`all answer in ${lang}, main sport ${sport}`, async () => {
        const { chips, found } = await setUp(lang, sport);
        expect(chips.length).toBeGreaterThan(20);
        expect(chips.filter((c) => found(c).length === 0)).toEqual([]);
      });
});
