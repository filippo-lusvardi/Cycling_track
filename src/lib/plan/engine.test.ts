import { describe, expect, it } from "vitest";
import type { Activity, PlannedEvent } from "../intervals";
import { buildPool, type SuggestInput } from "../suggest";
import { addDays } from "../training";
import { executionOf } from "./execution";
import {
  catchUp,
  daysToFill,
  easierToday,
  fillDue,
  lastReviewDay,
  proposalFor,
  reconcile,
  reviewDue,
  windowFor,
  workoutById,
  type PlanContext,
} from "./engine";
import { textHash, type NoteSession, type PlanNote } from "./note";
import { startState } from "./start-level";
import type { DayPlan, PlanSettings } from "./types";

// A Thursday: a review day.
const today = "2026-11-12";
const monday = "2026-11-09";
const th = { ftp: 250 };
const pool = buildPool([], "ride", th);
const off: DayPlan = { minutes: 0, indoor: false, long: false };
const d = (minutes: number, indoor = false, long = false): DayPlan => ({ minutes, indoor, long });
const settings: PlanSettings = {
  goal: "fitter",
  week: [off, d(90, true), d(60), d(90, true), off, d(240, false, true), d(120)],
};
const ride = (date: string, secs: number, extra: Partial<Activity> = {}) =>
  ({
    id: `a-${date}`,
    name: "",
    type: "Ride",
    start_date_local: `${date}T09:00:00`,
    moving_time: secs,
    icu_intensity: 65,
    icu_training_load: 70,
    ...extra,
  }) as unknown as Activity;
const history = Array.from({ length: 8 }, (_, w) =>
  [1, 3, 5].map((x) => ride(addDays(monday, -7 * (w + 1) + x), 7200)),
).flat();
const input = (over: Partial<SuggestInput> = {}): SuggestInput => ({
  today,
  sport: "ride",
  focus: "aerobic",
  races: [],
  events: [],
  offEvents: [],
  acts: history,
  wellness: [],
  score: 85,
  form: 0,
  th,
  pool,
  ...over,
});
const state = (over = {}) => ({
  ...startState({ today: addDays(today, -40), acts: history, settings }),
  cycleStart: addDays(monday, -28),
  weekRolled: monday,
  lastReview: addDays(today, -3),
  ...over,
});
const TEXT =
  "Warmup\n- 15m Ramp 40-60%\n\nMain set 4x\n- 10m 100%\n- 5m 50%\n\nCooldown\n- 10m Ramp 60-40%";
const event = (id: string, date: string, description = TEXT): PlannedEvent => ({
  id,
  date,
  end: null,
  category: "WORKOUT",
  type: "VirtualRide",
  name: "Soglia",
  description,
  moving_time: 5100,
  icu_training_load: 90,
});
const session = (
  id: string,
  date: string,
  role: NoteSession["role"] = "hard",
  description = TEXT,
): NoteSession => ({
  date,
  role,
  workoutId: "c-threshold-4x10",
  seconds: 5100,
  eventId: id,
  textHash: textHash(description),
});
const note = (sessions: NoteSession[] = [], over: Partial<PlanNote> = {}): PlanNote => ({
  settings,
  state: state(),
  sessions,
  reviews: [],
  undo: [],
  ...over,
});
const ctx = (
  n: PlanNote,
  calendar: PlannedEvent[] = [],
  i: Partial<SuggestInput> = {},
): PlanContext => ({ note: n, input: input(i), calendar });

describe("the calendar has the last word", () => {
  it("follows a session someone moved, and drops one they deleted", () => {
    const n = note([session("1", addDays(today, 1)), session("2", addDays(today, 2))]);
    const { sessions } = reconcile(n, [event("1", addDays(today, 3))], addDays(today, -14));
    expect(sessions).toHaveLength(1);
    expect(sessions[0]!.date).toBe(addDays(today, 3));
  });
  it("notices a session rewritten by hand", () => {
    const n = note([session("1", addDays(today, 1))]);
    const { edited } = reconcile(
      n,
      [event("1", addDays(today, 1), "- 20m 90%")],
      addDays(today, -14),
    );
    expect(edited.has(addDays(today, 1))).toBe(true);
  });
});

