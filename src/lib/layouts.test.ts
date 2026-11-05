import { describe, expect, it } from "vitest";
import {
  activitySections,
  moveNumber,
  moved,
  moveSection,
  orderOf,
  recapKind,
  recapSections,
  resolveLayout,
  setClosed,
  setHidden,
  setNumberHidden,
  activityLayoutKind,
  type SectionDef,
} from "./layouts";

const defs: SectionDef[] = [
  { id: "a", label: () => "A" },
  { id: "b", label: () => "B", closed: true },
  {
    id: "c",
    label: () => "C",
    fixed: true,
    numbers: [
      { id: "x", label: () => "X" },
      { id: "y", label: () => "Y", hidden: true },
    ],
  },
];

describe("resolveLayout", () => {
  it("is the default with nothing saved", () => {
    const r = resolveLayout(undefined, defs);
    expect(r.map((s) => s.id)).toEqual(["a", "b", "c"]);
    expect(r[1]!.closed).toBe(true);
    expect(r[2]!.numbers.map((n) => [n.id, n.hidden])).toEqual([
      ["x", false],
      ["y", true],
    ]);
  });

  it("drops what no longer exists and places what's new", () => {
    expect(orderOf(["c", "gone", "a"], ["a", "b", "c"])).toEqual(["c", "a", "b"]);
    expect(orderOf(["b", "a"], ["new", "a", "b"])).toEqual(["new", "b", "a"]);
    expect(orderOf(["a", "a"], ["a"])).toEqual(["a"]);
  });

  it("applies choices over the defaults, either way", () => {
    let l = setClosed({}, "b", false);
    l = setClosed(l, "a", true);
    l = setHidden(l, "a", true);
    const r = resolveLayout(l, defs);
    expect(r[0]).toMatchObject({ hidden: true, closed: true });
    expect(r[1]!.closed).toBe(false);
  });

  it("never closes what can't close", () => {
    expect(resolveLayout(setClosed({}, "c", true), defs)[2]!.closed).toBe(false);
  });

  it("moves sections and numbers", () => {
    expect(moved(["a", "b", "c"], "c", "a")).toEqual(["c", "a", "b"]);
    expect(moved(["a", "b", "c"], "a", "c")).toEqual(["b", "c", "a"]);
    expect(moved(["a"], "a", "z")).toEqual(["a"]);
    const l = moveSection({}, ["a", "b", "c"], "b", "a");
    expect(resolveLayout(l, defs).map((s) => s.id)).toEqual(["b", "a", "c"]);
    const n = setNumberHidden(moveNumber({}, "c", ["x", "y"], "y", "x"), "c", "y", false);
    expect(resolveLayout(n, defs)[2]!.numbers.map((v) => [v.id, v.hidden])).toEqual([
      ["y", false],
      ["x", false],
    ]);
  });
});

describe("kinds", () => {
  it("picks by length", () => {
    expect([1, 2, 14, 15, 62, 63].map(recapKind)).toEqual([
      "recap-day",
      "recap-week",
      "recap-week",
      "recap-month",
      "recap-month",
      "recap-long",
    ]);
  });

  it("picks by sport", () => {
    expect(activityLayoutKind({ type: "Ride" })).toBe("activity-ride");
    expect(activityLayoutKind({ type: "Run" })).toBe("activity-run");
    expect(activityLayoutKind({ type: "Swim" })).toBe("activity-other");
  });

  it("offers weeks only where they mean something", () => {
    expect(recapSections("recap-week").some((s) => s.id === "weeks")).toBe(false);
    expect(recapSections("recap-month").some((s) => s.id === "weeks")).toBe(true);
  });

  it("keeps a day's default page without its cards", () => {
    const day = resolveLayout(undefined, recapSections("recap-day"));
    expect(day.find((s) => s.id === "numbers")!.hidden).toBe(true);
  });

  it("keeps today's default activity page", () => {
    const r = resolveLayout(undefined, activitySections("activity-ride"));
    expect(r.map((s) => s.id)).toEqual([
      "feel",
      "numbers",
      "zones",
      "blocks",
      "climbs",
      "charts",
      "intervals",
      "brioche",
      "visibility",
    ]);
    expect(r.filter((s) => s.closed).map((s) => s.id)).toEqual(["charts", "intervals"]);
    expect(r.every((s) => !s.hidden)).toBe(true);
    expect(r[1]!.numbers.every((n) => !n.hidden)).toBe(true);
  });

  it("gives runs splits right after the zones, and an already arranged page too", () => {
    const defs = activitySections("activity-run");
    const fresh = resolveLayout(undefined, defs).map((s) => s.id);
    expect(fresh.indexOf("splits")).toBe(fresh.indexOf("zones") + 1);
    const saved = resolveLayout({ order: ["zones", "feel", "numbers"] }, defs).map((s) => s.id);
    expect(saved.indexOf("splits")).toBe(saved.indexOf("zones") + 1);
    expect(activitySections("activity-ride").some((s) => s.id === "splits")).toBe(false);
  });

  it("gives runs their own numbers", () => {
    const run = activitySections("activity-run")
      .find((s) => s.id === "numbers")!
      .numbers!.map((n) => n.id);
    expect(run).toContain("gap");
    expect(run).not.toContain("power");
  });
});
