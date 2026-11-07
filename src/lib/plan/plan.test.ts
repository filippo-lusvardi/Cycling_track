import { describe, expect, it } from "vitest";
import type { Activity, Wellness } from "../intervals";
import type { Focus, Race } from "../races";
import { buildPool } from "../suggest";
import { addDays } from "../training";
import { parseWorkout } from "../workout";
import { applyReview, lowMornings, review, rollWeek, type ReviewInput } from "./evaluate";
import { ladderFor, pickRung, workSeconds } from "./ladder";
import { easyRide, layoutWeek, longRide, recoveryRide, type LayoutInput } from "./layout";
import { diffWeek, matchSessions, outcomesOf } from "./match";
import { outline } from "./outline";
import { weekShape } from "./phase";
import { history, needsExperience, startState } from "./start-level";
import {
  parsePlanSettings,
  type DayPlan,
  type PlanSettings,
  type PlanState,
  type SessionOutcome,
} from "./types";

// A Monday.
const monday = "2026-11-09";
const th = { ftp: 250 };
const pool = buildPool([], "ride", th);
const off: DayPlan = { minutes: 0, indoor: false, long: false };
const day = (minutes: number, indoor = false, long = false): DayPlan => ({ minutes, indoor, long });
const typical: DayPlan[] = [
  off,
  day(75, true),
  day(60),
  day(75, true),
  off,
  day(240, false, true),
  day(120),
];
const settings = (
  week: DayPlan[] = typical,
  goal: PlanSettings["goal"] = "fitter",
): PlanSettings => ({ goal, week });

const ride = (date: string, secs = 5400, extra: Partial<Activity> = {}) =>
  ({
    id: `a-${date}`,
    name: date,
    type: "Ride",
    start_date_local: `${date}T09:00:00`,
    moving_time: secs,
    icu_intensity: 65,
    icu_training_load: 70,
    ...extra,
  }) as unknown as Activity;
const weeksOfRides = (hours: number, weeks = 8) =>
  Array.from({ length: weeks }, (_, w) =>
    Array.from({ length: 3 }, (_, d) =>
      ride(addDays(monday, -7 * (w + 1) + d * 2), (hours * 3600) / 3),
    ),
  ).flat();

const state = (over: Partial<PlanState> = {}): PlanState => ({
  ...startState({ today: monday, acts: weeksOfRides(6), settings: settings() }),
  ...over,
});
const race = (date: string, priority: "A" | "B" | "C" = "A") =>
  ({ id: date, name: "Gara", date, priority, type: "Ride", info: null }) as unknown as Race;

function week(
  over: Partial<LayoutInput> & {
    s?: PlanState;
    goal?: PlanSettings["goal"];
    plan?: DayPlan[];
    focus?: Focus;
  } = {},
) {
  const s = over.s ?? state();
  const races = over.races ?? [];
  const set = over.settings ?? settings(over.plan ?? typical, over.goal ?? "fitter");
  return layoutWeek({
    today: monday,
    shape: over.shape ?? weekShape(monday, set, races, s),
    settings: set,
    state: s,
    focus: over.focus ?? "aerobic",
    pool,
    races,
    taken: [],
    off: new Set(),
    recentHard: [],
    longestSeconds: 3 * 3600,
    th,
    ...over,
  });
}

/** The rules no week may ever break. */
function expectSound(days: ReturnType<typeof week>, set: PlanSettings, gap = 2) {
  const hard = days.filter((d) => d.role === "hard").map((d) => d.date);
  for (let i = 1; i < hard.length; i++) {
    const apart = (new Date(hard[i]!).getTime() - new Date(hard[i - 1]!).getTime()) / 864e5;
    expect(apart, `hard days ${hard}`).toBeGreaterThanOrEqual(gap);
  }
  expect(hard.length).toBeLessThanOrEqual(2);
  days.forEach((d, i) => {
    if (!d.workout) return;
    expect(d.workout.seconds, `${d.date} ${d.workout.id}`).toBeLessThanOrEqual(
      set.week[i]!.minutes * 60,
    );
    expect(set.week[i]!.minutes, `${d.date} is a rest day`).toBeGreaterThan(0);
    expect(d.workout.type).toBe(set.week[i]!.indoor ? "VirtualRide" : "Ride");
  });
}

