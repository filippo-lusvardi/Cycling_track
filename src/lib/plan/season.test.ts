import { describe, expect, it } from "vitest";
import type { Race, RaceKind } from "../races";
import { KINDS } from "../races";
import { buildPool } from "../suggest";
import { addDays } from "../training";
import { readNote, writeNote, type PlanNote } from "./note";
import { layoutWeek } from "./layout";
import { groupWeeks, outline } from "./outline";
import { weekShape } from "./phase";
import {
  periodsOf,
  racesChanged,
  seasonFocus,
  seasonLongShare,
  seasonOver,
  seasonProfile,
  seenRacesOf,
} from "./season";
import type { DayPlan, PlanSeason, PlanSettings, PlanState } from "./types";

const start = "2026-11-09";
const state: PlanState = {
  startedOn: start,
  cycleStart: start,
  buildWeeks: 3,
  weeklySeconds: 10 * 3600,
  lastBuildSeconds: 10 * 3600,
  doses: { tempo: 2400, threshold: 1500, vo2: 900, anaerobic: 300 },
  beforeLower: null,
  hardCap: 2,
  hardGap: 2,
  lowersThisCycle: 0,
  cleanCycles: 0,
  forcedRecovery: null,
  lastReview: null,
};
const spring: PlanSeason = { months: ["2027-05", "2027-06"], kinds: ["road"] };
const race = (
  date: string,
  priority: Race["priority"] = "A",
  kind: RaceKind | null = "road",
): Race => ({
  id: `r-${date}`,
  date,
  name: date,
  priority,
  info: kind ? { discipline: KINDS[kind].discipline, kind, minutes: null, sprint: false } : null,
  notes: "",
  type: "Ride",
});
const shape = (monday: string, races: Race[] = [], season = spring, st = state) =>
  weekShape(monday, { goal: "season", season }, races, st);

/** The first Monday of each stretch of a phase, from the start of the plan to `until`. */
function stretches(races: Race[], until: string, season = spring) {
  const out: [string, string][] = [];
  for (let m = start; m <= until; m = addDays(m, 7)) {
    const { phase } = shape(m, races, season);
    if (out[out.length - 1]?.[0] !== phase) out.push([phase, m]);
  }
  return out;
}

describe("periods", () => {
  it("joins months next to each other, also over a new year", () => {
    expect(periodsOf({ months: ["2027-06", "2027-05", "2027-09"], kinds: [] })).toEqual([
      { from: "2027-05-01", to: "2027-06-30" },
      { from: "2027-09-01", to: "2027-09-30" },
    ]);
    expect(periodsOf({ months: ["2026-12", "2027-01"], kinds: [] })).toEqual([
      { from: "2026-12-01", to: "2027-01-31" },
    ]);
  });
});

