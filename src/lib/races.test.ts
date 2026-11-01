import { describe, expect, it } from "vitest";
import type { PlannedEvent } from "./intervals";
import {
  FOCUSES,
  KINDS,
  parseMinutes,
  parseRace,
  profileFor,
  raceDescription,
  raceFrom,
  raceSummary,
  timeProfile,
  withSprint,
  type Profile,
  type RaceKind,
} from "./races";

const total = (p: Profile) => FOCUSES.reduce((s, f) => s + p[f], 0);

describe("race profiles", () => {
  it("every kind sums to 100", () => {
    for (const k of Object.keys(KINDS) as RaceKind[])
      expect(
        total(
          profileFor({ discipline: KINDS[k].discipline, kind: k, minutes: null, sprint: false }),
        ),
      ).toBeCloseTo(100);
  });
  it("a timed effort follows its length: 3 min is VO2max and anaerobic, 1 h is aerobic", () => {
    const short = timeProfile(3);
    const long = timeProfile(60);
    expect(short.vo2 + short.anaerobic).toBeGreaterThan(60);
    expect(long.aerobic + long.base).toBeGreaterThan(80);
    expect(total(timeProfile(7))).toBeCloseTo(100);
  });
  it("blends between bands instead of jumping", () => {
    const [a, b] = [timeProfile(7.5), timeProfile(8.5)];
    for (const f of FOCUSES) expect(Math.abs(a[f] - b[f])).toBeLessThan(4);
  });
  it("a sprint finish moves 15 points to sprint and anaerobic, keeping the total", () => {
    const gf = profileFor({ discipline: "road", kind: "granfondo", minutes: null, sprint: true });
    expect(gf.sprint).toBe(10);
    expect(gf.anaerobic).toBeCloseTo(13.5);
    expect(gf.base).toBeCloseTo(34);
    expect(total(withSprint(KINDS.crit.profile!))).toBeCloseTo(100);
  });
  it("timed kinds ignore the sprint finish", () => {
    const a = profileFor({ discipline: "road", kind: "tt", minutes: 20, sprint: true });
    expect(a).toEqual(timeProfile(20));
  });
});

describe("race description", () => {
  it("reads estimated times in several ways", () => {
    expect(parseMinutes("12")).toBe(12);
    expect(parseMinutes("12 min")).toBe(12);
    expect(parseMinutes("1h30")).toBe(90);
    expect(parseMinutes("1:05")).toBe(65);
    expect(parseMinutes("2 h")).toBe(120);
    expect(parseMinutes("soon")).toBeNull();
  });
  it("writes and reads back its lines, keeping the notes", () => {
    const info = {
      discipline: "mtb" as const,
      kind: "mtbclimb" as const,
      minutes: 90,
      sprint: false,
    };
    const d = raceDescription(info, "Bring spare tubes");
    expect(d).toBe("Discipline: MTB\nKind: Hill climb\nEstimated time: 1h30\n\nBring spare tubes");
    expect(parseRace(d)).toEqual({ info, notes: "Bring spare tubes" });
  });
  it("tells road and MTB hill climbs apart, and reads a sprint finish", () => {
    expect(parseRace("Kind: Hill climb")!.info!.kind).toBe("climb");
    expect(parseRace("Discipline: Road\nKind: Granfondo\nSprint finish: yes")!.info).toEqual({
      discipline: "road",
      kind: "granfondo",
      minutes: null,
      sprint: true,
    });
  });
  it("leaves races without a kind unset", () => {
    expect(parseRace("Just a note").info).toBeNull();
    expect(parseRace(null)).toEqual({ info: null, notes: "" });
  });
  it("turns a RACE_B event into a race", () => {
    const e: PlannedEvent = {
      id: "7",
      date: "2026-05-10",
      end: null,
      category: "RACE_B",
      type: "Ride",
      name: "Crit di primavera",
      description: "Kind: Criterium\nSprint finish: yes",
      moving_time: null,
      icu_training_load: null,
    };
    const r = raceFrom(e);
    expect(r.priority).toBe("B");
    expect(raceSummary(r)).toBe("Criterium · sprint finish · B");
  });
});
