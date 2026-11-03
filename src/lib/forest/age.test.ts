import { describe, expect, it } from "vitest";
import { growth, MAX_GROWTH, treeAge, treeGrowth } from "./age";

describe("tree age and height in a forest", () => {
  it("counts years from the first ride, or from the first year on older headers", () => {
    expect(treeAge({ since: "2024-11-03", years: ["2025"] }, "2026-11-03")).toBeCloseTo(2, 1);
    expect(treeAge({ years: ["2025"] }, "2026-07-01")).toBeCloseTo(1, 1);
    expect(treeAge(undefined, "2026-11-03")).toBeNull();
    expect(treeAge({ since: null, years: [] }, "2026-11-03")).toBeNull();
  });
  it("grows older trees taller, gently, never past the cap", () => {
    const hs = [0, 0.5, 1, 2, 5, 30].map((a) => growth(a));
    hs.slice(1).forEach((h, i) => expect(h).toBeGreaterThan(hs[i]!));
    expect(hs[0]).toBeCloseTo(0.55);
    expect(hs.at(-1)!).toBeLessThanOrEqual(MAX_GROWTH);
    expect(growth(null)).toBe(1);
  });
  it("counts kilometres as much as age", () => {
    expect(growth(1.5, 7500)).toBeCloseTo(1, 1);
    // Same age, many more kilometres: taller.
    expect(growth(2, 40_000)).toBeGreaterThan(growth(2, 3000) + 0.15);
    // A young tree with huge mileage still isn't a veteran's height.
    expect(growth(0.5, 40_000)).toBeLessThan(growth(8, 40_000));
    expect(growth(50, 500_000)).toBeLessThanOrEqual(MAX_GROWTH);
    expect(growth(null, 7500)).toBeGreaterThan(0.55);
  });
  it("reads a member's header (a seedling without one)", () => {
    const h = { crown: null, day: "2026-11-03", years: ["2020"], off: [], updatedAt: 0 };
    expect(treeGrowth(undefined, "2026-11-03")).toBe(1);
    expect(treeGrowth({ ...h, since: "2020-03-01", km: 60_000 }, "2026-11-03")).toBeGreaterThan(
      treeGrowth({ ...h, since: "2020-03-01", km: 2000 }, "2026-11-03"),
    );
  });
});
