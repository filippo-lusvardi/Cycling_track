// Pins what a cyclist sees. Written before running became a main sport: with sport left out, or set to "ride",
// these outputs must never change. Update the snapshot only when cycling itself is meant to change.
import { describe, expect, it } from "vitest";
import { computeFocus, focusSession } from "./focus";
import { lifetime } from "./forest/age";
import { buildGarden, sportOf } from "./garden";
import type { Activity, PowerCurve, RideStreams, Wellness } from "./intervals";
import { rideMetrics } from "./metrics";
import { profileFor, raceDescription, parseRace, type Race } from "./races";
import { buildDays, buildWeeks, buildYears, rideRecords } from "./tree";

const today = "2026-10-20";
const act = (id: string, date: string, type: string, extra: Partial<Activity> = {}): Activity => ({
  id,
  name: id,
  type,
  start_date_local: `${date}T09:00:00`,
  distance: 40000,
  moving_time: 5400,
  total_elevation_gain: 600,
  icu_training_load: 90,
  icu_average_watts: 210,
  icu_weighted_avg_watts: 225,
  average_heartrate: 140,
  max_heartrate: 170,
  icu_intensity: 76,
  calories: 900,
  average_speed: 7.4,
  zoneTimes: [600, 3000, 900, 500, 200, 100, 20],
  decoupling: 6,
  efficiency: null,
  trainer: false,
  feel: null,
  brioches: 2,
  garmin: null,
  ...extra,
});

const acts: Activity[] = [
  act("road", "2026-10-19", "Ride"),
  act("gravel", "2026-10-17", "GravelRide", {
    distance: 80000,
    moving_time: 14400,
    icu_training_load: 210,
  }),
  act("mtb", "2026-10-15", "MountainBikeRide", { total_elevation_gain: 1500 }),
  act("trainer", "2026-10-13", "Ride", { trainer: true, total_elevation_gain: 0 }),
  act("zwift", "2026-10-11", "VirtualRide"),
  act("ebike", "2026-10-09", "EBikeRide"),
  act("velo", "2026-10-07", "Velomobile"),
  act("run", "2026-10-18", "Run", { distance: 10000, moving_time: 3000, icu_training_load: 60 }),
  act("trail", "2026-10-16", "TrailRun", {
    distance: 15000,
    moving_time: 6000,
    total_elevation_gain: 900,
  }),
  act("swim", "2026-10-14", "Swim", { distance: 2000, moving_time: 2400 }),
  act("gym", "2026-10-12", "WeightTraining", { distance: null, moving_time: 3600 }),
  act("hike", "2026-10-10", "Hike", { distance: 12000, moving_time: 10800 }),
];
const wellness = [
  { id: "2026-10-19", ctl: 55 },
  { id: "2026-10-05", ctl: 48 },
] as Wellness[];

const streams: RideStreams = {
  time: Array.from({ length: 3600 }, (_, i) => i),
  distance: Array.from({ length: 3600 }, (_, i) => i * 8),
  altitude: Array.from({ length: 3600 }, (_, i) => 100 + 100 * Math.sin(i / 300)),
  watts: Array.from({ length: 3600 }, (_, i) => 180 + (i % 600 < 120 ? 120 : 0)),
  heartrate: Array.from({ length: 3600 }, (_, i) => 130 + i / 120),
  cadence: Array.from({ length: 3600 }, () => 88),
  lat: [],
  lng: [],
};

const SECS = [5, 10, 15, 30, 60, 120, 180, 300, 480, 1200, 2400, 3600];
const curve = (id: string, k: number): PowerCurve => ({
  id,
  label: id,
  secs: SECS,
  watts: SECS.map((s) => Math.round(k * (1200 * s ** -0.25 + 150))),
});
const race: Race = {
  id: "r",
  date: "2026-11-15",
  name: "Hill",
  priority: "A",
  notes: "",
  info: { discipline: "road", kind: "climb", minutes: 25, sprint: false },
};

describe("cycling stays exactly as it was", () => {
  it("tree", () => {
    expect(rideRecords(acts, today)).toMatchSnapshot();
    const days = buildDays(acts, wellness, "2026-10-05", today);
    expect(days).toMatchSnapshot();
    expect(buildWeeks(days)).toMatchSnapshot();
    expect(buildYears(days)).toMatchSnapshot();
    expect(lifetime(acts)).toMatchSnapshot();
  });
  it("garden", () => {
    expect(acts.map((a) => sportOf(a))).toMatchSnapshot();
    expect(buildGarden(acts, today)).toMatchSnapshot();
  });
  it("metrics", () => {
    expect(rideMetrics(streams, { ftp: 250, lthr: 165 })).toMatchSnapshot();
    expect(
      rideMetrics({ ...streams, watts: streams.watts.map(() => null) }, { ftp: 250, lthr: 165 }),
    ).toMatchSnapshot();
  });
  it("focus and races", () => {
    const input = {
      races: [race],
      today,
      acts,
      wellness,
      c42: curve("42d", 0.92),
      c1y: curve("1y", 1),
    };
    const r = computeFocus(input);
    expect(r).toMatchSnapshot();
    expect(
      focusSession({
        focus: r.focus,
        races: [race],
        today,
        zones: { ftp: 250, power: [140, 190, 225, 265, 300, 350], hr: [] },
        c1y: input.c1y,
      }),
    ).toMatchSnapshot();
    expect(profileFor(race.info!)).toMatchSnapshot();
    const text = raceDescription(race.info!, "notes");
    expect(text).toMatchSnapshot();
    expect(parseRace(text)).toMatchSnapshot();
  });
});
