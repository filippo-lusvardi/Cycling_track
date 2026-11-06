import { describe, expect, it, vi } from "vitest";
import { alternatives, type Entry } from "./ask";
import { curveKey, effortNeeds, effortRows, type EffortData } from "./ask-efforts";
import { intentEntries, type IntentData } from "./ask-intents";
import { readAsk } from "./ask-read";
import { whenCandidates } from "./ask-when";
import type { Activity, PowerCurve } from "./intervals";

vi.hoisted(() => localStorage.setItem("cadence_language", JSON.stringify("it")));

const today = "2026-11-06";
const act = (id: string, date: string, over: Partial<Activity> = {}) =>
  ({
    id,
    name: `Giro ${id}`,
    type: "Ride",
    start_date_local: `${date}T09:00:00`,
    moving_time: 3600,
    distance: 30000,
    icu_average_watts: 200,
    average_heartrate: 140,
    max_heartrate: 175,
    trainer: false,
    ...over,
  }) as unknown as Activity;

const acts = [
  act("oggi1", today),
  act("oggi2", today, { name: "Pomeriggio", moving_time: 1800, distance: 20000 }),
  act("ieri", "2026-11-05", {
    icu_average_watts: null,
    average_heartrate: null,
    max_heartrate: null,
  }),
  act("sab", "2026-10-31"),
  act("corsa", "2026-11-03", { type: "Run", icu_average_watts: null, name: "Corsa serale" }),
  act("rulli", "2026-03-10", { trainer: true, distance: 90000 }),
  act("mar", "2026-03-12", { moving_time: 7200, distance: 60000 }),
];

const steady = (w: number, n: number) => Array.from({ length: n }, () => w);
const signals = {
  oggi1: { watts: steady(250, 600), heartrate: steady(150, 600) },
  oggi2: {
    watts: [...steady(100, 300), ...steady(320, 240), ...steady(100, 300)],
    heartrate: steady(170, 840),
  },
  sab: { watts: steady(210, 400), heartrate: steady(160, 400) },
  corsa: { watts: [], heartrate: steady(165, 900) },
};

const data: EffortData = { today, sport: "ride", acts, signals, weight: 70, ftp: 280 };
const row = (q: string, d: Partial<EffortData> = {}): Entry => effortRows(q, { ...data, ...d })[0]!;
const curve = (id: string, value: number): PowerCurve => ({
  id,
  label: id,
  secs: [60, 180, 300, 1200],
  watts: [value + 50, value, value - 10, value - 30],
});

