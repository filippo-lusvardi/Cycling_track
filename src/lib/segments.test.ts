import { describe, expect, it } from "vitest";
import { branch, join, profile, ride, road } from "@/test/ride-fixtures";
import { findAttempts, haversine, samePath, segmentFromRange, segmentSummary, trackFromStreams, type Segment, type TrackLike } from "./segments";
import { autoSegments, traceOf } from "./segment-index";

// Straight line north, 1 point per ~11 m (0.0001° lat), 1 m/s.
function line(id: string, n = 300, speed = 1): TrackLike {
  const lat = Array.from({ length: n }, (_, i) => 45 + i * 0.0001);
  const dist = lat.map((_, i) => i * 11.12);
  return { id, name: id, date: "2026-10-01", lat, lng: lat.map(() => 11), dist, time: dist.map((d) => d / speed), alt: lat.map(() => 0), watts: lat.map(() => 200), hr: lat.map(() => 140) };
}

describe("segments", () => {
  const seg: Segment = { id: "s", name: "s", source: "custom", lat1: 45.005, lng1: 11, lat2: 45.015, lng2: 11, length: haversine(45.005, 11, 45.015, 11) };
  it("finds one attempt and timing matches speed", () => {
    const a = findAttempts(line("a", 300, 5), seg);
    expect(a).toHaveLength(1);
    expect(a[0]!.duration).toBeCloseTo(seg.length / 5, -1);
    expect(a[0]!.avgWatts).toBe(200);
  });
  it("does not match a ride that never reaches the finish", () => {
    expect(findAttempts(line("b", 120), seg)).toHaveLength(0);
  });
});

describe("segment helpers", () => {
  it("attempts carry gain, VAM and cadence", () => {
    const t = line("c", 300, 5);
    t.alt = t.dist.map((d) => d * 0.05); // 5% all the way
    t.cad = t.dist.map(() => 85);
    const seg: Segment = { id: "s", name: "s", source: "custom", lat1: 45.005, lng1: 11, lat2: 45.015, lng2: 11, length: haversine(45.005, 11, 45.015, 11) };
    const [a] = findAttempts(t, seg);
    expect(a!.gain).toBeCloseTo(seg.length * 0.05, -1);
    expect(a!.vam).toBeCloseTo(5 * 0.05 * 3600, -1); // 5 m/s × 5% = 0.25 m/s up = 900 m/h
    expect(a!.avgCad).toBe(85);
    const tr = traceOf(t, a!);
    expect(tr.dist[0]).toBe(0);
    expect(tr.dist.at(-1)).toBeCloseTo(seg.length, -2);
    expect(tr.lat[0]).toBeCloseTo(45.005, 3);
  });
  it("down-samples streams and skips points without GPS", () => {
    const n = 100;
    const distance = Array.from({ length: n }, (_, i) => i * 5);
    const lat = distance.map((_, i) => (i < 10 ? null : 45 + i * 0.00005));
    const t = trackFromStreams(
      { id: "x", name: null, date: "2026-10-01" },
      { distance, time: distance, altitude: distance.map(() => 0), lat, lng: lat.map(() => 11), watts: [], heartrate: [] },
    );
    expect(t.dist[0]).toBe(50);
    expect(t.dist[1]! - t.dist[0]!).toBeGreaterThanOrEqual(20);
    expect(t.dist.at(-1)).toBe(495);
  });
  it("counts how many rides share an auto-detected climb", () => {
    const hill = (id: string) => {
      const t = line(id, 400, 5);
      t.alt = t.dist.map((d) => (d < 1000 ? 0 : d < 3000 ? (d - 1000) * 0.06 : 120));
      return t;
    };
    const segs = autoSegments([hill("a"), hill("b")]);
    expect(segs).toHaveLength(1);
    expect(segs[0]!.rides).toBe(2);
    const c = hill("c");
    const on = (x: Segment) => traceOf(c, findAttempts(c, x)[0]!);
    expect(samePath(on(segs[0]!), on(segmentFromRange(c, 1.0, 3.0, "custom")))).toBe(true);
  });
});

describe("segment summary", () => {
  it("lists length, grade, gain and category", () => {
    expect(segmentSummary({ length: 3700, grade: 5.04, gain: 188 })).toBe("3.7 km · 5.0% · 188 m · Cat 3");
    expect(segmentSummary({ length: 900, grade: 1, gain: 9 })).toBe("0.9 km · 1.0% · 9 m");
  });
});

