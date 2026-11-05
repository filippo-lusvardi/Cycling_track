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

describe("months, dates and ranges of any year", () => {
  const today = "2026-11-05";
  const first = (q: string) => whenCandidates(q, today).find((c) => c.exact);
  it("reads a month with its year, either way round", () => {
    for (const q of ["settembre 2025", "september 2025", "sett 2025", "2025 settembre"])
      expect(first(q)).toMatchObject({ from: "2025-09-01", to: "2025-09-30" });
    expect(first("settembre 2025")!.q).toBe("Settembre 2025");
  });
  it("reads full dates", () => {
    expect(first("12 novembre 2024")).toMatchObject({ from: "2024-11-12", to: "2024-11-12" });
    expect(first("november 12 2024")).toMatchObject({ from: "2024-11-12" });
    expect(first("12/11/2024")).toMatchObject({ from: "2024-11-12" });
    expect(first("29 febbraio 2025")).toBeUndefined();
    expect(first("29 febbraio 2024")).toMatchObject({ from: "2024-02-29" });
  });
  it("reads ranges, a year said once counting for both ends", () => {
    expect(first("da marzo a giugno 2025")).toMatchObject({ from: "2025-03-01", to: "2025-06-30" });
    expect(first("from march to june 2025")).toMatchObject({
      from: "2025-03-01",
      to: "2025-06-30",
    });
    expect(first("dal 3 marzo al 12 aprile")).toMatchObject({
      from: "2026-03-03",
      to: "2026-04-12",
    });
    expect(first("da novembre 2024 a febbraio")).toMatchObject({
      from: "2024-11-01",
      to: "2025-02-28",
    });
    expect(first("da novembre a febbraio 2026")).toMatchObject({
      from: "2025-11-01",
      to: "2026-02-28",
    });
    expect(first("da verdana a sabato")).toBeUndefined();
  });
});

describe("more ways to say time", () => {
  const today = "2026-11-05"; // A Thursday.
  const first = (q: string) => whenCandidates(q, today).find((c) => c.exact);
  it("reads how long ago", () => {
    expect(first("3 giorni fa")).toMatchObject({ from: "2026-11-02", to: "2026-11-02" });
    expect(first("3 days ago")).toMatchObject({ from: "2026-11-02" });
    expect(first("2 settimane fa")).toMatchObject({ from: "2026-10-19", to: "2026-10-25" });
    expect(first("una settimana fa")).toMatchObject({ from: "2026-10-26", to: "2026-11-01" });
    expect(first("2 mesi fa")).toMatchObject({ from: "2026-09-01", to: "2026-09-30" });
    expect(first("un anno fa")).toMatchObject({ from: "2025-01-01", to: "2025-12-31" });
    expect(first("l'altro ieri")).toMatchObject({ from: "2026-11-03", to: "2026-11-03" });
    expect(first("altroieri")).toMatchObject({ from: "2026-11-03" });
  });
  it("reads weekends", () => {
    for (const q of ["weekend", "questo weekend", "this weekend", "fine settimana"])
      expect(first(q)).toMatchObject({ from: "2026-11-07", to: "2026-11-08" });
    for (const q of ["weekend scorso", "scorso weekend", "last weekend"])
      expect(first(q)).toMatchObject({ from: "2026-10-31", to: "2026-11-01" });
    expect(first("prossimo weekend")).toMatchObject({ from: "2026-11-14", to: "2026-11-15" });
  });
  it("reads seasons with a year or as the last one, and leaves a bare season to the tree", () => {
    expect(first("estate 2025")).toMatchObject({ from: "2025-06-01", to: "2025-08-31" });
    expect(first("summer 2025")).toMatchObject({ from: "2025-06-01" });
    expect(first("inverno 2026")).toMatchObject({ from: "2025-12-01", to: "2026-02-28" });
    expect(first("estate scorsa")).toMatchObject({ from: "2026-06-01" });
    expect(first("autunno scorso")).toMatchObject({ from: "2025-09-01", to: "2025-11-30" });
    expect(first("last winter")).toMatchObject({ from: "2025-12-01" });
    expect(first("estate")).toBeUndefined();
    expect(first("inverno")).toBeUndefined();
    expect(first("banana 2025")).toBeUndefined();
  });
  it("forgives one slip in a long month, not in a short word", () => {
    expect(first("setembre 2025")).toMatchObject({ from: "2025-09-01" });
    expect(first("novenbre 2025")).toMatchObject({ from: "2025-11-01" });
    expect(first("marco 2025")).toBeUndefined();
  });
});
