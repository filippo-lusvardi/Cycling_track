import { describe, expect, it } from "vitest";
import { WORKOUT_LIBRARY } from "./workout-library-data";
import { WORKOUT_KINDS, workoutTemplates, workoutText } from "./workout-templates";
import { estimateLoad, hasBlocks, parseWorkout, powerZone, stepWatts } from "./workout";

const one = (line: string, th = {}, sport: "ride" | "run" = "ride") =>
  parseWorkout(line, sport, th).blocks[0]!;

describe("the starter workouts", () => {
  it("read completely, every step with a target, in both sports", () => {
    for (const sport of ["ride", "run"] as const)
      for (const w of workoutTemplates(sport)) {
        const p = parseWorkout(workoutText(w), sport, { ftp: 250, pace: 4 });
        expect(p.unread, w.id).toEqual([]);
        expect(
          p.blocks.every((b) => b.zone != null),
          w.id,
        ).toBe(true);
        expect(p.totalSeconds, w.id).toBeGreaterThanOrEqual(12 * 60);
      }
  });
  it("last as long as the files they came from", () => {
    expect(WORKOUT_LIBRARY).toHaveLength(72);
    for (const w of WORKOUT_LIBRARY) {
      const p = parseWorkout(w.steps.replace(/\{\w+\} /g, ""), "ride");
      expect(p.totalSeconds, w.id).toBe(w.seconds);
    }
  });
  it("keep their labels as steps, in either language, and never name Zwift", () => {
    const aero = workoutTemplates("ride").find((w) => w.id === "d-aero-builder-60")!;
    expect(parseWorkout(aero.text(), "ride").blocks.some((b) => b.label === "Aero")).toBe(true);
    expect(aero.text()).not.toContain("{");
    for (const w of WORKOUT_LIBRARY) {
      expect(w.name[0] && w.name[1] && w.about[0] && w.about[1], w.id).toBeTruthy();
      expect(JSON.stringify(w), w.id).not.toMatch(/zwift/i);
    }
  });
  it("all have a kind that's listed", () => {
    for (const sport of ["ride", "run"] as const)
      for (const w of workoutTemplates(sport)) expect(WORKOUT_KINDS).toContain(w.kind);
    const ids = workoutTemplates("ride").map((w) => w.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("reading a workout", () => {
  it("reads durations in every form", () => {
    expect(one("- 10m 60%").seconds).toBe(600);
    expect(one("- 30s 120%").seconds).toBe(30);
    expect(one("- 1m30 80%").seconds).toBe(90);
    expect(one("- 1h 60%").seconds).toBe(3600);
    expect(one("- 1h30 60%").seconds).toBe(5400);
    expect(one("- 2m30s 80%").seconds).toBe(150);
    expect(one("- 5' 80%").seconds).toBe(300);
  });
  it("reads a range as its middle, and a ramp as its ends", () => {
    expect(one("- 10m 80-90%").from).toBeCloseTo(0.85);
    expect(one("- 10m 80-90%").to).toBeCloseTo(0.85);
    expect(one("- 10m 80-90%").zone).toBe(3);
    expect(one("- 10m Ramp 50-75%")).toMatchObject({ from: 0.5, to: 0.75 });
    expect(one("- Ramp 10m 50-75%")).toMatchObject({ from: 0.5, to: 0.75, label: null });
  });
  it("keeps the words before the duration as the label, and ignores cadence", () => {
    const b = one("- Recovery 30s 50% 90rpm");
    expect(b).toMatchObject({ label: "Recovery", from: 0.5, zone: 1 });
    expect(one("- 4m 100% 40-50 rpm, power matters less").from).toBe(1);
  });
  it("reads zones, watts, heart rate and pace", () => {
    expect(one("- 60m Z2")).toMatchObject({ zone: 2, from: 0.65 });
    expect(one("- 60m Z2 HR").zone).toBe(2);
    expect(one("- 10m 250w", { ftp: 250 })).toMatchObject({ from: 1, zone: 4 });
    expect(one("- 10m 200-300w", { ftp: 250 }).from).toBe(1);
    expect(one("- 10m 90% LTHR").from).toBeCloseTo(0.75);
    expect(one("- 10m 100% LTHR").zone).toBe(4);
    expect(one("- 10m 92% HR").from).toBeCloseTo(1);
    expect(one("- 10m 95% Pace", {}, "run").from).toBe(0.95);
    expect(one("- 10m 4:00/km", { pace: 1000 / 240 }, "run").from).toBeCloseTo(1);
    expect(one("- 10m 4:30 Pace", { pace: 1000 / 240 }, "run").from).toBeCloseTo(240 / 270);
  });
  it("draws a step low when a target needs a threshold it hasn't got", () => {
    expect(one("- 10m 250w")).toMatchObject({ zone: null, from: 0.5 });
    expect(one("- 10m 4:00/km", {}, "run")).toMatchObject({ zone: null });
    expect(one("- 20m")).toMatchObject({ zone: null, seconds: 1200 });
  });
  it("times a run's distance by its pace, and can't for a ride", () => {
    expect(one("- 1km 100% Pace", { pace: 4 }, "run").seconds).toBe(250);
    expect(one("- 400mtr 100% Pace", { pace: 4 }, "run").seconds).toBe(100);
    const ride = parseWorkout("- 10km 80%", "ride");
    expect(ride.blocks).toEqual([]);
    expect(ride.unread).toEqual(["- 10km 80%"]);
  });
  it("repeats the steps below a count, until a blank line or a heading", () => {
    const w = parseWorkout(
      `Warmup
- 10m 60%

Main set 3x
- 4m 105%
- 2m 50%

Cooldown
- 5m 50%`,
      "ride",
    );
    expect(w.blocks.map((b) => b.seconds)).toEqual([600, 240, 120, 240, 120, 240, 120, 300]);
    expect(w.totalSeconds).toBe(600 + 3 * 360 + 300);
    expect(w.notes).toEqual(["Warmup", "Cooldown"]);
    const bare = parseWorkout("2x\n- 1m 100%\n- 1m 50%\n- 1m 60%", "ride");
    expect(bare.blocks).toHaveLength(6);
  });
  it("keeps what it can't read", () => {
    const w = parseWorkout("Bring water\n- plenty of gels\n- 10m 60%", "ride");
    expect(w.notes).toEqual(["Bring water"]);
    expect(w.unread).toEqual(["- plenty of gels"]);
    expect(w.blocks).toHaveLength(1);
  });
  it("has nothing to draw for plain text, or steps with no target", () => {
    expect(hasBlocks(parseWorkout("Easy spin with friends", "ride"))).toBe(false);
    expect(hasBlocks(parseWorkout(null, "ride"))).toBe(false);
    expect(hasBlocks(parseWorkout("- 10m stretching", "ride"))).toBe(false);
    expect(hasBlocks(parseWorkout("- 10m 60%", "ride"))).toBe(true);
  });
  it("estimates load as TSS does", () => {
    expect(estimateLoad(parseWorkout("- 1h 100%", "ride").blocks)).toBe(100);
    expect(estimateLoad(parseWorkout("- 1h 50%", "ride").blocks)).toBe(25);
    // A ramp from 0 to 100%: the average of intensity² is a third.
    expect(estimateLoad(parseWorkout("- 1h Ramp 0-100%", "ride").blocks)).toBe(33);
  });
  it("colours by Coggan's zones", () => {
    expect([0.5, 0.7, 0.8, 1, 1.1, 1.3, 1.6].map((f) => powerZone(f, 1))).toEqual([
      1, 2, 3, 4, 5, 6, 7,
    ]);
  });
});

describe("a step's watts", () => {
  const watts = (line: string, sport: "ride" | "run" = "ride") =>
    stepWatts(one(line, { ftp: 250, pace: 4 }, sport), 250);

  it("works out percentages from the FTP", () => {
    expect(watts("- 5m 105%")).toBe("263W");
    expect(watts("- 5m 88-92%")).toBe("220–230W");
  });

  it("reads a decimal percentage whole", () => {
    expect(one("- 1m 112.9%").from).toBeCloseTo(1.129);
    expect(watts("- 1m 112.9%")).toBe("282W");
  });

  it("gives a ramp its start and end", () => {
    expect(watts("- 6m Ramp 45-70%")).toBe("113 → 175W");
    expect(watts("- 3m Ramp 60-45%")).toBe("150 → 113W");
  });

  it("gives a zone its whole range, open at both ends of the scale", () => {
    expect(watts("- 10m Z2")).toBe("138–188W");
    expect(watts("- 10m Z2-Z3")).toBe("138–225W");
    expect(watts("- 4m Z1")).toBe("≤138W");
    expect(watts("- 20s Z7")).toBe("≥375W");
  });

  it("keeps watts as written", () => {
    expect(watts("- 5m 280W")).toBe("280W");
    expect(watts("- 5m 280-300W")).toBe("280–300W");
  });

  it("doesn't pretend heart rate, pace or nothing are watts", () => {
    expect(watts("- 10m 85% LTHR")).toBeNull();
    expect(watts("- 10m 90% pace")).toBeNull();
    expect(watts("- 10m 4:30/km")).toBeNull();
    expect(watts("- 10m easy")).toBeNull();
  });
});

describe("a workout's sets", () => {
  it("keeps repeats folded, as written", () => {
    const w = parseWorkout(
      "Warmup\n- 10m 60%\n\nMain set 4x\n- 5m 105%\n- 3m 55%\n\n- 8m 50%",
      "ride",
    );
    expect(w.sets.map((s) => [s.reps, s.steps.length])).toEqual([
      [1, 1],
      [4, 2],
      [1, 1],
    ]);
    expect(w.blocks.length).toBe(10);
  });
});
