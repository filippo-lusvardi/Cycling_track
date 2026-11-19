import { describe, expect, it } from "vitest";
import { buildPool, type SuggestInput } from "../suggest";
import { addDays } from "../training";
import type { PlanContext, WindowDay } from "./engine";
import { forecast, forecastLoads, type DayLoad } from "./forecast";
import type { PlanNote } from "./note";
import type { DayPlan } from "./types";

const today = "2026-11-12";
const rows = Array.from({ length: 30 }, (_, i) => ({
  id: addDays(today, i - 30),
  ctl: 50,
  atl: 55,
}));
const loads = (entries: [string, number, boolean?][]) =>
  new Map<string, DayLoad>(
    entries.map(([d, load, estimated]) => [d, { load, estimated: !!estimated }]),
  );

describe("the forecast", () => {
  it("decays with no load as the 42- and 7-day sums do", () => {
    const end = addDays(today, 13);
    const ahead = forecast(rows, today, loads([[end, 0]]));
    // The same sums run from a steady 50/55: no load from yesterday on.
    const day = ahead.find((p) => p.date === end)!;
    let ctl = 50;
    let atl = 55;
    for (let d = today; d <= end; d = addDays(d, 1)) {
      ctl += (0 - ctl) * (1 - Math.exp(-1 / 42));
      atl += (0 - atl) * (1 - Math.exp(-1 / 7));
    }
    expect(day.fitness).toBeCloseTo(ctl, 1);
    expect(day.fatigue).toBeCloseTo(atl, 1);
    expect(day.form).toBeCloseTo(ctl - atl, 0);
  });
  it("raises fatigue more than fitness for a workout", () => {
    const ahead = forecast(rows, today, loads([[today, 120]]));
    const p = ahead.find((x) => x.date === today)!;
    expect(p.fatigue - 55).toBeGreaterThan(p.fitness - 50);
    expect(p.kind).toBe("planned");
  });
  it("keeps the past as it was, then marks what's planned and what's only estimated", () => {
    const ahead = forecast(
      rows,
      today,
      loads([
        [today, 60],
        [addDays(today, 1), 40],
        [addDays(today, 9), 50, true],
      ]),
    );
    expect(ahead.filter((p) => p.kind === "past").at(-1)!.date).toBe(addDays(today, -1));
    expect(ahead.find((p) => p.date === addDays(today, 9))!.kind).toBe("estimated");
    expect(ahead.at(-1)!.date).toBe(addDays(today, 9));
  });
  it("has nothing to say with no fitness known", () => {
    expect(forecast([], today, loads([[today, 60]]))).toEqual([]);
  });
});

describe("the loads ahead", () => {
  const off: DayPlan = { minutes: 0, indoor: false, long: false };
  const week: DayPlan[] = [
    off,
    { minutes: 60, indoor: true, long: false },
    off,
    off,
    off,
    { minutes: 180, indoor: false, long: true },
    off,
  ];
  const note = { settings: { goal: "fitter", week } } as unknown as PlanNote;
  const input = (acts: unknown[] = []) =>
    ({ today, acts, pool: buildPool([], "ride", {}) }) as unknown as SuggestInput;
  const ctx = (acts: unknown[] = []): PlanContext => ({ note, input: input(acts), calendar: [] });
  const days: WindowDay[] = [
    {
      date: today,
      role: "easy",
      workout: {
        id: "x",
        name: "",
        type: "Ride",
        description: "",
        seconds: 3600,
        load: 50,
        kind: "endurance",
      },
    },
    { date: addDays(today, 1), role: "rest", workout: null },
  ];
  it("counts the plan's sessions, then spreads each outline week over its riding days", () => {
    const out = forecastLoads(ctx(), days, [
      { monday: "2026-11-16", phase: "base", recovery: false, seconds: 4 * 3600 },
    ]);
    expect(out.get(today)).toEqual({ load: 50, estimated: false });
    expect(out.get("2026-11-16")!.load).toBe(0);
    // 50 per hour learned from the window, Saturday's share of the week's time.
    expect(out.get("2026-11-21")!.load).toBeCloseTo(4 * 50 * (180 / 240));
    expect(out.get("2026-11-21")!.estimated).toBe(true);
  });
  it("counts today's riding once it's done, not the plan", () => {
    const out = forecastLoads(
      ctx([{ start_date_local: `${today}T08:00:00`, icu_training_load: 90 }]),
      days,
      [],
    );
    expect(out.get(today)).toEqual({ load: 90, estimated: false });
  });
});
