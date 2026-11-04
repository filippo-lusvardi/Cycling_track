import { describe, expect, it } from "vitest";
import type { RideStreams } from "./intervals";
import {
  bestCurve,
  estimateFtp,
  fitnessSeries,
  normalizedPower,
  rideMetrics,
  toOneHz,
  zoneTimes,
} from "./metrics";

const ride = (secs: number, watts: (i: number) => number | null, hr = 140): RideStreams => ({
  time: Array.from({ length: secs }, (_, i) => i),
  distance: Array.from({ length: secs }, (_, i) => i * 8),
  altitude: Array.from({ length: secs }, () => 100),
  watts: Array.from({ length: secs }, (_, i) => watts(i)),
  heartrate: Array.from({ length: secs }, () => hr),
  cadence: Array.from({ length: secs }, () => 90),
  lat: [],
  lng: [],
});

describe("toOneHz", () => {
  it("fills 1 s samples from sparser recording and leaves long stops empty", () => {
    const s = toOneHz({
      ...ride(0, () => 0),
      time: [0, 2, 30],
      distance: [0, 10, 20],
      altitude: [1, 1, 1],
      watts: [100, 200, 300],
      heartrate: [],
      cadence: [],
      lat: [],
      lng: [],
    });
    expect(s.time).toHaveLength(31);
    expect(s.watts.slice(0, 4)).toEqual([100, 100, 200, 200]);
    expect(s.watts[20]).toBeNull();
    expect(s.watts[30]).toBe(300);
  });
});

describe("toOneHz distance", () => {
  it("runs on between sparse samples, and holds across a long stop", () => {
    const s = toOneHz({
      ...ride(0, () => 0),
      time: [0, 4, 34],
      distance: [0, 40, 80],
      altitude: [],
      watts: [],
      heartrate: [],
      cadence: [],
    });
    expect(s.distance.slice(0, 5)).toEqual([0, 10, 20, 30, 40]);
    expect(s.distance[20]).toBe(40);
  });
});

describe("normalizedPower", () => {
  it("equals the average on a steady ride and exceeds it on a variable one", () => {
    expect(normalizedPower(Array(600).fill(200))).toBeCloseTo(200, 5);
    const surges = Array.from({ length: 600 }, (_, i) => (Math.floor(i / 60) % 2 ? 300 : 100));
    expect(normalizedPower(surges)!).toBeGreaterThan(200);
  });
});

describe("rideMetrics", () => {
  it("gives TSS 100 for an hour at FTP", () => {
    const m = rideMetrics(
      ride(3601, () => 250),
      { ftp: 250, lthr: 165 },
    );
    expect(m.icu_training_load).toBe(100);
    expect(m.icu_intensity).toBe(100);
    expect(m.icu_weighted_avg_watts).toBe(250);
    expect(m.zoneTimes[3]).toBeGreaterThan(3500); // threshold zone
    expect(m.curve[0]).toBe(250);
  });

  it("falls back to heart rate without a power meter", () => {
    const m = rideMetrics(
      ride(3601, () => null, 165),
      { ftp: 250, lthr: 165 },
    );
    expect(m.icu_training_load).toBe(100);
    expect(m.icu_average_watts).toBeNull();
    expect(m.curve).toEqual([]);
  });
});

describe("rideMetrics with a file's summary", () => {
  const steady = ride(1001, () => null);

  it("reports the file's totals, and speed from them", () => {
    const m = rideMetrics(
      steady,
      { ftp: null, lthr: null },
      { moving: 1050, distance: 8400, ascent: 21 },
    );
    expect(m.moving_time).toBe(1050);
    expect(m.distance).toBe(8400);
    expect(m.total_elevation_gain).toBe(21);
    expect(m.average_speed).toBe(8);
  });

  it("ignores a timer that ran on through a long stop", () => {
    const m = rideMetrics(
      steady,
      { ftp: null, lthr: null },
      { moving: 3000, distance: null, ascent: null },
    );
    expect(m.moving_time).toBe(1000);
  });

  it("falls back to the streams when the file has no summary", () => {
    const m = rideMetrics(
      steady,
      { ftp: null, lthr: null },
      { moving: null, distance: null, ascent: null },
    );
    expect(m.moving_time).toBe(1000);
    expect(m.distance).toBe(8000);
  });

  it("ignores a one-second GPS jump in max speed", () => {
    const s = ride(100, () => null);
    s.distance = s.distance.map((d, i) => (i >= 50 ? d + 20 : d));
    expect(rideMetrics(s, { ftp: null, lthr: null }).max_speed).toBe(12);
  });
});

describe("zoneTimes", () => {
  it("puts each sample in the first zone whose top it doesn't exceed", () => {
    expect(zoneTimes([50, 150, 400, null, 0], [100, 200, 300])).toEqual([1, 1, 1]);
  });
});

describe("fitnessSeries", () => {
  it("rises toward a steady daily load, fatigue faster than fitness", () => {
    const loads = new Map<string, number>();
    for (let i = 1; i <= 28; i++) loads.set(`2026-02-${String(i).padStart(2, "0")}`, 100);
    const f = fitnessSeries(loads, "2026-02-28", "2026-03-01");
    const d = f.get("2026-02-28")!;
    expect(d.atl).toBeGreaterThan(95);
    expect(d.ctl).toBeGreaterThan(40);
    expect(d.ctl).toBeLessThan(d.atl);
    expect(d.rampRate).toBeGreaterThan(0);
    expect(f.get("2026-03-01")!.atl).toBeLessThan(d.atl); // a rest day
  });
});

describe("curves", () => {
  it("keeps the best watts at each duration and estimates FTP from them", () => {
    expect(
      bestCurve([
        [300, null],
        [250, 280],
      ]).slice(0, 2),
    ).toEqual([300, 280]);
    // A rider holding exactly CP 250 W with W′ 20 kJ at every duration.
    const cp = (secs: number) => 250 + 20000 / secs;
    const DURS = [
      1, 2, 3, 5, 8, 10, 15, 20, 30, 45, 60, 90, 120, 180, 240, 300, 420, 600, 900, 1200,
    ];
    expect(estimateFtp(DURS.map(cp))).toBe(250);
  });
});
