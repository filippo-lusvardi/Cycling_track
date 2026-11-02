import { describe, expect, it } from "vitest";
import { effortOf, ridePage, trimEnds } from "./rides";
import type { SharedRide } from "./types";

const track = (km: number) => {
  const n = km * 50 + 1; // a point every 20 m
  const dist = Array.from({ length: n }, (_, i) => i * 20);
  return {
    lat: dist.map((d) => 46 + d / 1e5),
    lng: dist.map(() => 11),
    dist,
    alt: dist.map((d) => 200 + d / 20),
  };
};
const ride: SharedRide = {
  id: "r",
  name: "Bondone",
  type: "Ride",
  start_date_local: "2026-10-12T09:00:00",
  moving_time: 3600,
  distance: 40000,
  total_elevation_gain: 1300,
  icu_training_load: 90,
  icu_intensity: 80,
  trainer: false,
  brioches: 0,
};

describe("ride pages for the forest", () => {
  it("cuts the first and last kilometre off the route", () => {
    const r = trimEnds(track(10))!;
    expect(r.lat[0]).toBeCloseTo(46.01, 5); // 1000 m in
    expect(r.lat.at(-1)).toBeCloseTo(46.09, 5); // 1000 m before the end
    expect(r.dist[0]).toBe(0);
    expect(r.dist.at(-1)).toBe(8000);
  });

  it("shows no route for short rides, indoor rides, or when maps aren't shared", () => {
    expect(trimEnds(track(2))).toBeNull();
    expect(ridePage(ride, null, true).route).toBeNull();
    expect(ridePage(ride, track(10), false).route).toBeNull();
  });

  it("thins long routes and keeps the summary", () => {
    const p = ridePage(ride, track(60), true);
    expect(p.route!.lat.length).toBe(400);
    expect(p.name).toBe("Bondone");
  });
});

describe("effortOf", () => {
  const a = {
    average_heartrate: 148.6,
    max_heartrate: 181,
    icu_average_watts: 212.4,
    icu_weighted_avg_watts: 236,
  };
  it("rounds the ride's numbers and takes max power from the track", () => {
    expect(effortOf(a, { watts: [100, null, 640, 300] })).toEqual({
      avgHr: 149,
      maxHr: 181,
      avgWatts: 212,
      maxWatts: 640,
      np: 236,
    });
  });
  it("leaves max power out without a track, and is null when nothing was recorded", () => {
    expect(effortOf(a, null)?.maxWatts).toBeNull();
    const none = {
      average_heartrate: null,
      max_heartrate: null,
      icu_average_watts: null,
      icu_weighted_avg_watts: null,
    };
    expect(effortOf(none, { watts: [null, 0] })).toBeNull();
  });
});
