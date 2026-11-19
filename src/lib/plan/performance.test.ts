import { describe, expect, it } from "vitest";
import type { RideDurability } from "../durability";
import type { Activity, PowerCurve } from "../intervals";
import { addDays } from "../training";
import {
  cpOf,
  cpTrend,
  cpWindows,
  daysSinceHard,
  durabilityTrend,
  efficiencyTrend,
} from "./performance";

const today = "2026-11-19";
/** Bests that follow P = CP + W′/t exactly. */
const curve = (cp: number, wPrime: number, extra: [number, number][] = []): PowerCurve => {
  const secs = [60, 180, 300, 600, 720, 1200, 3600];
  const watts = secs.map((t) => cp + wPrime / t);
  for (const [t, w] of extra) watts[secs.indexOf(t)] = w;
  return { id: "c", label: "", secs, watts };
};
const ride = (date: string, over: Partial<Activity> = {}) =>
  ({
    id: date,
    type: "Ride",
    start_date_local: `${date}T08:00:00`,
    moving_time: 5400,
    icu_intensity: 65,
    average_heartrate: 135,
    efficiency: 1.5,
    decoupling: 3,
    trainer: false,
    ...over,
  }) as unknown as Activity;

describe("critical power", () => {
  it("comes back from a clean power–duration line, and the 1 min best doesn't move it", () => {
    expect(cpOf(curve(260, 18000))).toEqual({ cp: 260, wPrime: 18000 });
    expect(cpOf(curve(260, 18000, [[60, 900]]))).toEqual({ cp: 260, wPrime: 18000 });
  });
  it("says nothing from a curve that isn't a clean line", () => {
    expect(
      cpOf(
        curve(260, 18000, [
          [300, 200],
          [720, 420],
        ]),
      ),
    ).toBeNull();
    expect(cpOf(null)).toBeNull();
  });
  it("is read every two weeks, from six weeks of riding each time", () => {
    const w = cpWindows(today);
    expect(w.at(-1)).toEqual({ from: addDays(today, -41), to: today });
    expect(w[0]!.to).toBe(addDays(today, -84));
    const trend = cpTrend(
      w.map((x, i) => ({ to: x.to, curve: i === 1 ? null : curve(240 + i, 18000) })),
    );
    expect(trend).toHaveLength(w.length - 1);
    expect(trend.at(-1)!.cp).toBe(240 + w.length - 1);
  });
  it("knows how long since a ride that could move it", () => {
    expect(
      daysSinceHard([ride("2026-11-10", { icu_intensity: 92 }), ride("2026-11-17")], today),
    ).toBe(9);
    expect(daysSinceHard([ride("2026-11-17")], today)).toBeNull();
  });
});

describe("aerobic efficiency", () => {
  it("takes steady easy rides only, week by week, indoors and outdoors apart", () => {
    const acts = [
      ride("2026-11-17", { efficiency: 1.6 }),
      ride("2026-11-18", { efficiency: 1.8 }),
      ride("2026-11-18", { efficiency: 2.5, icu_intensity: 90 }), // hard
      ride("2026-11-16", { efficiency: 2.5, moving_time: 1800 }), // short
      ride("2026-11-11", { efficiency: 1.4, type: "VirtualRide" }),
      ride("2026-11-12", { efficiency: 1.3, trainer: true }),
    ];
    const { indoor, outdoor } = efficiencyTrend(acts, today);
    expect(outdoor).toEqual([{ monday: "2026-11-16", efficiency: 1.7, decoupling: 3, rides: 2 }]);
    expect(indoor).toEqual([{ monday: "2026-11-09", efficiency: 1.35, decoupling: 3, rides: 2 }]);
  });
});

describe("durability", () => {
  const d = (fresh: number, after15: number, after30: number | null): RideDurability => ({
    0: [400, fresh, fresh * 0.9],
    15: [380, after15, after15 * 0.9],
    30: [360, after30, after30 == null ? null : after30 * 0.9],
    45: [null, null, null],
  });
  it("is the drop from fresh in blocks of four weeks", () => {
    const rides = [
      { date: "2026-11-15", durability: d(300, 285, 270) },
      { date: "2026-10-04", durability: d(300, 270, null) },
    ];
    const trend = durabilityTrend(rides, today);
    expect(trend).toHaveLength(2);
    expect(trend.at(-1)!.drop[15]).toEqual([5, 5]);
    expect(trend.at(-1)!.drop[30]).toEqual([10, 10]);
    expect(trend[0]!.drop[30]).toEqual([null, null]);
  });
});
