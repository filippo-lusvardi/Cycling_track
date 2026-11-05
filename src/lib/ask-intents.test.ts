import { describe, expect, it, vi } from "vitest";
import type { Activity, PlannedEvent } from "./intervals";
import {
  intentEntries,
  liveEntries,
  type IntentClimb,
  type IntentData,
  type LiveData,
} from "./ask-intents";
import { alternatives } from "./ask";
import { buildPool, type SuggestInput } from "./suggest";
import type { Attempt } from "./segments";

vi.hoisted(() => localStorage.setItem("cadence_language", JSON.stringify("it")));

const today = "2026-11-05";
const effort = (date: string, duration: number, avgWatts: number | null = 215): Attempt =>
  ({
    trackId: date,
    trackName: null,
    date,
    duration,
    avgWatts,
    avgHr: null,
    avgCad: null,
    gain: 800,
    vam: null,
    i0: 0,
    i1: 1,
  }) as Attempt;
const climb = (id: string, name: string, attempts: Attempt[], saved = false): IntentClimb => ({
  id,
  name,
  length: 20000,
  saved,
  attempts,
});
const act = (id: string, date: string, type: string, km: number, gain = 300) =>
  ({
    id,
    name: id,
    type,
    start_date_local: `${date}T09:00:00`,
    moving_time: 3600,
    distance: km * 1000,
    total_elevation_gain: gain,
    icu_training_load: 60,
  }) as unknown as Activity;

const data: IntentData = {
  today,
  sport: "ride",
  native: false,
  climbs: [
    climb(
      "m",
      "Passo Verdana",
      [effort("2025-05-12", 2892), effort("2026-10-01", 3100), effort("2026-03-01", 3000, null)],
      true,
    ),
    climb("b", "Monte-Rosso da Borgo", [effort("2026-06-01", 4000)]),
    climb("z", "Salita del Verdana bassa", []),
  ],
  acts: [
    act("oggi", today, "Ride", 40),
    act("corsa", "2026-11-01", "Run", 8, 50),
    act("nuoto", "2026-10-20", "Swim", 2, 0),
    act("vecchia", "2025-06-01", "Ride", 120, 2100),
  ],
  curves: [
    { id: "42d", label: "42", secs: [60, 300, 1200, 3600], watts: [400, 310, 270, 240] },
    { id: "1y", label: "1y", secs: [60, 300, 1200, 3600], watts: [420, 325, 285, 255] },
  ] as never,
  offEvents: [],
};
const rows = (q: string, d: IntentData = data) => intentEntries(q, d);

describe("climbs", () => {
  it("answers best with the time, date, power and passes", () => {
    const [top] = rows("best verdana");
    expect(top!.q).toBe("Passo Verdana");
    expect(top!.value).toBe("48:12");
    expect(top!.answer).toBe("12 mag 2025 · 215 W · 3 passaggi");
    expect(top!.dest).toEqual({
      kind: "route",
      to: "/segments/$id",
      search: { sport: "ride" },
      params: { id: "m" },
    });
  });

  it("takes every way of asking, and partial names", () => {
    for (const q of [
      "miglior verdana",
      "migliore verdana",
      "record verdana",
      "pr verdana",
      "pb verdana",
      "best ver",
      "miglior tempo verdana".replace(" tempo", ""),
    ])
      expect(rows(q)[0]!.value).toBe("48:12");
  });

  it("finds a word after punctuation", () => {
    expect(rows("best rosso")[0]!.value).toBe("1:06:40");
  });

  it("says when a climb has no passes", () => {
    expect(rows("best bassa")[0]!.answer).toBe("Ancora nessun passaggio");
  });

  it("offers your climbs for best alone, at most three", () => {
    expect(rows("best").length).toBeLessThanOrEqual(3);
    expect(rows("best")[0]!.q).toBe("Passo Verdana");
  });

  it("asks to read the rides when nothing has been analysed", () => {
    expect(rows("best verdana", { ...data, climbs: [] })[0]!.id).toBe("climb-none");
  });

  it("answers last and how many", () => {
    expect(rows("ultima verdana")[0]!.value).toBe("51:40");
    const [n] = rows("quante volte verdana");
    expect(n!.value).toBe("3");
    expect(n!.answer).toContain("2 quest'anno");
  });

  it("shows pace rather than power on a run", () => {
    expect(rows("best verdana", { ...data, sport: "run" })[0]!.answer).toContain("/km");
  });
});

