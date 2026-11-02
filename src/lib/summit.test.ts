import { describe, expect, it } from "vitest";
import { isMilestone, summitBook } from "./summit";

const e = (date: string, duration: number) => ({ date, duration });

describe("summitBook", () => {
  const book = summitBook([
    e("2024-05-14", 3600),
    e("2025-09-07", 3300),
    e("2024-08-01", 3500),
    e("2026-06-21", 3400),
    e("2026-10-12", 3100),
  ]);
  const all = book.years.flatMap((y) => y.entries);
  const by = (date: string) => all.find((b) => b.e.date === date)!;

  it("groups by year, newest first, entries newest first", () => {
    expect(book.years.map((y) => y.year)).toEqual(["2026", "2025", "2024"]);
    expect(book.years[0]!.entries.map((b) => b.e.date)).toEqual(["2026-10-12", "2026-06-21"]);
    expect(book.count).toBe(5);
    expect(book.since).toBe("2024-05-14");
  });

  it("numbers ascents oldest first and shows how the record fell", () => {
    expect(by("2024-05-14").n).toBe(1);
    expect(by("2026-10-12").n).toBe(5);
    expect(by("2024-05-14").record).toBe("then");
    expect(by("2024-08-01").record).toBe("then");
    expect(by("2025-09-07").record).toBe("then");
    expect(by("2026-06-21").record).toBeNull(); // slower than 2025's record
    expect(by("2026-10-12").record).toBe("current");
    expect(by("2026-06-21").gap).toBe(300);
  });

  it("keeps the record with whoever rode the time first", () => {
    const tie = summitBook([e("2025-01-01", 3000), e("2026-01-01", 3000)]).years.flatMap(
      (y) => y.entries,
    );
    expect(tie.map((b) => [b.e.date, b.record])).toEqual([
      ["2026-01-01", null],
      ["2025-01-01", "current"],
    ]);
  });

  it("handles a climb never ridden", () => {
    expect(summitBook([])).toEqual({ years: [], count: 0, since: null });
  });
});

describe("isMilestone", () => {
  it("marks the 1st, 10th, 25th and every 50th ascent", () => {
    expect([1, 2, 10, 25, 49, 50, 100, 150, 175].filter(isMilestone)).toEqual([
      1, 10, 25, 50, 100, 150,
    ]);
  });
});
