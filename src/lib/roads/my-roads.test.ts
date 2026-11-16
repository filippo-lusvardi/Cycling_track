import { describe, expect, it } from "vitest";
import { addRide, emptyRoads, homeOf, mostOn, packRoads, roadLines, unpackRoads } from "./my-roads";

/** A straight road east from a point, a GPS point every 20 m. */
function road(lat: number, lng: number, metres: number, wobble = 0) {
  const n = Math.round(metres / 20);
  const step = 20 / (111_320 * Math.cos((lat * Math.PI) / 180));
  return {
    lat: Array.from({ length: n + 1 }, () => lat + wobble),
    lng: Array.from({ length: n + 1 }, (_, i) => lng + i * step),
  };
}
const box: [[number, number], [number, number]] = [
  [46.0, 11.0],
  [46.2, 11.3],
];

describe("your roads", () => {
  it("lays two rides on the same road a few metres apart on the same nodes", () => {
    const r = emptyRoads();
    const a = road(46.1, 11.1, 2000);
    const b = road(46.1, 11.1, 2000, 0.00004);
    addRide(r, "a", a.lat, a.lng, "road");
    addRide(r, "b", b.lat, b.lng, "road");
    expect(mostOn(r, "road")).toBe(2);
  });
  it("counts each ride for its own bike: road shows road rides, gravel adds gravel, MTB all", () => {
    const r = emptyRoads();
    const a = road(46.1, 11.1, 2000);
    addRide(r, "road", a.lat, a.lng, "road");
    addRide(r, "gravel", a.lat, a.lng, "gravel");
    addRide(r, "mtb", a.lat, a.lng, "mtb");
    expect([mostOn(r, "road"), mostOn(r, "gravel"), mostOn(r, "mtb")]).toEqual([1, 2, 3]);
  });
  it("draws only what's inside the box, as joined lines with their count", () => {
    const r = emptyRoads();
    const a = road(46.1, 11.1, 2000);
    addRide(r, "a", a.lat, a.lng, "road");
    const lines = roadLines(r, box, 1, "road");
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.every((l) => l.rides === 1)).toBe(true);
    expect(
      roadLines(
        r,
        [
          [40, 5],
          [40.1, 5.1],
        ],
        1,
        "road",
      ),
    ).toEqual([]);
  });
  it("knows home from where rides start, and survives being stored", () => {
    const r = emptyRoads();
    for (const id of ["a", "b", "c"]) {
      const l = road(46.1, 11.1, 1000);
      addRide(r, id, l.lat, l.lng, "road");
    }
    const home = homeOf(r)!;
    expect(home.lat).toBeCloseTo(46.1, 3);
    const back = unpackRoads(packRoads(r));
    expect(mostOn(back, "road")).toBe(3);
    expect(back.rides.size).toBe(3);
  });
});