describe("the next seven days", () => {
  const fri = addDays(today, 1);
  it("are filled by a check, up to seven days from it", () => {
    const fill = daysToFill(ctx(note()), state());
    expect(fill.length).toBeGreaterThan(0);
    for (const d of fill) {
      expect(d.date >= today).toBe(true);
      expect(d.date <= addDays(today, 6)).toBe(true);
      expect(d.workout).not.toBeNull();
    }
  });
  it("cross into the next week", () => {
    const from = "2026-11-13"; // A Friday: the seven days reach Thursday.
    const fill = daysToFill(ctx(note(), [], { today: from }), state());
    expect(fill.some((d) => d.date >= "2026-11-16")).toBe(true);
    expect(fill.every((d) => d.date <= addDays(from, 6))).toBe(true);
  });
  it("only add to what's there, and stay spaced around it", () => {
    const placedDay = addDays(today, 1);
    const n = note([session("1", placedDay)]);
    const fill = daysToFill(ctx(n, [event("1", placedDay)]), state());
    expect(fill.find((d) => d.date === placedDay)).toBeUndefined();
    for (const d of fill)
      if (d.role === "hard")
        expect(
          Math.abs(new Date(d.date).getTime() - new Date(placedDay).getTime()) / 864e5,
        ).toBeGreaterThanOrEqual(2);
    expect(fill.filter((d) => d.role === "hard").length).toBeLessThanOrEqual(1);
  });
  it("leave a day someone cleared by hand", () => {
    const n = note([session("1", fri)]);
    const { cleared } = reconcile(n, [], addDays(today, -14));
    expect(cleared.has(fri)).toBe(true);
    expect(daysToFill(ctx(n), state()).find((d) => d.date === fri)).toBeUndefined();
    expect(
      daysToFill(ctx(note([], { declined: [fri] })), state()).find((d) => d.date === fri),
    ).toBeUndefined();
  });
  it("show what's on the calendar, then what's expected after the last check", () => {
    const placedDay = addDays(today, 1);
    const n = note([session("1", placedDay)], { lastFill: addDays(today, -2) });
    const days = windowFor(ctx(n, [event("1", placedDay)]), state());
    expect(days).toHaveLength(7);
    expect(days[0]!.date).toBe(today);
    expect(days[1]!.workout!.name).toBe("Soglia");
    expect(days[1]!.upcoming).toBeUndefined();
    expect(days.filter((d) => d.date <= addDays(today, 4)).every((d) => !d.upcoming)).toBe(true);
    expect(days.some((d) => d.upcoming)).toBe(true);
  });
  it("are due at each check, once", () => {
    expect(lastReviewDay("2026-11-11")).toBe("2026-11-09");
    expect(lastReviewDay("2026-11-12")).toBe("2026-11-12");
    expect(fillDue(note([], { lastFill: "2026-11-09" }), today)).toBe(true);
    expect(fillDue(note([], { lastFill: today }), today)).toBe(false);
    expect(fillDue(note([], { lastFill: today }), addDays(today, 3))).toBe(false);
    expect(fillDue(note([], { lastFill: today }), addDays(today, 4))).toBe(true);
  });
  it("are due again when the days or the goal change", () => {
    expect(fillDue(note([], { lastFill: null, replan: true }), today)).toBe(true);
    expect(fillDue(note([], { lastFill: today, replan: true }), today)).toBe(false);
  });
});

describe("when a review comes round", () => {
  it("is on Mondays and Thursdays, once", () => {
    expect(reviewDue(state({ lastReview: "2026-11-09" }), today)).toBe(true);
    expect(reviewDue(state({ lastReview: today }), today)).toBe(false);
    expect(reviewDue(state({ lastReview: today }), addDays(today, 3))).toBe(false);
    expect(reviewDue(state({ lastReview: today }), addDays(today, 4))).toBe(true);
  });
  it("isn't due the moment a plan starts", () => {
    expect(reviewDue(state({ lastReview: null, startedOn: today }), today)).toBe(false);
  });
});