describe("where a plan starts", () => {
  it("reads the last eight weeks", () => {
    const h = history(weeksOfRides(6), monday);
    expect(h.activeWeeks).toBe(8);
    expect(h.usualSeconds).toBeCloseTo(6 * 3600);
    expect(needsExperience(weeksOfRides(6), monday)).toBe(false);
  });
  it("asks only when there's too little to go by", () => {
    expect(needsExperience(weeksOfRides(6, 3), monday)).toBe(true);
    expect(needsExperience([], monday)).toBe(true);
  });
  it("starts more cautiously the less it knows, and after time off", () => {
    const none = startState({ today: monday, acts: [], settings: settings() });
    const some = startState({
      today: monday,
      acts: [],
      settings: settings(),
      experience: "experienced",
    });
    expect(none.doses.threshold).toBeLessThan(some.doses.threshold);
    const back = startState({
      today: monday,
      acts: weeksOfRides(6),
      settings: settings(),
      comingBack: true,
    });
    const usual = startState({ today: monday, acts: weeksOfRides(6), settings: settings() });
    expect(back.doses.vo2).toBeLessThan(usual.doses.vo2);
    expect(back.hardCap).toBe(1);
    expect(back.weeklySeconds).toBeLessThan(usual.weeklySeconds);
  });
  it("never starts bigger than the time there is", () => {
    const short = settings([off, day(30), off, day(30), off, off, off]);
    expect(
      startState({ today: monday, acts: weeksOfRides(12), settings: short }).weeklySeconds,
    ).toBe(3600);
  });
});

describe("the shape of the season", () => {
  const s = state({ cycleStart: monday, buildWeeks: 3 });
  it("rests every fourth week, and sooner on a shorter cycle", () => {
    const at = (w: number, st = s) =>
      weekShape(addDays(monday, 7 * w), { goal: "fitter" }, [], st).recovery;
    expect([0, 1, 2, 3, 4, 7].map((w) => at(w))).toEqual([false, false, false, true, false, true]);
    expect(at(2, { ...s, buildWeeks: 2 })).toBe(true);
  });
  it("goes from base to build on its own, with no race", () => {
    const at = (w: number) => weekShape(addDays(monday, 7 * w), { goal: "fitter" }, [], s).phase;
    expect(at(0)).toBe("base");
    expect(at(4)).toBe("build");
    expect(at(8)).toBe("build");
    expect(at(12)).toBe("base");
  });
  it("counts back from the race, and starts late when it's close", () => {
    const r = [race("2027-05-02")];
    const phase = (m: string) => weekShape(m, { goal: "race" }, r, s).phase;
    expect(phase("2026-11-09")).toBe("base");
    expect(phase("2027-02-01")).toBe("build");
    expect(phase("2027-04-05")).toBe("specific");
    expect(phase("2027-04-26")).toBe("taper");
    expect(weekShape(monday, { goal: "race" }, [race(addDays(monday, 20))], s).phase).toBe(
      "specific",
    );
  });
  it("never lands a recovery week on the taper or the week before it", () => {
    const r = [race("2027-05-02")];
    for (let i = 0; i < 20; i++) {
      const m = addDays("2027-04-26", -7 * i);
      const shape = weekShape(m, { goal: "race" }, r, s);
      if (i <= 1) expect(shape.recovery, m).toBe(false);
    }
    const shapes = Array.from({ length: 12 }, (_, i) =>
      weekShape(addDays("2027-04-19", -7 * i), { goal: "race" }, r, s),
    );
    expect(shapes.filter((x) => x.recovery).length).toBeGreaterThanOrEqual(2);
  });
  it("ignores a race when the goal is another, and a C race as a target", () => {
    expect(weekShape(monday, { goal: "healthy" }, [race(addDays(monday, 3))], s).phase).toBe(
      "maintain",
    );
    expect(weekShape(monday, { goal: "race" }, [race(addDays(monday, 30), "C")], s).phase).not.toBe(
      "specific",
    );
  });
  it("lays out later weeks up to the race, or a stretch ahead", () => {
    const r = [race(addDays(monday, 70))];
    const toRace = outline(monday, "race", r, state(), settings());
    expect(toRace.length).toBe(11);
    expect(toRace[toRace.length - 1]!.phase).toBe("taper");
    expect(outline(monday, "fitter", [], state(), settings())).toHaveLength(8);
  });
});

