import { describe, expect, it } from "vitest";
import { BRIOCHE_G, carbsBurned, choShare, intakeTarget, rideFuel } from "./fuel";

const ride = (over: object = {}) => ({
  moving_time: 3 * 3600,
  icu_average_watts: 200,
  calories: null,
  icu_intensity: 70,
  zoneTimes: [0, 3 * 3600, 0, 0, 0, 0, 0],
  ...over,
});

describe("fuel", () => {
  it("takes more of the energy from carbohydrate the harder the riding", () => {
    expect(choShare([3600, 0, 0, 0, 0, 0, 0])).toBeCloseTo(0.35);
    expect(choShare([0, 0, 0, 3600, 0, 0, 0])).toBeCloseTo(0.85);
    expect(choShare([0, 0, 0, 0, 0, 0, 0])).toBeCloseTo(0.6);
  });

  it("burns kJ ≈ kcal at the zone's carbohydrate share", () => {
    // 200 W for 3 h = 2160 kJ ≈ 2160 kcal, half of it from carbohydrate in Z2: 270 g.
    expect(carbsBurned(ride())).toBeCloseTo(270);
    expect(carbsBurned(ride({ joules: 1_000_000 }))).toBeCloseTo(125);
  });

  it("needs nothing on short rides and more per hour on long ones", () => {
    expect(intakeTarget(3600, 0.9).grams).toBe(0);
    expect(intakeTarget(2 * 3600, 0.6)).toEqual({ low: 60, high: 120, grams: 60 });
    expect(intakeTarget(4 * 3600, 0.85).grams).toBe(360);
  });

  it("judges what was eaten against the target", () => {
    const f = rideFuel(ride(), 1);
    expect(f.eaten).toBe(BRIOCHE_G);
    expect(f.verdict).toBe("under");
    expect(f.advice).toBeGreaterThan(0);
    expect(rideFuel(ride({ moving_time: 1800 }), 0).verdict).toBeNull();
  });
});