describe("reading an effort question", () => {
  const ctx = { today, sport: "ride" as const, acts };
  const read = (q: string) => readAsk(q, ctx);

  it.each([
    "power today 3m",
    "3m power today",
    "today power 3m",
    "today 3m power",
    "potenza oggi 3 minuti",
    "potenza di oggi su 3 min",
    "quanti watt ho tenuto oggi per tre minuti",
    "best power today 3m",
    "miglior potenza 3 min oggi",
    "watt 3' oggi",
  ])("%s", (q) => {
    expect(read(q)).toMatchObject({
      metric: "power",
      shape: "best",
      length: { secs: 180 },
      target: { kind: "span", from: today, to: today },
    });
  });

  it.each([
    ["fc 3m ieri", 180, "2026-11-05"],
    ["hr yesterday 3m", 180, "2026-11-05"],
    ["frequenza cardiaca 5 min sabato scorso", 300, "2026-10-31"],
    ["battiti last saturday 1h", 3600, "2026-10-31"],
    ["heart rate 90 s 3 giorni fa", 90, "2026-11-03"],
    ["bpm mezz'ora 28 marzo", 1800, "2026-03-28"],
    ["fc un'ora ieri", 3600, "2026-11-05"],
  ])("%s", (q, secs, from) => {
    expect(read(q)).toMatchObject({ metric: "hr", length: { secs }, target: { from } });
  });

  it("reads any stretch, in either language", () => {
    expect(read("power 20m marzo")?.target).toMatchObject({ from: "2026-03-01", to: "2026-03-31" });
    expect(read("power 20m marzo 2025")?.target).toMatchObject({ from: "2025-03-01" });
    expect(read("power 20m 2025")?.target).toMatchObject({ from: "2025-01-01", to: "2025-12-31" });
    expect(read("hr 5m this week")?.target).toMatchObject({ from: "2026-11-02" });
    expect(read("hr 5m settimana scorsa")?.target).toMatchObject({ from: "2026-10-26" });
    expect(read("potenza 5 min estate 2025")?.target).toMatchObject({ from: "2025-06-01" });
    expect(read("potenza 5 min ultimi 10 giorni")?.target).toMatchObject({ to: today });
    expect(read("fc 5 min dal 3 al 5 marzo")?.target).toMatchObject({
      from: "2026-03-03",
      to: "2026-03-05",
    });
    expect(read("fc 5 min 12/10")?.target).toMatchObject({ from: "2026-10-12" });
  });

  it("tells a length with minutes from a length and a date", () => {
    expect(read("power 1h30 oggi")).toMatchObject({ length: { secs: 5400 } });
    expect(read("power 1h 30m oggi")).toMatchObject({ length: { secs: 5400 } });
    expect(read("fc oggi 1h 30")).toMatchObject({ length: { secs: 5400 } });
    expect(read("power 1h 6 novembre 2026")).toMatchObject({
      length: { secs: 3600 },
      target: { from: "2026-11-06" },
    });
  });

  it("takes a length without its unit once there's a time, even still being typed", () => {
    expect(read("power today 3")).toMatchObject({ length: { secs: 180 } });
    expect(read("3 potenza oggi")).toMatchObject({ length: { secs: 180 } });
  });

  it("reads a ride as a target", () => {
    expect(read("power 3m ultima uscita")?.target).toMatchObject({ kind: "ride", id: "oggi1" });
    expect(read("fc 5 min last run")?.target).toMatchObject({ kind: "ride", id: "corsa" });
    expect(read("fc 5 min corsa serale")?.target).toMatchObject({ kind: "ride", id: "corsa" });
  });

  it("reads the last pass on a climb as its day, and keeps last week a time", () => {
    const climbs = [
      {
        id: "v",
        name: "Passo Verdana",
        length: 9000,
        saved: true,
        attempts: [{ date: "2026-09-01T10:00:00" }, { date: "2026-10-02T10:00:00" }],
      },
    ] as never;
    expect(readAsk("fc 5 min ultimo verdana", { ...ctx, climbs })?.target).toMatchObject({
      from: "2026-10-02",
    });
    expect(readAsk("hr 5m last week", { ...ctx, climbs })?.target).toMatchObject({ to: today });
  });

  it("reads the shape asked for", () => {
    expect(read("fc media oggi")).toMatchObject({ metric: "hr", shape: "mean" });
    expect(read("potenza media marzo")).toMatchObject({ metric: "power", shape: "mean" });
    expect(read("fc max oggi")).toMatchObject({ shape: "max" });
    expect(read("velocita oggi")).toMatchObject({ metric: "speed", shape: "mean" });
    expect(read("speed march")).toMatchObject({ metric: "speed", shape: "mean" });
    expect(read("power today")).toMatchObject({ shape: "marks", length: null });
    expect(read("fc corsa ieri")).toMatchObject({ sport: "run" });
  });

  it("leaves alone what means something else", () => {
    for (const q of [
      "fc riposo",
      "fc riposo oggi",
      "resting hr",
      "hr rest",
      "best fc riposo",
      "hr",
      "fc",
      "potenza",
      "hr max",
      "fc max",
      "fc soglia",
      "passo soglia",
      "passo",
      "passo verdana",
      "passo verdana oggi",
      "potenza 5 min",
      "curva potenza",
      "zone fc",
      "potenza 5 min di sempre",
      "power 5m vs hr 5m",
      "power 5m hr 5m oggi",
      "potenza cose strane oggi",
      "km oggi",
    ])
      expect(read(q), q).toBeNull();
  });

  it("the page being read is the target, unless another is named", () => {
    const onRide = { ...ctx, here: { kind: "ride" as const, id: "sab" } };
    expect(readAsk("power 3m", onRide)?.target).toMatchObject({ kind: "ride", id: "sab" });
    expect(readAsk("fc media", onRide)?.target).toMatchObject({ id: "sab" });
    expect(readAsk("fc 3m questa uscita", onRide)?.target).toMatchObject({ id: "sab" });
    expect(readAsk("power 3m ieri", onRide)?.target).toMatchObject({ kind: "span" });
    // The word alone keeps its answer on every page.
    expect(readAsk("hr", onRide)).toBeNull();
    expect(readAsk("potenza", onRide)).toBeNull();
    const recap = { kind: "recap" as const, from: "2026-03-01", to: "2026-03-31", q: "Marzo" };
    expect(readAsk("power 3m", { ...ctx, here: recap })?.target).toMatchObject({ q: "Marzo" });
  });

  it("names a time in English on an Italian app, and the other way round", () => {
    const names = (s: string) => whenCandidates(s, today).length > 0;
    expect(names("last saturday")).toBe(true);
    expect(read("hr 5m last week")?.target).toMatchObject({ to: today });
  });
});