describe("dose ladders", () => {
  it("hold no workouts of your own, none for one kind of bike, none from the hardest shelf", () => {
    const mine = buildPool(
      [
        {
          id: "m",
          name: "Mia",
          type: "Ride",
          description: "- 10m 60%\n\n5x\n- 4m 95%\n- 3m 50%",
          moving_time: null,
          icu_training_load: null,
        },
      ],
      "ride",
      th,
    );
    for (const kind of ["tempo", "threshold", "vo2", "anaerobic"] as const) {
      const ids = ladderFor(mine, kind, false, th).map((r) => r.workout.id);
      expect(ids.length, kind).toBeGreaterThan(2);
      expect(ids.join()).not.toMatch(/lib-|aero-builder|ironman|the-|70-3/);
    }
  });
  it("keep the anaerobic workouts", () => {
    const ids = ladderFor(pool, "anaerobic", false, th).map((r) => r.workout.id);
    expect(ids).toContain("r-anaerobic");
    expect(ids).toContain("c-anaerobic-40-20-3x6");
  });
  it("climb in order of work", () => {
    const l = ladderFor(pool, "threshold", false, th);
    for (let i = 1; i < l.length; i++) expect(l[i]!.work).toBeGreaterThanOrEqual(l[i - 1]!.work);
    expect(
      workSeconds(
        pool.find((w) => w.id === "c-threshold-4x10")!,
        "threshold",
        th,
      ),
    ).toBe(2400);
  });
  it("stay on the same rung through small changes, and move once the dose reaches another", () => {
    const l = ladderFor(pool, "threshold", false, th);
    const a = pickRung(l, 30 * 60, 3 * 3600)!;
    expect(a.work).toBeLessThanOrEqual(30 * 60);
    const b = pickRung(l, 30 * 60 * 1.05, 3 * 3600)!;
    expect(b.work).toBeGreaterThanOrEqual(a.work * 0.85);
    expect(pickRung(l, 60 * 60, 3 * 3600)!.work).toBeGreaterThan(a.work);
  });
  it("respect the time there is, and offer nothing when nothing fits", () => {
    const l = ladderFor(pool, "threshold", false, th);
    expect(pickRung(l, 60 * 60, 45 * 60)!.workout.seconds).toBeLessThanOrEqual(45 * 60);
    expect(pickRung(l, 60 * 60, 10 * 60)).toBeNull();
  });
  it("rotate among what's close", () => {
    const l = ladderFor(pool, "vo2", false, th);
    const first = pickRung(l, 15 * 60, 3 * 3600)!;
    const next = pickRung(l, 15 * 60, 3 * 3600, new Set([first.workout.id]))!;
    if (l.filter((r) => r.work <= 15 * 60 && r.work >= first.work * 0.85).length > 1)
      expect(next.workout.id).not.toBe(first.workout.id);
  });
});

