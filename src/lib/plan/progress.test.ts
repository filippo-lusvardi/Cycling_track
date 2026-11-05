import { describe, expect, it } from "vitest";
import type { Activity, PlannedEvent } from "../intervals";
import type { SuggestInput } from "../suggest";
import type { PlanContext } from "./engine";
import type { Execution } from "./execution";
import { textHash, writeNote, type NoteWeek, type PlanNote } from "./note";
import { pastWeekLines, sessionLines, weekLine, weeksDue } from "./progress";

const today = "2026-11-05"; // a Thursday: its week began on the 2nd
const session = (date: string, id: string, seconds = 3600) => ({
  date,
  role: "easy" as const,
  workoutId: "plan-easy",
  seconds,
  eventId: id,
  textHash: textHash("text"),
});
const event = (date: string, id: string) =>
  ({
    id,
    date,
    name: `Seduta ${id}`,
    description: "text",
    type: "Ride",
  }) as unknown as PlannedEvent;
const ride = (id: string, date: string, secs = 3500) =>
  ({
    id,
    type: "Ride",
    start_date_local: `${date}T08:00:00`,
    moving_time: secs,
  }) as unknown as Activity;
const score = (n: number) => ({ score: n }) as Execution;

const note = (over: Partial<PlanNote> = {}) =>
  ({
    settings: { goal: "fitter", week: [] },
    state: { startedOn: "2026-10-01", cycleStart: "2026-10-05", buildWeeks: 3 },
    sessions: [
      session("2026-10-26", "a"),
      session("2026-10-28", "b"),
      session("2026-11-03", "c"),
      session("2026-11-07", "d"),
    ],
    reviews: [],
    undo: [],
    ...over,
  }) as unknown as PlanNote;
const ctx = (n: PlanNote = note(), acts: Activity[] = []): PlanContext => ({
  note: n,
  input: { today, acts, races: [] } as unknown as SuggestInput,
  calendar: ["2026-10-26:a", "2026-10-28:b", "2026-11-03:c", "2026-11-07:d"].map((x) => {
    const [d, id] = x.split(":");
    return event(d!, id!);
  }),
});

describe("how the plan has gone", () => {
  it("each session with its ride and score, oldest first", () => {
    const lines = sessionLines(
      ctx(note(), [ride("r1", "2026-11-03")]),
      "2026-11-02",
      today,
      new Map([["r1", score(86)]]),
    );
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ date: "2026-11-03", score: 86 });
    expect(lines[0]!.workout?.name).toBe("Seduta c");
    expect(lines[0]!.act?.id).toBe("r1");
  });
  it("a session with no ride has no score", () => {
    const [l] = sessionLines(ctx(), "2026-11-02", today, new Map());
    expect(l).toMatchObject({ act: null, score: null });
  });
  it("a finished week in a line: done against planned, time ridden, mean score", () => {
    const c = ctx(note(), [ride("r1", "2026-10-26", 3000), ride("r2", "2026-10-28", 4000)]);
    const lines = sessionLines(
      c,
      "2026-10-26",
      "2026-11-01",
      new Map([
        ["r1", score(80)],
        ["r2", null],
      ]),
    );
    expect(weekLine(c, "2026-10-26", lines)).toMatchObject({
      monday: "2026-10-26",
      planned: 2,
      done: 2,
      seconds: 7000,
      score: 80,
    });
  });
  it("a week with nothing planned isn't a line", () => {
    expect(weekLine(ctx(), "2026-10-19", [])).toBeNull();
  });
  it("only finished weeks that aren't written down yet, and not before the plan", () => {
    expect(weeksDue(note(), today)).toEqual([
      "2026-10-05",
      "2026-10-12",
      "2026-10-19",
      "2026-10-26",
    ]);
    const kept = [{ monday: "2026-10-26" }] as NoteWeek[];
    expect(weeksDue(note({ pastWeeks: kept }), today)).not.toContain("2026-10-26");
    expect(
      weeksDue(note({ state: { startedOn: "2026-11-03" } } as unknown as Partial<PlanNote>), today),
    ).toEqual([]);
  });
  it("past weeks join what's written down with what isn't, newest first", () => {
    const old: NoteWeek = {
      monday: "2026-03-02",
      phase: "base",
      planned: 3,
      done: 2,
      seconds: 100,
    };
    const out = pastWeekLines(ctx(note({ pastWeeks: [old] })), null, "2026-10-08");
    expect(out.map((w) => w.monday)).toEqual(["2026-10-26", "2026-03-02"]);
  });
  it("the note keeps half a year of weeks at most", () => {
    const many = Array.from({ length: 40 }, (_, i): NoteWeek => ({
      monday: `2026-W${i}`,
      phase: "base",
      planned: 1,
      done: 1,
      seconds: 1,
    }));
    const base = note();
    const text = writeNote(
      note({
        pastWeeks: many,
        state: { ...base.state, doses: {}, lastBuildSeconds: 0, weeklySeconds: 0 } as never,
      }),
      today,
    );
    expect(text).not.toContain('"2026-W13"');
    expect(text).toContain('"2026-W14"');
  });
});
