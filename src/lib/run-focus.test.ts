import { describe, expect, it } from "vitest";
import {
  baseGate,
  computeFocus,
  focusSession,
  focusWhy,
  neglected,
  roleText,
  seasonDemand,
} from "./focus";
import { carbsBurned, intakeTarget, rideFuel, runKcal } from "./fuel";
import type { Activity, PowerCurve } from "./intervals";
import { ceiling, ceilingText } from "./readiness";
import {
  focusesFor,
  parseRace,
  profileFor,
  raceDescription,
  raceFrom,
  raceSport,
  type Race,
} from "./races";
import { fadeProfile, RUN_DUR } from "./run-metrics";

const today = "2026-10-20";
const speed = (k = 1): PowerCurve => ({
  id: "c",
  label: "c",
  secs: RUN_DUR,
  watts: RUN_DUR.map((s) => k * (3.6 + 180 / s)),
});
const race = (over: Partial<Race> = {}): Race => ({
  id: "r",
  date: "2026-11-15",
  name: "Half",
  priority: "A",
  notes: "",
  info: { discipline: "run", kind: "runHalf", minutes: 100, sprint: false },
  ...over,
});
const act = (id: string, type: string, extra: Partial<Activity> = {}) =>
  ({
    id,
    type,
    start_date_local: `${today}T09:00:00`,
    moving_time: 4000,
    icu_intensity: 70,
    decoupling: 8,
    zoneTimes: [100, 3000, 300, 100, 0, 0, 0],
    ...extra,
  }) as Activity;

describe("a runner's focus", () => {
  it("never picks sprint, whatever the curves say", () => {
    expect(focusesFor("run")).not.toContain("sprint");
    expect(seasonDemand([], today, "run").sprint).toBe(0);
    const r = computeFocus({
      races: [],
      today,
      acts: [],
      wellness: [],
      c42: speed(0.9),
      c1y: speed(),
      sport: "run",
    });
    expect(r.focus).not.toBe("sprint");
  });
  it("counts only races in the main sport", () => {
    const bike = race({ info: { discipline: "road", kind: "crit", minutes: null, sprint: false } });
    expect(seasonDemand([bike], today, "run")).toEqual(seasonDemand([], today, "run"));
    expect(seasonDemand([race()], today, "ride")).toEqual(seasonDemand([], today, "ride"));
    expect(seasonDemand([race()], today, "run").base).toBeGreaterThan(
      seasonDemand([], today, "run").base,
    );
  });
  it("looks at runs, not rides, for the base", () => {
    const runs = [act("1", "Run"), act("2", "Run"), act("3", "TrailRun")];
    expect(baseGate(runs, [], today, null, "run")[0]).toContain("drift");
    expect(baseGate(runs, [], today).length).toBe(0);
    const rides = runs.map((a) => ({ ...a, type: "Ride" }));
    expect(baseGate(rides, [], today, null, "run").length).toBe(0);
  });
  it("sends a fading runner to the base", () => {
    const fade = fadeProfile(
      [1, 2, 3].map(() => ({ 0: [4, 3.8], 15: [3.8, 3.6], 25: [3.2, 3], 35: [null, null] })),
    );
    expect(baseGate([], [], today, null, "run", fade)[0]).toContain("25 km");
  });
  it("sees neglected zones in runs only", () => {
    expect(neglected([act("1", "Run")], today, "run")).toContain("vo2");
    expect(neglected([act("1", "Run")], today, "run")).not.toContain("sprint");
    expect(neglected([act("1", "Run")], today)).toEqual([]);
  });
  it("writes sessions in pace, with no watts or FTP anywhere", () => {
    for (const focus of focusesFor("run")) {
      const text = focusSession({
        focus,
        races: [],
        today,
        zones: undefined,
        c1y: speed(),
        sport: "run",
        threshold: 4,
      });
      expect(text).toMatch(/\/km/);
      expect(text).not.toMatch(/\bW\b|FTP|3–4 h/);
    }
    const none = focusSession({
      focus: "vo2",
      races: [],
      today,
      zones: undefined,
      c1y: undefined,
      sport: "run",
      threshold: null,
    });
    expect(none).toContain("% of threshold pace");
  });
  it("trains for the race ahead, on climbs for a trail", () => {
    const text = focusSession({
      focus: "aerobic",
      races: [race()],
      today,
      zones: undefined,
      c1y: speed(),
      sport: "run",
      threshold: 4,
    });
    expect(text).toContain("Race pace for Half");
    const trail = race({
      info: { discipline: "trail", kind: "vertical", minutes: 45, sprint: false },
    });
    expect(
      focusSession({
        focus: "vo2",
        races: [trail],
        today,
        zones: undefined,
        c1y: speed(),
        sport: "run",
        threshold: 4,
      }),
    ).toContain("climb");
  });
  it("speaks of runners and pace", () => {
    const r = computeFocus({
      races: [],
      today,
      acts: [],
      wellness: [],
      c42: speed(0.9),
      c1y: speed(),
      sport: "run",
    });
    const why = focusWhy(r, [], today, "run").join(" ");
    expect(why).toContain("runner");
    expect(why).toContain("pace");
    expect(why).not.toContain("power");
    expect(roleText({ role: "sharpen", race: race(), days: 5 }, "run")).toContain("strides");
  });
});

