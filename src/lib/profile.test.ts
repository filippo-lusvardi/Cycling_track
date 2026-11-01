import { describe, expect, it } from "vitest";
import { gradeChunks, gradeColor, maxGrade } from "./profile";

describe("gradient profile", () => {
  // 1 km at 4%, then 500 m at 10%, sampled every 20 m.
  const dist = Array.from({ length: 76 }, (_, i) => i * 20);
  const alt = dist.map((d) => (d <= 1000 ? d * 0.04 : 40 + (d - 1000) * 0.1));

  it("cuts 100 m chunks with their grade", () => {
    const c = gradeChunks(dist, alt);
    expect(c).toHaveLength(15);
    expect(c[3]!.grade).toBeCloseTo(4, 1);
    expect(c[13]!.grade).toBeCloseTo(10, 1);
    expect(c.at(-1)!.to).toBe(1500);
  });
  it("finds the steepest chunk", () => {
    expect(maxGrade(gradeChunks(dist, alt))).toBeGreaterThan(9.5);
  });
  it("colours grades along a continuous ramp", () => {
    expect(gradeColor(-4)).toBe("var(--z1)");
    expect(gradeColor(0)).toBe("var(--z1)");
    expect(gradeColor(7.5)).toBe("color-mix(in oklch, var(--z5) 50%, var(--z4))");
    expect(gradeColor(6)).toBe("var(--z4)");
    expect(gradeColor(20)).toBe("var(--z7)");
  });
});