describe("recurring climbs across rides", () => {
  const base = road(30, 7);
  it("one segment when the same climb is detected a bit differently on two rides", () => {
    // Sunday's ride has a gentle ramp before and a false flat after, so its detection is ~200 m longer at each end.
    const today = ride("today", 3, base, profile(30, [[10, 14, 6]]), { altNoise: 2 });
    const sunday = ride("sunday", 9, base, profile(30, [[9.7, 10, 1.5], [10, 14, 6], [14, 14.3, 1.5]]), { altNoise: 2 });
    const segs = autoSegments([today, sunday]);
    expect(segs).toHaveLength(1);
    expect(segs[0]!.rides).toBe(2);
  });
  it("counts rides that pass the climb even where it wasn't detected", () => {
    const climb = profile(30, [[10, 14, 6]]);
    const flatData = ride("gps-glitch", 5, base, climb.map(() => 200));
    const segs = autoSegments([ride("a", 3, base, climb), ride("b", 4, base, climb), flatData]);
    expect(segs[0]!.rides).toBe(3);
  });
  it("half a climb is a segment of its own, and full ascents count towards it", () => {
    const full = profile(30, [[10, 14, 6]]);
    // Climbs only the first 2 km, then turns off onto another (flat) road.
    const half = ride("half", 5, branch(base, 12, 30), profile(30, [[10, 12, 6]]));
    const segs = autoSegments([ride("a", 3, base, full), ride("b", 4, base, full), half]).sort((x, y) => y.length - x.length);
    expect(segs).toHaveLength(2);
    expect(segs[0]!.length).toBeGreaterThan(3500); // the whole climb: only the two full rides
    expect(segs[0]!.rides).toBe(2);
    expect(segs[1]!.length).toBeLessThan(2500); // the first half: all three rides went through it
    expect(segs[1]!.rides).toBe(3);
  });
  it("one segment when rides reach the climb by different roads, and the page finds every ride", () => {
    // Sunday comes in on a side road that joins at 10 km and is already rising before the junction.
    const today = ride("today", 3, base, profile(30, [[10, 14, 6]]), { altNoise: 2 });
    const sunday = ride("sunday", 9, join(base, 10), profile(30, [[9.5, 10, 2.5], [10, 14, 6]]), { altNoise: 2 });
    for (const order of [[today, sunday], [sunday, today]]) {
      const segs = autoSegments(order);
      expect(segs).toHaveLength(1);
      expect(segs[0]!.rides).toBe(2);
      expect(order.filter((t) => findAttempts(t, segs[0]!).length).length).toBe(2);
    }
  });
  it("list count and segment page always agree", () => {
    const full = profile(30, [[10, 14, 6]]);
    const tracks = [
      ride("a", 3, base, full),
      ride("b", 4, join(base, 10), profile(30, [[9.5, 10, 2.5], [10, 14, 6]])),
      ride("c", 5, branch(base, 12, 30), profile(30, [[10, 12, 6]])),
      ride("d", 6, base, profile(30, [[9.7, 10, 1.5], [10, 14, 6], [14, 14.3, 1.5]]), { altNoise: 4 }),
    ];
    for (const s of autoSegments(tracks)) expect(tracks.filter((t) => findAttempts(t, s).length).length).toBe(s.rides);
  });
  it("keeps two different climbs on the same ride apart", () => {
    const segs = autoSegments([ride("a", 3, base, profile(30, [[5, 8, 6], [15, 19, 5]]))]);
    expect(segs).toHaveLength(2);
  });
  it("stays fast: 60 rides of 80 km", () => {
    const b = road(80, 11);
    const alt = profile(80, [[10, 14, 6], [25, 27, 8], [40, 49, 5], [60, 62.5, 4]]);
    const tracks = Array.from({ length: 60 }, (_, i) => ride(`r${i}`, i + 3, b, alt, { altNoise: 3 }));
    const t0 = performance.now();
    const segs = autoSegments(tracks);
    expect(performance.now() - t0).toBeLessThan(1500);
    expect(segs.map((s) => s.rides)).toEqual([60, 60, 60, 60]);
  });
});