describe("effort answers", () => {
  it("gives the best of today across its rides, and which ride", () => {
    const r = row("power today 3m");
    expect(r).toMatchObject({
      q: "Miglior 3 min · Oggi",
      value: "320 W",
      page: "ride",
      dest: { to: "/rides/$id", params: { id: "oggi2" } },
    });
    expect(r.answer).toBe("Pomeriggio · 4.57 W/kg · 114% FTP");
  });

  it("gives heart rate the same way", () => {
    expect(row("hr today 3m")).toMatchObject({ q: "FC più alta 3 min · Oggi", value: "170 bpm" });
    expect(row("fc 5 min sabato scorso")).toMatchObject({ value: "160 bpm" });
  });

  it("reads a whole ride", () => {
    const r = row("power 3m ultima uscita");
    expect(r).toMatchObject({ q: "Miglior 3 min · Giro oggi1", value: "250 W" });
    expect(r.answer ?? "").not.toContain("Giro oggi1");
  });

  it("gives marks when no length is said", () => {
    expect(row("power today").answer).toBe("5 s 320 W · 1 min 320 W · 5 min 276 W");
    expect(row("fc sabato scorso").answer).toBe("1 min 160 bpm · 5 min 160 bpm");
  });

  it("is honest about what isn't there", () => {
    expect(row("power 3m 2 novembre").answer).toBe("Nessuna attività");
    expect(row("power 3m ieri").answer).toBe("Nessun dato di potenza");
    expect(row("fc 3m ieri").answer).toBe("Nessun dato di FC");
    expect(row("power today 2h").answer).toBe("Nessuno sforzo così lungo");
    expect(row("power domani 3m").answer).toBe("Non è ancora successo");
    expect(row("power today 3m", { signals: {} }).answer).toBe("Caricamento…");
    expect(row("power 3m sabato scorso", { signals: { sab: null } }).answer).toBe(
      "Serve la connessione",
    );
  });

  it("reads a longer stretch from its curve, once it's there", () => {
    const span = { from: "2026-03-01", to: "2026-03-31" };
    expect(row("power 3m marzo").answer).toBe("Caricamento…");
    expect(
      row("power 3m marzo", { rangeCurve: { ...span, curve: curve("r", 280) } }),
    ).toMatchObject({
      q: "Miglior 3 min · Marzo 2026",
      value: "280 W",
      dest: { to: "/analysis" },
    });
    const key = curveKey({ metric: "hr", ...span, sport: "ride" });
    expect(row("fc 3m marzo", { curveReads: { [key]: { curve: curve("r", 170) } } })).toMatchObject(
      {
        value: "170 bpm",
        dest: { to: "/recap", search: span },
      },
    );
    expect(
      row("fc 3m marzo", { curveReads: { [key]: { curve: null, failed: true } } }).answer,
    ).toBe("Serve la connessione");
  });

  it("gives W/kg and FTP only for what's recent", () => {
    const old = { from: "2025-03-01", to: "2025-03-31" };
    const r = row("power 3m marzo 2025", { rangeCurve: { ...old, curve: curve("r", 280) } });
    expect(r.value).toBe("280 W");
    expect(r.answer).toBeUndefined();
  });

  it("says when it read a nearby length", () => {
    const span = { from: "2026-03-01", to: "2026-03-31" };
    const r = row("power 4m marzo", { rangeCurve: { ...span, curve: curve("r", 280) } });
    expect(r.value).toBe("270 W");
    expect(r.answer).toContain("letti sui 5 min");
  });

  it("gives heart rate with no time named, from its curves", () => {
    expect(row("fc 3 min").answer).toBe("Caricamento…");
    const r = row("fc 3 min", {
      hrCurves: [curve("42d", 165), curve("1y", 172), curve("all", 180)],
    });
    expect(r.value).toBe("165 bpm");
    expect(r.answer).toBe("Ultimi 42 giorni · anno 172 bpm · di sempre 180 bpm");
  });

  it("gives means, weighted by time", () => {
    expect(row("fc media oggi").value).toBe("140 bpm");
    const w = row("potenza media oggi", {
      acts: [act("a", today), act("b", today, { icu_average_watts: 300, moving_time: 1800 })],
    });
    expect(w.value).toBe("233 W");
    expect(row("fc max oggi")).toMatchObject({ q: "FC massima · Oggi", value: "175 bpm" });
  });

  it("gives mean speed, leaving out the home trainer", () => {
    expect(row("velocita oggi")).toMatchObject({ q: "Velocità media · Oggi", value: "33.3 km/h" });
    expect(row("velocità media marzo").value).toBe("30.0 km/h");
    expect(row("speed ultima uscita").value).toBe("30.0 km/h");
    expect(row("velocita ieri").value).toBe("30.0 km/h");
    expect(row("velocita 2 novembre").answer).toBe("Nessuna attività");
    expect(row("velocita").q).toContain("ultimi 42 giorni");
  });

  it("for a runner, power words are pace and heart rate stays heart rate", () => {
    const run: Partial<EffortData> = {
      sport: "run",
      runs: [{ date: "2026-11-03", curve: Array.from({ length: 19 }, () => 3.5) }],
    };
    expect(row("potenza 5 min ieri", run).q).toContain("Miglior passo");
    expect(row("passo 5 min 3 novembre", run).value).toBe("4:46/km");
    expect(row("fc 5 min 3 novembre", run).value).toBe("165 bpm");
    expect(row("passo medio 3 novembre", run).value).toBe("2:00/km");
    expect(row("passo 5 min 3 novembre", { sport: "run", runs: [] }).answer).toBe(
      "Apri l'Analisi una volta",
    );
  });

  it("asks for only what the question needs", () => {
    const needs = (q: string, d: Partial<EffortData> = {}) => effortNeeds(q, { ...data, ...d });
    expect(needs("power today 3m").rideIds).toEqual(["oggi1", "oggi2"]);
    expect(needs("fc 3m ieri").rideIds).toEqual([]);
    expect(needs("power 3m marzo").curves).toEqual([
      { metric: "power", from: "2026-03-01", to: "2026-03-31", sport: "ride" },
    ]);
    expect(needs("fc 3m marzo").curves[0]).toMatchObject({ from: "2026-03-01", sport: "ride" });
    expect(needs("fc corsa 3m marzo").curves[0]).toMatchObject({ sport: "run" });
    expect(needs("fc 3 min").hrCurves).toBe("ride");
    for (const q of ["power domani 3m", "velocita oggi", "fc media oggi", "peso oggi", "hr"])
      expect(needs(q)).toEqual({ rideIds: [], curves: [], hrCurves: null });
  });
});

