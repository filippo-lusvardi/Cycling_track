import { describe, expect, it } from "vitest";
import type { Sport } from "@/lib/garden";
import { layoutSheets, wrapName } from "./PantryNotes";

const named = (...names: string[]) =>
  names.map((name, i) => ({ sport: `custom:${i}` as Sport, name }));
const ITALIAN = named(
  "Corsa",
  "Forza",
  "Yoga e stretching",
  "Camminate ed escursioni",
  "Nuoto",
  "Sci",
  "Canottaggio e pagaia",
  "Arrampicata",
  "Altri sport",
);
const span = (sheets: ReturnType<typeof layoutSheets>) => -sheets[0]!.x;

describe("wrapName", () => {
  it("keeps a short name whole", () => {
    expect(wrapName("Corsa", 13)).toEqual(["Corsa"]);
  });
  it("breaks a long one on a word", () => {
    expect(wrapName("Camminate ed escursioni", 13)).toEqual(["Camminate ed", "escursioni"]);
  });
  it("never goes past two lines", () => {
    const lines = wrapName("Una disciplina con un nome davvero molto lungo", 13);
    expect(lines).toHaveLength(2);
    expect(lines[1]).toMatch(/…$/);
    expect(Math.max(...lines.map((l) => l.length))).toBeLessThanOrEqual(13);
  });
});

describe("layoutSheets", () => {
  it("has no sheet without sports", () => {
    expect(layoutSheets([], 300)).toEqual([]);
  });
  it("keeps a few sports on one sheet", () => {
    expect(layoutSheets(named("Corsa", "Forza", "Nuoto", "Sci"), 300)).toHaveLength(1);
  });
  it("deals many sports onto several sheets that fit a phone", () => {
    const sheets = layoutSheets(ITALIAN, 328);
    expect(sheets).toHaveLength(3);
    expect(span(sheets)).toBeLessThanOrEqual(328);
    expect(sheets.flatMap((s) => s.entries.map((e) => e.sport))).toEqual(
      ITALIAN.map((i) => i.sport),
    );
    for (const s of sheets) expect(s.entries.length).toBeLessThanOrEqual(3);
  });
  it("does not wrap names when there is room", () => {
    const sheets = layoutSheets(ITALIAN, 640);
    expect(sheets.flatMap((s) => s.entries).every((e) => e.lines.length === 1)).toBe(true);
  });
  it("falls back to fewer, longer sheets when width is very short", () => {
    const sheets = layoutSheets(ITALIAN, 150);
    expect(sheets).toHaveLength(1);
    expect(sheets[0]!.entries).toHaveLength(9);
  });
});
