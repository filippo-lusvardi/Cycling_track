import { describe, expect, it } from "vitest";
import { durabilityOf, durabilityProfile, durabilityVerdict } from "./durability";

// 70 kg rider: 250 W for 2 h is 1800 kJ (25.7 kJ/kg), then 3 h at 200 W (another 30.9 kJ/kg).
const kg = 70;
const ride = [...Array(7200).fill(250), ...Array(10800).fill(200)];

describe("durability", () => {
  it("measures each effort only after the bucket's work", () => {
    const d = durabilityOf(ride, kg);
    expect(d[0]).toEqual([250, 250, 250]);
    // 15 kJ/kg is reached inside the 250 W part, so 20 min at 250 W is still possible after it.
    expect(d[15]).toEqual([250, 250, 250]);
    // 30 and 45 kJ/kg come during the 200 W part.
    expect(d[30]).toEqual([200, 200, 200]);
    expect(d[45]).toEqual([200, 200, 200]);
  });

  it("leaves buckets the ride never reached empty", () => {
    const d = durabilityOf(Array(3600).fill(200), kg); // 720 kJ ≈ 10 kJ/kg
    expect(d[15]).toEqual([null, null, null]);
  });

  it("reports the drop from fresh across rides", () => {
    const p = durabilityProfile([durabilityOf(ride, kg)]);
    expect(p.drop[30][1]).toBeCloseTo(20);
    expect(durabilityVerdict(p)).toBe("fades");
  });
});