describe("a season's weeks", () => {
  it("counts back from the period's start while no race has a date", () => {
    expect(stretches([], "2027-06-28")).toEqual([
      ["base", start],
      ["build", "2027-01-18"],
      ["specific", "2027-03-15"],
    ]);
  });

  it("never tapers without a real A race, and goes on rolling once the period ends", () => {
    for (let m = start; m <= "2027-06-28"; m = addDays(m, 7))
      expect(shape(m).phase).not.toBe("taper");
    expect(shape("2027-06-28").phase).toBe("specific");
    expect(["base", "build"]).toContain(shape("2027-07-05").phase);
  });

  it("is redrawn around an A race once it has a date", () => {
    const r = [race("2027-06-06")];
    expect(stretches(r, "2027-06-28")).toEqual([
      ["base", start],
      ["build", "2027-02-22"],
      ["specific", "2027-04-19"],
      ["taper", "2027-05-24"],
      ["specific", "2027-06-07"],
    ]);
  });

  it("doesn't start a plan on a recovery week, even where the count would put one", () => {
    expect(shape(start).recovery).toBe(false);
    expect(shape("2026-12-07").recovery).toBe(true);
    expect(shape(start, [], spring, { ...state, forcedRecovery: start }).recovery).toBe(true);
  });

  it("gives the week after an A race to recovery", () => {
    const r = [race("2027-06-06")];
    expect(shape("2027-06-07", r).recovery).toBe(true);
    expect(shape("2027-06-14", r).recovery).toBe(false);
  });

  it("never puts two recovery weeks in a row around A races", () => {
    const season: PlanSeason = {
      months: ["2027-04", "2027-05", "2027-06", "2027-07", "2027-08"],
      kinds: [],
    };
    for (let gap = 14; gap <= 70; gap += 7) {
      for (let shift = 0; shift < 28; shift += 7) {
        const first = addDays("2027-04-18", shift);
        const r = [race(first), race(addDays(first, gap))];
        let previous = false;
        for (let m = "2027-03-01"; m <= "2027-08-30"; m = addDays(m, 7)) {
          const { recovery } = shape(m, r, season);
          expect(previous && recovery, `${first} +${gap} at ${m}`).toBe(false);
          previous = recovery;
        }
      }
    }
  });

  it("keeps recovery weeks away from the weeks just before a target", () => {
    for (const r of [[], [race("2027-06-06")]]) {
      const anchor = r.length ? "2027-05-24" : "2027-04-26";
      expect(shape(addDays(anchor, -7), r).recovery).toBe(false);
      expect(shape(addDays(anchor, -28), r).recovery).toBe(true);
    }
  });

  it("has a recovery week every cycle inside a period, following the learned rhythm", () => {
    const weeks = Array.from({ length: 8 }, (_, i) => shape(addDays("2027-04-26", 7 * i)).recovery);
    expect(weeks).toEqual([false, false, false, true, false, false, false, true]);
    const short = { ...state, buildWeeks: 2 as const };
    expect(shape(addDays("2027-04-26", 14), [], spring, short).recovery).toBe(true);
  });

  it("rebuilds between two periods", () => {
    const two: PlanSeason = { months: ["2027-04", "2027-09"], kinds: [] };
    expect(shape("2027-04-12", [], two).phase).toBe("specific");
    expect(shape("2027-05-10", [], two).phase).toBe("base");
    expect(shape("2027-06-07", [], two).phase).toBe("build");
    expect(shape("2027-08-02", [], two).phase).toBe("specific");
  });

  it("leaves the phases to A races: a B or C race moves nothing", () => {
    const plain = stretches([], "2027-06-28");
    expect(stretches([race("2027-05-16", "B"), race("2027-05-30", "C")], "2027-06-28")).toEqual(
      plain,
    );
  });

  it("works towards an A race outside any period", () => {
    const r = [race("2027-03-14")];
    expect(shape("2027-03-08", r).phase).toBe("taper");
    expect(shape("2027-02-08", r).phase).toBe("specific");
    // And then on towards the period.
    expect(shape("2027-03-15", r).recovery).toBe(true);
    expect(shape("2027-03-22", r).phase).toBe("specific");
  });

  it("starts in the right place when the period is already under way", () => {
    expect(shape("2027-05-17").phase).toBe("specific");
  });

  it("goes on rolling with nothing left, and with no season at all", () => {
    expect(seasonOver(spring, [], "2027-07-01")).toBe(true);
    expect(seasonOver(spring, [], "2027-06-30")).toBe(false);
    expect(seasonOver(spring, [race("2027-09-01")], "2027-07-01")).toBe(false);
    const rolling = weekShape(start, { goal: "fitter" }, [], state);
    expect(weekShape(start, { goal: "season" }, [], state)).toEqual(rolling);
    expect(shape("2027-08-02")).toEqual(weekShape("2027-08-02", { goal: "fitter" }, [], state));
  });

  it("doesn't count a runner's race", () => {
    const run = { ...race("2027-02-14"), type: "Run", info: null };
    expect(shape("2027-02-08", [run]).phase).toBe("build");
  });
});