describe("a week", () => {
  const riders: [string, () => ReturnType<typeof week>, PlanSettings, number?][] = [
    ["typical", () => week({ s: state({ cycleStart: addDays(monday, -28) }) }), settings()],
    ["base", () => week(), settings()],
    ["recovery", () => week({ s: state({ cycleStart: addDays(monday, -21) }) }), settings()],
    [
      "wider gap",
      () => week({ s: state({ hardGap: 3, cycleStart: addDays(monday, -28) }) }),
      settings(),
      3,
    ],
    [
      "every day free",
      () =>
        week({
          plan: Array.from({ length: 7 }, (_, i) => day(90, false, i === 5)),
          s: state({ cycleStart: addDays(monday, -28) }),
        }),
      settings(Array.from({ length: 7 }, (_, i) => day(90, false, i === 5))),
    ],
    [
      "low volume",
      () => week({ plan: [off, day(45), off, day(45), off, day(90, false, true), off] }),
      settings([off, day(45), off, day(45), off, day(90, false, true), off]),
    ],
    ["stay healthy", () => week({ goal: "healthy" }), settings(typical, "healthy")],
    [
      "race in three weeks",
      () => week({ goal: "race", races: [race(addDays(monday, 20))] }),
      settings(typical, "race"),
    ],
    [
      "race this week",
      () => week({ goal: "race", races: [race(addDays(monday, 5))] }),
      settings(typical, "race"),
    ],
  ];
  for (const [name, make, set, gap] of riders)
    it(`keeps the rules: ${name}`, () => expectSound(make(), set, gap));

  it("puts the long ride on the chosen day and hard sessions away from it", () => {
    const days = week({ s: state({ cycleStart: addDays(monday, -28) }) });
    expect(days[5]!.role).toBe("long");
    const i = days.findIndex((d) => d.role === "hard");
    expect(i).toBeGreaterThanOrEqual(0);
    for (const [n, d] of days.entries())
      if (d.role === "hard") expect(Math.abs(n - 5)).toBeGreaterThanOrEqual(2);
  });
  it("makes do with two days next to each other: one hard, one long", () => {
    const plan = [off, off, off, off, off, day(90), day(180, false, true)];
    const days = week({ plan, s: state({ cycleStart: addDays(monday, -28) }) });
    expect(days[5]!.role).toBe("hard");
    expect(days[6]!.role).toBe("long");
  });
  it("gets longer rides than the library has", () => {
    const plan = [off, day(120), off, day(120), off, day(360, false, true), day(240)];
    const s = state({ weeklySeconds: 14 * 3600, cycleStart: addDays(monday, -28) });
    const days = week({ plan, s, longestSeconds: 5.5 * 3600 });
    expect(days[5]!.workout!.seconds).toBeGreaterThan(3.5 * 3600);
    expect(parseWorkout(days[5]!.workout!.description, "ride").unread).toEqual([]);
  });
  it("keeps long rides within reach of your longest", () => {
    const s = state({ weeklySeconds: 20 * 3600 });
    const days = week({
      s,
      longestSeconds: 3600,
      plan: [off, off, off, off, off, day(360, false, true), off],
    });
    expect(days[5]!.workout!.seconds).toBeLessThanOrEqual(3600 * 1.15);
  });
  it("is smaller in a recovery week, and smaller still in a taper", () => {
    const total = (d: ReturnType<typeof week>) =>
      d.reduce((n, x) => n + (x.workout?.seconds ?? 0), 0);
    const build = week({ s: state({ cycleStart: addDays(monday, -28) }) });
    const rest = week({ s: state({ cycleStart: addDays(monday, -21) }) });
    expect(total(rest)).toBeLessThan(total(build));
    expect(rest.filter((d) => d.role === "hard").length).toBeLessThanOrEqual(1);
  });
  it("counts a hard ride already done instead of a planned one", () => {
    const s = state({ cycleStart: addDays(monday, -28) });
    const none = week({ s });
    const after = week({ s, taken: [{ date: addDays(monday, 1), seconds: 7200, hard: true }] });
    expect(after.filter((d) => d.role === "hard").length).toBe(
      none.filter((d) => d.role === "hard").length - 1,
    );
    expect(after[1]!.role).toBe("taken");
    expect(after[1]!.workout).toBeNull();
  });
  it("stays away from a hard day just before the week", () => {
    const s = state({ cycleStart: addDays(monday, -28) });
    const days = week({
      s,
      recentHard: [addDays(monday, 0)],
      plan: [off, day(90), day(90), day(90), off, day(180, false, true), off],
    });
    expect(days[1]!.role).not.toBe("hard");
  });
  it("plans nothing while sick, or in the past", () => {
    const days = week({ today: addDays(monday, 2), off: new Set([addDays(monday, 3)]) });
    expect(days[0]!.role).toBe("past");
    expect(days[1]!.role).toBe("past");
    expect(days[3]!.workout).toBeNull();
  });
  it("leaves race day alone, and rests and opens around it", () => {
    const r = [race(addDays(monday, 5))];
    const days = week({
      goal: "race",
      races: r,
      plan: [day(60), day(60), day(60), day(60), day(60), day(60), day(60)],
    });
    expect(days[5]!.role).toBe("race");
    expect(days[5]!.workout).toBeNull();
    expect(days[4]!.workout?.id).toMatch(/opener/);
    expect(days[6]!.workout?.kind).toBe("recovery");
  });
  it("is the same every time", () => {
    expect(week()).toEqual(week());
  });
  it("doesn't take more than one anaerobic session", () => {
    const s = state({ cycleStart: addDays(monday, -28) });
    const days = week({ s, focus: "anaerobic" });
    expect(days.filter((d) => d.workout?.kind === "anaerobic").length).toBeLessThanOrEqual(1);
  });
  it("writes its own rides so intervals.icu can read them", () => {
    for (const w of [
      longRide(5 * 3600, false),
      easyRide(75 * 60, true),
      recoveryRide(45 * 60, false),
    ]) {
      const p = parseWorkout(w.description, "ride");
      expect(p.unread).toEqual([]);
      expect(p.totalSeconds, w.id).toBe(Number(w.id.split("-").pop()) * 60);
      // What it's for, then the steps, as the library's workouts are written.
      expect(w.description).toMatch(/\n\n(Warmup|Main set)\n- \d+m /);
    }
  });
});

