import { describe, expect, it } from "vitest";
import type { Activity } from "./intervals";
import {
  addCustomSport,
  allSports,
  assignCrop,
  buildGarden,
  buildPantry,
  cropMap,
  cropFor,
  cropOf,
  customSportCount,
  DEFAULT_CROPS,
  freeCrops,
  removeCustomSport,
  resetCrops,
  soilOf,
  sportOf,
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

describe("choosing what grows", () => {
  it("knows each activity's sport, and grows it as the chosen crop", () => {
    expect(sportOf({ type: "TrailRun" })).toBe("run");
    expect(sportOf({ type: "Ride" })).toBeNull();
    const map = cropMap({ run: "strawberry" });
    expect(cropOf({ type: "Run" }, map)).toBe("strawberry");
    expect(cropOf({ type: "Yoga" }, map)).toBe("flowers");
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
  it("keeps every bed different through a reset", () => {
    const next = resetCrops(assignCrop(padel, id, "tomato"));
    expect(next.run).toBe("tomato");
    const crops = allSports(next).map((s) => cropFor(next, s));
    expect(new Set(crops).size).toBe(crops.length);
  });
  it("gives its activities back when removed", () => {
    const next = removeCustomSport(padel, id);
    expect(sportOf({ type: "Padel" }, next)).toBe("other");
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