describe("in the bar", () => {
  const d = { ...data, climbs: [], native: false } as IntentData;
  const top = (q: string) => alternatives(q, null, intentEntries(q, d))[0];

  it("answers first, however it's typed", () => {
    for (const q of [
      "power today 3m",
      "Potenza oggi 3 minuti",
      "quanti watt ho tenuto oggi per tre minuti",
      "qual è la mia potenza migliore di oggi su 3 minuti",
    ])
      expect(top(q), q).toMatchObject({ value: "320 W" });
    expect(top("fc 3m oggi")).toMatchObject({ value: "170 bpm" });
  });

  it("never answers a resting heart rate", () => {
    for (const q of ["fc riposo oggi", "resting hr today", "hr riposo 3m"])
      expect(intentEntries(q, d)).toEqual([]);
  });

  it("leaves what already answered alone", () => {
    const curves = [curve("42d", 300), curve("1y", 320), curve("all", 360)];
    expect(
      alternatives("potenza 5 min", null, intentEntries("potenza 5 min", { ...d, curves }))[0]!.id,
    ).toBe("power");
    expect(
      alternatives("miglior 5 min", null, intentEntries("miglior 5 min", { ...d, curves }))[0]!.id,
    ).toBe("best-power");
  });
});

describe("distribution in the bar", () => {
  const zoned = [
    act("o", today, { zoneTimes: [100, 500, 0, 400], hrZoneTimes: [300, 700] } as never),
    act("m", "2026-03-12", { zoneTimes: [1000], hrZoneTimes: [0, 1000] } as never),
  ];
  const d = { today, sport: "ride", acts: zoned, climbs: [], native: false } as IntentData;
  const rows = (q: string, over: Partial<IntentData> = {}) => intentEntries(q, { ...d, ...over });

  it("reads it in any order, for a day, a stretch or a ride", () => {
    for (const q of [
      "distribuzione fc oggi",
      "fc oggi distribuzione",
      "hr distribution today",
      "istogramma fc oggi",
    ]) {
      expect(rows(q)[0], q).toMatchObject({
        q: "Distribuzione FC · Oggi",
        answer: "Z2 70% · Z1 30%",
        dest: { to: "/recap", search: { from: today, focus: "distribution", metric: "hr" } },
      });
    }
    expect(rows("distribuzione potenza marzo")[0]!.answer).toBe("Z1 100%");
    expect(rows("distribuzione fc ultima uscita")[0]).toMatchObject({
      q: "Distribuzione FC · Giro o",
      dest: { to: "/rides/$id", params: { id: "o" }, search: { focus: "distribution" } },
    });
  });

  it("offers both when neither is named", () => {
    expect(rows("distribuzione oggi").map((e) => e.id)).toEqual([
      "distribution-power",
      "distribution-hr",
    ]);
    expect(rows("zone oggi", { sport: "run" }).map((e) => e.id)).toEqual(["distribution-hr"]);
  });

  it("uses the page being read, and a metric alone means the last weeks", () => {
    const here = { kind: "ride" as const, id: "m" };
    expect(rows("distribuzione fc", { here })[0]!.q).toBe("Distribuzione FC · Giro m");
    expect(rows("distribuzione", { here })).toHaveLength(2);
    expect(rows("distribuzione fc")[0]!.q).toBe("Distribuzione FC · Ultimi 28 giorni");
  });

  it("leaves alone what means something else, and is honest", () => {
    for (const q of ["distribuzione", "zone", "zone fc", "zone soglia", "fc riposo distribuzione"])
      expect(
        rows(q).filter((e) => e.id.startsWith("distribution")),
        q,
      ).toEqual([]);
    expect(rows("distribuzione fc domani")[0]!.answer).toBe("Non è ancora successo");
    expect(rows("distribuzione fc 2 novembre")[0]!.answer).toBe("Nessuna attività");
  });
});
