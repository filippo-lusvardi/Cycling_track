import { describe, expect, it, vi } from "vitest";
import { askNeeds } from "./ask-compare";
import { curveKey } from "./ask-efforts";
import { applyFilter, filterFromSearch, filterSearch, readFilter } from "./ask-filter";
import { intentEntries, type IntentData } from "./ask-intents";
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
    total_elevation_gain: 300,
    icu_training_load: 60,
    icu_average_watts: 200,
    average_heartrate: 140,
    zoneTimes: [600, 2400, 600],
    hrZoneTimes: [1200, 2400],
    trainer: false,
    ...over,
  }) as unknown as Activity;

const acts = [
  act("oggi", today, { distance: 120000, moving_time: 14400, total_elevation_gain: 2000 }),
  act("rulli", "2026-11-04", { trainer: true, distance: 40000 }),
  act("nohr", "2026-11-03", { hrZoneTimes: undefined, zoneTimes: [0, 0, 0] } as never),
  act("mar", "2026-03-10", { distance: 80000 }),
  act("old", "2025-06-01", { total_elevation_gain: 3000, distance: 150000 }),
  act("corsa", "2026-10-30", { type: "Run", distance: 10000, icu_average_watts: null }),
];
const d: IntentData = {
  today,
  sport: "ride",
  native: false,
  climbs: [],
  acts,
  weight: 70,
  ftp: 280,
  signals: {
    oggi: {
      watts: [...Array(600).fill(320), ...Array(300).fill(0), ...Array(900).fill(150)],
      heartrate: [...Array(600).fill(170), ...Array(1200).fill(130)],
    },
  },
  zoneTops: { power: [150, 250, 999], hr: [120, 150, 999] },
};
const rows = (q: string, over: Partial<IntentData> = {}) => intentEntries(q, { ...d, ...over });
const curve = (w: number, ids?: string[]): PowerCurve => ({
  id: "r",
  label: "r",
  secs: [60, 300, 1200],
  watts: [w + 50, w, w - 30],
  ...(ids ? { activityIds: ids } : {}),
});

describe("time at", () => {
  it("reads time in a zone from what's already read", () => {
    for (const q of [
      "tempo in z2 oggi",
      "quanto tempo in zona 2 oggi",
      "time in z2 today",
      "z2 oggi",
    ])
      expect(rows(q)[0], q).toMatchObject({
        q: "Tempo in Z2 · Oggi",
        value: "40m",
        answer: "Fondo · 67% del tempo",
      });
    expect(rows("tempo in z2 fc oggi")[0]).toMatchObject({
      q: "Tempo in Z2 FC · Oggi",
      answer: "Fondo · 67% del tempo",
    });
  });

  it("works a zone out from histograms when the activity doesn't say", () => {
    expect(rows("tempo in z1 fc 3 novembre")[0]!.answer).toBe("Caricamento…");
    expect(
      rows("tempo in z1 fc 3 novembre", {
        histograms: {
          nohr: {
            power: [],
            hr: [
              { start: 100, secs: 600 },
              { start: 130, secs: 300 },
            ],
          },
        },
      })[0],
    ).toMatchObject({ value: "10m", answer: "Recupero · 67% del tempo" });
  });

  it("reads a value to the second on one day, leaving zeros out", () => {
    expect(rows("tempo sopra 300 w oggi")[0]).toMatchObject({
      q: "Tempo sopra 300 W · Oggi",
      value: "10m",
      answer: "40% del tempo",
    });
    expect(rows("time above 160 bpm today")[0]).toMatchObject({ value: "10m" });
    expect(rows("fc sopra 160 oggi")[0]).toMatchObject({ q: "Tempo sopra 160 bpm · Oggi" });
    expect(rows("tempo sotto 200 w oggi")[0]).toMatchObject({ value: "15m" });
  });

  it("reads a value over a short stretch from whole bands, and says which", () => {
    const histograms = {
      oggi: {
        power: [
          { start: 0, secs: 50 },
          { start: 300, secs: 100 },
        ],
        hr: [],
      },
      rulli: { power: [{ start: 275, secs: 100 }], hr: [] },
      nohr: { power: [], hr: [] },
    };
    const r = rows("tempo sopra 310 w questa settimana", { histograms })[0]!;
    expect(r.answer).toContain("letti da 300 W");
    expect(rows("tempo sopra 300 w questa settimana", { histograms })[0]).toMatchObject({
      answer: "50% del tempo",
    });
    expect(rows("tempo sopra 300 w 2025")[0]!.answer).toBe("Scegli un periodo fino a 31 giorni");
  });

  it("keeps away from what means something else", () => {
    for (const q of [
      "z2",
      "fc z2",
      "zona 2",
      "tempo",
      "tempo marzo",
      "tempo in z2 riposo",
      "fc riposo sopra 50",
    ])
      expect(
        rows(q).filter((e) => e.id.startsWith("time-")),
        q,
      ).toEqual([]);
    // No unit and no metric: can't tell what.
    expect(rows("tempo sopra 300 oggi").filter((e) => e.id.startsWith("time-"))).toEqual([]);
    expect(rows("tempo in z2 domani")[0]!.answer).toBe("Non è ancora successo");
  });

  it("needs only what it asks for", () => {
    expect(askNeeds("tempo sopra 300 w oggi", d).rideIds).toEqual(["oggi"]);
    expect(askNeeds("tempo in z2 oggi", d).histIds).toEqual([]);
    expect(askNeeds("tempo in z1 fc 3 novembre", d).histIds).toEqual(["nohr"]);
    expect(askNeeds("tempo sopra 300 w questa settimana", d).histIds.length).toBeGreaterThan(0);
    expect(askNeeds("tempo sopra 300 w 2025", d).histIds).toEqual([]);
  });
});

