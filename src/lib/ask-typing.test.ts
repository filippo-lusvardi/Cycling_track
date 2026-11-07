// Whole sentences typed a letter at a time: once something has read, the panel is never empty on the way to the end.
import { describe, expect, it } from "vitest";
import { alternatives, type Alt } from "./ask";
import { askKey } from "./ask-compare";
import { completeWords, correctWords, typedRows } from "./ask-complete";
import { effortFollow } from "./ask-efforts";
import { heldAnswer, holdable, type Held } from "./ask-hold";
import { intentEntries, type IntentData } from "./ask-intents";
import type { Activity } from "./intervals";

const today = "2026-11-07";
const acts = [
  {
    id: "a",
    name: "Giro",
    type: "Ride",
    start_date_local: "2026-11-02T09:00:00",
    distance: 30000,
    moving_time: 3600,
    total_elevation_gain: 300,
    icu_training_load: 60,
    zoneTimes: [],
  } as unknown as Activity,
];
const curves = ["42d", "1y", "all"].map((id) => ({
  id,
  label: id,
  secs: [5, 60, 300, 1200],
  watts: [900, 400, 300, 260],
}));
const d: IntentData = {
  today,
  sport: "ride",
  native: true,
  climbs: [],
  acts,
  curves: curves as unknown as IntentData["curves"],
};
const ctx = { today, sport: "ride" as const, acts, climbs: [] };
const among = (q: string) => alternatives(q, null, intentEntries(q, d));
const key = (q: string) => askKey(q, ctx);
const rows = (q: string) => typedRows(q, among, key(q) ? null : completeWords(q, key));

/** What's on screen at each letter, typed faster than the pause. */
function typing(phrase: string) {
  const out: { q: string; row: Alt | null; holding: boolean }[] = [];
  let held: Held | null = null;
  for (let n = 1; n <= phrase.length; n++) {
    const q = phrase.slice(0, n);
    const found = rows(q);
    const holding = heldAnswer(held, q, found, false);
    out.push({ q, row: holding ?? found[0] ?? null, holding: !!holding });
    if (holdable(found[0])) held = { q, row: found[0] };
  }
  return out;
}

describe("a sentence on its way", () => {
  it.each([
    ["grafico km per settimana 2025", "grafico km"],
    ["grafico km marzo 2026", "grafico km"],
    ["grafico km per mese", "grafico km"],
    ["hrv e km", "hrv"],
    ["power 5m per mese", "power"],
    ["peso per mese", "peso"],
  ])("%s has no gap from %s on", (phrase, from) => {
    const seen = typing(phrase).filter((s) => s.q.length >= from.length);
    for (const s of seen) expect(s.row, `at "${s.q}"`).not.toBeNull();
  });
  it("draws no nonsense on the way to a year", () => {
    for (const s of typing("grafico km marzo 2026").filter((x) => x.q.length > 16))
      expect(s.row?.q, s.q).toMatch(/March 2026|last 12 months/);
  });
  it("ends on what was asked", () => {
    expect(typing("grafico km per settimana").at(-1)!.row?.q).toContain("12 weeks");
    expect(typing("grafico km marzo 2026").at(-1)!.holding).toBe(false);
  });
  it("a pause lets go only of words that can't become anything", () => {
    const held = { q: "grafico km", row: rows("grafico km")[0]! };
    expect(heldAnswer(held, "grafico km m", rows("grafico km m"), false)).toBe(held.row);
    expect(heldAnswer(held, "grafico km m", rows("grafico km m"), true)).toBe(held.row);
    expect(heldAnswer(held, "grafico km 20", rows("grafico km 20"), true)).toBe(held.row);
    expect(heldAnswer(held, "grafico km banane", rows("grafico km banane"), false)).toBe(held.row);
    expect(heldAnswer(held, "grafico km banane", rows("grafico km banane"), true)).toBeNull();
  });
  it("lets go when the sentence is another one", () => {
    const held = { q: "grafico km", row: rows("grafico km")[0]! };
    expect(heldAnswer(held, "forest", [], false)).toBeNull();
    expect(heldAnswer(held, "", [], false)).toBeNull();
  });
});

