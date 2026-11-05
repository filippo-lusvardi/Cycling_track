import { describe, expect, it } from "vitest";
import type { Activity, OffKind, PlannedEvent, Wellness } from "./intervals";
import { buildRecap } from "./recap";

const today = "2026-11-05";
const act = (date: string, secs: number, km: number, climb: number, load: number, type = "Ride") =>
  ({
    id: date + type,
    type,
    name: "x",
    start_date_local: `${date}T09:00:00`,
    moving_time: secs,
    distance: km * 1000,
    total_elevation_gain: climb,
    icu_training_load: load,
    zoneTimes: [10, 70, 10, 5, 5, 0, 0],
  }) as unknown as Activity;
const acts = [
  act("2026-11-05", 3600, 30, 300, 50),
  act("2026-11-03", 7200, 60, 900, 100),
  act("2026-11-01", 1800, 6, 50, 20, "Run"),
  act("2026-10-28", 3600, 30, 100, 40),
];
const well = (id: string, ctl: number) =>
  ({ id, ctl, hrv: 60, sleepSecs: 25200 }) as unknown as Wellness;
const wellness = [
  well("2026-10-30", 30),
  well("2026-11-02", 31),
  well("2026-11-05", 33),
  well("2026-10-01", 28),
];
const plan = (date: string, name: string, secs: number, category = "WORKOUT") =>
  ({
    id: date,
    date,
    end: null,
    category,
    type: "Ride",
    name,
    description: null,
    moving_time: secs,
    icu_training_load: 80,
  }) as PlannedEvent;

const recap = (
  from: string,
  to: string,
  off = new Map<string, OffKind>(),
  events: PlannedEvent[] = [],
) => buildRecap({ span: { from, to }, today, acts, wellness, events, off });

describe("buildRecap", () => {
  it("adds up the stretch", () => {
    const r = recap("2026-10-30", today);
    expect(r.totals).toEqual({ count: 3, secs: 12600, km: 96, climb: 1250, load: 170 });
    expect(r.pastDays).toBe(7);
    expect(r.acts[0]!.start_date_local.startsWith("2026-11-05")).toBe(true);
  });

  it("counts rest and sick days apart", () => {
    const off = new Map<string, OffKind>([["2026-11-02", "SICK"]]);
    const r = recap("2026-10-30", today, off);
    expect(r.offDays.sick).toBe(1);
    expect(r.restDays).toBe(3);
  });

  it("reads the body and the fitness change", () => {
    const r = recap("2026-10-30", today);
    expect(r.sleepSecs).toBe(25200);
    expect(r.ctl).toEqual({ from: 30, to: 33 });
    expect(r.usualHrv).toBe(60);
  });

  it("compares only with your own stretch before", () => {
    const r = recap("2026-10-30", today);
    expect(r.before!.span).toEqual({ from: "2026-10-23", to: "2026-10-29" });
    expect(r.before!.totals.count).toBe(1);
    expect(recap(today, today).before).toBeNull();
  });

  it("shows what's planned ahead and nothing lived", () => {
    const r = recap("2026-11-06", "2026-11-06", new Map(), [
      plan("2026-11-06", "Fondo", 7800),
      plan("2026-11-08", "Altro", 3600),
    ]);
    expect(r.planned.map((e) => e.name)).toEqual(["Fondo"]);
    expect(r.plannedSecs).toBe(7800);
    expect(r.acts).toEqual([]);
    expect(r.pastDays).toBe(0);
    expect(r.restDays).toBe(0);
  });

  it("drops today's plan once today has an activity, and keeps races", () => {
    const r = recap("2026-11-05", "2026-11-15", new Map(), [
      plan(today, "Oggi", 3600),
      plan("2026-11-15", "Lago", 0, "RACE_B"),
    ]);
    expect(r.planned.map((e) => e.name)).toEqual(["Lago"]);
  });

  it("gives long stretches a shape", () => {
    expect(recap("2026-10-01", "2026-10-31").weeks.length).toBe(5);
    expect(recap("2026-10-30", today).weeks).toEqual([]);
  });

  it("is plainly empty when nothing happened", () => {
    const r = recap("2026-01-01", "2026-01-07");
    expect(r.totals.count).toBe(0);
    expect(r.restDays).toBe(7);
    expect(r.mix).toBeNull();
  });
});