describe("the review", () => {
  const hard = (over: Partial<SessionOutcome> = {}): SessionOutcome => ({
    date: monday,
    hard: true,
    plannedSeconds: 3600,
    doneSeconds: 3600,
    rating: "expected",
    ...over,
  });
  const input = (over: Partial<ReviewInput> = {}): ReviewInput => ({
    outcomes: [hard()],
    lowMornings: 0,
    hrvLow: false,
    recoveryWeek: false,
    off: false,
    ...over,
  });
  it("raises only on hard sessions done and rated fine", () => {
    expect(review(input())).toEqual({ result: "raise", reason: "good" });
    expect(review(input({ outcomes: [hard({ rating: "easier" })] })).result).toBe("raise");
  });
  it("lowers on a session not finished", () => {
    expect(review(input({ outcomes: [hard({ rating: "failed" })] }))).toEqual({
      result: "lower",
      reason: "failed",
    });
  });
  it("lowers on two harder in a row, and only in a row", () => {
    const h = (d: number, rating: "harder" | "expected") =>
      hard({ date: addDays(monday, d), rating });
    expect(review(input({ outcomes: [h(0, "harder"), h(2, "harder")] })).reason).toBe(
      "harder-twice",
    );
    expect(review(input({ outcomes: [h(0, "harder"), h(2, "expected")] })).result).toBe("hold");
  });
  it("lowers on three low mornings in four, whatever the sessions", () => {
    expect(review(input({ lowMornings: 3 }))).toEqual({ result: "lower", reason: "low-mornings" });
    expect(review(input({ lowMornings: 1 })).result).toBe("hold");
  });
  it("never raises on missing data", () => {
    for (const i of [
      input({ outcomes: [] }),
      input({ outcomes: [hard({ rating: null })] }),
      input({ outcomes: [hard({ doneSeconds: null, rating: null })] }),
      input({ outcomes: [hard({ doneSeconds: 1800 })] }),
      input({ outcomes: [{ ...hard(), hard: false }] }),
    ])
      expect(review(i).result).toBe("hold");
  });
  it("uses HRV only to hold back, or to lower with how you feel", () => {
    expect(review(input({ hrvLow: true }))).toEqual({ result: "hold", reason: "low-hrv" });
    expect(review(input({ hrvLow: true, lowMornings: 3 }))).toEqual({
      result: "lower",
      reason: "hrv-and-feel",
    });
    expect(review(input({ hrvLow: true, outcomes: [] })).result).toBe("hold");
  });
  it("doesn't raise in a recovery week, but can still lower", () => {
    expect(review(input({ recoveryWeek: true })).result).toBe("hold");
    expect(review(input({ recoveryWeek: true, lowMornings: 3 })).result).toBe("lower");
  });
  it("holds when sick, and with two sessions missed", () => {
    expect(review(input({ off: true, lowMornings: 3 }))).toEqual({ result: "hold", reason: "off" });
    const missed = (d: number) =>
      hard({ date: addDays(monday, d), doneSeconds: null, rating: null });
    expect(review(input({ outcomes: [missed(0), missed(2)] })).reason).toBe("missed");
  });
  it("reads low mornings from the check-in, ignoring empty days", () => {
    const w = (id: string, fatigue: number | null) =>
      ({ id, fatigue, sleepQuality: null, stress: null, mood: null }) as Wellness;
    const well = [
      w(addDays(monday, -4), 4),
      w(addDays(monday, -3), 3),
      w(addDays(monday, -2), 3),
      w(addDays(monday, -1), null),
      w(monday, 1),
    ];
    expect(lowMornings(well, monday)).toBe(2);
  });
});

