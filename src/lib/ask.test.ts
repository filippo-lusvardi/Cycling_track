import { describe, expect, it, vi } from "vitest";
import type { Activity, PlannedEvent } from "./intervals";
import {
  allEntries,
  alternatives,
  barText,
  dayIsDone,
  norm,
  nowEntries,
  spanAnswer,
  whenEntries,
  type AskData,
  type Moment,
  type Entry,
} from "./ask";

// These cases are written in Italian; the language is fixed when the module loads.
vi.hoisted(() => localStorage.setItem("cadence_language", JSON.stringify("it")));

const today = "2026-11-05";
const ride = (id: string, name: string, date = "2026-11-03"): Activity =>
  ({
    id,
    name,
    type: "Ride",
    start_date_local: `${date}T09:00:00`,
    moving_time: 5400,
    total_elevation_gain: 800,
  }) as unknown as Activity;
const data: AskData = {
  today,
  garden: true,
  acts: [
    ride("a", "Passo Verdana"),
    ride("b", "Passo Verdana", "2026-10-01"),
    ride("c", "Valverde"),
  ],
  climbs: [
    { id: "s", name: "Salita del Verdana", length: 21000, gain: 1400, rides: 4, saved: true },
    { id: "d", name: "Monte-Rosso da Borgo", length: 19800, gain: 1320, rides: 6, saved: false },
  ],
  forests: [{ id: "f1", name: "Faggeta", trees: 4 }],
  races: [
    {
      id: "r",
      name: "Marcia Alta",
      date: "2027-01-31",
      category: "RACE_B",
    } as unknown as PlannedEvent,
  ],
};
const entries = allEntries(data);
const ids = (q: string, season: Parameters<typeof alternatives>[1] = null) =>
  alternatives(q, season, entries).map((a) => a.id);

const params = {
  sport: "ride" as const,
  runs: false,
  rideZones: {
    ftp: 262,
    power: [144, 197, 236, 275, 314, 393, 2600],
    hr: [131, 146, 157, 168, 173, 178, 195],
  },
  thresholds: {
    exists: true,
    paceSynced: false,
    ftp: 262,
    lthr: 168,
    maxHr: 192,
    pace: null,
  } as never,
  runThreshold: null,
  wellness: [
    {
      id: "2026-11-05",
      ctl: 35,
      atl: 37,
      rampRate: 1.5,
      eftp: 258,
      weight: 68,
      bodyFat: null,
      hrv: 62,
      sleepSecs: 26000,
    } as never,
  ],
};
const full = allEntries({ ...data, params });
const fullIds = (q: string) =>
  alternatives(q, null, [...whenEntries(q, today).filter((e) => e.exact), ...full]).map(
    (a) => a.id,
  );

describe("parameters", () => {
  it("answers ftp with the value before any question", () => {
    const [top] = alternatives("ftp", "summer", full);
    expect(top!.id).toBe("param-ftp");
    expect(top!.value).toBe("262 W");
    expect(alternatives("ftp", "summer", full).map((x) => x.id)).toContain("param-eftp");
  });

  it("offers the thresholds for soglia", () => {
    expect(fullIds("soglia")).toEqual(expect.arrayContaining(["param-ftp", "param-lthr"]));
    expect(fullIds("soglia")).not.toContain("legend-leaves");
  });

  it("opens the Zone tab on the zone asked for", () => {
    const [z] = alternatives("z2", null, full);
    expect(z!.id).toBe("param-zone-2");
    expect(z!.answer).toBe("145–197 W · 132–146 bpm");
    expect(z!.dest).toEqual({
      kind: "route",
      to: "/analysis",
      search: { view: "zones", zone: "2" },
    });
    expect(alternatives("zona 2", null, full)[0]!.id).toBe("param-zone-2");
  });

  it("opens Settings only when asked for by name", () => {
    for (const q of ["zone", "soglia", "fc max", "ftp"])
      expect(fullIds(q)).not.toContain("settings");
    expect(fullIds("impostazioni")[0]).toBe("settings");
  });

  it("opens a single chart", () => {
    const [d] = alternatives("durability", "summer", full);
    expect(d!.dest).toEqual({ kind: "route", to: "/analysis", search: { plot: "durability" } });
    expect(alternatives("eftp", null, full)[0]!.dest).toEqual({
      kind: "route",
      to: "/analysis",
      search: { plot: "eftp" },
    });
  });

  it("never recognises resting heart rate", () => {
    for (const q of ["fc riposo", "frequenza a riposo", "resting hr", "rhr"]) {
      const found = fullIds(q).filter((id) => id.startsWith("param-") || id.startsWith("plot-"));
      expect(found).toEqual([]);
    }
  });
});