describe("what the kinds change", () => {
  const profile = (kinds: PlanSeason["kinds"], races: Race[] = []) =>
    seasonProfile({ months: ["2027-05"], kinds }, races, start)!;

  it("sets the hard work from the kinds", () => {
    expect(seasonFocus(profile(["granfondo"]))).toBe("aerobic");
    expect(seasonFocus(profile(["crit"]))).toBe("anaerobic");
    expect(seasonFocus(profile(["road"]))).toBe("vo2");
  });

  it("knows nothing with no kinds, and after the season", () => {
    expect(seasonProfile({ months: ["2027-05"], kinds: [] }, [], start)).toBeNull();
    expect(seasonProfile(spring, [], "2027-08-01")).toBeNull();
  });

  it("lets real races replace the kinds", () => {
    expect(seasonFocus(profile(["granfondo"], [race("2027-05-16", "A", "crit")]))).toBe(
      "anaerobic",
    );
    expect(seasonFocus(profile(["granfondo"], [race("2027-05-16", "B", "crit")]))).toBe(
      "anaerobic",
    );
  });

  it("isn't swayed by a preparation race before the period, or by a race with no kind", () => {
    expect(seasonFocus(profile(["granfondo"], [race("2027-03-07", "B", "crit")]))).toBe("aerobic");
    expect(seasonFocus(profile(["granfondo"], [race("2027-05-16", "A", null)]))).toBe("aerobic");
  });

  it("gives long races more long ride and short ones less, only when preparing", () => {
    expect(seasonLongShare(profile(["granfondo"]), "build")).toBe(0.45);
    expect(seasonLongShare(profile(["stage"]), "specific")).toBe(0.45);
    expect(seasonLongShare(profile(["crit"]), "specific")).toBe(0.3);
    expect(seasonLongShare(profile(["crit"]), "build")).toBeUndefined();
    expect(seasonLongShare(profile(["road"]), "specific")).toBeUndefined();
    expect(seasonLongShare(profile(["granfondo"]), "base")).toBeUndefined();
    expect(seasonLongShare(null, "build")).toBeUndefined();
  });
});

describe("noticing the races", () => {
  const today = "2027-03-01";
  const seen = seenRacesOf([race("2027-05-16"), race("2027-06-06", "B")], today);

  it("stays quiet when nothing changed, and when a race has only gone by", () => {
    expect(racesChanged(seen, [race("2027-05-16"), race("2027-06-06", "B")], today)).toBe(false);
    expect(racesChanged(seen, [race("2027-06-06", "B")], "2027-05-17")).toBe(false);
  });

  it("notices a race added, moved, removed or changed", () => {
    const both = [race("2027-05-16"), race("2027-06-06", "B")];
    expect(racesChanged(seen, [...both, race("2027-04-11", "C")], today)).toBe(true);
    expect(racesChanged(seen, [both[0]!, race("2027-06-13", "B")], today)).toBe(true);
    expect(racesChanged(seen, [both[0]!], today)).toBe(true);
    expect(racesChanged(seen, [race("2027-05-16", "B"), both[1]!], today)).toBe(true);
    expect(racesChanged(seen, [race("2027-05-16", "A", "crit"), both[1]!], today)).toBe(true);
  });

  it("has nothing to compare with before it has seen any", () => {
    expect(racesChanged(undefined, [race("2027-05-16")], today)).toBe(false);
  });
});

describe("the road ahead", () => {
  const free: DayPlan = { minutes: 60, indoor: false, long: false };
  const settings: PlanSettings = {
    goal: "season",
    season: spring,
    week: Array.from({ length: 7 }, () => free),
  };

  it("reaches the end of the season, however far", () => {
    const weeks = outline(start, "season", [], state, settings);
    expect(weeks[weeks.length - 1]!.monday).toBe("2027-06-28");
  });

  it("goes back to a few weeks once the season is over", () => {
    expect(outline("2027-08-02", "season", [], state, settings)).toHaveLength(8);
  });
});

describe("the climb on the road ahead", () => {
  const free: DayPlan = { minutes: 180, indoor: false, long: false };
  const settings: PlanSettings = {
    goal: "season",
    season: { ...spring, peakSeconds: 12 * 3600 },
    week: Array.from({ length: 7 }, () => free),
  };

  it("climbs to the peak by the specific phase, then holds it to the end of the period", () => {
    const low = { ...state, weeklySeconds: 7 * 3600 };
    const weeks = outline(start, "season", [], low, settings);
    const at = (m: string) => weeks.find((w) => w.monday === m)!;
    expect(at(start).seconds).toBe(7 * 3600);
    expect(at("2027-03-08").seconds).toBeCloseTo(12 * 3600, -1);
    expect(at("2027-03-15").seconds).toBeCloseTo(12 * 3600, -1);
    expect(at("2027-06-21").seconds).toBeCloseTo(12 * 3600, -1);
  });

  it("stays flat with no peak", () => {
    const flat = { ...settings, season: spring };
    const weeks = outline(start, "season", [], state, flat).filter((w) => !w.recovery);
    expect(new Set(weeks.map((w) => w.seconds)).size).toBe(1);
  });
});