describe("what a review changes", () => {
  it("raises in small steps and lowers in big ones", () => {
    const s = state();
    const up = applyReview(s, "raise", monday);
    expect(up.doses.vo2).toBeCloseTo(s.doses.vo2 * 1.05);
    const down = applyReview(s, "lower", monday);
    expect(down.doses.vo2).toBeCloseTo(s.doses.vo2 * 0.75);
    expect(down.hardCap).toBe(1);
    expect(applyReview(s, "hold", monday).doses).toEqual(s.doses);
  });
  it("holds a week's growth within 10% of the last build week, not a recovery week", () => {
    let s = state({ weeklySeconds: 20000, lastBuildSeconds: 20000 });
    for (let i = 0; i < 6; i++) s = applyReview(s, "raise", monday);
    expect(s.weeklySeconds).toBeCloseTo(22000);
    const after = rollWeek(
      { ...s, lastBuildSeconds: 22000, weeklySeconds: 13000 },
      { monday, recovery: true, seconds: 13000, lowEnding: false },
    );
    expect(after.weeklySeconds).toBe(22000);
  });
  it("learns recovery: two lowers bring it forward and shorten the cycle", () => {
    let s = state();
    s = applyReview(s, "lower", monday);
    expect(s.forcedRecovery).toBeNull();
    s = applyReview(s, "lower", addDays(monday, 3));
    expect(s.forcedRecovery).toBe(addDays(monday, 7));
    expect(s.buildWeeks).toBe(2);
    expect(s.hardGap).toBe(3);
    expect(weekShape(addDays(monday, 7), { goal: "fitter" }, [], s).recovery).toBe(true);
  });
  it("comes back to the level after recovery, unless it ended low", () => {
    const s = applyReview(state(), "lower", monday);
    const fine = rollWeek(s, { monday, recovery: true, seconds: 10000, lowEnding: false });
    expect(fine.doses).toEqual(state().doses);
    expect(fine.hardCap).toBe(2);
    const low = rollWeek(s, { monday, recovery: true, seconds: 10000, lowEnding: true });
    expect(low.doses.vo2).toBeCloseTo(state().doses.vo2 * 0.75);
  });
  it("eases the rhythm after two clean cycles, never beyond three build weeks", () => {
    let s = state({ buildWeeks: 2, hardGap: 3 });
    const end = { monday, recovery: true, seconds: 10000, lowEnding: false };
    s = rollWeek(s, end);
    expect(s.buildWeeks).toBe(2);
    s = rollWeek(s, end);
    expect(s.buildWeeks).toBe(3);
    expect(s.hardGap).toBe(2);
    expect(rollWeek(s, end).buildWeeks).toBe(3);
  });
  it("behaves like the trial's riders when simulated: mostly holds, rarely lowers", () => {
    // Nuuttila 2022: 55% maintained, 35% increased, 10% decreased. A rider who mostly copes, with a bad patch now and then.
    const counts = { raise: 0, hold: 0, lower: 0 };
    for (let i = 0; i < 400; i++) {
      const seed = (i * 7919) % 100;
      const rating =
        seed < 10
          ? "harder"
          : seed < 14
            ? "failed"
            : seed < 55
              ? "expected"
              : seed < 70
                ? "easier"
                : null;
      const r = review({
        outcomes: [
          {
            date: monday,
            hard: true,
            plannedSeconds: 3600,
            doneSeconds: seed > 92 ? 2000 : 3600,
            rating,
          },
        ],
        lowMornings: seed % 9 === 0 ? 3 : seed % 5 === 0 ? 1 : 0,
        hrvLow: seed % 11 === 0,
        recoveryWeek: i % 8 === 0,
        off: false,
      });
      counts[r.result]++;
    }
    expect(counts.hold).toBeGreaterThan(counts.raise * 0.8);
    expect(counts.lower).toBeLessThan(counts.raise);
    expect(counts.lower / 400).toBeLessThan(0.25);
  });
});

