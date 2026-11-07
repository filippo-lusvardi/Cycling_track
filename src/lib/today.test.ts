import { describe, expect, it } from "vitest";
import type { Activity, PlannedEvent } from "./intervals";
import { intensityOf, pendingSessions, planClash, topZone, upcomingDays } from "./today";
import type { WorkoutBlock } from "./workout";

const event = (over: Partial<PlannedEvent> = {}): PlannedEvent => ({
  id: "1",
  date: "2026-11-07",
  end: null,
  category: "WORKOUT",
  type: "Ride",
  name: "VO2max",
  description: null,
  moving_time: 3600,
  icu_training_load: 70,
  ...over,
});
const ride = { type: "Ride" } as Activity;
const block = (seconds: number, zone: number | null) => ({ seconds, zone }) as WorkoutBlock;

describe("pendingSessions", () => {
  it("keeps a session with nothing done yet", () => {
    expect(pendingSessions([event()], [])).toHaveLength(1);
  });
  it("drops a session once paired, or once that sport was done today", () => {
    expect(pendingSessions([event({ pairedActivityId: "a" })], [])).toEqual([]);
    expect(pendingSessions([event()], [ride])).toEqual([]);
  });
  it("keeps a ride when only the gym was done", () => {
    expect(pendingSessions([event()], [{ type: "WeightTraining" } as Activity])).toHaveLength(1);
  });
  it("leaves races to the race text", () => {
    expect(pendingSessions([event({ category: "RACE_A" })], [])).toEqual([]);
  });
});

describe("planClash", () => {
  it("reads the top of the advised zones", () => {
    expect(topZone("Z3–Z4")).toBe(4);
    expect(topZone("Riposo")).toBe(0);
  });
  it("flags real time above the day's zones", () => {
    expect(planClash([block(1200, 5)], "Z2")).toBe(true);
    expect(planClash([block(1200, 5)], "Z4–Z5")).toBe(false);
  });
  it("ignores strides and steps with no target", () => {
    expect(planClash([block(3600, 2), block(120, 6)], "Z2")).toBe(false);
    expect(planClash([block(3600, null)], "Z1")).toBe(false);
  });
});

describe("upcomingDays", () => {
  const dates = ["2026-11-08", "2026-11-09"];
  it("lists each day, planned or not", () => {
    const days = upcomingDays([event({ date: "2026-11-09" })], dates);
    expect(days.map((d) => d.event?.name ?? null)).toEqual([null, "VO2max"]);
  });
  it("is empty with nothing planned", () => {
    expect(upcomingDays([], dates)).toEqual([]);
  });
});

it("intensityOf turns load and length back into intensity", () => {
  expect(intensityOf(100, 3600)).toBeCloseTo(1);
  expect(intensityOf(50, 0)).toBe(0);
});