describe("last activity", () => {
  it("finds the latest of a sport", () => {
    expect(rows("ultima uscita")[0]!.id).toBe("last-activity");
    expect(rows("ultima uscita")[0]!.q).toBe("oggi");
    expect(rows("ultima corsa")[0]!.q).toBe("corsa");
    expect(rows("ultimo nuoto")[0]!.q).toBe("nuoto");
  });

  it("leaves stretches of time alone", () => {
    expect(rows("ultima settimana")).toEqual([]);
    expect(rows("ultimi 10 giorni")).toEqual([]);
    expect(rows("last week")).toEqual([]);
  });
});

describe("best power and pace", () => {
  it("reads durations", () => {
    const [p] = rows("best 20 min");
    expect(p!.value).toBe("285 W");
    expect(p!.answer).toContain("270 W");
    expect(p!.dest).toEqual({ kind: "route", to: "/analysis", search: { plot: "power" } });
    expect(rows("best 1h")[0]!.value).toBe("255 W");
    expect(rows("miglior 5 min")[0]!.value).toBe("325 W");
  });

  it("reads running bests only if the analysis is ready", () => {
    expect(rows("best 10 km", { ...data, sport: "run" })[0]!.id).toBe("best-run-open");
    const runs = [
      { id: "r1", bests: [null, null, 2500, null, null] },
      { id: "r2", bests: [null, null, 2400, null, null] },
    ];
    const [b] = rows("best 10 km", { ...data, sport: "run", runs });
    expect(b!.value).toBe("40:00");
    expect(b!.dest).toEqual({ kind: "route", to: "/rides/$id", params: { id: "r2" } });
    expect(rows("best mezza", { ...data, sport: "run", runs })[0]!.answer).toContain(
      "nessuna corsa",
    );
  });
});

describe("writing", () => {
  const action = (q: string, d = data) => {
    const e = rows(q, d)[0];
    return e?.dest.kind === "write" ? e.dest.action : null;
  };

  it("saves weight, and says so in the row", () => {
    const e = rows("peso 68.2")[0]!;
    expect(e.q).toBe("Salva peso 68.2 kg");
    expect(e.page).toBe("save");
    expect(action("peso 68,2")).toMatchObject({
      kind: "wellness",
      field: "weight",
      value: 68.2,
      date: today,
    });
    expect(action("68.2 kg")).toMatchObject({ field: "weight", value: 68.2 });
    expect(action("weight 70")).toMatchObject({ value: 70 });
  });

  it("refuses values out of range", () => {
    expect(rows("peso 680")).toEqual([]);
    expect(rows("peso 10")).toEqual([]);
    expect(rows("grasso 90")).toEqual([]);
    expect(rows("sonno 30h")).toEqual([]);
    expect(rows("99 brioche")).toEqual([]);
  });

  it("reads sleep in any common form", () => {
    for (const [q, secs] of [
      ["sonno 7h", 25200],
      ["sonno 7", 25200],
      ["sonno 7h 30", 27000],
      ["sonno 7h30", 27000],
      ["sonno 7.5", 27000],
      ["sleep 8 hours", 28800],
      ["ho dormito 6 ore 15", 22500],
    ] as const)
      expect(action(q)).toMatchObject({ field: "sleepSecs", value: secs });
  });

  it("takes HRV only without intervals.icu", () => {
    expect(rows("hrv 62")).toEqual([]);
    expect(action("hrv 62", { ...data, native: true })).toMatchObject({ field: "hrv", value: 62 });
  });

  it("needs the word for today to mark a day", () => {
    expect(rows("malato")).toEqual([]);
    expect(action("malato oggi")).toMatchObject({ kind: "off", off: "SICK", today });
    expect(action("malata oggi")).toMatchObject({ off: "SICK" });
    expect(action("infortunio oggi")).toMatchObject({ off: "INJURED" });
  });

  it("doesn't mark what's marked, and takes it off", () => {
    const marked = {
      ...data,
      offEvents: [{ id: "e", date: today, end: today, category: "SICK" } as PlannedEvent],
    };
    expect(rows("malato oggi", marked)[0]!.dest.kind).toBe("route");
    expect(action("non piu malato", marked)).toMatchObject({ kind: "off", off: "SICK" });
    expect(action("non più malata", marked)).toMatchObject({ kind: "off" });
    expect(rows("non piu malato")[0]!.dest.kind).toBe("route");
  });

  it("puts brioches on today's activity, naming it, else the latest", () => {
    const e = rows("2 brioche")[0]!;
    expect(e.answer).toContain("oggi");
    expect(action("2 brioche")).toMatchObject({ kind: "brioche", activityId: "oggi", count: 2 });
    const none = { ...data, acts: data.acts!.slice(1) };
    expect(action("brioche 3", none)).toMatchObject({ activityId: "corsa" });
  });

  it("never treats a word alone as a save", () => {
    for (const q of ["peso", "sonno", "grasso", "hrv", "brioche"])
      expect(rows(q).every((e) => e.dest.kind !== "write")).toBe(true);
  });
});

