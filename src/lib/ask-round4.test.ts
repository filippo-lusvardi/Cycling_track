import { describe, expect, it, vi } from "vitest";
import type { Entry } from "./ask";
import { askNeeds, manyParts } from "./ask-compare";
import { spanPhrase } from "./ask-detail";
import { intentEntries, LOGGED_IN_BATCH, type BatchPart, type IntentData } from "./ask-intents";
import { readAsk } from "./ask-read";
import { runWrite } from "./ask-write";
import type { Activity } from "./intervals";

vi.hoisted(() => localStorage.setItem("cadence_language", JSON.stringify("it")));
const mocks = vi.hoisted(() => ({
  created: [] as unknown[],
  deleted: [] as string[],
  described: [] as [string, string][],
  fail: { brioche: false },
}));
vi.mock("./source", async (real) => ({
  ...(await real<typeof import("./source")>()),
  createManualActivity: vi.fn(async (e: unknown) => {
    mocks.created.push(e);
    return { id: "new1" };
  }),
  deleteActivity: vi.fn(async (id: string) => void mocks.deleted.push(id)),
  getActivity: vi.fn(async () => ({ description: null })),
  setActivityDescription: vi.fn(async (id: string, text: string) => {
    if (mocks.fail.brioche) throw new Error("no");
    mocks.described.push([id, text]);
  }),
  getWellness: vi.fn(async () => []),
}));
vi.mock("./wellness-queue", () => ({ saveWellnessOrQueue: vi.fn(async () => "saved") }));

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
    max_heartrate: 170,
    zoneTimes: [600, 2400, 600],
    hrZoneTimes: [1200, 2400],
    trainer: false,
    ...over,
  }) as unknown as Activity;
const acts = [act("oggi", today), act("ieri", "2026-11-05"), act("mar", "2026-03-10")];
const signal = { watts: Array(1800).fill(250), heartrate: Array(1800).fill(150) };
const d: IntentData = {
  today,
  sport: "ride",
  native: false,
  climbs: [{ id: "c", name: "Monte e Valle", length: 1000, saved: true, attempts: [] }],
  acts,
  weight: 70,
  ftp: 280,
  signals: { oggi: signal, ieri: signal },
};
const rows = (q: string, over: Partial<IntentData> = {}) => intentEntries(q, { ...d, ...over });
const ctx = { today, sport: "ride" as const, acts };

describe("answers that open in the panel", () => {
  it("efforts, distribution and time have a detail; the rest doesn't", () => {
    expect(rows("power 5m oggi")[0]!.detail?.view.kind).toBe("curve");
    expect(rows("distribuzione fc oggi")[0]!.detail?.view).toMatchObject({
      kind: "distribution",
      metric: "hr",
      ids: ["oggi"],
    });
    expect(rows("tempo in z2 oggi")[0]!.detail?.view.kind).toBe("distribution");
    for (const q of ["km marzo", "velocita oggi", "fc media oggi", "uscite sopra 10 km"])
      expect(rows(q)[0]!.detail, q).toBeUndefined();
    expect(rows("power 5m oggi vs ieri")[0]!.detail).toBeUndefined();
  });

  it("marks the length asked for, and offers others", () => {
    const detail = rows("power 3m oggi")[0]!.detail!;
    expect(detail.view).toMatchObject({ at: 180, unit: "W" });
    const on = detail.lengths!.filter((c) => c.on);
    expect(on.map((c) => c.label)).toEqual(["3 min"]);
    expect(detail.lengths!.map((c) => c.label)).toContain("20 min");
  });

  it("every chip is a question that reads back to what it says", () => {
    const detail = rows("power 3m oggi")[0]!.detail!;
    for (const c of detail.lengths!)
      expect(readAsk(c.query, ctx), c.query).toMatchObject({ target: { from: today, to: today } });
    expect(readAsk(detail.prev!.query, ctx)).toMatchObject({
      length: { secs: 180 },
      target: { from: "2026-11-05", to: "2026-11-05" },
    });
    // Today has no tomorrow to go to.
    expect(detail.next).toBeUndefined();
    const yesterday = rows("power 3m ieri")[0]!.detail!;
    expect(readAsk(yesterday.next!.query, ctx)).toMatchObject({ target: { from: today } });
  });

  it("a chip keeps today and yesterday as words, so a pin stays current", () => {
    const detail = rows("power 3m oggi")[0]!.detail!;
    expect(detail.lengths![0]!.query).toBe("power 5s oggi");
    expect(detail.prev!.query).toBe("power 3m ieri");
  });

  it("reads back a month, a year and any range, in either language", () => {
    for (const s of [
      { from: "2026-03-01", to: "2026-03-31" },
      { from: "2025-01-01", to: "2025-12-31" },
      { from: "2026-03-03", to: "2026-03-09" },
      { from: "2025-12-29", to: "2026-01-04" },
      { from: "2026-02-10", to: "2026-02-10" },
    ])
      expect(readAsk(`power 5m ${spanPhrase(s)}`, ctx), JSON.stringify(s)).toMatchObject({
        target: s,
      });
  });

  it("the page being read stays unsaid in a chip", () => {
    const here = { kind: "ride" as const, id: "mar" };
    const detail = rows("power 3m", { here, signals: { mar: signal } })[0]!.detail!;
    expect(detail.lengths![0]!.query).toBe("power 5s");
    expect(detail.prev).toBeUndefined();
  });

  it("switches between power and heart rate, for a cyclist only", () => {
    const view = rows("distribuzione fc oggi")[0]!.detail!.view as { other?: string };
    expect(rows(view.other!)[0]!.q).toBe("Distribuzione potenza · Oggi");
    const run = rows("distribuzione fc oggi", { sport: "run" })[0]!.detail!.view as {
      other?: string;
    };
    expect(run.other).toBeUndefined();
  });
});

