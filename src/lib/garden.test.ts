import { describe, expect, it } from "vitest";
import type { Activity } from "./intervals";
import {
  addCustomSport,
  allSports,
  customSports,
  assignCrop,
  buildGarden,
  buildPantry,
  cropMap,
  cropFor,
  cropOf,
  customSportCount,
  DEFAULT_CROPS,
  freeCrops,
  jarSessions,
  addSport,
  removeSport,
  growNewSports,
  sportCounts,
  sportsToAdd,
  CROPS,
  type CropMap,
  soilOf,
  sportOf,
  sportSign,
  suggestedSports,
  weekSummary,
} from "./garden";

const act = (
  id: string,
  date: string,
  type: string,
  mins: number,
  extra: Partial<Activity> = {},
): Activity =>
  ({
    id,
    name: id,
    type,
    start_date_local: `${date}T08:00:00`,
    moving_time: mins * 60,
    distance: null,
    total_elevation_gain: null,
    icu_training_load: mins,
    icu_intensity: null,
    trainer: false,
    ...extra,
  }) as Activity;

const today = "2026-11-03"; // a Tuesday

describe("the garden", () => {
  it("plants every sport but cycling in its own crop", () => {
    expect(cropOf({ type: "Ride" })).toBeNull();
    expect(cropOf({ type: "VirtualRide" })).toBeNull();
    expect(cropOf({ type: "Run" })).toBe("tomato");
    expect(cropOf({ type: "TrailRun" })).toBe("tomato");
    expect(cropOf({ type: "WeightTraining" })).toBe("pumpkin");
    expect(cropOf({ type: "Yoga" })).toBe("flowers");
    expect(cropOf({ type: "Pilates" })).toBe("flowers");
    expect(cropOf({ type: "Hike" })).toBe("herbs");
    expect(cropOf({ type: "Swim" })).toBe("lily");
    expect(cropOf({ type: "NordicSki" })).toBe("kale");
    expect(cropOf({ type: "Rowing" })).toBe("reeds");
    expect(cropOf({ type: "RockClimbing" })).toBe("beans");
    expect(cropOf({ type: "Tennis" })).toBe("sunflower");
  });

  it("grows the last 8 weeks, beds back to front, plants oldest first, fruit ripening over a week", () => {
    const g = buildGarden(
      [
        act("ride", "2026-11-02", "Ride", 120),
        act("run-new", "2026-11-03", "Run", 50, { distance: 10_000 }),
        act("run-old", "2026-10-20", "Run", 40, { distance: 8000 }),
        act("yoga", "2026-11-01", "Yoga", 30),
        act("gone", "2026-08-01", "Run", 60, { distance: 12_000 }),
      ],
      today,
    );
    expect(g.beds.map((b) => b.crop)).toEqual(["tomato", "flowers"]);
    const [runOld, runNew] = g.beds[0]!.plants;
    expect(runOld!.id).toBe("run-old");
    expect(runNew).toMatchObject({ id: "run-new", age: 0, ripeness: 0, fruit: 2 });
    expect(runOld!.ripeness).toBe(1);
    expect(g.beds[1]!.plants[0]!.fruit).toBe(3); // 30 min of yoga: three flowers
    expect(g.count).toBe(3);
  });

  it("puts an animal on the longest run of all time, if it's still growing", () => {
    const g = buildGarden(
      [
        act("long", "2026-10-10", "Run", 120, { distance: 25_000 }),
        act("short", "2026-10-30", "Run", 30, { distance: 6000 }),
      ],
      today,
    );
    expect(g.beds[0]!.plants.find((p) => p.id === "long")!.critter).toBe("hedgehog");
    expect(g.beds[0]!.plants.find((p) => p.id === "short")!.critter).toBeNull();
  });

  it("waters the soil with regular sessions, rests it without", () => {
    expect(soilOf([], today)).toBe(0);
    const twiceAWeek = Array.from({ length: 8 }, (_, i) =>
      act(`r${i}`, `2026-10-${String(8 + i * 3).padStart(2, "0")}`, "Run", 40),
    );
    expect(soilOf(twiceAWeek, today)).toBe(1);
  });

  it("harvests months into jars on yearly shelves, and sums this week", () => {
    const acts = [
      act("a", "2025-12-05", "Run", 60),
      act("b", "2026-01-10", "Yoga", 30),
      act("c", "2026-01-20", "Run", 45),
      act("d", "2026-11-02", "Swim", 40),
      act("e", "2026-11-01", "Run", 50), // last Sunday: not this week
    ];
    const shelves = buildPantry(acts);
    expect(shelves.map((s) => s.year)).toEqual([2026, 2025]);
    const jan = shelves[0]!.jars.find((j) => j.month === "2026-01")!;
    expect(jan).toMatchObject({ minutes: 75, bySport: { mobility: 30, run: 45 } });
    expect(weekSummary(acts, today)).toEqual({ minutes: 40, count: 1 });
  });
});

