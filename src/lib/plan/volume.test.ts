import { describe, expect, it } from "vitest";
import type { Activity } from "../intervals";
import type { Race } from "../races";
import { addDays } from "../training";
import { catchUp, type PlanContext } from "./engine";
import { startState } from "./start-level";
import { rampWeeks, riddenEnough, steppedVolume, suggestVolume, yearVolume } from "./volume";
import type { PlanSettings } from "./types";
import type { SuggestInput } from "../suggest";

const today = "2026-11-09"; // A Monday.
const H = 3600;
const day = (minutes: number) => ({ minutes, indoor: false, long: false });
const week = Array.from({ length: 7 }, () => day(240));
const settings = (peakSeconds?: number): PlanSettings => ({
  goal: "season",
  week,
  season: { months: ["2027-05", "2027-06"], kinds: [], ...(peakSeconds ? { peakSeconds } : {}) },
});
const rhythm = { buildWeeks: 3 as const, cycleStart: today, forcedRecovery: null };
const race = (date: string): Race => ({
  id: date,
  date,
  name: "",
  priority: "A",
  info: null,
  notes: "",
  type: "Ride",
});
const ride = (date: string, seconds: number, type = "Ride") =>
  ({
    id: `${type}-${date}`,
    type,
    start_date_local: `${date}T09:00:00`,
    moving_time: seconds,
  }) as unknown as Activity;
/** `hours(weeksAgo)` hours in each of the last `weeks` full weeks. */
const year = (hours: (weeksAgo: number) => number, weeks = 52) =>
  Array.from({ length: weeks }, (_, i) =>
    ride(addDays(today, -7 * (i + 1)), hours(i + 1) * H),
  ).filter((a) => a.moving_time! > 0);
// 8 h a week, 12 h for a month in June, 7 h lately.
const usual = (w: number) => (w <= 8 ? 7 : w >= 20 && w < 24 ? 12 : 8);

describe("last year", () => {
  it("reads a usual week and the best four in a row", () => {
    const v = yearVolume(year(usual), today)!;
    expect(v.bestSeconds).toBe(12 * H);
    expect(v.usualSeconds).toBeGreaterThan(7.9 * H);
    expect(v.usualSeconds).toBeLessThan(8.5 * H);
  });

  it("counts rides only, and full weeks only", () => {
    const runs = [...year(usual), ride(addDays(today, -7), 40 * H, "Run"), ride(today, 40 * H)];
    expect(yearVolume(runs, today)!.bestSeconds).toBe(12 * H);
  });

  it("says nothing from too few weeks", () => {
    expect(
      yearVolume(
        year(() => 8, 20),
        today,
      ),
    ).toBeNull();
  });

  it("isn't lifted by one big week", () => {
    const big = yearVolume(
      year((w) => (w === 30 ? 30 : 8)),
      today,
    )!;
    expect(big.bestSeconds).toBe((30 + 3 * 8) * (H / 4));
  });
});

describe("the suggested start", () => {
  const suggest = (over: Partial<Parameters<typeof suggestVolume>[0]> = {}) =>
    suggestVolume({
      acts: year(usual),
      today,
      settings: settings(),
      races: [],
      state: rhythm,
      fallbackSeconds: 5 * H,
      ...over,
    });

  it("aims a little over last year's best, and starts lower the further away the period is", () => {
    const far = suggest();
    expect(far.peakSeconds).toBe(12 * H + 35 * 60);
    expect(far.lastYearBest).toBe(12 * H);
    expect(far.startSeconds).toBeLessThan(far.peakSeconds);
    const near = suggest({ today: "2027-02-01", acts: year(() => 11).map(shift("2027-02-01")) });
    expect(near.weeks).toBeLessThan(far.weeks);
    expect(near.startSeconds / near.peakSeconds).toBeGreaterThan(
      far.startSeconds / far.peakSeconds,
    );
  });

  it("lets the rider choose how far over last year's best, from 5% to 15%", () => {
    expect(suggest().climbPercent).toBe(5);
    expect(suggest({ climbPercent: 10 }).peakSeconds).toBe(13 * H + 10 * 60);
    expect(suggest({ climbPercent: 15 }).peakSeconds).toBe(13 * H + 50 * 60);
    expect(suggest({ climbPercent: 40 }).peakSeconds).toBe(13 * H + 50 * 60);
    expect(suggest({ climbPercent: 0 }).peakSeconds).toBe(12 * H + 35 * 60);
    expect(suggest({ climbPercent: 40 }).climbPercent).toBe(15);
  });

  it("starts higher when the climb goes higher, until the last weeks hold it back", () => {
    expect(suggest({ climbPercent: 15 }).startSeconds).toBeGreaterThanOrEqual(
      suggest().startSeconds,
    );
  });

  it("has nothing to choose with no year to read", () => {
    expect(suggest({ acts: [], climbPercent: 15 }).climbPercent).toBeNull();
  });

  it("doesn't go far over what the last weeks really held", () => {
    const quiet = year((w) => (w <= 8 ? 3 : w >= 20 && w < 24 ? 12 : 8));
    expect(suggest({ acts: quiet }).startSeconds).toBe(3.5 * H);
  });

  it("doesn't start too low however far the period is", () => {
    const far = suggest({
      settings: { ...settings(), season: { months: ["2027-10"], kinds: [] } },
    });
    expect(far.startSeconds).toBeGreaterThanOrEqual(0.6 * 8 * H - 15 * 60);
  });

  it("keeps inside the time available", () => {
    const short = { ...settings(), week: Array.from({ length: 7 }, () => day(60)) };
    const v = suggest({ settings: short });
    expect(v.reachSeconds).toBe(7 * H);
    expect(v.peakSeconds).toBe(12 * H + 35 * 60);
    expect(v.startSeconds).toBeLessThanOrEqual(7 * H);
    expect(v.limitedByDays).toBe(true);
    expect(suggest().limitedByDays).toBe(false);
  });

  it("doesn't let few free hours drag the start down", () => {
    const tight = { ...settings(), week: [0, 60, 60, 60, 0, 180, 90].map(day) };
    const v = suggest({ settings: tight });
    expect(v.reachSeconds).toBe(7.5 * H);
    expect(v.startSeconds).toBe(Math.min(suggest().startSeconds, 7.5 * H));
    expect(v.startSeconds).toBeGreaterThan(6 * H);
  });

  it("falls back on the plan's own start with no year to read", () => {
    const v = suggest({ acts: [] });
    expect(v.lastYearBest).toBeNull();
    expect(v.startSeconds).toBe(5 * H);
    expect(v.peakSeconds).toBe(7 * H);
  });
});

