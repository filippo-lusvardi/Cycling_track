import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Entry } from "./ask";
import { intentEntries, type IntentData, type WriteAction } from "./ask-intents";
import { runWrite } from "./ask-write";
import { current, type Gear } from "./gear";
import { gearState, resetGearState } from "./gear-store";
import type { Activity } from "./intervals";

vi.hoisted(() => localStorage.setItem("cadence_language", JSON.stringify("it")));
vi.mock("./cloud", () => ({
  writeGear: vi.fn(async () => {}),
  deleteGear: vi.fn(async () => {}),
  writeGearRide: vi.fn(async () => {}),
}));

const today = "2026-11-10";
const act = (id: string, date: string, over: Partial<Activity> = {}) =>
  ({
    id,
    name: `Giro ${id}`,
    type: "Ride",
    start_date_local: `${date}T09:00:00`,
    moving_time: 3600,
    distance: 50000,
    trainer: false,
    ...over,
  }) as Activity;

const gear = (over: Partial<Gear>): Gear => ({
  id: "canyon",
  name: "Canyon Ultimate",
  kind: "bike",
  frame: "road",
  slot: "ride",
  isDefault: true,
  startKm: 0,
  since: "2026-01-01",
  components: [{ id: "c1", part: "chain", fitted: "2026-01-01", intervalKm: 120 }],
  events: [],
  updatedAt: 0,
  ...over,
});

const gears = [
  gear({}),
  gear({
    id: "topstone",
    name: "Cannondale Topstone",
    frame: "gravel",
    isDefault: false,
    components: [],
  }),
  gear({
    id: "peg",
    name: "Pegasus 41",
    kind: "shoes",
    slot: "run",
    components: [],
    intervalKm: 700,
  }),
];
const acts = [
  act("a", "2026-11-09", { name: "Manghen" }),
  act("b", "2026-11-05"),
  act("r", "2026-11-08", { type: "Run" }),
];

const data = (over: Partial<IntentData> = {}): IntentData => ({
  today,
  sport: "ride",
  native: false,
  climbs: [],
  acts,
  gear: { gears, overrides: {} },
  ...over,
});

const ask = (q: string, d = data()) => intentEntries(q, d);
const action = (e: Entry | undefined) =>
  (e?.dest.kind === "write" ? e.dest.action : null) as Extract<
    WriteAction,
    { kind: "gear" | "gear-ride" }
  > | null;

describe("gear by typing", () => {
  beforeEach(() => resetGearState({ gears, overrides: {}, ready: true }));

  it("a wash goes on the usual bike first, today", () => {
    const rows = ask("lavato la bici");
    expect(rows[0]!.q).toBe("Lavaggio · Canyon Ultimate, oggi");
    expect(rows.map((r) => r.id)).toEqual(["gear-wash-canyon", "gear-wash-topstone"]);
    const a = action(rows[0]);
    expect(a?.kind === "gear" && a.gear.events.at(-1)).toMatchObject({ date: today, kind: "wash" });
  });

  it("a named bike and a day", () => {
    const rows = ask("lavaggio topstone ieri");
    expect(rows).toHaveLength(1);
    const a = action(rows[0]);
    expect(a?.kind === "gear" && a.gear.id).toBe("topstone");
    expect(a?.kind === "gear" && a.gear.events.at(-1)!.date).toBe("2026-11-09");
  });

  it("a new chain keeps the interval and says the old one's km", () => {
    const rows = ask("catena nuova");
    expect(rows[0]!.q).toBe("Sostituzione catena · Canyon Ultimate, oggi");
    expect(rows[0]!.answer).toContain("100 km");
    const a = action(rows[0]);
    const g = a?.kind === "gear" ? a.gear : null;
    expect(current(g!, "chain")).toMatchObject({ fitted: today, intervalKm: 120 });
  });

  it("brake pads mean both, unless a side is said", () => {
    const both = action(ask("cambiato pastiglie freni")[0]);
    expect(both?.kind === "gear" && both.gear.components.map((c) => c.part)).toEqual([
      "chain",
      "padsF",
      "padsR",
    ]);
    const rear = action(ask("pastiglie posteriori nuove")[0]);
    expect(rear?.kind === "gear" && rear.gear.components.map((c) => c.part)).toEqual([
      "chain",
      "padsR",
    ]);
  });

  it("reads a part's km", () => {
    const [row] = ask("km catena");
    expect(row!.value).toBe("100 km");
    expect(row!.dest).toMatchObject({ to: "/gear", search: { id: "canyon", part: "chain" } });
  });

  it("leaves totals alone", () => {
    expect(ask("km bici").some((r) => r.id.startsWith("gear"))).toBe(false);
    expect(ask("km").some((r) => r.id.startsWith("gear"))).toBe(false);
  });

  it("moves an activity onto another bike", () => {
    const rows = ask("uscita di ieri con la topstone");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.q).toBe("Manghen con Cannondale Topstone");
    expect(rows[0]!.answer).toContain("passano da Canyon Ultimate a Cannondale Topstone");
  });

  it("on an activity's page, that activity", () => {
    const rows = ask("con la topstone", data({ here: { kind: "ride", id: "b" } }));
    expect(action(rows[0])).toMatchObject({
      kind: "gear-ride",
      activityId: "b",
      gearId: "topstone",
    });
  });

  it("a name alone opens the gear", () => {
    const [row] = ask("topstone");
    expect(row!.dest).toMatchObject({ to: "/gear", search: { id: "topstone" } });
  });

  it("adds a bike with its name as typed", () => {
    const [row] = ask("nuova bici Specialized Aethos");
    expect(row!.q).toBe("Aggiungi bici Specialized Aethos");
    const a = action(row);
    expect(a?.kind === "gear" && a.gear).toMatchObject({
      name: "Specialized Aethos",
      isDefault: false,
      since: today,
    });
  });

  it("a note on a named gear", () => {
    const [row] = ask("nota canyon freno posteriore fischia");
    const a = action(row);
    expect(a?.kind === "gear" && a.gear.events.at(-1)).toMatchObject({
      kind: "note",
      note: "freno posteriore fischia",
    });
  });

  it("saving and undoing", async () => {
    const a = action(ask("lavato la canyon")[0])!;
    const done = await runWrite(a, {} as never);
    expect(gearState().gears.find((g) => g.id === "canyon")!.events).toHaveLength(1);
    await done.undo();
    expect(gearState().gears.find((g) => g.id === "canyon")!.events).toHaveLength(0);
    const r = action(ask("uscita di ieri con la topstone")[0])!;
    const moved = await runWrite(r, {} as never);
    expect(gearState().overrides).toEqual({ a: "topstone" });
    await moved.undo();
    expect(gearState().overrides).toEqual({});
  });

  it("no gear, no rows (except adding one)", () => {
    const d = data({ gear: { gears: [], overrides: {} } });
    expect(ask("lavato la bici", d)).toEqual([]);
    expect(ask("nuove scarpe Pegasus", d)[0]!.id).toBe("gear-add");
  });
});