describe("feel by typing", () => {
  it("saves on today's activity, naming it", () => {
    const e = rows("sensazione buona")[0]!;
    expect(e.q).toBe("Segna sensazione: Buona");
    expect(e.answer).toContain("oggi");
    expect(e.dest).toMatchObject({
      kind: "write",
      action: { kind: "feel", activityId: "oggi", feel: 2 },
    });
    expect(rows("feel weak")[0]!.dest).toMatchObject({ action: { feel: 5 } });
    expect(rows("corsa pessima")[0]!.dest).toMatchObject({ action: { feel: 5 } });
  });
});

describe("plan by typing", () => {
  it("opens the Calendar's plan page on that day", () => {
    const [p] = rows("plan domani");
    expect(p!.q).toBe("Pianifica domani");
    expect(p!.dest).toEqual({
      kind: "route",
      to: "/calendar",
      search: { month: "2026-11", plan: "2026-11-06" },
    });
    expect(rows("pianifica sabato")[0]!.dest).toMatchObject({ search: { plan: "2026-11-07" } });
    expect(rows("plan tomorrow")[0]!.dest).toMatchObject({ search: { plan: "2026-11-06" } });
    expect(rows("plan 12 novembre")[0]!.dest).toMatchObject({ search: { plan: "2026-11-12" } });
    expect(rows("plan tra 3 giorni")[0]!.dest).toMatchObject({ search: { plan: "2026-11-08" } });
    expect(rows("plan 1 dicembre")[0]!.dest).toMatchObject({
      search: { month: "2026-12", plan: "2026-12-01" },
    });
  });

  it("means tomorrow when nothing follows, and offers the alternatives while typing", () => {
    expect(rows("plan")[0]!.dest).toMatchObject({ search: { plan: "2026-11-06" } });
    expect(rows("plan do").map((e) => e.q)).toEqual(
      expect.arrayContaining(["Pianifica domani", "Pianifica dopodomani", "Pianifica domenica"]),
    );
  });

  it("can't plan the past", () => {
    expect(rows("plan ieri")).toEqual([]);
    expect(rows("plan sabato scorso")).toEqual([]);
  });

  it("says what's already there", () => {
    const events = [{ date: "2026-11-06", category: "WORKOUT", name: "Fondo" } as PlannedEvent];
    expect(rows("plan domani", { ...data, events })[0]!.answer).toContain("Fondo");
  });

  it("leaves what's already planned to the question", () => {
    expect(rows("programma").length).toBe(0);
  });
});

