import { describe, expect, it } from "vitest";
import { executionOf, type Execution } from "./execution";
import { review, type ReviewInput } from "./evaluate";
import { bestShift, comparePoints, plannedWatts } from "@/components/PlanVsRide";
import type { Rating, SessionOutcome } from "./types";

const ftp = 250;
const WORKOUT =
  "Warmup\n- 15m Ramp 40-60%\n\nMain set 4x\n- 10m 100%\n- 5m 50%\n\nCooldown\n- 10m Ramp 60-40%";
const EASY = "Warmup\n- 10m Ramp 45-60%\n\nMain set\n- 60m 65%\n\nCooldown\n- 5m Ramp 60-45%";

const flat = (seconds: number, w: number | null) => Array.from({ length: seconds }, () => w);
/** A ride of this workout, holding these watts in each 10-minute step. */
const ride = (...steps: number[]) => [
  ...flat(900, 130),
  ...steps.flatMap((w) => [...flat(600, w), ...flat(300, 120)]),
  ...flat(600, 110),
];

describe("comparing a ride with its workout", () => {
  it("gives full marks to a ride on target", () => {
    expect(
      executionOf({ description: WORKOUT, ftp, watts: ride(250, 250, 250, 250) }),
    ).toMatchObject({
      verdict: "on",
      score: 100,
      stepsHit: 4,
      steps: 4,
    });
  });
  it("sees 70 W over target", () => {
    const e = executionOf({ description: WORKOUT, ftp, watts: ride(320, 320, 320, 320) })!;
    expect(e.verdict).toBe("over");
    expect(e.ratio).toBeCloseTo(1.28);
    expect(e.score).toBe(0);
  });
  it("sees a ride well under target, and a step missed", () => {
    const e = executionOf({ description: WORKOUT, ftp, watts: ride(250, 250, 250, 120) })!;
    expect(e.verdict).toBe("under");
    expect(e.stepsHit).toBe(3);
  });
  it("finds the efforts wherever they fell, as on a road", () => {
    const late = [...flat(2000, 130), ...ride(250, 250, 250, 250).slice(900)];
    expect(executionOf({ description: WORKOUT, ftp, watts: late })).toMatchObject({
      verdict: "on",
      stepsHit: 4,
    });
  });
  it("counts a ride cut short as under", () => {
    expect(executionOf({ description: WORKOUT, ftp, watts: flat(1500, 250) })!.verdict).toBe(
      "under",
    );
  });
  it("counts stops as no power", () => {
    const stops = ride(250, 250, 250, 250).map((w, i) => (i % 4 === 0 ? null : w));
    expect(executionOf({ description: WORKOUT, ftp, watts: stops })!.ratio).toBeLessThan(0.92);
  });
  it("uses the whole ride with no stream", () => {
    expect(executionOf({ description: WORKOUT, ftp, weightedWatts: 300 })!.verdict).toBe("over");
    expect(executionOf({ description: WORKOUT, ftp, weightedWatts: 120 })!.verdict).toBe("under");
  });
  it("gives an easy ride more room, and never calls easier a shortfall", () => {
    const fine = 250 * 0.65;
    expect(executionOf({ description: EASY, ftp, weightedWatts: fine * 1.08 })!.verdict).toBe("on");
    expect(executionOf({ description: EASY, ftp, weightedWatts: fine * 1.3 })!.verdict).toBe(
      "over",
    );
    expect(executionOf({ description: EASY, ftp, weightedWatts: fine * 0.7 })!.verdict).toBe("on");
  });
  it("says nothing without power or an FTP, so the rider's word stands", () => {
    expect(executionOf({ description: WORKOUT, ftp: null, watts: ride(250) })).toBeNull();
    expect(executionOf({ description: WORKOUT, ftp })).toBeNull();
    expect(executionOf({ description: WORKOUT, ftp, watts: flat(3600, 0) })).toBeNull();
    expect(executionOf({ description: WORKOUT, ftp, watts: flat(3600, null) })).toBeNull();
    expect(executionOf({ description: "Easy with friends", ftp, weightedWatts: 200 })).toBeNull();
  });
});