describe("time", () => {
  it("reads days ahead and behind", () => {
    const tomorrow = alternatives("domani", null, full)[0]!;
    expect(tomorrow.span).toEqual({ from: "2026-11-06", to: "2026-11-06" });
    expect(tomorrow.page).toBe("programme");
    expect(alternatives("ieri", null, full)[0]!.page).toBe("recap");
  });

  it("reads any length typed", () => {
    const q = "ultimi 10 giorni";
    const [top] = alternatives(q, null, [...whenEntries(q, today).filter((e) => e.exact), ...full]);
    expect(top!.span).toEqual({ from: "2026-10-27", to: "2026-11-05" });
  });

  it("offers both a month's recap and its calendar", () => {
    const found = fullIds("ottobre");
    expect(found).toContain("when-recap-2026-10");
    expect(found).toContain("month-2026-10");
  });

  it("answers a future day from the plan, a past stretch from the activities", () => {
    const events = [
      {
        date: "2026-11-06",
        category: "WORKOUT",
        name: "Fondo",
        moving_time: 7800,
        icu_training_load: 128,
      } as never,
    ];
    const d = { ...data, events };
    const tomorrow = alternatives("domani", null, full)[0]!;
    expect(spanAnswer(tomorrow, d)).toBe("Fondo · 2h 10m · carico 128");
    const after = alternatives("dopodomani", null, full)[0]!;
    expect(spanAnswer(after, d)).toBe("Niente in programma");
    expect(spanAnswer(alternatives("ultima settimana", null, full)[0]!, d)).toMatch(/2 attività/);
  });
});

const moment: Moment = {
  season: "spring",
  checkInDue: false,
  ride: null,
  rideSeen: false,
  planned: false,
  hour: 10,
};

describe("alternatives", () => {
  it("counts the same row once, however it was reached", () => {
    const dest = {
      kind: "route",
      to: "/suggest",
      search: { date: "2026-11-05", id: "x" },
    } as const;
    const twice: Entry[] = [
      { id: "a", q: "Fondo", page: "workouts", kind: "plan", exact: true, dest },
      { id: "b", q: "Fondo", page: "workouts", kind: "plan", dest },
      { id: "c", q: "Fondo", page: "ride", kind: "ride", dest: { kind: "stay" } },
    ];
    expect(alternatives("fondo", null, twice).map((e) => e.id)).toEqual(["a", "c"]);
  });

  it("offers at most three", () => {
    expect(alternatives("s", "summer", entries).length).toBeLessThanOrEqual(3);
  });

  it("lets the season decide on a single letter", () => {
    expect(ids("s", "summer")[0]).toBe("climbs");
    expect(ids("s", "winter")).not.toContain("climbs");
    expect(ids("s", "winter")).toContain("sleep");
  });

  it("finds the same word whatever the season once it's typed in full", () => {
    expect(ids("analisi", "winter")[0]).toBe("analysis");
    expect(ids("salite", "winter")[0]).toBe("climbs");
  });

  it("opens the guide for guide, including how to search", () => {
    for (const q of ["guida", "guide", "legenda", "aiuto"]) expect(ids(q)).toContain("legend");
    const how = alternatives("guida", null, entries).find((a) => a.id === "guide-search");
    expect(how!.dest).toEqual({ kind: "legend", term: "find", tab: "ask" });
  });

  it("prefers the page when the legend has the same word", () => {
    expect(ids("anni")[0]).toBe("years");
    expect(ids("anni")).toContain("legend-years");
  });

  it("understands other people's words", () => {
    expect(ids("vasi")[0]).toBe("pantry");
    expect(ids("giardino")[0]).toBe("garden");
    expect(ids("foreste")[0]).toBe("forest");
    expect(ids("sonno")).toContain("sleep");
    expect(ids("gufo")[0]).toBe("legend-owl");
  });

  it("forgives one slip and ignores accents", () => {
    expect(ids("miglorando")[0]).toBe("analysis");
    expect(norm("Attività")).toBe("attivita");
    expect(ids("attivita")).toContain("activities");
  });

  it("finds the person's own rides, climbs and races, each name once", () => {
    const man = ids("verd");
    expect(man).toContain("ride-a");
    expect(man).toContain("segment-s");
    expect(man).not.toContain("ride-b");
    expect(ids("marcia")).toContain("race-r");
  });

  it("opens a month in the calendar", () => {
    const m = alternatives("marzo", null, entries).find((a) => a.id.startsWith("month-"));
    expect(m!.dest).toEqual({ kind: "route", to: "/calendar", search: { month: "2026-03" } });
  });

  it("never guesses the forest", () => {
    for (const q of ["b", "bo", "a", "am", "f", "fo"]) expect(ids(q)).not.toContain("forest");
    expect(ids("amici")).toContain("forest");
  });

  it("finds a climb by a word after punctuation", () => {
    expect(ids("rosso")).toContain("segment-d");
    expect(ids("verdana")).toContain("segment-s");
  });

  it("enters a forest by its name, never by a guess", () => {
    const [f] = alternatives("faggeta", null, entries);
    expect(f!.dest).toEqual({ kind: "route", to: "/forest/$fid", params: { fid: "f1" } });
    expect(alternatives("fag", null, entries)[0]!.id).toBe("forest-f1");
    expect(ids("fa")).not.toContain("forest-f1");
    expect(ids("f")).not.toContain("forest-f1");
    expect(nowEntries(moment, entries).map((e) => e.id)).not.toContain("forest-f1");
  });

  it("takes a question in the other language too", () => {
    expect(ids("analysis")[0]).toBe("analysis");
    expect(ids("sleeping")[0]).toBe("sleep");
  });

  it("completes only what starts with what's typed", () => {
    expect(alternatives("come sto", "summer", entries)[0]!.ghost).toBe(" oggi?");
    expect(alternatives("gufo", "summer", entries)[0]!.ghost).toBe("");
    expect(alternatives("sonno", "summer", entries)[0]!.ghost).toBeNull();
  });

  it("has nothing for what it doesn't know", () => {
    expect(ids("ombrello")).toEqual([]);
  });

  it("leaves the Garden out when it's off", () => {
    const off = allEntries({ ...data, garden: false });
    expect(alternatives("vasi", null, off)).toEqual([]);
    expect(off.some((e) => e.id === "legend-sprouts")).toBe(false);
  });
});