describe("eating and totals", () => {
  it("answers fuel without going anywhere", () => {
    const [f] = rows("mangiare 3 ore");
    expect(f!.dest).toEqual({ kind: "stay" });
    expect(f!.value).toMatch(/g$/);
    expect(f!.answer).toContain("brioche");
    expect(rows("brioche 3h")[0]!.id).toBe("fuel");
    expect(rows("mangiare 1 ora")[0]!.answer).toContain("non serve");
  });

  it("adds up a stretch", () => {
    const [k] = rows("km quest'anno");
    expect(k!.value).toBe("50 km");
    expect(k!.dest).toEqual({
      kind: "route",
      to: "/recap",
      search: { from: "2026-01-01", to: "2026-12-31" },
    });
    expect(rows("km 2025")[0]!.value).toBe("120 km");
    expect(rows("dislivello 2025")[0]!.value).toBe("2100 m");
    expect(rows("ore ultimi 10 giorni")[0]!.value).toBe("2h 00m");
  });

  it("recognises no resting heart rate", () => {
    for (const q of ["fc riposo", "best fc riposo", "resting hr"])
      expect(rows(q).every((e) => !/fc|hr/i.test(e.q))).toBe(true);
  });
});

describe("today", () => {
  const live: LiveData = {
    today,
    sport: "ride",
    checkIn: true,
    acts: data.acts,
    score: 64,
    form: -2,
    zones: { power: [144, 197, 236, 275, 314, 393, 999], hr: [131, 146, 157, 168, 173, 178, 195] },
    suggest: {
      today,
      sport: "ride",
      focus: "aerobic",
      races: [],
      events: [],
      offEvents: [],
      acts: [],
      wellness: [],
      score: 64,
      form: -2,
      th: { ftp: 250 },
      pool: buildPool(
        [
          {
            id: "1",
            name: "Fondo mio",
            type: "Ride",
            description: "- 60m 65%",
            moving_time: 3600,
            icu_training_load: 45,
          },
        ],
        "ride",
        { ftp: 250 },
      ),
    },
  };
  const find = (d: LiveData, id: string) => liveEntries(d).find((e) => e.id === id);

  it("gives today's advice and ceiling", () => {
    expect(find(live, "do-today")!.answer).toMatch(/fondo.*197 W/i);
  });

  it("puts what's planned first and offers nothing else", () => {
    const planned = [
      { date: today, category: "WORKOUT", name: "Ripetute 4×8", moving_time: 5400 } as PlannedEvent,
    ];
    expect(find({ ...live, planned }, "do-today")!.answer).toBe("Ripetute 4×8 · 1h 30m");
    expect(find({ ...live, planned }, "do-workout")).toBeUndefined();
  });

  it("answers with the same workout as a suggestion", () => {
    const row = find(live, "do-workout")!;
    expect(row.q).toBe("Fondo mio");
    expect(row.dest).toEqual({
      kind: "route",
      to: "/suggest",
      search: { date: today, id: "lib-1" },
    });
  });

  it("suggests no workout on a low day", () => {
    expect(find({ ...live, score: 32 }, "do-workout")).toBeUndefined();
    expect(find({ ...live, score: 32 }, "do-today")!.answer).toBeTruthy();
  });

  it("counts down to the next race", () => {
    const races = [
      { date: "2026-11-15", name: "Lago", category: "RACE_B" } as PlannedEvent,
      { date: "2026-10-01", name: "Vecchia", category: "RACE_A" } as PlannedEvent,
    ];
    const r = find({ ...live, races }, "next-race")!;
    expect(r.value).toBe("10 g");
    expect(r.answer).toContain("Lago");
    expect(find(live, "next-race")!.answer).toBe("Nessuna gara in programma");
  });

  it("knows your records", () => {
    expect(find(live, "record-longest")!.value).toBe("120 km");
    expect(find(live, "record-climbing")!.value).toBe("2100 m");
  });
});

