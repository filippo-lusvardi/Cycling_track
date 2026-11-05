import { describe, expect, it } from "vitest";
import { startState } from "./start-level";
import { NOTE_SEARCH_DAYS, noteDate, readNote, textHash, writeNote, type PlanNote } from "./note";
import { ratingIn, withRating, withoutRating } from "./rating";
import { addDays } from "../training";
import type { PlanSettings } from "./types";

const today = "2026-11-09";
const settings: PlanSettings = {
  goal: "fitter",
  week: Array.from({ length: 7 }, (_, i) => ({
    minutes: i === 0 ? 0 : 90,
    indoor: i % 2 === 0,
    long: i === 5,
  })),
};
const note = (over: Partial<PlanNote> = {}): PlanNote => ({
  settings,
  state: startState({ today, acts: [], settings }),
  sessions: [],
  reviews: [],
  undo: [],
  ...over,
});
const session = (date: string) => ({
  date,
  role: "hard" as const,
  workoutId: "c-threshold-4x10",
  seconds: 4980,
  eventId: "123456",
  textHash: textHash("x"),
});

describe("the plan's note", () => {
  it("reads back what was written", () => {
    const n = note({
      sessions: [session(today)],
      reviews: [{ on: today, result: "hold", reason: "mixed" }],
    });
    expect(readNote(writeNote(n, today))).toEqual(n);
  });
  it("opens with a sentence for anyone who finds it", () => {
    expect(writeNote(note(), today).split("\n")[0]).toMatch(/plan/i);
  });
  it("reads as nothing when damaged, or when it's some other note", () => {
    const text = writeNote(note(), today);
    for (const bad of [
      null,
      "",
      "shopping list",
      text.slice(0, -5),
      text.replace('"fitter"', '"x"'),
    ])
      expect(readNote(bad)).toBeNull();
  });
  it("stays small however long the plan runs", () => {
    const n = note({
      sessions: Array.from({ length: 400 }, (_, i) => session(addDays(today, -i))),
      reviews: Array.from({ length: 400 }, (_, i) => ({
        on: addDays(today, -i),
        result: "hold" as const,
        reason: "mixed",
      })),
      undo: Array.from({ length: 7 }, (_, i) => ({
        date: addDays(today, i),
        workoutId: "c-threshold-4x10",
      })),
    });
    const text = writeNote(n, today);
    expect(text.length).toBeLessThan(10000);
    expect(readNote(text)!.reviews).toHaveLength(30);
  });
  it("moves up before the search can lose it", () => {
    expect(noteDate(today, null, today)).toBe(today);
    expect(noteDate(today, addDays(today, -100), today)).toBe(addDays(today, -100));
    expect(noteDate(today, addDays(today, -350), today)).toBe(today);
    expect(350).toBeLessThan(NOTE_SEARCH_DAYS);
  });
});

describe("a session's rating on its activity", () => {
  it("is a readable line, added and replaced, and leaves the rest alone", () => {
    const one = withRating("Bella uscita\n\nBrioches: 2", "harder");
    expect(one).toBe("Bella uscita\n\nBrioches: 2\n\nPlan: harder");
    expect(ratingIn(one)).toBe("harder");
    const two = withRating(one, "expected");
    expect(ratingIn(two)).toBe("expected");
    expect(two.match(/Plan:/g)).toHaveLength(1);
    expect(withoutRating(two)).toBe("Bella uscita\n\nBrioches: 2");
  });
  it("is nothing when absent, or when it's someone's own sentence", () => {
    expect(ratingIn(null)).toBeNull();
    expect(ratingIn("Plan: went well, nice day")).toBeNull();
  });
});
