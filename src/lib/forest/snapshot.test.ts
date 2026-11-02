import { describe, expect, it } from "vitest";
import type { Activity, Wellness } from "../intervals";
import { bestShared } from "./leaderboard";
import { fingerprint, fromSnapshot, offStretches, toSharedRide, yearDocs } from "./snapshot";
import { isShared } from "./visibility";

const act = (id: string, date: string): Activity => ({
  id,
  name: id,
  type: "Ride",
  start_date_local: `${date}T09:00:00`,
  distance: 40000,
  moving_time: 5400,
  total_elevation_gain: 800,
  icu_training_load: 90,
  icu_average_watts: 210,
  icu_weighted_avg_watts: 230,
  average_heartrate: 150,
  max_heartrate: 180,
  icu_intensity: 85,
  calories: 1200,
  average_speed: 7.4,
  zoneTimes: [1, 2, 3, 4, 5, 6, 7],
  decoupling: 3,
  efficiency: null,
  trainer: false,
  feel: 2,
  brioches: 1,
  garmin: "Garmin Edge 840",
});
const well = (id: string, ctl: number, atl: number) => ({ id, ctl, atl }) as Wellness;

describe("forest snapshot", () => {
  it("shares only what the tree draws: no heart rate, power, zones or device", () => {
    const r = toSharedRide(act("a", "2026-10-01"));
    expect(Object.keys(r).sort()).toEqual(
      [
        "brioches",
        "distance",
        "icu_intensity",
        "icu_training_load",
        "id",
        "moving_time",
        "name",
        "start_date_local",
        "total_elevation_gain",
        "trainer",
        "type",
      ].sort(),
    );
  });

  it("splits rides and fitness by year, indexed by day of the year", () => {
    const years = yearDocs(
      [toSharedRide(act("a", "2025-12-31")), toSharedRide(act("b", "2026-01-02"))],
      [well("2025-12-31", 50, 60), well("2026-01-02", 51.23, 62)],
    );
    expect(Object.keys(years).sort()).toEqual(["2025", "2026"]);
    expect(years["2025"]!.ctl[364]).toBe(50);
    expect(years["2026"]!.ctl).toEqual([null, 51.2]);
  });

  it("comes back as tree inputs on a friend's device", () => {
    const years = yearDocs([toSharedRide(act("a", "2026-03-05"))], [well("2026-03-05", 40, 45)]);
    const header = {
      crown: null,
      day: "2026-03-05",
      years: ["2026"],
      off: offStretches([
        {
          id: "x",
          date: "2026-02-01",
          end: "2026-02-03",
          category: "SICK",
          type: null,
          name: null,
          description: null,
          moving_time: null,
          icu_training_load: null,
        },
      ]),
      updatedAt: 0,
    };
    const back = fromSnapshot(header, years);
    expect(back.acts[0]!.average_heartrate).toBeNull();
    expect(back.acts[0]!.icu_training_load).toBe(90);
    expect(back.wellness).toEqual([
      expect.objectContaining({ id: "2026-03-05", ctl: 40, atl: 45 }),
    ]);
    expect(back.off[0]).toEqual(
      expect.objectContaining({ date: "2026-02-01", end: "2026-02-03", category: "SICK" }),
    );
    expect(back.crown).toBeNull();
  });

  it("fingerprints change with content only", () => {
    expect(fingerprint({ a: 1 })).toBe(fingerprint({ a: 1 }));
    expect(fingerprint({ a: 1 })).not.toBe(fingerprint({ a: 2 }));
  });
});

describe("visibility and leaderboard", () => {
  it("follows the forest's default unless the ride says otherwise", () => {
    const o = { r1: { f1: false }, r2: { f1: true } };
    expect(isShared("r1", "f1", true, o)).toBe(false);
    expect(isShared("r2", "f1", false, o)).toBe(true);
    expect(isShared("r3", "f1", true, o)).toBe(true);
    expect(isShared("r1", "f2", false, o)).toBe(false);
  });

  it("takes the best time among shared rides only", () => {
    const at = (trackId: string, duration: number) =>
      ({ trackId, duration }) as Parameters<typeof bestShared>[0][number];
    const tries = [at("hidden", 900), at("a", 1000), at("b", 950)];
    expect(bestShared(tries, (id) => id !== "hidden")?.trackId).toBe("b");
    expect(bestShared(tries, () => false)).toBeNull();
  });
});