describe("matching what was planned with what happened", () => {
  const w = (seconds: number) => ({ seconds }) as never;
  const plan = (date: string, seconds = 3600) => ({
    date,
    role: "hard" as const,
    workout: w(seconds),
  });
  it("takes the same day and the closest length, each activity once", () => {
    const acts = [ride(monday, 3500, { id: "a" }), ride(monday, 1800, { id: "b" })];
    const m = matchSessions([plan(monday)], acts);
    expect(m.get(monday)?.id).toBe("a");
  });
  it("won't match a ride of a very different length, another day, or another sport", () => {
    expect(matchSessions([plan(monday)], [ride(monday, 9000)]).size).toBe(0);
    expect(matchSessions([plan(monday)], [ride(addDays(monday, 1), 3600)]).size).toBe(0);
    expect(matchSessions([plan(monday)], [ride(monday, 3600, { type: "Run" })]).size).toBe(0);
  });
  it("trusts a pairing from intervals.icu first", () => {
    const m = matchSessions(
      [{ ...plan(monday), pairedActivityId: "far" }],
      [ride(monday, 3600, { id: "near" }), ride(monday, 9000, { id: "far" })],
    );
    expect(m.get(monday)?.id).toBe("far");
  });
  it("counts indoor and outdoor rides alike", () => {
    expect(matchSessions([plan(monday)], [ride(monday, 3600, { type: "VirtualRide" })]).size).toBe(
      1,
    );
  });
  it("gives each past session what happened, and leaves today and later alone", () => {
    const acts = [ride(monday, 3600, { id: "a", planRating: "harder" })];
    const o = outcomesOf(
      [plan(monday), plan(addDays(monday, 1)), plan(addDays(monday, 2))],
      acts,
      addDays(monday, 2),
    );
    expect(o).toEqual([
      {
        date: monday,
        hard: true,
        plannedSeconds: 3600,
        doneSeconds: 3600,
        rating: "harder",
        execution: null,
      },
      {
        date: addDays(monday, 1),
        hard: true,
        plannedSeconds: 3600,
        doneSeconds: null,
        rating: null,
        execution: null,
      },
    ]);
  });
});

describe("what a change would touch", () => {
  const d = (date: string, id: string | null) =>
    ({ date, role: id ? "easy" : "rest", workout: id ? { id } : null }) as never;
  it("names only what differs, and never today or before", () => {
    const before = [d(monday, "a"), d(addDays(monday, 1), "b"), d(addDays(monday, 2), "c")];
    const after = [d(monday, "x"), d(addDays(monday, 1), "y"), d(addDays(monday, 2), "c")];
    expect(diffWeek(before, after, monday).map((c) => c.date)).toEqual([addDays(monday, 1)]);
  });
});

describe("a raise", () => {
  it("never lowers the week, even when the last sessions added up to much less", () => {
    const s = state({ weeklySeconds: 10 * 3600, lastBuildSeconds: 5 * 3600 });
    expect(applyReview(s, "raise", monday).weeklySeconds).toBe(10 * 3600);
  });
});

describe("what's kept", () => {
  it("reads settings only when they're whole", () => {
    expect(parsePlanSettings(JSON.stringify(settings()))?.goal).toBe("fitter");
    for (const bad of [
      null,
      "",
      "{",
      '{"goal":"fitter"}',
      JSON.stringify({ goal: "x", week: typical }),
    ])
      expect(parsePlanSettings(bad)).toBeNull();
  });
  it("uses nothing the app has ruled out", async () => {
    const files = import.meta.glob("./*.ts", { query: "?raw", import: "default" });
    for (const [name, load] of Object.entries(files)) {
      if (name.includes("test")) continue;
      const text = (await load()) as string;
      expect(text, name).not.toMatch(/restingHR|resting_hr|\.ratio\b|loadCheck/i);
    }
  });
});
