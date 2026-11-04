import { describe, expect, it } from "vitest";
import { deviceLabel, evenDistance, lapIntervals, localIso, mergeRecords, rideType } from "./fit";

describe("Strava's FIT exports", () => {
  const at = (s: number) => new Date(1_700_000_000_000 + s * 1000);

  it("joins the records that share a timestamp", () => {
    const merged = mergeRecords([
      { timestamp: at(0) },
      { timestamp: at(4), distance: 10 },
      { timestamp: at(4), enhancedAltitude: 210, positionLat: 5 },
      { timestamp: at(4), heartRate: 120 },
      { timestamp: at(5), distance: 12 },
    ]);
    expect(merged).toHaveLength(3);
    expect(merged[1]).toMatchObject({ distance: 10, enhancedAltitude: 210, heartRate: 120 });
  });

  it("evens out a distance that updates every other second, but leaves real stops", () => {
    const d = [0, 10, 10, 20];
    evenDistance([0, 1, 2, 3], d);
    expect(d).toEqual([0, 10, 15, 20]);
    const stop = [10, 10, 10, 20];
    evenDistance([0, 30, 60, 61], stop);
    expect(stop).toEqual([10, 10, 10, 20]);
  });

  it("drops the phantom lap after the last sample", () => {
    const lap = (s: number) => ({ startTime: at(s), totalElapsedTime: 2715, totalTimerTime: 1891 });
    expect(lapIntervals([lap(0), lap(2715)], at(0).getTime(), at(2473).getTime())).toEqual([]);
  });

  it("keeps real laps, cut to the end of the ride", () => {
    const laps = [
      { startTime: at(0), totalElapsedTime: 100 },
      { startTime: at(100), totalElapsedTime: 500 },
    ];
    const out = lapIntervals(laps, at(0).getTime(), at(300).getTime());
    expect(out.map((l) => [l.start_time, l.end_time])).toEqual([
      [0, 100],
      [100, 300],
    ]);
  });
});

describe("FIT helpers", () => {
  it("maps sports to intervals.icu activity types", () => {
    expect(rideType("cycling", "road")).toEqual({ type: "Ride", trainer: false });
    expect(rideType("cycling", "virtualActivity")).toEqual({ type: "VirtualRide", trainer: true });
    expect(rideType("cycling", "indoorCycling")).toEqual({ type: "Ride", trainer: true });
    expect(rideType("cycling", "mountain").type).toBe("MountainBikeRide");
    expect(rideType("running", "generic").type).toBe("Run");
    expect(rideType("crossCountrySkiing", "generic").type).toBe("NordicSki");
  });

  it("names Garmin devices the way Garmin writes them", () => {
    expect(deviceLabel("edge840")).toBe("Edge 840");
    expect(deviceLabel("fr965")).toBe("Forerunner 965");
    expect(deviceLabel("fenix7")).toBe("fēnix 7");
    expect(deviceLabel(undefined)).toBe("");
  });

  it("writes local start times without a zone", () => {
    expect(localIso(new Date(2026, 10, 2, 9, 5, 7))).toBe("2026-11-02T09:05:07");
  });
});