describe("comparing", () => {
  const march = {
    metric: "power" as const,
    from: "2026-03-01",
    to: "2026-03-31",
    sport: "ride" as const,
  };
  const april = { ...march, from: "2026-04-01", to: "2026-04-30" };
  const curveReads = {
    [curveKey(march)]: { curve: curve(300) },
    [curveKey(april)]: { curve: curve(280) },
  };

  it("sets any question side by side, with the difference", () => {
    for (const q of [
      "power 5m marzo vs aprile",
      "potenza 5 min marzo contro aprile",
      "confronta power 5m marzo con aprile",
      "power 5m marzo vs power 5m aprile",
    ]) {
      const r = rows(q, { curveReads });
      expect(
        r.map((e) => e.value),
        q,
      ).toEqual(["300 W", "280 W"]);
      expect(r[0]!.answer, q).toContain("+20 W");
    }
  });

  it("works for heart rate, means, distribution and time", () => {
    expect(rows("fc media oggi vs 4 novembre").map((e) => e.value)).toEqual(["140 bpm", "140 bpm"]);
    expect(rows("distribuzione oggi vs marzo").map((e) => e.q)).toEqual([
      "Distribuzione potenza · Oggi",
      "Distribuzione potenza · Marzo 2026",
    ]);
    expect(rows("tempo in z2 oggi vs marzo").map((e) => e.q)).toEqual([
      "Tempo in Z2 · Oggi",
      "Tempo in Z2 · Marzo 2026",
    ]);
  });

  it("reads both sides, and leaves totals to the old comparison", () => {
    expect(askNeeds("power 5m marzo vs aprile", d).curves.map((c) => c.from)).toEqual([
      "2026-03-01",
      "2026-04-01",
    ]);
    expect(rows("marzo vs aprile")[0]!.id).toMatch(/^compare-/);
    const same = {
      [curveKey(march)]: { curve: curve(300) },
      [curveKey(april)]: { curve: curve(300) },
    };
    expect(rows("power 5m marzo vs aprile", { curveReads: same })[0]!.answer ?? "").not.toContain(
      "0 W",
    );
    expect(rows("top 2 per km")[0]!.q).toBe("Top 2 uscite per distanza");
    expect(rows("power 5m marzo vs qualcosa")).toEqual([]);
  });
});

describe("where it happened", () => {
  const span = { from: "2026-03-01", to: "2026-03-31" };
  const key = curveKey({ metric: "power", ...span, sport: "ride" });

  it("opens the ride that set a stretch's best, and says when", () => {
    const r = rows("power 5m marzo", {
      curveReads: { [key]: { curve: curve(300, ["x", "mar", "x"]) } },
    })[0]!;
    expect(r.dest).toMatchObject({ to: "/rides/$id", params: { id: "mar" } });
    expect(r.answer).toContain("Giro mar");
    expect(r.answer).toContain("10 mar 2026");
  });

  it("keeps opening the chart when the id means nothing here", () => {
    const r = rows("power 5m marzo", {
      curveReads: { [key]: { curve: curve(300, ["x", "nope", "x"]) } },
    })[0]!;
    expect(r.dest).toMatchObject({ to: "/analysis" });
  });

  it("names no ride from outside the stretch, whatever the curve says", () => {
    const r = rows("power 5m marzo", {
      curveReads: { [key]: { curve: curve(300, ["x", "oggi", "x"]) } },
    })[0]!;
    expect(r.dest).toMatchObject({ to: "/analysis" });
    expect(r.answer ?? "").not.toContain("Giro oggi");
  });

  it("answers when the all-time best was", () => {
    const curves = [{ ...curve(360, ["a", "old", "c"]), id: "all" }];
    for (const q of ["quando ho fatto il mio miglior 5 min", "miglior 5 min"]) {
      const r = rows(q, { curves })[0]!;
      expect(r.answer, q).toContain("Giro old");
      expect(r.dest, q).toMatchObject({ to: "/rides/$id", params: { id: "old" } });
    }
  });
});