describe("saving is never guessed", () => {
  it("a save row is never held", () => {
    const save = rows("peso 68")[0]!;
    expect(save.dest.kind).toBe("write");
    expect(holdable(save)).toBe(false);
    const steps = typing("peso 68 m");
    expect(steps.at(-1)!.row?.dest.kind).not.toBe("write");
  });
  it("the morning: chart, then the save row, through the dot", () => {
    const seen = typing("peso 68.2").map((s) => [s.q, s.row?.dest.kind]);
    expect(Object.fromEntries(seen)["peso"]).toBe("route");
    expect(Object.fromEntries(seen)["peso 68"]).toBe("write");
    expect(Object.fromEntries(seen)["peso 68."]).toBe("write");
    expect(Object.fromEntries(seen)["peso 68.2"]).toBe("write");
  });
  it("a half word never leads to a save", () => {
    expect(rows("peso 6")[0]?.dest.kind).not.toBe("write");
    expect(completeWords("sonn", key)?.query).toBe("sonno");
    expect(rows("sonn")[0]?.dest.kind).not.toBe("write");
  });
  it("a slip never leads to a save", () => {
    expect(rows("pesso 68")[0]?.dest.kind).not.toBe("write");
  });
});

describe("half words", () => {
  it("finishes what has one meaning", () => {
    expect(completeWords("grafico km per s", key)).toEqual({
      query: "grafico km per settimana",
      ghost: "ettimana",
    });
    expect(completeWords("grafico km per m", key)?.ghost).toBe("ese");
    expect(completeWords("graf", key)?.query).toBe("grafico");
    expect(rows("grafico km per s")[0]).toMatchObject({ id: "chart", ghost: "ettimana" });
  });
  it("a second measure needs its joining word", () => {
    expect(completeWords("power 5m p", key)?.query ?? "").not.toContain("peso");
    expect(completeWords("grafico km p", key)?.query).toBe("grafico km per");
    expect(completeWords("hrv e", key)).toBeNull();
    expect(rows("power 5m p")[0]?.q ?? "").not.toContain("Weight");
  });
  it("a chart's title isn't offered as the end of the sentence", () => {
    for (const q of ["hrv", "peso", "km", "fc"]) expect(rows(q)[0]?.ghost, q).toBeNull();
  });
  it("leaves what could be several things", () => {
    expect(completeWords("grafico km m", key)).toBeNull();
    expect(completeWords("grafico km 20", key)).toBeNull();
  });
  it("leaves a word that's still short, or finished", () => {
    expect(completeWords("gr", key)).toBeNull();
    expect(completeWords("grafico km ", key)).toBeNull();
  });
  it("a word alone stays a search if it already finds something", () => {
    const search = (q: string): Alt[] =>
      q === "fit" ? [{ id: "x", ghost: null } as unknown as Alt] : [];
    expect(typedRows("fit", search, { query: "fitness", ghost: "ness" })[0]?.id).toBe("x");
  });
});

describe("slips", () => {
  it("forgives one, anywhere in the line", () => {
    expect(correctWords("grafico dislivelo")).toBe("grafico dislivello");
    expect(correctWords("grafco km")).toBe("grafico km");
    expect(correctWords("grafico km")).toBeNull();
    expect(rows("grafico dislivelo")[0]?.id).toBe("chart");
  });
  it("doesn't touch numbers or short words", () => {
    expect(correctWords("km 2025")).toBeNull();
  });
});

describe("what could come next", () => {
  const exact = { exact: true };
  it("offers lengths, then times, on an effort", () => {
    expect(effortFollow("power", exact, d).map((c) => c.query)).toEqual([
      "power 5m",
      "power 20m",
      "power 60m",
    ]);
    expect(effortFollow("power 5m", exact, d).map((c) => c.query)).toEqual([
      "power 5m oggi",
      "power 5m ieri",
      "power 5m questo mese",
    ]);
    expect(effortFollow("power oggi", exact, d).map((c) => c.query)).toContain("power oggi 20m");
    expect(effortFollow("power 5m oggi", exact, d)).toEqual([]);
  });
  it("offers nothing on a guess", () => {
    expect(effortFollow("power", {}, d)).toEqual([]);
  });
});