describe("what a jar and a sign say", () => {
  it("lists a month's sessions off the bike, newest first, and nothing else", () => {
    const acts = [
      act("a", "2025-03-05", "Run", 60),
      act("b", "2025-03-20", "Yoga", 30),
      act("c", "2025-03-10", "Ride", 90),
      act("d", "2025-04-01", "Run", 45),
    ];
    const sessions = jarSessions(acts, "2025-03");
    expect(sessions.map((s) => [s.id, s.sport])).toEqual([
      ["b", "mobility"],
      ["a", "run"],
    ]);
    // Every minute in the jar is a session in its list.
    const jar = buildPantry(acts)[0]!.jars.find((j) => j.month === "2025-03")!;
    expect(sessions.reduce((sum, s) => sum + s.minutes, 0)).toBe(jar.minutes);
  });

  it("names a sport on its sign, whatever grows there", () => {
    const map = assignCrop(DEFAULT_CROPS, "run", "strawberry");
    expect(sportSign(map, "run")).toBe(sportSign(DEFAULT_CROPS, "run"));
    const long = addCustomSport(DEFAULT_CROPS, "Calcio a cinque con gli amici", "carrot");
    expect(sportSign(long, long.custom![0]!.id).length).toBeLessThanOrEqual(14);
  });
});

describe("choosing what grows", () => {
  it("knows each activity's sport, and grows it as the chosen crop", () => {
    expect(sportOf({ type: "TrailRun" })).toBe("run");
    expect(sportOf({ type: "Ride" })).toBeNull();
    const map = cropMap({ run: "strawberry" });
    expect(cropOf({ type: "Run" }, map)).toBe("strawberry");
    const g = buildGarden([act("r", "2026-11-02", "Run", 40, { distance: 10_000 })], today, map);
    expect(g.beds[0]).toMatchObject({ sport: "run", crop: "strawberry" });
    // What a session bears is its sport's: two fruits for 10 km, whatever grows.
    expect(g.beds[0]!.plants[0]!.fruit).toBe(2);
  });
  it("swaps with the sport already growing a crop, so no two beds look alike", () => {
    const next = assignCrop(DEFAULT_CROPS, "run", "pumpkin");
    expect(next.run).toBe("pumpkin");
    expect(next.strength).toBe("tomato");
    const fresh = assignCrop(DEFAULT_CROPS, "run", "carrot");
    expect(fresh.run).toBe("carrot");
    expect(Object.values(fresh).filter((c) => c === "tomato")).toHaveLength(0);
  });
});

