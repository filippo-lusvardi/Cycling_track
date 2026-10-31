import { describe, expect, it } from "vitest";
import type { Activity, Wellness } from "./intervals";
import {
  buildDays,
  buildWeeks,
  buildYears,
  crownFor,
  feelLevel,
  intensityLevel,
  seasonOf,
  seedOf,
  smoothTrunk,
  trunkWidth,
  weekRange,
} from "./tree";

const act = (
  id: string,
  date: string,
  mins: number,
  load: number,
  extra: Partial<Activity> = {},
): Activity => ({
  id,
  name: id,
  type: "Ride",
  start_date_local: `${date}T09:00:00`,
  distance: null,
  moving_time: mins * 60,
  total_elevation_gain: null,
  icu_training_load: load,
  icu_average_watts: null,
  icu_weighted_avg_watts: null,
  average_heartrate: null,
  max_heartrate: null,
  icu_intensity: null,
  calories: null,
  average_speed: null,
  zoneTimes: [],
  decoupling: null,
  efficiency: null,
  trainer: false,
  feel: null,
  ...extra,
});

const well = (id: string, ctl: number | null, extra: Partial<Wellness> = {}): Wellness => ({
  id,
  ctl,
  atl: null,
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
  ...extra,
});

describe("tree", () => {
  it("has one day per calendar day, newest first", () => {
    const days = buildDays([], [], "2026-10-28", "2026-10-31");
    expect(days.map((d) => d.date)).toEqual([
      "2026-10-31",
      "2026-10-30",
      "2026-10-29",
      "2026-10-28",
    ]);
  });
  it("trunk follows fitness and carries it over days without wellness", () => {
    const days = buildDays(
      [],
      [well("2026-10-28", 60), well("2026-10-30", 90)],
      "2026-10-28",
      "2026-10-31",
    );
    expect(days.map((d) => d.ctl)).toEqual([90, 90, 60, 60]);
    expect(days[0]!.trunk).toBeGreaterThan(days[3]!.trunk);
    expect(trunkWidth(null, [50])).toBe(8);
  });
  it("trunk width comes from fitness rank, so common values spread over the whole range", () => {
    // Most days sit between 60 and 64: by rank they still span thin to thick.
    const sorted = [20, 60, 61, 62, 63, 64, 100].sort((a, b) => a - b);
    expect(trunkWidth(20, sorted)).toBeLessThan(13);
    expect(trunkWidth(62, sorted)).toBeCloseTo(31, 0); // the median sits in the middle
    expect(trunkWidth(100, sorted)).toBeGreaterThan(49);
    expect(trunkWidth(63, sorted) - trunkWidth(61, sorted)).toBeGreaterThan(10);
  });
  it("grows a branch per activity, longer for longer rides, thicker for more load", () => {
    const days = buildDays(
      [act("a", "2026-10-30", 30, 20), act("b", "2026-10-31", 240, 220)],
      [],
      "2026-10-30",
      "2026-10-31",
    );
    const [b] = days[0]!.branches;
    const [a] = days[1]!.branches;
    expect(b!.length).toBeGreaterThan(a!.length);
    expect(b!.thickness).toBeGreaterThan(a!.thickness);
  });
  it("alternates sides from the roots, so adding a new ride never flips old branches", () => {
    const old = [act("a", "2026-10-29", 60, 50), act("b", "2026-10-30", 60, 50)];
    const before = buildDays(old, [], "2026-10-29", "2026-10-30");
    const after = buildDays(
      [...old, act("c", "2026-10-31", 60, 50)],
      [],
      "2026-10-29",
      "2026-10-31",
    );
    expect(after.find((d) => d.date === "2026-10-30")!.branches[0]!.side).toBe(
      before[0]!.branches[0]!.side,
    );
    expect(after[0]!.branches[0]!.side).not.toBe(after[1]!.branches[0]!.side);
  });
  it("shapes are deterministic per activity id", () => {
    expect(seedOf("12345")).toBe(seedOf("12345"));
    expect(seedOf("12345")).not.toBe(seedOf("12346"));
  });
  it("maps intervals.icu feel 1–5 onto levels 1–4", () => {
    expect(feelLevel(1)).toBe(1);
    expect(feelLevel(5)).toBe(4);
    expect(feelLevel(null)).toBeNull();
  });
  it("buckets intensity factor into easy, steady, tempo and hard", () => {
    expect(intensityLevel(55)).toBe(1);
    expect(intensityLevel(70)).toBe(2);
    expect(intensityLevel(85)).toBe(3);
    expect(intensityLevel(0.98)).toBe(4); // also accepts a plain fraction
    expect(intensityLevel(null)).toBeNull();
  });
  it("grows one leaf per 100 m climbed, none on a flat or gym session, coloured by intensity", () => {
    const days = buildDays(
      [
        act("hill", "2026-10-31", 120, 100, { total_elevation_gain: 1250, icu_intensity: 72 }),
        act("flat", "2026-10-31", 60, 40, { total_elevation_gain: 40 }),
        act("gym", "2026-10-31", 45, 30, { type: "WeightTraining" }),
        act("alps", "2026-10-31", 400, 300, { total_elevation_gain: 5000 }),
      ],
      [],
      "2026-10-31",
      "2026-10-31",
    );
    const by = Object.fromEntries(days[0]!.branches.map((b) => [b.id, b]));
    expect(by["hill"]).toMatchObject({ leaves: 12, intensity: 2 });
    expect(by["flat"]!.leaves).toBe(0);
    expect(by["gym"]!.leaves).toBe(0);
    expect(by["alps"]!.leaves).toBe(30); // capped
  });
  it("folds days into Monday weeks and marks a big jump as a build", () => {
    const acts = ["2026-10-05", "2026-10-12", "2026-10-19"].map((d, i) => act(`e${i}`, d, 60, 50));
    acts.push(act("big", "2026-10-26", 300, 300));
    const weeks = buildWeeks(buildDays(acts, [], "2026-10-05", "2026-11-01"));
    expect(weeks.map((w) => w.start)).toEqual([
      "2026-10-26",
      "2026-10-19",
      "2026-10-12",
      "2026-10-05",
    ]);
    expect(weeks[0]!.chapter).toBe("build");
    expect(weeks[1]!.chapter).toBe("steady");
  });
  it("gives each week one twig per activity, oldest first, with the week's climbing", () => {
    const acts = [
      act("tue", "2026-10-27", 60, 50, { total_elevation_gain: 300 }),
      act("sat", "2026-10-31", 180, 150, { total_elevation_gain: 1200 }),
    ];
    const [week] = buildWeeks(buildDays(acts, [], "2026-10-26", "2026-11-01"));
    expect(week!.twigs.map((t) => t.id)).toEqual(["tue", "sat"]);
    expect(week!.climb).toBe(1500);
    expect(week!.count).toBe(2);
  });
  it("sums each year into one ring, oldest first", () => {
    const days = buildDays(
      [
        act("a", "2025-12-31", 60, 40, { distance: 27_000, total_elevation_gain: 450 }),
        act("b", "2026-01-02", 60, 70),
      ],
      [],
      "2025-12-30",
      "2026-01-03",
    );
    const years = buildYears(days);
    expect(years.map((y) => [y.year, y.load])).toEqual([
      [2025, 40],
      [2026, 70],
    ]);
    expect(years[1]!.weekLoads[0]).toBe(70);
    expect(years[0]!.distance).toBe(27_000);
    expect(years[0]!.climb).toBe(450);
  });
  it("maps readiness onto the four seasons", () => {
    expect([80, 60, 45, 20].map(seasonOf)).toEqual(["summer", "spring", "autumn", "winter"]);
  });
  it("crown without check-in is estimated from form, with weather and plain numbers", () => {
    const tired = crownFor([well("2026-10-31", 50, { atl: 85 })], "2026-10-31");
    expect(tired).toMatchObject({ estimated: true, ctl: 50, atl: 85, form: -35, weather: "rain" });
    expect(tired.score).not.toBeNull();
    expect(tired.season).toBe("winter");
    const fresh = crownFor([well("2026-10-31", 50, { atl: 40, mood: 2 })], "2026-10-31");
    expect(fresh).toMatchObject({ estimated: false, weather: "sun" });
    expect(crownFor([well("2026-10-31", 50, { atl: 70 })], "2026-10-31").weather).toBe("clouds");
    expect(crownFor([well("2026-10-31", 50, { atl: 52 })], "2026-10-31").weather).toBe("partly");
  });
  it("labels a week by its first and last day, ending early when cut short", () => {
    const weeks = buildWeeks(buildDays([], [], "2026-09-28", "2026-10-07"));
    expect(weeks.map((w) => weekRange(w.start, w.end))).toEqual(["5–7 Oct", "28 Sep – 4 Oct"]);
    expect(weekRange("2026-10-05", "2026-10-05")).toBe("5 Oct");
  });
  it("joins trunk pieces with one shared slope, vertical where it meets the crown", () => {
    const e = smoothTrunk([
      { h: 40, top: 40, bottom: 36 },
      { h: 30, top: 36, bottom: 36 },
      { h: 40, top: 36, bottom: 20 },
    ]);
    expect(e[0]!.slopeTop).toBe(0);
    expect(e[0]!.slopeBottom).toBe(e[1]!.slopeTop);
    expect(e[1]!.slopeBottom).toBe(e[2]!.slopeTop);
    expect(e[1]!.slopeTop).toBeCloseTo(-0.05);
    expect(e[2]!.slopeBottom).toBeCloseTo(-0.4);
  });
});
