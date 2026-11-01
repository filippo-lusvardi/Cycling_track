import { describe, expect, it } from "vitest";
import {
  baseGate,
  closeness,
  computeFocus,
  dayRole,
  focusSession,
  holdFocus,
  mondayOf,
  powerGaps,
  seasonDemand,
} from "./focus";
import type { Activity, PowerCurve, Wellness } from "./intervals";
import type { Race, RaceInfo } from "./races";
import { addDays } from "./training";

const today = "2026-03-04"; // a Wednesday
const race = (
  id: string,
  inDays: number,
  priority: Race["priority"],
  info: RaceInfo | null,
): Race => ({
  id,
  date: addDays(today, inDays),
  name: id,
  priority,
  info,
  notes: "",
});
const crit: RaceInfo = { discipline: "road", kind: "crit", minutes: null, sprint: false };
const tt = (minutes: number): RaceInfo => ({
  discipline: "road",
  kind: "tt",
  minutes,
  sprint: false,
});

const SECS = [5, 10, 15, 30, 60, 120, 180, 300, 480, 1200, 2400, 3600];
const curve = (id: string, w: (s: number) => number): PowerCurve => ({
  id,
  label: id,
  secs: SECS,
  watts: SECS.map(w),
});
const best = (s: number) => Math.round(1200 * Math.pow(s, -0.25) + 150);

describe("focus", () => {
  it("weighs races fully within 8 weeks, fading to nothing at 20", () => {
    expect(closeness(10)).toBe(1);
    expect(closeness(98)).toBeCloseTo(0.5);
    expect(closeness(150)).toBe(0);
    expect(closeness(-1)).toBe(0);
  });
  it("trains the complete cyclist with no races", () => {
    const d = seasonDemand([], today);
    expect(Object.values(d).every((v) => Math.abs(v - 0.2) < 1e-9)).toBe(true);
  });
  it("adds up every race: several crits pull toward anaerobic, an A time trial toward aerobic", () => {
    const crits = seasonDemand(
      [race("a", 14, "B", crit), race("b", 21, "B", crit), race("c", 28, "C", crit)],
      today,
    );
    expect(crits.anaerobic).toBeGreaterThan(crits.aerobic);
    const tt60 = seasonDemand([race("t", 30, "A", tt(60))], today);
    expect(tt60.aerobic).toBeGreaterThan(tt60.anaerobic);
  });
  it("finds the gap against your own year", () => {
    const { ratio } = powerGaps(
      curve("42d", (s) => (s >= 180 && s <= 480 ? best(s) * 0.9 : best(s))),
      curve("1y", best),
    );
    expect(ratio.vo2).toBeCloseTo(0.9, 2);
    expect(ratio.aerobic).toBe(1);
  });
  it("picks the gap the races need over a bigger one they don't", () => {
    // Sprint is 12% down, 20–40 min power 5% down; an A time trial of an hour is coming.
    const c42 = curve("42d", (s) => best(s) * (s <= 15 ? 0.88 : s >= 1200 && s <= 2400 ? 0.95 : 1));
    const r = computeFocus({
      races: [race("t", 30, "A", tt(60))],
      today,
      acts: [],
      wellness: [],
      c42,
      c1y: curve("1y", best),
    });
    expect(r.focus).toBe("aerobic");
    const free = computeFocus({
      races: [],
      today,
      acts: [],
      wellness: [],
      c42,
      c1y: curve("1y", best),
    });
    expect(free.focus).toBe("sprint");
  });
  it("puts the base first when fitness is far below your usual", () => {
    const wellness = Array.from(
      { length: 120 },
      (_, i) => ({ id: addDays(today, -i), ctl: i < 7 ? 30 : 60 }) as Wellness,
    );
    expect(baseGate([], wellness, today)).toHaveLength(1);
    const r = computeFocus({
      races: [race("a", 14, "A", crit)],
      today,
      acts: [],
      wellness,
      c42: undefined,
      c1y: undefined,
    });
    expect(r.focus).toBe("base");
  });
  it("puts the base first when steady rides decouple", () => {
    const ride = (i: number) =>
      ({
        id: `r${i}`,
        type: "Ride",
        start_date_local: `${addDays(today, -i * 3)}T09:00:00`,
        moving_time: 7200,
        icu_intensity: 65,
        decoupling: 8,
        zoneTimes: [],
      }) as unknown as Activity;
    expect(baseGate([1, 2, 3].map(ride), [], today)[0]).toMatch(/decoupling/);
  });
  it("holds a block for two weeks unless the races change", () => {
    const s0 = holdFocus(null, "vo2", today, "k");
    expect(s0.blocks).toEqual([{ focus: "vo2", since: mondayOf(today) }]);
    expect(holdFocus(s0, "sprint", addDays(today, 7), "k")).toBe(s0);
    const later = holdFocus(s0, "sprint", addDays(today, 14), "k");
    expect(later.blocks.map((b) => b.focus)).toEqual(["vo2", "sprint"]);
    expect(holdFocus(s0, "sprint", addDays(today, 2), "k2").blocks.map((b) => b.focus)).toEqual([
      "sprint",
    ]);
  });
  it("knows race day, the day after, the A taper and the B easy days", () => {
    expect(dayRole([race("r", 0, "C", crit)], today)!.role).toBe("race");
    expect(dayRole([race("r", -1, "C", crit)], today)!.role).toBe("recovery");
    expect(dayRole([race("r", 9, "A", crit)], today)).toMatchObject({ role: "sharpen", days: 9 });
    expect(dayRole([race("r", 9, "B", crit)], today)).toBeNull();
    expect(dayRole([race("r", 2, "B", crit)], today)).toMatchObject({ role: "ease", days: 2 });
    expect(dayRole([race("r", 2, "C", crit)], today)).toBeNull();
  });
  it("sets race-pace efforts for a timed race and adds sprints for a sprint finish", () => {
    const c1y = curve("1y", best);
    const climb = focusSession({
      focus: "vo2",
      races: [race("Climb", 20, "A", tt(12))],
      today,
      zones: undefined,
      c1y,
    });
    expect(climb).toMatch(/Race pace for Climb \(12 min\): 3×10 min/);
    // An anaerobic block doesn't turn into climb pacing: a 12-minute effort is mostly aerobic and VO2max.
    const anaerobic = focusSession({ focus: "anaerobic", races: [race("Climb", 20, "A", tt(12))], today, zones: undefined, c1y });
    expect(anaerobic).toMatch(/^6×1 min/);
    const gf = {
      discipline: "road" as const,
      kind: "granfondo" as const,
      minutes: null,
      sprint: true,
    };
    const s = focusSession({
      focus: "aerobic",
      races: [race("GF", 20, "B", gf)],
      today,
      zones: { ftp: 300, power: [], hr: [] },
      c1y,
    });
    expect(s).toMatch(/285–300 W/);
    expect(s).toMatch(/3×15 s sprints/);
  });
});