describe("a proposal", () => {
  const hardYesterday = addDays(today, -1);
  const tomorrow = addDays(today, 2);
  const placedCalendar = [event("1", hardYesterday), event("2", tomorrow, "- 90m 65%")];
  const placed = [session("1", hardYesterday), session("2", tomorrow, "long", "- 90m 65%")];
  const rated = (rating: "harder" | "failed" | "expected", watts?: number) => {
    const act = ride(hardYesterday, 5100, { planRating: rating });
    const execution = watts
      ? executionOf({
          description: TEXT,
          ftp: 250,
          watts: Array.from({ length: 5100 }, () => watts),
        })
      : null;
    return { acts: [...history, act], executions: new Map([[act.id, execution]]) };
  };

  it("lowers after a session that couldn't be finished, never touching today", () => {
    const { acts, executions } = rated("failed");
    const p = proposalFor(ctx(note(placed), placedCalendar, { acts }), executions)!;
    expect(p.review).toEqual({ result: "lower", reason: "failed" });
    expect(p.state.doses.vo2).toBeLessThan(note().state.doses.vo2);
    for (const c of p.changes) expect(c.date > today).toBe(true);
  });
  it("doesn't count too hard after riding 70 W over", () => {
    const { acts, executions } = rated("failed", 320);
    const p = proposalFor(ctx(note(placed), placedCalendar, { acts }), executions)!;
    expect(p.review).toEqual({ result: "hold", reason: "went-over" });
    expect(p.state.doses).toEqual(note().state.doses);
  });
  it("won't lower twice for the same session", () => {
    const { acts, executions } = rated("failed");
    const n = note(placed, { state: state({ lastReview: hardYesterday }) });
    const p = proposalFor(ctx(n, placedCalendar, { acts }), executions);
    expect(p?.review.result).not.toBe("lower");
  });
  it("is nothing to ask when the review changes nothing on the calendar", () => {
    const p = proposalFor(ctx(note()), new Map())!;
    expect(p.silent).toBe(true);
    expect(p.review.result).toBe("hold");
  });
  it("changes only what's on the calendar: empty days are for the check", () => {
    const { acts, executions } = rated("failed");
    const p = proposalFor(ctx(note(placed), placedCalendar, { acts }), executions)!;
    for (const c of p.changes) expect(c.from).not.toBeNull();
  });
  it("redraws the week when the days change, and leaves a rewritten session alone", () => {
    const edited = [event("2", tomorrow, "- 20m 90%")];
    const n = note([session("2", tomorrow, "easy", "- 90m 65%")], { replan: true });
    const p = proposalFor(ctx(n, edited), new Map())!;
    expect(p.review.reason).toBe("days-changed");
    expect(p.changes.find((c) => c.date === tomorrow)).toBeUndefined();
  });
  it("waits when no review is due", () => {
    const n = note([], { state: state({ lastReview: today }) });
    expect(proposalFor(ctx(n), new Map())).toBeNull();
  });
});

describe("as weeks pass", () => {
  it("takes each new week into account once", () => {
    const n = note([], { state: state({ weekRolled: addDays(monday, -14) }) });
    expect(catchUp(ctx(n)).weekRolled).toBe(monday);
    const again = note([], { state: catchUp(ctx(n)) });
    expect(catchUp(ctx(again))).toEqual(again.state);
  });
});

describe("swapping and going back", () => {
  it("offers something easier only for a hard session", () => {
    const hard = {
      date: today,
      role: "hard" as const,
      workout: workoutById("c-threshold-4x10", pool, true)!,
    };
    expect(easierToday(hard)!.kind).toBe("recovery");
    expect(easierToday(hard)!.type).toBe("VirtualRide");
    expect(easierToday({ ...hard, role: "easy" })).toBeNull();
  });
  it("rebuilds a workout from what the note keeps", () => {
    expect(workoutById("plan-long-150", pool, false)!.seconds).toBe(9000);
    expect(workoutById("plan-easy-75", pool, true)!.type).toBe("VirtualRide");
    expect(workoutById("c-threshold-4x10", pool, false)!.name).toBeTruthy();
    expect(workoutById("gone", pool, false)).toBeNull();
  });
});
