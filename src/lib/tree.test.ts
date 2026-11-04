import { describe, expect, it } from "vitest";
import { addDays as addDaysT } from "./training";
import { lastDay, type Activity, type PlannedEvent, type Wellness } from "./intervals";
import {
  buildDays,
  buildWeeks,
  buildYears,
  crownFor,
  feelLevel,
  morningWellness,
  intensityLevel,
  offDays,
  offToggle,
  returningFromBreak,
  leafSpots,
  perchSpots,
  rideRecords,
  seasonLabel,
  seasonOf,
  seasonPhase,
  seedOf,
  smoothTrunk,
  trunkWidth,
  weatherPhase,
  weekRange,
  onlySprouts,
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
  brioches: 0,
  garmin: null,
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
  it("grows one leaf per 100 m climbed, none on a flat ride, coloured by intensity", () => {
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
    expect(by["alps"]!.leaves).toBe(30); // capped
    // Off the bike: no branch, a sprout (it lives in the garden).
    expect(by["gym"]).toBeUndefined();
    expect(days[0]!.sprouts).toEqual([
      expect.objectContaining({ id: "gym", kind: "gym", minutes: 45, load: 30 }),
    ]);
  });
  it("keeps rides on the tree, counts every sport in chapters and rings", () => {
    const acts = [
      act("ride", "2026-10-26", 60, 50, { distance: 30_000 }),
      act("run", "2026-10-27", 50, 60, { type: "Run", distance: 10_000 }),
    ];
    const days = buildDays(acts, [], "2026-10-26", "2026-11-01");
    const [week] = buildWeeks(days);
    expect(week).toMatchObject({ count: 1, load: 50, totalLoad: 110, crossMinutes: 50 });
    expect(week!.twigs.map((t) => t.id)).toEqual(["ride"]);
    const [year] = buildYears(days);
    expect(year).toMatchObject({ count: 1, distance: 30_000, load: 110, crossMinutes: 50 });
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
  it("places a day inside its season and sky, 0 at the worse end to 1 at the better", () => {
    expect([0, 20, 40, 47.5, 55, 65, 75, 100].map(seasonPhase)).toEqual([
      0, 0.5, 0, 0.5, 0, 0.5, 0, 1,
    ]);
    expect(seasonLabel("spring", 0.1)).toBe("Early spring");
    expect(seasonLabel("autumn", 0.1)).toBe("Late autumn"); // the low end of autumn is nearly winter
    expect(seasonLabel("summer", 0.9)).toBe("High summer");
    expect(weatherPhase(-60)).toBe(0); // the deepest rain
    expect(weatherPhase(-20)).toBe(0.5);
    expect(weatherPhase(40)).toBe(1); // as sunny as it gets
  });
  it("crown without check-in is estimated from form, with weather and plain numbers", () => {
    const tired = crownFor([well("2026-10-31", 50, { atl: 85 })], [], "2026-10-31");
    expect(tired).toMatchObject({ estimated: true, ctl: 50, atl: 85, form: -35, weather: "rain" });
    expect(tired.score).not.toBeNull();
    expect(tired.season).toBe("winter");
    const fresh = crownFor([well("2026-10-31", 50, { atl: 40, mood: 2 })], [], "2026-10-31");
    expect(fresh).toMatchObject({ estimated: false, weather: "sun" });
    const weather = (atl: number) =>
      crownFor([well("2026-10-31", 50, { atl })], [], "2026-10-31").weather;
    // The sky follows form as % of fitness: at fitness 50, −20 is −40% (overreached), −10 is −20%.
    expect(weather(70)).toBe("rain");
    expect(weather(60)).toBe("clouds");
    expect(weather(52)).toBe("partly");
  });
  it("what doesn't grow in the garden leaves no sprout and no trace in weeks or rings", () => {
    const day = "2026-10-28";
    const days = buildDays(
      [act("r", day, 60, 50), act("g", addDaysT(day, 1), 40, 30, { type: "WeightTraining" })],
      [],
      day,
      addDaysT(day, 1),
    );
    expect(buildWeeks(days)[0]).toMatchObject({ crossMinutes: 40, totalLoad: 80 });
    const alone = onlySprouts(days, new Set());
    expect(alone.flatMap((d) => d.sprouts)).toEqual([]);
    expect(alone.flatMap((d) => d.branches).map((b) => b.id)).toEqual(["r"]);
    expect(buildWeeks(alone)[0]).toMatchObject({ crossMinutes: 0, totalLoad: 50, count: 1 });
    expect(buildYears(alone)[0]).toMatchObject({ crossMinutes: 0, load: 50 });
    expect(
      onlySprouts(days, new Set(["g"]))
        .flatMap((d) => d.sprouts)
        .map((x) => x.id),
    ).toEqual(["g"]);
  });
  it("no check-in leaves the crown to the other data; turned off, answers on record don't count", () => {
    const day = "2026-10-31";
    const others = { atl: 55, hrv: 60, sleepSecs: 7 * 3600 };
    const bad = { sleepQuality: 4, fatigue: 4, stress: 4, mood: 4 };
    const history = (extra: Partial<Wellness>) =>
      Array.from({ length: 4 }, (_, i) => well(addDaysT(day, i - 3), 50, { ...others, ...extra }));
    const none = crownFor(history({}), [], day);
    // Answers on record really do move it, so the rest of this test means something.
    expect(crownFor(history(bad), [], day).score).toBeLessThan(none.score!);
    const off = crownFor(history(bad), [], day, [], false);
    expect(off.score).toBe(none.score);
    expect(off.signals).toEqual(none.signals);
    // Nothing is awaited with the check-in off, so a score with enough behind it isn't "estimated".
    expect(none.estimated).toBe(true);
    expect(off.estimated).toBe(false);
  });
  it("uses yesterday's fitness and fatigue until today has an activity", () => {
    const rows = [
      well("2026-10-30", 50, { atl: 60 }),
      well("2026-10-31", 49, { atl: 52, mood: 2 }),
    ];
    // No ride yet: this morning's numbers, and the form/weather computed from them.
    const morning = crownFor(rows, [], "2026-10-31");
    expect(morning).toMatchObject({
      ctl: 50,
      atl: 60,
      form: -10,
      formPct: -20,
      weather: "clouds",
      estimated: false,
    });
    // Ridden today: intervals.icu's values for today.
    const ridden = crownFor(rows, [act("r", "2026-10-31", 60, 80)], "2026-10-31");
    expect(ridden).toMatchObject({ ctl: 49, atl: 52, form: -3 });
    // A ride on another day doesn't count.
    expect(crownFor(rows, [act("r", "2026-10-30", 60, 80)], "2026-10-31").ctl).toBe(50);
    // No row for today yet: yesterday's numbers still show.
    expect(morningWellness(rows.slice(0, 1), [], "2026-10-31").at(-1)).toMatchObject({
      id: "2026-10-31",
      ctl: 50,
      atl: 60,
    });
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

const off = (
  id: string,
  category: string,
  date: string,
  end: string | null = null,
): PlannedEvent => ({
  id,
  date,
  end,
  category,
  type: null,
  name: null,
  description: null,
  moving_time: null,
  icu_training_load: null,
});

describe("knots", () => {
  it("reads an all-day event's midnight end as the day before", () => {
    expect(lastDay("2026-10-04T00:00:00", "2026-10-10T00:00:00")).toBe("2026-10-09");
    expect(lastDay("2026-10-04T00:00:00", "2026-10-09T23:59:00")).toBe("2026-10-09");
    expect(lastDay("2026-10-04T00:00:00", "2026-10-05T00:00:00")).toBeNull();
    expect(lastDay("2026-10-04T00:00:00", null)).toBeNull();
  });
  it("marks every covered day, injured over ill, and ignores other events", () => {
    const map = offDays([
      off("a", "SICK", "2026-10-04", "2026-10-06"),
      off("b", "INJURED", "2026-10-06"),
      off("c", "WORKOUT", "2026-10-08"),
    ]);
    expect([...map.entries()]).toEqual([
      ["2026-10-04", "SICK"],
      ["2026-10-05", "SICK"],
      ["2026-10-06", "INJURED"],
    ]);
  });
  it("puts knots on days and counts them per week", () => {
    const days = buildDays(
      [],
      [],
      "2026-10-05",
      "2026-10-11",
      offDays([off("a", "SICK", "2026-10-06", "2026-10-07")]),
    );
    expect(days.filter((d) => d.off).map((d) => d.date)).toEqual(["2026-10-07", "2026-10-06"]);
    expect(buildWeeks(days)[0]!.off).toEqual({ days: 2, kind: "SICK" });
  });
  it("toggling today creates, extends yesterday's stretch, or undoes", () => {
    const today = "2026-10-10";
    expect(offToggle([], "SICK", today)).toEqual({ op: "create", start: today, last: today });
    const yesterday = [off("a", "SICK", "2026-10-07", "2026-10-09")];
    expect(offToggle(yesterday, "SICK", today)).toEqual({
      op: "update",
      id: "a",
      start: "2026-10-07",
      last: today,
    });
    // A different kind starts its own stretch.
    expect(offToggle(yesterday, "INJURED", today).op).toBe("create");
    const through = [off("a", "SICK", "2026-10-07", today)];
    expect(offToggle(through, "SICK", today)).toEqual({
      op: "update",
      id: "a",
      start: "2026-10-07",
      last: "2026-10-09",
    });
    expect(offToggle([off("b", "SICK", today)], "SICK", today)).toEqual({ op: "delete", id: "b" });
  });
});

describe("returning from a break", () => {
  it("counts a recent injury or two weeks without training", () => {
    const today = "2026-11-01";
    const riding = Array.from({ length: 60 }, (_, i) => act(`r${i}`, addDaysT(today, -i), 60, 50));
    expect(returningFromBreak(riding, [], today)).toBe(false);
    expect(
      returningFromBreak(riding, [off("i", "INJURED", "2026-09-20", "2026-10-10")], today),
    ).toBe(true);
    expect(
      returningFromBreak(riding, [off("i", "INJURED", "2026-08-01", "2026-08-20")], today),
    ).toBe(false);
    const gap = riding.filter((_, i) => i < 10 || i > 26);
    expect(returningFromBreak(gap, [], today)).toBe(true);
  });
});

describe("bird perches", () => {
  const len = 200;
  const bird = 22;
  const gapsOk = (spots: number[], leaves: number) => {
    const tops = leafSpots(leaves, 0.4).filter((_, i) => i % 2 === 0);
    return spots.every((s) => tops.every((l) => Math.abs(l - s) * len >= bird * 0.9));
  };
  it("puts a single bird on bare wood, clear of the leaves on top", () => {
    for (const leaves of [1, 2, 3, 6]) {
      const [s] = perchSpots(1, leaves, 0.4, len, bird);
      expect(gapsOk([s!], leaves)).toBe(true);
    }
  });
  it("keeps birds a body apart and on the branch", () => {
    const spots = perchSpots(4, 2, 0.4, len, bird);
    expect(spots).toHaveLength(4);
    spots
      .slice(1)
      .forEach((s, i) => expect((s - spots[i]!) * len).toBeGreaterThanOrEqual(bird - 1));
    expect(spots[0]! * len).toBeGreaterThanOrEqual(bird * 0.8 - 1e-6);
    expect(spots[3]!).toBeLessThanOrEqual(1);
  });
  it("keeps birds clear of an animal already sitting there, and a tall one low", () => {
    const [g] = perchSpots(1, 2, 0.4, len, 30, { upTo: 0.5 });
    expect(g!).toBeLessThanOrEqual(0.5);
    const spots = perchSpots(3, 2, 0.4, len, bird, { taken: [{ t: g!, w: 30 }] });
    for (const s of spots)
      expect(Math.abs(s - g!) * len).toBeGreaterThanOrEqual((30 + bird) / 2 - 1);
  });
  it("still places every bird when the branch is crowded", () => {
    expect(perchSpots(8, 20, 0.4, 60, bird)).toHaveLength(8);
    expect(perchSpots(0, 3, 0.4, len, bird)).toEqual([]);
  });
});

describe("scars", () => {
  it("turns each injured stretch into one scar on its year, and ignores sickness", () => {
    const days = buildDays(
      [],
      [],
      "2026-01-01",
      "2026-03-31",
      offDays([
        off("i1", "INJURED", "2026-01-10", "2026-01-14"),
        off("i2", "INJURED", "2026-03-01"),
        off("s", "SICK", "2026-02-02", "2026-02-05"),
      ]),
    );
    expect(buildYears(days)[0]!.scars).toEqual([
      { start: "2026-01-10", end: "2026-01-14", from: 9, to: 13 },
      { start: "2026-03-01", end: "2026-03-01", from: 59, to: 59 },
    ]);
  });
});

describe("all-time ride records (squirrel and owl)", () => {
  const today = "2026-10-20";
  it("finds the longest ride and the one with the most climbing, among rides only", () => {
    const acts = [
      act("flat", "2025-06-01", 300, 200, { distance: 160_000, total_elevation_gain: 400 }),
      act("alps", "2026-07-10", 280, 260, { distance: 120_000, total_elevation_gain: 3200 }),
      act("ultra", "2026-05-01", 600, 150, {
        type: "Run",
        distance: 200_000,
        total_elevation_gain: 5000,
      }),
    ];
    expect(rideRecords(acts, today)).toEqual({ longest: "flat", mostClimbing: "alps" });
  });
  it("keeps the earlier ride on a tie and ignores the future", () => {
    const acts = [
      act("first", "2026-01-01", 60, 50, { distance: 50_000 }),
      act("again", "2026-02-01", 60, 50, { distance: 50_000 }),
      act("planned", "2026-12-01", 60, 50, { distance: 90_000 }),
    ];
    expect(rideRecords(acts, today)).toEqual({ longest: "first", mostClimbing: null });
  });
  it("marks the record branches in the tree", () => {
    const acts = [
      act("a", "2026-10-18", 60, 50, { distance: 30_000, total_elevation_gain: 900 }),
      act("b", "2026-10-19", 90, 70, { distance: 60_000, total_elevation_gain: 300 }),
    ];
    const days = buildDays(acts, [], "2026-10-18", today);
    const branches = days.flatMap((d) => d.branches);
    expect(branches.find((b) => b.id === "b")).toMatchObject({
      longest: true,
      mostClimbing: false,
    });
    expect(branches.find((b) => b.id === "a")).toMatchObject({
      longest: false,
      mostClimbing: true,
    });
  });
});
