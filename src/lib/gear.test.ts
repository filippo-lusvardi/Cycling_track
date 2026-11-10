import { describe, expect, it } from "vitest";
import {
  componentKm,
  current,
  dueOn,
  gearKm,
  gearNamed,
  gearOf,
  kmSinceWash,
  lifetimes,
  makeDefault,
  newGear,
  partsIn,
  replacePart,
  ridesByGear,
  addEvent,
  removeEvent,
  trackPart,
  type Gear,
} from "./gear";

const ride = (id: string, day: string, km: number, type = "Ride", trainer = false) => ({
  id,
  type,
  trainer,
  start_date_local: `${day}T09:00:00`,
  distance: km * 1000,
});

const bike = (over: Partial<Gear> = {}): Gear => ({
  id: "canyon",
  name: "Canyon Ultimate",
  kind: "bike",
  frame: "road",
  slot: "ride",
  isDefault: true,
  startKm: 1000,
  since: "2026-01-01",
  components: [],
  events: [],
  updatedAt: 0,
  ...over,
});

describe("which gear an activity counts on", () => {
  const road = bike();
  const gravel = bike({ id: "grizl", name: "Topstone", isDefault: false, frame: "gravel" });
  const shoes = bike({ id: "peg", name: "Pegasus 41", kind: "shoes", slot: "run", startKm: 0 });
  const gears = [road, gravel, shoes];

  it("goes to the slot's default", () => {
    expect(gearOf(ride("a", "2026-03-01", 50), gears, {})?.id).toBe("canyon");
    expect(gearOf(ride("b", "2026-03-01", 10, "Run"), gears, {})?.id).toBe("peg");
  });

  it("doesn't count before the gear's first day", () => {
    expect(gearOf(ride("a", "2025-12-31", 50), gears, {})).toBeNull();
  });

  it("indoor rides count only on an indoor gear", () => {
    expect(gearOf(ride("a", "2026-03-01", 30, "VirtualRide"), gears, {})).toBeNull();
    expect(gearOf(ride("a", "2026-03-01", 30, "Ride", true), gears, {})).toBeNull();
    const trainer = bike({ id: "rulli", slot: "indoor" });
    expect(gearOf(ride("a", "2026-03-01", 30, "VirtualRide"), [...gears, trainer], {})?.id).toBe(
      "rulli",
    );
  });

  it("an override wins, and null means none", () => {
    expect(gearOf(ride("a", "2026-03-01", 50), gears, { a: "grizl" })?.id).toBe("grizl");
    expect(gearOf(ride("a", "2026-03-01", 50), gears, { a: null })).toBeNull();
    expect(gearOf(ride("a", "2025-03-01", 50), gears, { a: "grizl" })?.id).toBe("grizl");
  });

  it("swims and gym go nowhere", () => {
    expect(gearOf(ride("a", "2026-03-01", 2, "Swim"), gears, {})).toBeNull();
  });
});

describe("km", () => {
  const acts = [
    ride("a", "2026-02-01", 100),
    ride("b", "2026-03-01", 50),
    ride("c", "2026-04-01", 25),
  ];

  it("the gear's km start from what it had", () => {
    const by = ridesByGear(acts, [bike()], {});
    expect(gearKm(bike(), by.get("canyon")!)).toBe(1175);
  });

  it("a part counts from the day it went on until the day it came off", () => {
    let g = replacePart(bike(), "chain", "2026-03-01", {}, 1);
    expect(componentKm(current(g, "chain")!, acts)).toBe(75);
    g = replacePart(g, "chain", "2026-04-01", {}, 2);
    const [life] = lifetimes(g, acts);
    expect(life!.current!.km).toBe(25);
    expect(life!.past.map((p) => p.km)).toEqual([50]);
    expect(life!.usual).toBeNull();
  });

  it("keeps the interval when replaced, and reports what's due", () => {
    let g = replacePart(bike(), "chain", "2026-01-01", { intervalKm: 180 }, 1);
    expect(dueOn(g, acts).map((d) => d.part)).toEqual(["chain"]);
    g = replacePart(g, "chain", "2026-04-01", {}, 2);
    expect(current(g, "chain")!.intervalKm).toBe(180);
    expect(dueOn(g, acts)).toEqual([]);
  });

  it("a part already on the bike starts from its own km", () => {
    const g = trackPart(bike(), "tyreR", "2026-03-15", 2000, 4000, 1);
    expect(lifetimes(g, acts)[0]!.current).toMatchObject({ km: 2025, interval: 4000 });
  });

  it("usual life from two past parts", () => {
    let g = replacePart(bike(), "chain", "2026-01-01", {}, 1);
    g = replacePart(g, "chain", "2026-03-01", {}, 2);
    g = replacePart(g, "chain", "2026-04-01", {}, 3);
    expect(lifetimes(g, acts)[0]!.usual).toBe(75);
  });

  it("taking a replacement out of the log puts the old part back", () => {
    let g = replacePart(bike(), "chain", "2026-01-01", {}, 1);
    g = replacePart(g, "chain", "2026-03-01", {}, 2);
    const e = g.events.at(-1)!;
    g = removeEvent(g, e.id, 3);
    expect(g.components).toHaveLength(1);
    expect(current(g, "chain")!.fitted).toBe("2026-01-01");
    expect(g.events).toHaveLength(1);
  });

  it("km since the last wash", () => {
    expect(kmSinceWash(bike(), acts)).toBeNull();
    const g = addEvent(bike(), { date: "2026-03-01", kind: "wash" }, 1);
    expect(kmSinceWash(g, acts)).toBe(25);
  });

  it("shoes are due as a whole", () => {
    const s = bike({ kind: "shoes", slot: "run", startKm: 650, intervalKm: 700 });
    expect(dueOn(s, [])).toHaveLength(1);
  });
});

describe("defaults", () => {
  it("the first of a slot is its default; moving it changes both", () => {
    const a = newGear({ name: "A", kind: "bike", slot: "ride" }, [], "2026-01-01");
    const b = newGear({ name: "B", kind: "bike", slot: "ride" }, [a], "2026-01-01");
    expect(a.isDefault).toBe(true);
    expect(b.isDefault).toBe(false);
    const changed = makeDefault([a, b], b.id);
    expect(changed.map((g) => [g.name, g.isDefault])).toEqual([
      ["A", false],
      ["B", true],
    ]);
  });
});

describe("words", () => {
  it("parts, with front and rear", () => {
    expect(partsIn(["catena", "nuova"]).parts).toEqual(["chain"]);
    expect(partsIn(["pastiglie", "freni"]).parts).toEqual(["padsF", "padsR"]);
    expect(partsIn(["gomma", "posteriore"]).parts).toEqual(["tyreR"]);
    expect(partsIn(["front", "tyre"]).parts).toEqual(["tyreF"]);
    expect([...partsIn(["movimento", "centrale"]).used]).toEqual([0, 1]);
  });

  it("gear by name", () => {
    const gears = [bike(), bike({ id: "t", name: "Cannondale Topstone" })];
    expect(gearNamed(gears, ["topstone"])?.gear.id).toBe("t");
    expect(gearNamed(gears, ["canyon"])?.gear.id).toBe("canyon");
    expect(gearNamed(gears, ["la"])).toBeNull();
  });
});
