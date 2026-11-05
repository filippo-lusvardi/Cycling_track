import { describe, expect, it, vi } from "vitest";
import { pastAsked, pastRows, pastWindow } from "./ask-past";
import type { IntentClimb } from "./ask-intents";
import { simplify } from "./ask-sentence";
import type { Activity, Wellness } from "./intervals";
import type { Attempt } from "./segments";

vi.hoisted(() => localStorage.setItem("cadence_language", JSON.stringify("it")));

const today = "2026-11-05";
const day = (id: string, w: Partial<Wellness>) => ({ id, ...w }) as Wellness;
const act = (id: string, date: string, name: string, type = "Ride") =>
  ({ id, name, type, start_date_local: `${date}T08:00:00` }) as Activity;
const climb = (id: string, name: string, dates: string[]): IntentClimb => ({
  id,
  name,
  length: 20000,
  saved: true,
  attempts: dates.map((date) => ({ trackId: `t-${date}`, date }) as Attempt),
});
const row = (q: string, wellness: Wellness[] = [], extra: object = {}) =>
  pastRows(q, { today, wellness, ...extra })[0];

describe("a value as it was", () => {
  it("reads a day", () => {
    const r = row("peso 28 marzo", [day("2026-03-28", { weight: 71.4 })]);
    expect(r?.value).toBe("71.4 kg");
    expect(r?.q).toContain("28 marzo 2026");
    expect(r?.dest).toMatchObject({ to: "/recap", search: { from: "2026-03-28" } });
  });
  it("takes the words either way round, and with what joins them", () => {
    for (const q of [
      "28 marzo peso",
      "peso il 28 marzo",
      "peso del 28 marzo",
      "peso 28 di marzo",
      "weight 28 of march",
      "weight 28th of march",
    ])
      expect(pastAsked(q, { today })?.span, q).toEqual({ from: "2026-03-28", to: "2026-03-28" });
  });
  it("reads what a sentence comes down to", () => {
    expect(pastAsked(simplify("quanto pesavo il 28 marzo"), { today })?.metric.id).toBe("weight");
  });
  it("averages a month over the days it has", () => {
    const r = row("peso marzo", [
      day("2026-03-02", { weight: 70 }),
      day("2026-03-20", { weight: 72 }),
      day("2026-03-21", {}),
    ]);
    expect(r?.value).toBe("71.0 kg");
    expect(r?.answer).toBe("Media di 2 giorni");
  });
  it("averages any longer stretch, stopping at today", () => {
    const asked = pastAsked("fitness questa settimana", { today });
    expect(asked?.span.to).toBe(today);
    expect(
      row("fitness settembre 2025", [
        day("2025-09-01", { ctl: 50 }),
        day("2025-09-02", { ctl: 52 }),
      ])?.value,
    ).toBe("51");
  });
  it("works form out day by day", () => {
    expect(row("forma ieri", [day("2026-11-04", { ctl: 60, atl: 72 })])?.value).toBe("-12");
  });
  it("a weigh-in from the days before stands in, and says when; a night's sleep doesn't", () => {
    const asked = pastAsked("peso 28 marzo", { today })!;
    expect(pastWindow(asked).from).toBe("2026-03-14");
    const r = row("peso 28 marzo", [day("2026-03-26", { weight: 71 })]);
    expect(r?.value).toBe("71 kg");
    expect(r?.answer).toContain("26 marzo 2026");
    expect(row("sonno ieri", [day("2026-11-03", { sleepSecs: 25000 })])?.value).toBe("–");
    expect(row("peso 28 marzo", [day("2026-03-01", { weight: 71 })])?.value).toBe("–");
  });
  it("a number alone is a value to save, never a day", () => {
    for (const q of ["peso 78", "peso 78,5", "sonno 7", "hrv 50", "peso 12 11"])
      expect(pastAsked(q, { today }), q).toBeNull();
  });
  it("what's still ahead means the last one that's been", () => {
    expect(pastAsked("peso sabato", { today })?.span.from).toBe("2026-10-31");
    expect(pastAsked("peso 28 dicembre", { today })?.span.from).toBe("2025-12-28");
    expect(pastAsked("peso domani", { today })).toBeNull();
    expect(pastAsked("fitness prossima settimana", { today })).toBeNull();
  });
  it("finds the latest ride or pass by name", () => {
    const acts = [
      act("a1", "2026-08-01", "Giro del Manghen"),
      act("a2", "2026-06-01", "Manghen con Marco"),
      act("a3", "2026-10-01", "Bondone", "Run"),
    ];
    const r = row("fitness ultimo manghen", [day("2026-08-01", { ctl: 66 })], { acts });
    expect(r?.value).toBe("66");
    expect(r?.q).toContain("Giro del Manghen");
    expect(r?.dest).toMatchObject({ to: "/rides/$id", params: { id: "a1" } });
    expect(pastAsked("fitness manghen", { today, acts })?.span.from).toBe("2026-08-01");
    expect(pastAsked("peso ultima corsa", { today, acts })?.span.from).toBe("2026-10-01");
  });
  it("a climb's pass counts when no ride has the name, opening the climb", () => {
    const climbs = [climb("c1", "Passo Manghen", ["2026-05-01", "2026-09-09"])];
    const r = row("fitness all'ultimo manghen", [day("2026-09-09", { ctl: 70 })], { climbs });
    expect(r?.value).toBe("70");
    expect(r?.dest).toMatchObject({ to: "/segments/$id", params: { id: "c1" } });
  });
  it("says nothing for a name it doesn't know", () => {
    expect(pastAsked("fitness cimone", { today, acts: [] })).toBeNull();
    expect(pastAsked("fitness", { today })).toBeNull();
  });
  it("shows it's reading, and when it couldn't", () => {
    expect(pastRows("peso ieri", { today })[0]?.value).toBe("…");
    expect(pastRows("peso ieri", { today, failed: true })[0]?.answer).toContain("Impossibile");
  });
});