describe("a garden with no defaults", () => {
  const acts = [
    act("r", "2026-11-02", "Run", 40),
    act("s", "2026-11-02", "Swim", 30),
    act("t", "2026-11-01", "Tennis", 60),
    act("b", "2026-11-01", "Ride", 60),
  ];
  it("starts empty: nothing grows, the soil rests, every usual sport is on offer", () => {
    const map = cropMap(null);
    expect(allSports(map, "ride")).toEqual([]);
    expect(buildGarden(acts, today, map)).toMatchObject({ beds: [], count: 0, soil: 0 });
    expect(buildPantry(acts, map)).toEqual([]);
    expect(sportsToAdd(map, "ride")).toContain("run");
    expect(freeCrops(map)).toHaveLength(CROPS.length);
  });
  it("grows only the sports added", () => {
    const map = addSport(cropMap(null), "swim", "carrot");
    expect(buildGarden(acts, today, map).beds.map((b) => [b.sport, b.crop])).toEqual([
      ["swim", "carrot"],
    ]);
    expect(sportOf({ type: "Run" }, map)).toBeNull();
    expect(sportsToAdd(map, "ride")).not.toContain("swim");
    expect(buildGarden(acts, today, removeSport(map, "swim")).count).toBe(0);
  });
  it("won't add a sport twice, or a crop another bed grows", () => {
    const map = addSport(cropMap(null), "swim", "carrot");
    expect(addSport(map, "swim", "lettuce")).toBe(map);
    expect(addSport(map, "ski", "carrot")).toBe(map);
  });
  it("gives a new sport a bed, with a crop no other bed grows", () => {
    const map = growNewSports(cropMap(null), acts, "ride");
    const sports = allSports(map, "ride");
    expect(sports).toEqual(expect.arrayContaining(["run", "swim", "custom:tennis"]));
    expect(sports).toHaveLength(3);
    expect(customSports(map)[0]!.name).toBe("Tennis");
    const crops = sports.map((s) => cropFor(map, s));
    expect(new Set(crops).size).toBe(3);
    // Every activity but the ride now grows.
    expect(buildGarden(acts, today, map).count).toBe(3);
  });
  it("picks at random among the free crops", () => {
    const low = growNewSports(cropMap(null), [acts[0]!], "ride", () => 0);
    const high = growNewSports(cropMap(null), [acts[0]!], "ride", () => 0.999);
    expect(low.run).toBe(CROPS[0]);
    expect(high.run).toBe(CROPS.at(-1));
    const added = growNewSports(low, [acts[0]!, acts[1]!], "ride", () => 0);
    expect(added.run).toBe(CROPS[0]);
    expect(added.swim).toBe(CROPS[1]);
  });
  it("changes nothing without a new sport", () => {
    const map = growNewSports(cropMap(null), acts, "ride");
    expect(growNewSports(map, acts, "ride")).toBe(map);
    const empty = cropMap(null);
    expect(growNewSports(empty, [], "ride")).toBe(empty);
  });
  it("clears the beds saved for sports never done, keeping the crops of those done", () => {
    const map = growNewSports({ ...DEFAULT_CROPS, swim: "carrot" }, acts, "ride");
    expect(allSports(map, "ride").sort()).toEqual(["custom:tennis", "run", "swim"]);
    expect(map.swim).toBe("carrot");
    expect(map.run).toBe(DEFAULT_CROPS.run);
    expect(map.ski).toBeUndefined();
    // Only once: a sport added by hand since stays, activities or not.
    const free = freeCrops(map)[0]!;
    const later = addSport(map, "ski", free);
    expect(growNewSports(later, acts, "ride").ski).toBe(free);
  });
  it("leaves a removed sport out until it's added again", () => {
    const map = growNewSports(cropMap(null), acts, "ride");
    const gone = removeSport(removeSport(map, "swim"), "custom:tennis");
    expect(growNewSports(gone, acts, "ride")).toBe(gone);
    expect(sportOf({ type: "Swim" }, gone)).toBeNull();
    expect(sportOf({ type: "Tennis" }, gone)).toBeNull();
    const back = addSport(gone, "swim", "carrot");
    expect(back.skipped).toEqual(["custom:tennis"]);
    expect(sportOf({ type: "Swim" }, back)).toBe("swim");
  });
  it("keeps a sport out with every crop taken, and activities with no type go to other sports", () => {
    const full = CROPS.reduce<CropMap>((m, c, i) => addCustomSport(m, `Sport ${i}`, c), { v: 2 });
    expect(growNewSports(full, acts, "ride")).toBe(full);
    const untyped = growNewSports(cropMap(null), [act("o", "2026-11-01", "Other", 30)], "ride");
    expect(allSports(untyped, "ride")).toEqual(["other"]);
  });
  it("counts what each sport would grow, whatever is added", () => {
    expect(sportCounts(acts, cropMap(null), "ride")).toEqual({ run: 1, swim: 1, other: 1 });
    expect(sportCounts(acts, cropMap(null), "run")).toEqual({ bike: 1, swim: 1, other: 1 });
  });
  it("for a runner, offers cycling and shares its crop key", () => {
    const map = addSport(cropMap(null), "bike", "carrot");
    expect(map.run).toBe("carrot");
    expect(allSports(map, "run")).toEqual(["bike"]);
    expect(sportsToAdd(cropMap(null), "run")).toContain("bike");
    expect(removeSport(map, "bike").run).toBeUndefined();
  });
});