describe("similar weeks, as one", () => {
  const H = 3600;
  const w = (monday: string, phase: "base" | "build", hours: number, recovery = false) => ({
    monday,
    phase,
    recovery,
    seconds: hours * H,
  });

  it("joins weeks of a phase of about the same size, recovery included", () => {
    const groups = groupWeeks([
      w("a", "base", 8),
      w("b", "base", 8.5),
      w("c", "base", 5.5, true),
      w("d", "base", 8.7),
      w("e", "base", 9),
      w("f", "build", 9),
    ]);
    expect(groups.map((g) => [g.monday, g.weeks, g.recoveries])).toEqual([
      ["a", 4, 1],
      ["e", 1, 0],
      ["f", 1, 0],
    ]);
    expect(groups[0]!.seconds).toBeCloseTo(((8 + 8.5 + 8.7) / 3) * H, 3);
  });

  it("makes a whole season short enough to read, and loses no week", () => {
    const weeks = outline(
      start,
      "season",
      [],
      { ...state, weeklySeconds: 7.5 * H },
      {
        goal: "season",
        season: { ...spring, peakSeconds: 12.5 * H },
        week: Array.from({ length: 7 }, () => ({ minutes: 180, indoor: false, long: false })),
      },
    );
    const groups = groupWeeks(weeks);
    expect(groups.length).toBeLessThanOrEqual(10);
    expect(groups.reduce((n, g) => n + g.weeks, 0)).toBe(weeks.length);
  });

  it("is empty with nothing to group", () => {
    expect(groupWeeks([])).toEqual([]);
  });
});

describe("the note", () => {
  const week = Array.from({ length: 7 }, () => ({ minutes: 60, indoor: false, long: false }));
  const note: PlanNote = {
    settings: { goal: "season", season: spring, week },
    state,
    sessions: [],
    reviews: [],
    undo: [],
    seenRaces: seenRacesOf([race("2027-05-16")], start),
  };

  it("keeps the season and the races it has seen", () => {
    const back = readNote(writeNote(note, start))!;
    expect(back.settings.season).toEqual(spring);
    const peak = { ...note.settings, season: { ...spring, peakSeconds: 43200 } };
    expect(
      readNote(writeNote({ ...note, settings: peak }, start))!.settings.season?.peakSeconds,
    ).toBe(43200);
    expect(back.settings.goal).toBe("season");
    expect(back.seenRaces).toEqual(note.seenRaces);
  });

  it("still reads a note from before seasons", () => {
    const { seenRaces: _, ...older } = note;
    const back = readNote(writeNote({ ...older, settings: { goal: "fitter", week } }, start))!;
    expect(back.settings.goal).toBe("fitter");
    expect(back.settings.season).toBeUndefined();
  });
});

describe("a whole season, week by week", () => {
  const off: DayPlan = { minutes: 0, indoor: false, long: false };
  const day = (minutes: number, long = false): DayPlan => ({ minutes, indoor: false, long });
  const week = [off, day(75), day(60), day(75), off, day(240, true), day(120)];
  const pool = buildPool([], "ride", { ftp: 250 });
  const settings: PlanSettings = { goal: "season", season: spring, week };
  const races = [race("2027-05-16", "B"), race("2027-06-06")];

  it("keeps hard days apart, rest days free and every day inside its time", () => {
    let hardBefore: string[] = [];
    for (let m = start; m <= "2027-07-26"; m = addDays(m, 7)) {
      const days = layoutWeek({
        today: m,
        shape: weekShape(m, settings, races, state),
        settings,
        state,
        focus: "vo2",
        pool,
        races,
        taken: [],
        off: new Set(),
        recentHard: hardBefore,
        longestSeconds: 4 * 3600,
        th: { ftp: 250 },
      });
      const hard = days.filter((d) => d.role === "hard").map((d) => d.date);
      for (const [i, d] of days.entries()) {
        if (d.workout) expect(d.workout.seconds).toBeLessThanOrEqual(week[i]!.minutes * 60);
        if (week[i]!.minutes === 0 && d.role !== "race") expect(d.workout).toBeNull();
      }
      for (const [i, h] of hard.entries()) {
        if (i) expect(h > addDays(hard[i - 1]!, 1)).toBe(true);
        for (const b of hardBefore) expect(h > addDays(b, 1)).toBe(true);
      }
      hardBefore = hard.slice(-1);
    }
  });
});