describe("what it does to the rider's word", () => {
  const over = executionOf({ description: WORKOUT, ftp, watts: ride(320, 320, 320, 320) });
  const under = executionOf({ description: WORKOUT, ftp, watts: ride(200, 200, 200, 200) });
  const on = executionOf({ description: WORKOUT, ftp, watts: ride(250, 250, 250, 250) });
  const session = (
    rating: Rating | null,
    execution: Execution | null,
    date = "2026-11-09",
  ): SessionOutcome => ({
    date,
    hard: true,
    plannedSeconds: 3600,
    doneSeconds: 3600,
    rating,
    execution,
  });
  const run = (...outcomes: SessionOutcome[]) => {
    const input: ReviewInput = {
      outcomes,
      lowMornings: 0,
      hrvLow: false,
      recoveryWeek: false,
      off: false,
    };
    return review(input);
  };
  const days = ["2026-11-09", "2026-11-11"];

  it("doesn't count too hard after riding 70 W over", () => {
    expect(run(session("harder", over, days[0]), session("harder", over, days[1]))).toEqual({
      result: "hold",
      reason: "went-over",
    });
    expect(run(session("failed", over))).toEqual({ result: "hold", reason: "went-over" });
  });
  it("still lowers when the target was ridden and it was too much", () => {
    expect(run(session("harder", on, days[0]), session("harder", on, days[1])).result).toBe(
      "lower",
    );
    expect(run(session("failed", on)).result).toBe("lower");
    expect(run(session("harder", under, days[0]), session("harder", under, days[1])).result).toBe(
      "lower",
    );
  });
  it("trusts the word when there's no power to compare", () => {
    expect(run(session("failed", null)).result).toBe("lower");
    expect(run(session("expected", null)).result).toBe("raise");
  });
  it("doesn't raise on fine when the ride fell short", () => {
    expect(run(session("expected", under))).toEqual({ result: "hold", reason: "under-target" });
    expect(run(session("easier", under)).result).toBe("hold");
  });
  it("raises on fine, on target or over", () => {
    expect(run(session("expected", on)).result).toBe("raise");
    expect(run(session("easier", over)).result).toBe("raise");
  });
  it("still lowers on low mornings, whatever the power says", () => {
    const input = {
      outcomes: [session("harder", over)],
      lowMornings: 3,
      hrvLow: false,
      recoveryWeek: false,
      off: false,
    };
    expect(review(input).result).toBe("lower");
  });
});

describe("the plot of a ride against its workout", () => {
  const seconds = 900 + 4 * 900 + 600;
  it("holds the whole workout, warm-up, recoveries and cool-down", () => {
    const plan = plannedWatts(WORKOUT, ftp);
    expect(plan).toHaveLength(seconds);
    expect(plan[0]).toBeCloseTo(100, 0);
    expect(plan[899]).toBeCloseTo(150, 0);
    expect(plan[900]).toBe(250);
    expect(plan[1500]).toBe(125);
    expect(plan[seconds - 1]).toBeCloseTo(100, 0);
    const points = comparePoints(ride(250, 250, 250, 250), WORKOUT, ftp);
    expect(points.every((p) => p.target != null)).toBe(true);
    expect(points[points.length - 1]!.min).toBeGreaterThan(80);
  });
  it("lines the workout up with a ride that started late", () => {
    const late = [...flat(600, 100), ...ride(250, 250, 250, 250)];
    const points = comparePoints(late, WORKOUT, ftp);
    expect(points[0]!.target).toBeNull();
    expect(points[(600 + 900 + 60) / 15]!.target).toBe(250);
  });
  it("keeps showing the plan past a ride cut short", () => {
    const points = comparePoints(flat(1500, 250), WORKOUT, ftp);
    expect(points[points.length - 1]!.power).toBeNull();
    expect(points[points.length - 1]!.target).not.toBeNull();
  });
  it("doesn't move a plan as long as the ride", () => {
    expect(bestShift([1, 2, 3], [1, 2, 3])).toBe(0);
    expect(bestShift([0, 0, 1, 2], [1, 2])).toBe(2);
  });
});
