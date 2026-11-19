// Days set by hand: what can be picked, how the plan keeps away from them, and what the calendar and note get.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PlannedEvent } from "../intervals";
import { buildPool, type SuggestInput } from "../suggest";
import { addDays } from "../training";
import { alternativesFor, proposalFor, reconcile, type PlanContext } from "./engine";
import { INDOOR_MAX } from "./layout";
import { readNote, textHash, writeNote, type NoteSession, type PlanNote } from "./note";
import { startState } from "./start-level";
import type { DayPlan, PlanSettings } from "./types";

const calls: { op: string; args: unknown[] }[] = [];
let saved: PlanNote | null = null;
vi.mock("../source", () => ({
  scheduleWorkout: vi.fn(
    async (...args: unknown[]) => (calls.push({ op: "schedule", args }), "new-1"),
  ),
  replacePlanned: vi.fn(async (...args: unknown[]) => void calls.push({ op: "replace", args })),
  deleteEvent: vi.fn(async (...args: unknown[]) => void calls.push({ op: "delete", args })),
  getRideWatts: vi.fn(),
}));
vi.mock("./store", () => ({
  loadPlan: vi.fn(),
  savePlan: vi.fn(async (note: PlanNote) => void (saved = note)),
}));
const { setDay, roleOf } = await import("./actions");

const today = "2026-11-12";
const th = { ftp: 250 };
const pool = buildPool([], "ride", th);
const off: DayPlan = { minutes: 0, indoor: false, long: false };
const d = (minutes: number, indoor = false, long = false): DayPlan => ({ minutes, indoor, long });
const settings: PlanSettings = {
  goal: "fitter",
  week: [off, d(90, true), d(60), d(90, true), d(90), d(240, false, true), d(120)],
};
const state = () => ({
  ...startState({ today: addDays(today, -40), acts: [], settings }),
  cycleStart: addDays(today, -31),
  weekRolled: "2026-11-09",
  lastReview: today,
});
const note = (sessions: NoteSession[] = [], over: Partial<PlanNote> = {}): PlanNote => ({
  settings,
  state: state(),
  sessions,
  reviews: [],
  undo: [],
  ...over,
});
const input = (): SuggestInput =>
  ({
    today,
    sport: "ride",
    focus: "aerobic",
    races: [],
    events: [],
    offEvents: [],
    acts: [],
    wellness: [],
    score: 85,
    form: 0,
    th,
    pool,
  }) as SuggestInput;
const ctx = (n: PlanNote, calendar: PlannedEvent[] = []): PlanContext => ({
  note: n,
  input: input(),
  calendar,
});
const event = (id: string, date: string, description = "x"): PlannedEvent => ({
  id,
  date,
  end: null,
  category: "WORKOUT",
  type: "Ride",
  name: "Hazel 1 h",
  description,
  moving_time: 3600,
  icu_training_load: 40,
});
const session = (id: string, date: string, over: Partial<NoteSession> = {}): NoteSession => ({
  date,
  role: "easy",
  workoutId: "plan-easy-60",
  seconds: 3600,
  eventId: id,
  textHash: textHash("x"),
  ...over,
});

beforeEach(() => {
  calls.length = 0;
  saved = null;
});

describe("choosing a day's workout by hand", () => {
  const fri = "2026-11-13";
  it("offers what the day already is first, all within its time", () => {
    const hard = alternativesFor(ctx(note()), fri, state(), "hard");
    expect(hard[0]!.role).toBe("hard");
    const easy = alternativesFor(ctx(note()), fri, state(), "easy");
    expect(easy[0]!.role).toBe("easy");
    for (const a of [...hard, ...easy]) expect(a.workout.seconds).toBeLessThanOrEqual(90 * 60);
    expect(new Set(easy.map((a) => a.workout.id)).size).toBe(easy.length);
  });
  it("keeps the trainer's limit on an indoor day, and offers varied rides there", () => {
    const thu = "2026-11-12";
    const list = alternativesFor(ctx(note()), thu, state());
    for (const a of list) {
      expect(a.workout.seconds).toBeLessThanOrEqual(INDOOR_MAX);
      expect(a.workout.type).toBe("VirtualRide");
    }
    expect(list.filter((a) => a.role === "easy").length).toBeGreaterThan(1);
  });
  it("gives a hand-picked workout its part in the week", () => {
    const w = (kind: string, seconds = 3600) => ({ kind, seconds }) as never;
    expect(roleOf(w("vo2"), false)).toBe("hard");
    expect(roleOf(w("tempo"), true)).toBe("hard");
    expect(roleOf(w("endurance", 3 * 3600), true)).toBe("long");
    expect(roleOf(w("endurance", 3 * 3600), false)).toBe("easy");
  });
});

describe("a day set by hand", () => {
  const sat = "2026-11-14";
  const sun = "2026-11-15";
  it("is never changed by the plan, and the next days are proposed again around it", () => {
    const n = note([session("e1", sat, { manual: true }), session("e2", sun)], {
      replan: true,
      replanBy: "hand",
    });
    const cal = [event("e1", sat), event("e2", sun)];
    expect(reconcile(n, cal, addDays(today, -14)).edited.has(sat)).toBe(true);
    const p = proposalFor(ctx(n, cal), new Map());
    expect(p?.review.reason).toBe("hand-changed");
    expect(p?.changes.some((c) => c.date === sat)).toBe(false);
  });
  it("changes the event already there, and marks the session as chosen by hand", async () => {
    const stored = { id: "note", note: note([session("e2", sun)]) } as never;
    const to = alternativesFor(ctx(note()), sun, state(), "easy")[1]!.workout;
    await setDay(
      stored,
      ctx(note([session("e2", sun)]), [event("e2", sun)]),
      { date: sun, to },
      today,
    );
    expect(calls).toEqual([
      { op: "replace", args: ["e2", expect.objectContaining({ name: to.name })] },
    ]);
    const s = saved!.sessions.find((x) => x.date === sun)!;
    expect(s).toMatchObject({ manual: true, workoutId: to.id, eventId: "e2" });
    expect(saved!.undo).toEqual([{ date: sun, workoutId: "plan-easy-60" }]);
    expect(saved).toMatchObject({ replan: true, replanBy: "hand" });
    // And it survives the note's round trip.
    expect(readNote(writeNote(saved!, today))!.sessions.find((x) => x.date === sun)!.manual).toBe(
      true,
    );
  });
  it("puts a workout on an empty day, and empties a day so no check fills it", async () => {
    const stored = { id: "note", note: note() } as never;
    const to = alternativesFor(ctx(note()), sat, state(), "long")[0]!;
    await setDay(stored, ctx(note()), { date: sat, to: to.workout, role: to.role }, today);
    expect(calls[0]!.op).toBe("schedule");
    expect(saved!.sessions[0]).toMatchObject({
      date: sat,
      role: "long",
      eventId: "new-1",
      manual: true,
    });

    calls.length = 0;
    const n = note([session("e2", sun)]);
    await setDay(
      { id: "note", note: n } as never,
      ctx(n, [event("e2", sun)]),
      { date: sun, to: null },
      today,
    );
    expect(calls).toEqual([{ op: "delete", args: ["e2"] }]);
    expect(saved!.sessions).toEqual([]);
    expect(saved!.declined).toContain(sun);
  });
});