describe("a sport of your own", () => {
  const padel = addCustomSport(DEFAULT_CROPS, "Padel", "carrot");
  const id = "custom:padel";

  it("grows activities of its type, and titled with it among other sports", () => {
    expect(sportOf({ type: "Padel" }, padel)).toBe(id);
    expect(sportOf({ type: "Other", name: "Evening padel with Marco" }, padel)).toBe(id);
    expect(sportOf({ type: "Other", name: "Padella party" }, padel)).toBe("other");
    expect(sportOf({ type: "Tennis" }, padel)).toBe("other");
  });
  it("leaves rides alone, and a run stays a run whatever its title", () => {
    expect(sportOf({ type: "Ride", name: "Padel" }, padel)).toBeNull();
    expect(sportOf({ type: "Run", name: "Run to padel" }, padel)).toBe("run");
  });
  it("can take a usual sport's type for itself", () => {
    const trail = addCustomSport(DEFAULT_CROPS, "Trail run", "carrot");
    expect(sportOf({ type: "TrailRun" }, trail)).toBe("custom:trailrun");
    expect(sportOf({ type: "Run" }, trail)).toBe("run");
  });
  it("has its own bed in the garden and its own layer in the pantry", () => {
    const acts = [act("p", "2026-11-02", "Padel", 60), act("r", "2026-11-02", "Run", 40)];
    const bed = buildGarden(acts, today, padel).beds.find((b) => b.sport === id)!;
    expect(bed).toMatchObject({ name: "Padel", crop: "carrot" });
    expect(bed.plants[0]!.fruit).toBe(4);
    expect(buildPantry(acts, padel)[0]!.jars[0]!.bySport[id]).toBe(60);
  });
  it("takes only a free crop, one per name", () => {
    expect(addCustomSport(DEFAULT_CROPS, "Padel", "tomato")).toBe(DEFAULT_CROPS);
    expect(addCustomSport(padel, " PADEL ", "lettuce")).toBe(padel);
    expect(addCustomSport(DEFAULT_CROPS, " - ", "carrot")).toBe(DEFAULT_CROPS);
    expect(freeCrops(padel)).not.toContain("carrot");
  });
  it("swaps crops with the usual sports", () => {
    const next = assignCrop(padel, id, "tomato");
    expect(cropFor(next, id)).toBe("tomato");
    expect(next.run).toBe("carrot");
    expect(cropFor(assignCrop(padel, "run", "carrot"), id)).toBe("tomato");
  });
  it("takes its activities out of the garden when removed, and frees its crop", () => {
    const next = removeSport(padel, id);
    expect(sportOf({ type: "Padel" }, next)).toBeNull();
    expect(freeCrops(next)).toContain("carrot");
  });
  it("suggests what's landing in other sports, and counts what a name would grow", () => {
    const acts = [
      act("a", today, "TableTennis", 30),
      act("b", today, "TableTennis", 30),
      act("c", today, "Tennis", 30),
      act("d", today, "Other", 30),
      act("e", today, "Run", 30),
    ];
    expect(suggestedSports(acts, DEFAULT_CROPS)).toEqual([
      { name: "Table tennis", count: 2 },
      { name: "Tennis", count: 1 },
    ]);
    expect(customSportCount(acts, DEFAULT_CROPS, "Table tennis")).toBe(2);
    expect(customSportCount(acts, DEFAULT_CROPS, "Run")).toBe(1);
    expect(customSportCount(acts, DEFAULT_CROPS, "Padel")).toBe(0);
  });
});