describe("the words for an activity", () => {
  const acts = [
    act("lunga", "2026-10-01", "Ride", 150, 2000),
    act("breve", "2026-10-02", "Ride", 20, 100),
    act("trail", "2026-10-03", "Run", 18, 900),
  ];
  const live: LiveData = { today, sport: "ride", checkIn: true, acts };
  const top = (q: string, l: LiveData = live) =>
    alternatives(q, null, liveEntries(l)).map((e) => e.id);

  it("finds your records under any of a sport's names", () => {
    for (const q of [
      "uscita più lunga",
      "pedalata più lunga",
      "giro più lungo".replace("lungo", "lunga"),
      "longest ride",
      "pedalata piu l",
    ])
      expect(top(q)[0]).toBe("record-longest");
    expect(top("pedalata con più dislivello")[0]).toBe("record-climbing");
  });

  it("answers for the other sport when it's named, your own first otherwise", () => {
    expect(top("corsa più lunga")[0]).toBe("record-longest-run");
    expect(top("più lunga")[0]).toBe("record-longest");
    const onlyRides = { ...live, acts: acts.filter((a) => a.type === "Ride") };
    expect(top("corsa più lunga", onlyRides)).toEqual([]);
    const runner = { ...live, sport: "run" as const };
    expect(top("corsa più lunga", runner)[0]).toBe("record-longest");
    expect(top("pedalata più lunga", runner)[0]).toBe("record-longest-ride");
  });

  it("reads pedalata in commands", () => {
    expect(rows("ultima pedalata")[0]!.q).toBe("oggi");
    expect(rows("pedalata buona")[0]!.id).toBe("save-feel");
  });

  it("counts the sport a word names", () => {
    expect(rows("pedalate quest'anno")[0]!.value).toBe("1");
    expect(rows("uscite quest'anno")[0]!.value).toBe("1");
    expect(rows("corse quest'anno")[0]!.value).toBe("1");
    expect(rows("attivita quest'anno")[0]!.value).toBe("3");
  });
});

describe("a ride that isn't training", () => {
  const on: IntentData = data;
  const ride = (q: string, d: IntentData = on) => {
    const r = rows(q, d)[0];
    return r?.dest.kind === "write" ? r.dest.action : null;
  };

  it("takes the day from either end and keeps your capitals", () => {
    expect(ride("pianifica domani giro con Marco")).toMatchObject({
      kind: "ride",
      date: "2026-11-06",
      name: "Giro con Marco",
      type: "Ride",
    });
    expect(ride("plan social ride saturday")).toMatchObject({
      date: "2026-11-07",
      name: "Social ride",
    });
    expect(ride("pianifica uscita sociale il 12 novembre")).toMatchObject({
      date: "2026-11-12",
      name: "Uscita sociale",
    });
    expect(ride("pianifica Colazione con Luca per sabato")).toMatchObject({
      date: "2026-11-07",
      name: "Colazione con Luca",
    });
  });

  it("means tomorrow without a day", () => {
    expect(ride("pianifica giro con Anna")).toMatchObject({ date: "2026-11-06" });
  });

  it("takes the sport from the words, else your own", () => {
    expect(ride("pianifica domani corsa con Anna")).toMatchObject({ type: "Run" });
    expect(ride("pianifica domani colazione")).toMatchObject({ type: "Ride" });
    expect(ride("pianifica domani colazione", { ...on, sport: "run" })).toMatchObject({
      type: "Run",
    });
    expect(ride("pianifica domani giro", { ...on, sport: "run" })).toMatchObject({ type: "Ride" });
  });

  it("leaves dates alone, whole or half typed", () => {
    expect(rows("pianifica domani", on)[0]!.id).toBe("plan-2026-11-06");
    expect(rows("pianifica sab", on)[0]!.q).toBe("Pianifica sabato");
  });

  it("can't go in the past", () => {
    expect(rows("pianifica ieri giro con Marco", on)).toEqual([]);
    expect(rows("pianifica giro con Marco sabato scorso", on)).toEqual([]);
    expect(rows("plan ieri", on)).toEqual([]);
  });

  it("says what's already that day", () => {
    const events = [{ date: "2026-11-06", category: "WORKOUT", name: "Fondo" } as PlannedEvent];
    expect(rows("pianifica domani giro", { ...on, events })[0]!.answer).toContain("Fondo");
  });
});