function shift(to: string) {
  const by = (Date.parse(to) - Date.parse(today)) / 864e5;
  return (a: Activity) => ride(addDays(a.start_date_local.slice(0, 10), by), a.moving_time ?? 0);
}

describe("the climb", () => {
  const next = addDays(today, 7);

  it("reaches the peak by the last week before the specific phase", () => {
    const s = settings(12 * H);
    let w = 8 * H;
    for (let m = next; m < "2027-03-15"; m = addDays(m, 7)) w = steppedVolume(w, m, s, [], rhythm);
    expect(w).toBeCloseTo(12 * H, -1);
  });

  it("holds in recovery weeks and from the specific phase on", () => {
    const s = settings(12 * H);
    expect(steppedVolume(8 * H, "2026-12-07", s, [], rhythm)).toBe(8 * H);
    expect(steppedVolume(8 * H, "2027-03-22", s, [], rhythm)).toBe(8 * H);
  });

  it("never steps by more than 10%, and catches up as far as it can", () => {
    expect(steppedVolume(2 * H, next, settings(40 * H), [], rhythm)).toBeCloseTo(2.2 * H, 3);
  });

  it("stops at what the days hold, and goes on if they later hold more", () => {
    const tight = { ...settings(12 * H), week: Array.from({ length: 7 }, () => day(60)) };
    expect(steppedVolume(7 * H, next, tight, [], rhythm)).toBe(7 * H);
    expect(steppedVolume(7 * H, next, settings(12 * H), [], rhythm)).toBeGreaterThan(7 * H);
  });

  it("doesn't touch other goals, a week at the peak, or a season with no peak", () => {
    expect(steppedVolume(8 * H, next, { ...settings(12 * H), goal: "fitter" }, [], rhythm)).toBe(
      8 * H,
    );
    expect(steppedVolume(13 * H, next, settings(12 * H), [], rhythm)).toBe(13 * H);
    expect(steppedVolume(8 * H, next, settings(), [], rhythm)).toBe(8 * H);
  });

  it("changes its steps when a race moves the target", () => {
    const later = rampWeeks(next, settings(), [race("2027-06-06")], rhythm);
    expect(later).toBeGreaterThan(rampWeeks(next, settings(), [], rhythm));
  });

  it("has nothing left once the season is over", () => {
    expect(rampWeeks("2027-08-02", settings(), [], rhythm)).toBe(0);
  });
});

describe("moving on from a finished week", () => {
  const monday = "2026-11-09";
  const now = "2026-11-16";
  const context = (acts: Activity[], over = {}): PlanContext => {
    const s = settings(12 * H);
    return {
      note: {
        settings: s,
        state: {
          ...startState({ today: monday, acts: [], settings: s, weeklySeconds: 8 * H }),
          weekRolled: monday,
          ...over,
        },
        sessions: [],
        reviews: [],
        undo: [],
      },
      input: { today: now, acts, wellness: [], races: [] } as unknown as SuggestInput,
      calendar: [],
    };
  };

  it("climbs after a week ridden as planned", () => {
    expect(riddenEnough([ride(monday, 6.8 * H)], monday, 8 * H)).toBe(true);
    expect(riddenEnough([ride(monday, 6.7 * H)], monday, 8 * H)).toBe(false);
    expect(catchUp(context([ride(monday, 8 * H)])).weeklySeconds).toBeGreaterThan(8 * H);
  });

  it("holds after a week not ridden: missing rides never raise anything", () => {
    expect(riddenEnough([], monday, 8 * H)).toBe(false);
    expect(catchUp(context([])).weeklySeconds).toBe(8 * H);
    expect(catchUp(context([ride(monday, 5 * H)])).weeklySeconds).toBe(8 * H);
  });

  it("holds when a review has just lowered things", () => {
    expect(catchUp(context([ride(monday, 8 * H)], { lowersThisCycle: 1 })).weeklySeconds).toBe(
      8 * H,
    );
  });

  it("holds after low mornings", () => {
    const wellness = Array.from({ length: 4 }, (_, i) => ({
      id: addDays(now, -i),
      sleepQuality: 4,
      fatigue: 4,
      stress: 4,
      mood: 4,
    }));
    const ctx = context([ride(monday, 8 * H)]);
    const low = { ...ctx, input: { ...ctx.input, wellness } } as PlanContext;
    expect(catchUp(low).weeklySeconds).toBe(8 * H);
  });
});