describe("several things in one line", () => {
  it("shares a time said once, at the end or the start", () => {
    expect(manyParts("power 5m e hr 5m oggi", today)).toEqual(["power 5m oggi", "hr 5m oggi"]);
    expect(manyParts("oggi power 5m e hr 5m", today)).toEqual(["oggi power 5m", "hr 5m oggi"]);
    expect(manyParts("km e dislivello marzo", today)).toEqual(["km marzo", "dislivello marzo"]);
    expect(manyParts("km marzo, km aprile", today)).toEqual(["km marzo", "km aprile"]);
    expect(manyParts("marzo vs aprile e maggio", today)).toBeNull();
    expect(manyParts("power 5m", today)).toBeNull();
    expect(manyParts("a e b e c e d", today)).toBeNull();
  });

  it("answers each, in the order typed", () => {
    expect(rows("power 5m e hr 5m oggi").map((e) => e.value)).toEqual(["250 W", "150 bpm"]);
    expect(rows("km e dislivello oggi").map((e) => e.value)).toEqual(["30 km", "300 m"]);
    expect(rows("power 5m + hr 5m oggi")).toHaveLength(2);
  });

  it("works as a sentence, and reads what each part needs", () => {
    expect(rows("quanti km e dislivello a marzo").map((e) => e.value)).toEqual(["30 km", "300 m"]);
    expect(askNeeds("power 5m e hr 5m oggi", d).rideIds).toEqual(["oggi"]);
  });

  it("needs every part to answer, and a name stays a name", () => {
    expect(rows("power 5m e cose strane oggi").some((e) => e.id.endsWith("-1"))).toBe(false);
    expect(rows("Monte e Valle").some((e) => /-\d$/.test(e.id))).toBe(false);
    expect(
      rows("Giro a e b", { acts: [act("x", today, { name: "Giro a e b" })] }).some((e) =>
        /-\d$/.test(e.id),
      ),
    ).toBe(false);
  });
});

const batchOf = (e: Entry): BatchPart[] => {
  if (e.dest.kind !== "write" || e.dest.action.kind !== "batch") throw new Error("Not a batch");
  return e.dest.action.parts;
};

describe("saving several things", () => {
  const line = "ieri 2h con Marco, gambe pesanti, 1 brioche";

  it("reads the line, and saves nothing by itself", () => {
    const r = rows(line)[0]!;
    expect(r.id).toBe("save-batch");
    const parts = batchOf(r);
    expect(parts.map((p) => p.title)).toEqual(["2h con Marco", "Gambe pesanti", "1 brioche"]);
    expect(parts[0]!.action).toMatchObject({
      kind: "log",
      entry: { date: "2026-11-05", type: "Ride", minutes: 120 },
    });
    expect((parts[0]!.action as { entry: { name: string } }).entry.name).toContain("Marco");
    expect(parts[1]!.action).toMatchObject({
      kind: "wellness",
      date: "2026-11-05",
      field: "fatigue",
      value: 3,
    });
    expect(parts[1]!.detail).toContain("3 / 4");
    expect(parts[2]!.action).toMatchObject({ kind: "brioche", activityId: LOGGED_IN_BATCH });
  });

  it("without an activity logged, a brioche goes on that day's", () => {
    const parts = batchOf(rows("ieri gambe pesanti, 1 brioche")[0]!);
    expect(parts[1]!.action).toMatchObject({ activityId: "ieri" });
    expect(rows("2 novembre gambe pesanti, 1 brioche")[0]?.id).not.toBe("save-batch");
  });

  it("every part has to mean something; two activities are two lines", () => {
    expect(rows("ieri 2h con Marco, cose strane")[0]?.id).not.toBe("save-batch");
    expect(rows("ieri 2h con Marco, 1h con Luca")[0]?.id).not.toBe("save-batch");
    expect(rows("stanco")[0]?.id).toBe("save-fatigue");
    // A single part isn't a batch, and a day ahead can't be saved.
    expect(rows("domani stanco, gambe pesanti")[0]?.id).not.toBe("save-batch");
  });

  it("runs the activity first, puts the brioche on it, and undoes all of it", async () => {
    mocks.created.length = mocks.deleted.length = mocks.described.length = 0;
    const r = rows(line)[0]!;
    const action = (r.dest as { action: Parameters<typeof runWrite>[0] }).action;
    const qc = { invalidateQueries: vi.fn(async () => {}) } as never;
    const done = await runWrite(action, qc);
    expect(mocks.created).toHaveLength(1);
    expect(mocks.described[0]![0]).toBe("new1");
    await done.undo();
    expect(mocks.deleted).toEqual(["new1"]);
    expect(mocks.described.at(-1)).toEqual(["new1", ""]);
  });

  it("takes back what's done when a part fails", async () => {
    mocks.created.length = mocks.deleted.length = 0;
    mocks.fail.brioche = true;
    const action = (rows(line)[0]!.dest as { action: Parameters<typeof runWrite>[0] }).action;
    const qc = { invalidateQueries: vi.fn(async () => {}) } as never;
    await expect(runWrite(action, qc)).rejects.toThrow();
    expect(mocks.deleted).toEqual(["new1"]);
    mocks.fail.brioche = false;
  });
});