describe("power by words", () => {
  const curves = [
    {
      id: "42d",
      label: "42",
      secs: [5, 60, 300, 420, 1200, 3600],
      watts: [900, 420, 310, 300, 270, 240],
    },
    {
      id: "1y",
      label: "1y",
      secs: [5, 60, 300, 420, 1200, 3600],
      watts: [950, 440, 325, 310, 285, 255],
    },
  ] as never;
  const d: IntentData = { ...data, curves, ftp: 280, weight: 70 };

  it("reads any way of writing a length", () => {
    for (const q of [
      "potenza 5 min",
      "power 5m",
      "potenza 5",
      "potenza 5'",
      "5 min potenza",
      "watt 5 min",
      "quanti watt per 5 min",
      "potenza su 5 mi",
    ])
      expect(rows(q, d)[0]!.value).toBe("310 W");
    expect(rows("potenza 5 s", d)[0]!.value).toBe("900 W");
    expect(rows("potenza 1 h", d)[0]!.value).toBe("240 W");
    expect(rows("power 1h", d)[0]!.value).toBe("240 W");
    expect(rows("potenza 1 ora", d)[0]!.value).toBe("240 W");
  });

  it("gives the year, weight and FTP around it", () => {
    const a = rows("potenza 5 min", d)[0]!.answer!;
    expect(a).toContain("95%");
    expect(a).toContain("325 W");
    expect(a).toContain("4.43 W/kg");
    expect(a).toContain("111% FTP");
    const bare = rows("potenza 5 min", { ...d, ftp: null, weight: null })[0]!.answer!;
    expect(bare).not.toContain("FTP");
    expect(bare).not.toContain("W/kg");
  });

  it("says when it read a longer length", () => {
    expect(rows("potenza 6 min", d)[0]!.answer).toContain("letti sui 7 min");
    expect(rows("potenza 5 min", d)[0]!.answer).not.toContain("letti");
  });

  it("never offers room above what you've held for less", () => {
    const sparse = [
      { id: "1y", label: "1y", secs: [5, 60, 300, 1200, 1800], watts: [950, 440, 325, 285, 270] },
    ] as never;
    const r = rows("potenza 25 min", { ...d, curves: sparse });
    expect(r[0]!.answer).toContain("letti sui 30 min");
    expect(r.some((e) => e.id === "power-room")).toBe(false);
  });

  it("says so when nothing's that long", () => {
    const r = rows("potenza 5 h", d)[0]!;
    expect(r.answer).toContain("Ancora nessuno sforzo");
  });

  it("alone, shows a few points of the curve", () => {
    const r = rows("potenza", d)[0]!;
    expect(r.answer).toContain("5 s 900 W");
    expect(r.answer).toContain("20 min 270 W");
  });

  it("gives a year's best when the last weeks have none", () => {
    const old = [{ id: "1y", label: "1y", secs: [300], watts: [325] }] as never;
    const r = rows("potenza 5 min", { ...d, curves: old })[0]!;
    expect(r.value).toBe("325 W");
    expect(r.answer).toContain("Ultimo anno");
  });

  it("leaves a climb named Passo alone", () => {
    expect(rows("passo verdana", d)).toEqual([]);
  });

  it("runners get pace", () => {
    const runs = [
      {
        id: "a",
        bests: [],
        date: "2026-10-20",
        curve: [5, 4.5, 4, 3.8, 3.6, 3.5, 3.4, 3.3, 3.2, 3.1, 3, 2.9],
      },
      {
        id: "b",
        bests: [],
        date: "2026-01-20",
        curve: [6, 5, 4.2, 4, 3.8, 3.6, 3.5, 3.4, 3.3, 3.2, 3.1, 3],
      },
    ];
    const run: IntentData = { ...d, sport: "run", runs, runThreshold: 4 };
    const p = rows("passo 30 s", run)[0]!;
    expect(p.q).toBe("Passo 30 s");
    expect(p.value).toBe("3:20/km");
    expect(p.answer).toContain("125% della soglia");
    expect(rows("potenza 30 s", run)[0]!.id).toBe("pace");
    expect(rows("passo 10 s", run)[0]!.answer).toContain("GPS");
    expect(rows("passo 5 min", { ...run, runs: [] })[0]!.answer).toContain("Analisi");
    expect(rows("passo 5 min", { ...d, runs: [] })).toEqual([]);
  });
});

