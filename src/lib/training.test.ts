import { describe, expect, it } from "vitest";
import {
  addDays,
  computeForm,
  formatClock,
  formZone,
  isoDate,
  loadFromRpe,
  weightFor,
} from "./training";

describe("training metrics", () => {
  it("form is fitness minus fatigue", () => {
    expect(computeForm(60, 75)).toBe(-15);
  });
  it("form below -30 is high risk", () => {
    expect(formZone(-31)).toBe("High risk");
  });
  it("form between -30 and -10 is optimal", () => {
    expect(formZone(-20)).toBe("Optimal");
  });
  it("form between -10 and 5 is grey zone", () => {
    expect(formZone(0)).toBe("Grey zone");
  });
  it("form between 5 and 25 is fresh", () => {
    expect(formZone(15)).toBe("Fresh");
  });
  it("form above 25 is transition", () => {
    expect(formZone(30)).toBe("Transition");
  });
  it("isoDate uses the local calendar day, not UTC", () => {
    // 00:30 local on 1 Nov is still 31 Oct in UTC for any zone east of Greenwich.
    expect(isoDate(new Date(2026, 10, 1, 0, 30))).toBe("2026-11-01");
  });
  it("addDays crosses month and DST boundaries", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-10-25", -1)).toBe("2026-10-24");
  });
  it("weightFor takes the ride's day, else the 3 days before, else the profile weight", () => {
    const rows = [
      { id: "2026-10-01", weight: 72 },
      { id: "2026-10-04", weight: 71 },
      { id: "2026-10-05", weight: null },
      { id: "2026-10-06", weight: 70 },
      { id: "2026-10-08", weight: 71.5 },
    ];
    expect(weightFor(rows, "2026-10-08T08:00:00", 75)).toBe(71.5);
    // 7 Oct: no weigh-in, so 4–6 Oct (71 and 70); 1 Oct is too far back.
    expect(weightFor(rows, "2026-10-07", 75)).toBe(70.5);
    expect(weightFor(rows, "2026-10-03", 75)).toBe(72);
    expect(weightFor(rows, "2026-09-30", 75)).toBe(75);
    expect(weightFor(rows, "2026-09-30")).toBeNull();
  });
  it("formatClock shows m:ss and h:mm:ss", () => {
    expect(formatClock(754)).toBe("12:34");
    expect(formatClock(3723)).toBe("1:02:03");
  });
  it("an hour at RPE 10 is worth about an hour at FTP", () => {
    expect(loadFromRpe(60, 10)).toBe(100);
    expect(loadFromRpe(60, 5)).toBe(49);
    expect(loadFromRpe(90, 3)).toBe(54);
  });
});