describe("lists", () => {
  const ctx = { today, sport: "ride" as const, acts };

  it("reads conditions in both languages", () => {
    expect(readFilter("uscite sopra 100 km", ctx)).toMatchObject({
      sport: "ride",
      field: "km",
      op: "above",
      value: 100,
    });
    expect(readFilter("rides over 100 km march", ctx)).toMatchObject({
      field: "km",
      from: "2026-03-01",
    });
    expect(readFilter("corse sotto 5 km", ctx)).toMatchObject({ sport: "run", op: "below" });
    expect(readFilter("uscite con piu di 1000 m", ctx)).toMatchObject({ field: "m", value: 1000 });
    expect(readFilter("uscite oltre 3 ore 2025", ctx)).toMatchObject({
      field: "time",
      value: 10800,
      from: "2025-01-01",
    });
    expect(readFilter("uscite sopra 250 w", ctx)).toMatchObject({ field: "watts" });
    expect(readFilter("uscite carico sopra 100", ctx)).toMatchObject({ field: "load", value: 100 });
    expect(readFilter("uscite indoor marzo", ctx)).toMatchObject({
      place: "indoor",
      from: "2026-03-01",
    });
  });

  it("reads top lists", () => {
    expect(readFilter("top 5 per dislivello 2025", ctx)).toMatchObject({
      limit: 5,
      sort: "m",
      from: "2025-01-01",
    });
    expect(readFilter("top 3 uscite per km", ctx)).toMatchObject({
      limit: 3,
      sort: "km",
      sport: "ride",
    });
    expect(readFilter("le 5 uscite piu lunghe", ctx)).toMatchObject({ limit: 5, sort: "km" });
    expect(readFilter("uscite piu veloci 2026", ctx)).toMatchObject({ sort: "speed", limit: 10 });
  });

  it("leaves the rest alone", () => {
    for (const q of [
      "uscite marzo",
      "km marzo",
      "uscite",
      "top",
      "uscite sopra",
      "uscite sopra 100",
      "uscite strane sopra 100 km",
      "uscita piu lunga",
    ])
      expect(readFilter(q, ctx), q).toBeNull();
    expect(rows("uscite marzo").some((e) => e.id === "activity-filter")).toBe(false);
  });

  it("filters and sorts, and a home trainer has no speed", () => {
    const ids = (f: Parameters<typeof applyFilter>[1]) => applyFilter(acts, f).map((a) => a.id);
    expect(ids({ field: "km", op: "above", value: 100 })).toEqual(["oggi", "old"]);
    expect(ids({ sport: "ride", place: "indoor" })).toEqual(["rulli"]);
    expect(ids({ sort: "m", limit: 2 })).toEqual(["old", "oggi"]);
    expect(ids({ sort: "speed" })).not.toContain("rulli");
  });

  it("gives a row that opens the list, and the list reads it back", () => {
    const r = rows("uscite sopra 100 km")[0]!;
    expect(r).toMatchObject({ q: "Uscite sopra 100 km", value: "2", answer: "270 km · 5h 00m" });
    const search = (r.dest as { search: Record<string, string> }).search;
    expect(filterFromSearch(search)).toEqual({
      sport: "ride",
      field: "km",
      op: "above",
      value: 100,
    });
    expect(rows("top 2 per dislivello")[0]).toMatchObject({
      value: "3000 m",
      answer: "Giro old 3000 m · Giro oggi 2000 m",
    });
    expect(rows("uscite sopra 900 km")[0]!.answer).toBe("Nessuna attività");
    expect(filterFromSearch({})).toBeNull();
    expect(filterSearch({ limit: 5 })).toEqual({ filter: "1", limit: "5" });
  });
});
