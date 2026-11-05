import { describe, expect, it, vi } from "vitest";
import { daysIn, shiftSpan, spanTitle, whenCandidates } from "./ask-when";

vi.hoisted(() => localStorage.setItem("cadence_language", JSON.stringify("it")));

// A Thursday.
const today = "2026-11-05";
const find = (q: string, id: string) => {
  const c = whenCandidates(q, today).find((x) => x.id === id);
  if (!c) throw new Error(`no ${id}`);
  return { from: c.from, to: c.to };
};

describe("whenCandidates", () => {
  it("names the days around today", () => {
    expect(find("", "tomorrow")).toEqual({ from: "2026-11-06", to: "2026-11-06" });
    expect(find("", "after-tomorrow").from).toBe("2026-11-07");
    expect(find("", "yesterday").from).toBe("2026-11-04");
  });

  it("takes the next and the last of a weekday", () => {
    expect(find("", "day-6").from).toBe("2026-11-07");
    expect(find("", "last-day-6").from).toBe("2026-10-31");
    // Today's own weekday means next week's, and last week's.
    expect(find("", "day-4").from).toBe("2026-11-12");
    expect(find("", "last-day-4").from).toBe("2026-10-29");
  });

  it("knows the weeks and months", () => {
    expect(find("", "last-7")).toEqual({ from: "2026-10-30", to: today });
    expect(find("", "this-week")).toEqual({ from: "2026-11-02", to: "2026-11-08" });
    expect(find("", "prev-week")).toEqual({ from: "2026-10-26", to: "2026-11-01" });
    expect(find("", "next-week")).toEqual({ from: "2026-11-09", to: "2026-11-15" });
    expect(find("", "prev-month")).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(find("", "this-year")).toEqual({ from: "2026-01-01", to: "2026-12-31" });
  });

  it("uses the latest month of a name", () => {
    expect(find("", "recap-2026-10").to).toBe("2026-10-31");
    expect(find("", "recap-2025-12").from).toBe("2025-12-01");
  });

  it("reads numbers", () => {
    expect(find("ultimi 10 giorni", "last-10d")).toEqual({ from: "2026-10-27", to: today });
    expect(find("10", "last-10d").from).toBe("2026-10-27");
    expect(find("ultime 3 settimane", "last-3w").from).toBe("2026-10-16");
    expect(find("last 2 months", "last-2m").to).toBe(today);
    expect(find("tra 3 giorni", "ahead").from).toBe("2026-11-08");
    expect(find("in 2 weeks", "ahead").from).toBe("2026-11-19");
    expect(find("2025", "year-2025")).toEqual({ from: "2025-01-01", to: "2025-12-31" });
  });

  it("reads dates", () => {
    expect(find("il 12", "date-2026-11-12").from).toBe("2026-11-12");
    expect(find("12 novembre", "date-2026-11-12").from).toBe("2026-11-12");
    expect(find("12 nov", "date-2026-11-12").from).toBe("2026-11-12");
    expect(find("november 12", "date-2026-11-12").from).toBe("2026-11-12");
    expect(find("12/11", "date-2026-11-12").from).toBe("2026-11-12");
    expect(whenCandidates("31 febbraio", today).some((c) => c.id.startsWith("date-"))).toBe(false);
  });
});

describe("spans", () => {
  it("names a stretch", () => {
    expect(spanTitle({ from: "2026-11-06", to: "2026-11-06" }, today)).toBe("Domani");
    expect(spanTitle({ from: "2026-10-30", to: today }, today)).toBe("Ultima settimana");
    expect(spanTitle({ from: "2026-10-27", to: today }, today)).toBe("Ultimi 10 giorni");
    expect(spanTitle({ from: "2026-10-01", to: "2026-10-31" }, today)).toBe("Ottobre");
    expect(spanTitle({ from: "2025-10-01", to: "2025-10-31" }, today)).toBe("Ottobre 2025");
    expect(spanTitle({ from: "2025-01-01", to: "2025-12-31" }, today)).toBe("2025");
  });

  it("moves by whole months and years across their ends", () => {
    expect(shiftSpan({ from: "2026-01-01", to: "2026-01-31" }, -1)).toEqual({
      from: "2025-12-01",
      to: "2025-12-31",
    });
    expect(shiftSpan({ from: "2026-02-01", to: "2026-02-28" }, 1)).toEqual({
      from: "2026-03-01",
      to: "2026-03-31",
    });
    expect(shiftSpan({ from: "2025-01-01", to: "2025-12-31" }, 1)).toEqual({
      from: "2026-01-01",
      to: "2026-12-31",
    });
    expect(shiftSpan({ from: "2026-10-30", to: today }, -1)).toEqual({
      from: "2026-10-23",
      to: "2026-10-29",
    });
    expect(daysIn({ from: "2026-10-30", to: today })).toBe(7);
  });
});
