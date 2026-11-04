import { describe, expect, it } from "vitest";
import { growth, lifetime, treeGrowth } from "./forest/age";
import { fromSnapshot } from "./forest/snapshot";
import type { TreeHeader } from "./forest/types";
import {
  allSports,
  assignCrop,
  buildGarden,
  buildPantry,
  cropFor,
  DEFAULT_CROPS,
  sportOf,
} from "./garden";
import type { Activity } from "./intervals";
import { isOutdoorActivity, sportOfActivity } from "./sport";
import { buildDays, rideRecords } from "./tree";

const today = "2026-10-20";
const act = (id: string, type: string, date: string, extra: Partial<Activity> = {}) =>
  ({
    id,
    name: id,
    type,
    start_date_local: `${date}T09:00:00`,
    distance: 10000,
    moving_time: 3000,
    total_elevation_gain: 150,
    icu_training_load: 60,
    icu_intensity: 75,
    trainer: false,
    brioches: 0,
    ...extra,
  }) as Activity;
const acts = [
  act("r1", "Run", "2026-10-19"),
  act("t1", "TrailRun", "2026-10-18", { distance: 25000 }),
  act("v1", "VirtualRun", "2026-10-17"),
  act("b1", "Ride", "2026-10-16", { distance: 90000 }),
  act("s1", "Swim", "2026-10-15"),
  act("h1", "Hike", "2026-10-14"),
];

describe("main sport", () => {
  it("sorts activities into the two sports", () => {
    expect(acts.map(sportOfActivity)).toEqual(["run", "run", "run", "ride", null, null]);
    expect(sportOfActivity({ type: "Velomobile" })).toBe("ride");
    expect(sportOfActivity({ type: "VirtualRow" })).toBe(null);
  });
  it("knows what goes outdoors", () => {
    expect(isOutdoorActivity({ type: "TrailRun" })).toBe(true);
    expect(isOutdoorActivity({ type: "Run", trainer: true })).toBe(false);
    expect(isOutdoorActivity({ type: "VirtualRun" })).toBe(false);
    expect(isOutdoorActivity({ type: "Hike" })).toBe(false);
  });
  it("grows a runner's tree from runs, the rest sprouting", () => {
    const days = buildDays(acts, [], "2026-10-14", today, new Map(), "run");
    expect(days.flatMap((d) => d.branches.map((b) => b.id)).sort()).toEqual(["r1", "t1", "v1"]);
    expect(days.flatMap((d) => d.sprouts.map((s) => s.id)).sort()).toEqual(["b1", "h1", "s1"]);
    expect(rideRecords(acts, today, "run").longest).toBe("t1");
  });
  it("draws a usual run like a usual ride", () => {
    const run = buildDays([acts[0]!], [], "2026-10-19", today, new Map(), "run").flatMap(
      (d) => d.branches,
    )[0]!;
    const ride = buildDays(
      [
        act("b", "Ride", "2026-10-19", {
          moving_time: 5400,
          icu_training_load: 90,
          total_elevation_gain: 600,
        }),
      ],
      [],
      "2026-10-19",
      today,
    ).flatMap((d) => d.branches)[0]!;
    expect(Math.abs(run.length - ride.length)).toBeLessThan(0.1);
    expect(Math.abs(run.thickness - ride.thickness)).toBeLessThan(0.5);
    expect(Math.abs(run.leaves - ride.leaves)).toBeLessThanOrEqual(1);
  });
  it("gives a runner's rides a garden bed that shares the run's crop", () => {
    expect(sportOf(acts[3]!, DEFAULT_CROPS, "run")).toBe("bike");
    expect(sportOf(acts[0]!, DEFAULT_CROPS, "run")).toBe(null);
    expect(sportOf(acts[0]!)).toBe("run");
    expect(sportOf(acts[3]!)).toBe(null);
    const beds = buildGarden(acts, today, DEFAULT_CROPS, "run").beds;
    expect(beds.map((b) => b.sport).sort()).toEqual(["bike", "swim", "walk"]);
    expect(cropFor(DEFAULT_CROPS, "bike")).toBe(DEFAULT_CROPS.run);
    expect(allSports(DEFAULT_CROPS, "run")).toContain("bike");
    expect(allSports(DEFAULT_CROPS, "run")).not.toContain("run");
    expect(allSports(DEFAULT_CROPS, "ride")).not.toContain("bike");
    const next = assignCrop(DEFAULT_CROPS, "bike", "carrot");
    expect(next.run).toBe("carrot");
    expect(Object.keys(next)).not.toContain("bike");
  });
  it("fills a runner's pantry with their rides, under a sport the jars can show", () => {
    const jars = buildPantry(acts, DEFAULT_CROPS, "run").flatMap((s) => s.jars);
    const bySport = jars[0]!.bySport;
    expect(bySport.bike).toBe(50);
    expect(bySport.run).toBeUndefined();
    const shown = allSports(DEFAULT_CROPS, "run");
    for (const sport of Object.keys(bySport)) expect(shown).toContain(sport);
    // The jar's layers add up to the jar: nothing it counts is left undrawn.
    const drawn = shown.reduce((sum, s) => sum + (bySport[s] ?? 0), 0);
    expect(drawn).toBe(jars[0]!.minutes);
  });
  it("sizes a forest tree by its owner's sport, whatever device looks at it", () => {
    expect(lifetime(acts, "run")).toEqual({ since: "2026-10-17", km: 45 });
    expect(growth(2, 3000, "run")).toBeCloseTo(growth(2, 11000, "ride"));
    const header = {
      crown: null,
      day: today,
      years: [],
      off: [],
      km: 3000,
      since: "2024-10-20",
      updatedAt: 0,
    } as TreeHeader;
    expect(treeGrowth({ ...header, sport: "run" }, today)).toBeGreaterThan(
      treeGrowth(header, today),
    );
    expect(fromSnapshot(header, {}).sport).toBe("ride");
    const friend = fromSnapshot({ ...header, sport: "run" }, {});
    expect(friend.sport).toBe("run");
  });
});