describe("the moment", () => {
  const now = (m: Partial<Moment>) => nowEntries({ ...moment, ...m }, entries).map((e) => e.id);

  it("asks for the check-in first", () => {
    expect(now({ checkInDue: true, season: "winter" })).toEqual(["today", "sleep", "week"]);
    expect(now({ checkInDue: true, season: "summer" })).toEqual(["today", "climbs", "activities"]);
  });

  it("asks about today's activity until it has been opened", () => {
    const r = ride("t", "Monte Rosso", today);
    expect(now({ ride: r, season: "summer" })).toEqual(["today-ride", "climbs"]);
    expect(barText({ ...moment, ride: r })).toBe("Com'è andata oggi?");
    expect(dayIsDone({ ...moment, ride: r, rideSeen: true })).toBe(true);
    expect(now({ ride: r, rideSeen: true })).toEqual([]);
  });

  it('no longer offers "Sto migliorando?", typed or not', () => {
    expect(entries.some((e) => e.q === "Sto migliorando?")).toBe(false);
    expect(alternatives("sto", "summer", entries).map((e) => e.q)).not.toContain(
      "Sto migliorando?",
    );
  });

  it("just invites on the bar when a plan is all that's waiting", () => {
    expect(barText({ ...moment, planned: true })).toBe("Chiedi all'albero…");
  });

  it("keeps performance away on a low day", () => {
    for (const season of ["winter", "autumn"] as const) {
      expect(now({ season })).not.toContain("analysis");
      expect(now({ season })).not.toContain("climbs");
    }
  });

  it("says nothing special when the day is done", () => {
    expect(barText({ ...moment, hour: 19 })).toBe("Chiedi all'albero…");
    expect(now({ hour: 19 })).toEqual([]);
  });

  it("finishes on an evening with nothing waiting, but not with a plan", () => {
    expect(dayIsDone({ ...moment, hour: 19 })).toBe(true);
    expect(dayIsDone({ ...moment, hour: 10 })).toBe(false);
    expect(dayIsDone({ ...moment, hour: 19, planned: true })).toBe(false);
    expect(dayIsDone({ ...moment, hour: 19, checkInDue: true })).toBe(false);
  });

  it("looks back at the week's turn, only when nothing else is waiting", () => {
    expect(now({ weekday: 1 })).toContain("when-last-7");
    expect(now({ weekday: 0 })).toContain("when-this-week");
    expect(now({ weekday: 3 })).not.toContain("when-last-7");
    expect(now({ weekday: 1, checkInDue: true })).not.toContain("when-last-7");
  });

  it("never suggests the forest", () => {
    for (const season of ["winter", "spring", "summer", null] as const) {
      expect(now({ season })).not.toContain("forest");
      expect(now({ season, ride: ride("t", "x", today) })).not.toContain("forest");
    }
  });
});
