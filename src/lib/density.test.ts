import { describe, expect, it } from "vitest";
import { densestRegion } from "./density";

const seg = (lat: number, lng: number) => ({ lat: [lat, lat + 0.01], lng: [lng, lng + 0.01] });

describe("densestRegion", () => {
  it("is null without segments", () => {
    expect(densestRegion([])).toBeNull();
  });
  it("picks the busiest area and leaves far-away segments out", () => {
    const home = [seg(44.6, 10.6), seg(44.62, 10.65), seg(44.58, 10.7), seg(44.65, 10.62)];
    const holiday = [seg(46.5, 11.3), seg(46.52, 11.35)];
    const b = densestRegion([...holiday, ...home])!;
    expect(b[0][0]).toBeCloseTo(44.58);
    expect(b[1][0]).toBeCloseTo(44.66);
    expect(b[1][1]).toBeLessThan(11); // the far-away trip isn't in the frame
  });
});