describe("running races", () => {
  it("survive being written to the calendar and read back", () => {
    for (const info of [
      { discipline: "run", kind: "runMarathon", minutes: 225, sprint: false },
      { discipline: "trail", kind: "trailUltra", minutes: 800, sprint: false },
      { discipline: "trail", kind: "vertical", minutes: null, sprint: false },
    ] as const) {
      expect(parseRace(raceDescription(info, "notes")).info).toEqual(info);
    }
  });
  it("tell a trail ultra from a road ultra, and an MTB marathon from a road one", () => {
    const of = (d: string, k: string) => parseRace(`Discipline: ${d}\nKind: ${k}`).info?.kind;
    expect(of("Run", "Ultra")).toBe("runUltra");
    expect(of("Trail", "Ultra")).toBe("trailUltra");
    expect(of("Run", "Marathon")).toBe("runMarathon");
    expect(of("MTB", "Marathon")).toBe("marathon");
  });
  it("still read races from before", () => {
    expect(parseRace("Kind: Road race").info?.discipline).toBe("road");
  });
  it("know their sport, by their event when no kind is set", () => {
    expect(raceSport(race())).toBe("run");
    expect(raceSport(race({ info: null, type: "TrailRun" }))).toBe("run");
    expect(raceSport(race({ info: null, type: "Ride" }))).toBe("ride");
    const e = {
      id: "1",
      date: today,
      end: null,
      category: "RACE_A",
      type: "Run",
      name: "x",
      description: null,
      moving_time: null,
      icu_training_load: null,
    };
    expect(raceSport(raceFrom(e))).toBe("run");
  });
  it("shift to base as they get longer", () => {
    const of = (minutes: number) =>
      profileFor({ discipline: "run", kind: "run10k", minutes, sprint: false });
    expect(of(20).aerobic).toBeGreaterThan(of(20).base);
    expect(of(600).base).toBeGreaterThan(80);
    expect(of(30).sprint).toBe(0);
  });
});

describe("a runner's ceiling", () => {
  it("is a pace to stay slower than, with heart rate", () => {
    const c = ceiling(60, { power: [], hr: [120, 145] }, 4)!;
    expect(c.pace).toBeCloseTo(3.52);
    expect(ceilingText(c)).toBe("Stay slower than 4:44/km · under 145 bpm");
    expect(ceiling(80, { power: [], hr: [] }, 4)).toBe(null);
  });
  it("leaves a cyclist's as it was", () => {
    expect(ceilingText(ceiling(60, { power: [120, 200], hr: [120, 145] })!)).toBe(
      "Stay under 200 W · 145 bpm",
    );
  });
});

describe("fuelling a run", () => {
  const a = {
    moving_time: 3 * 3600,
    icu_average_watts: 300,
    joules: 3e6,
    calories: 1500,
    icu_intensity: 75,
    zoneTimes: [],
  };
  it("takes energy from distance, climbing and weight", () => {
    expect(runKcal(10000, 70)).toBeCloseTo(602, -1);
    expect(carbsBurned(a, { kcal: 1000 })).toBeCloseTo(150);
  });
  it("doesn't read running power as work, and falls back to the device's calories", () => {
    expect(carbsBurned(a, { kcal: null })).toBeCloseTo(225);
    expect(carbsBurned(a)).toBeCloseTo(450);
  });
  it("asks for less than on a bike", () => {
    expect(intakeTarget(3 * 3600, 0.7, true).high).toBeLessThan(intakeTarget(3 * 3600, 0.7).high);
    expect(intakeTarget(3600, 0.7, true).high).toBe(0);
    expect(rideFuel(a, 1, { kcal: 1000 }).target.high).toBe(225);
  });
});