describe("suggestions by words", () => {
  const th = { ftp: 250 };
  const suggest: SuggestInput = {
    today,
    sport: "ride",
    focus: "vo2",
    races: [],
    events: [],
    offEvents: [],
    acts: [],
    wellness: [],
    score: 85,
    form: 2,
    th,
    pool: buildPool([], "ride", th),
  };
  const d: IntentData = { ...data, suggest };

  it("gives up to three workouts, opening their preview", () => {
    const r = rows("consiglia", d);
    expect(r.length).toBeGreaterThan(1);
    expect(r.length).toBeLessThanOrEqual(3);
    expect(r[0]!.dest).toMatchObject({ to: "/suggest", search: { date: today } });
    expect(r[0]!.answer).toContain("Il tuo blocco");
    expect(r[0]!.answer).toContain(" W");
  });

  it("reads a day, a length and a kind in any order", () => {
    expect(rows("consiglia domani", d)[0]!.dest).toMatchObject({ search: { date: "2026-11-06" } });
    expect(rows("cosa faccio sabato", d)[0]!.dest).toMatchObject({
      search: { date: "2026-11-07" },
    });
    expect(rows("what should i do tomorrow", d)[0]!.dest).toMatchObject({
      search: { date: "2026-11-06" },
    });
    const short = rows("consiglia 1h", d);
    expect(short.length).toBeGreaterThan(0);
    const soglia = rows("consiglia soglia sabato", d)[0]!;
    expect(soglia.dest).toMatchObject({ search: { date: "2026-11-07" } });
    expect(soglia.answer).toContain("Soglia");
  });

  it("warns without blocking when you ask for more than the day", () => {
    const low = { ...d, suggest: { ...suggest, score: 50 } };
    const r = rows("consiglia vo2", low)[0]!;
    expect(r.answer).toContain("la giornata chiede meno");
  });

  it("gives one row for a week", () => {
    const r = rows("consiglia settimana", d);
    expect(r.length).toBe(1);
    expect(r[0]!.dest).toMatchObject({ to: "/suggest", search: { from: today, to: "2026-11-11" } });
    expect(rows("consiglia settimana prossima", d)[0]!.dest).toMatchObject({
      search: { from: "2026-11-09", to: "2026-11-15" },
    });
  });

  it("says rest on a low day", () => {
    const low = { ...d, suggest: { ...suggest, score: 30 } };
    expect(rows("consiglia", low)[0]!.q).toBe("Oggi: riposo");
  });

  it("names what's in the way", () => {
    const events = [
      { date: "2026-11-06", category: "WORKOUT", name: "Mio", type: "Ride" } as PlannedEvent,
    ];
    const r = rows("consiglia domani", { ...d, suggest: { ...suggest, events } });
    expect(r[0]!.q).toBe("Già in programma: Mio");
  });

  it("leaves today's question and the past alone", () => {
    expect(rows("cosa faccio oggi", d)).toEqual([]);
    expect(rows("consiglia ieri", d)).toEqual([]);
    expect(rows("allenamento zzz", d)).toEqual([]);
  });

  it("plans a kind by going to suggestions", () => {
    const r = rows("pianifica sabato soglia", d)[0]!;
    expect(r.dest).toMatchObject({ to: "/suggest", search: { date: "2026-11-07" } });
  });
});
