import { describe, expect, it } from "vitest";
import { askNeeds } from "./ask-compare";
import {
  buildChart,
  chartAsked,
  chartCurves,
  chartLeftover,
  chartRows,
  chartWellnessSpan,
  MAX_CURVE_PERIODS,
  niceTicks,
  periodsOf,
} from "./ask-chart";
import { curveKey } from "./ask-efforts";
import { intentEntries, type IntentData } from "./ask-intents";
import type { ChartView } from "./ask-detail";
import type { Activity, PowerCurve, Wellness } from "./intervals";

const today = "2026-11-07";
const ctx = { today, sport: "ride" as const };
const act = (day: string, km: number, type = "Ride"): Activity =>
  ({
    id: `${day}-${km}`,
    name: "x",
    type,
    start_date_local: `${day}T08:00:00`,
    distance: km * 1000,
    moving_time: 3600,
    total_elevation_gain: 100,
    icu_training_load: 50,
    zoneTimes: [],
  }) as unknown as Activity;
const well = (id: string, hrv: number | null): Wellness =>
  ({ id, hrv, ctl: 50, atl: 60, weight: null, sleepSecs: 7 * 3600 }) as unknown as Wellness;
const view = (q: string, d = {}) =>
  buildChart(chartAsked(q, ctx)!, { ...ctx, ...d }).view as ChartView;

describe("reading a chart", () => {
  it.each([
    ["grafico km"],
    ["chart km"],
    ["andamento km"],
    ["km per mese"],
    ["hrv e km"],
    ["power 5m per mese"],
    ["potenza 5 min per mese"],
    ["heart rate 20m by month"],
    ["grafico km 2025 vs 2026"],
    ["grafico km vs hrv"],
    ["grafico velocita media"],
    ["grafico km corsa"],
    ["grafico peso marzo"],
    ["fitness e fatica"],
    ["km"],
    ["hrv"],
    ["peso"],
    ["forma"],
  ])("%s is a chart", (q) => {
    expect(chartAsked(q, ctx)).not.toBeNull();
  });
  it.each([
    ["tempo"],
    ["time"],
    ["numero"],
    ["fc"],
    ["power"],
    ["grafico km oggi"],
    ["grafico km marzo 2"],
    ["grafico km marzo 20"],
    ["km marzo"],
    ["km e dislivello marzo"],
    ["forma e hrv oggi"],
    ["peso 70"],
    ["grafico durability"],
    ["grafico km bananas"],
    ["grafico power"],
    ["grafico"],
    ["km 2025 vs 2026"],
    ["power 5m oggi"],
    ["power 20m oggi vs ieri"],
  ])("%s isn't a chart", (q) => {
    expect(chartAsked(q, ctx)).toBeNull();
  });
  it("defaults to what suits the measure", () => {
    expect(chartAsked("grafico km", ctx)).toMatchObject({
      period: "month",
      span: { from: "2025-12-01", to: today },
    });
    expect(chartAsked("power 5m per mese", ctx)).toMatchObject({ period: "month" });
    const weeks = chartAsked("grafico km per settimana", ctx)!;
    expect(periodsOf(weeks.span, weeks.period, today)).toHaveLength(12);
    const hrv = chartAsked("grafico hrv", ctx)!;
    expect(hrv.period).toBe("day");
    expect(periodsOf(hrv.span, hrv.period, today)).toHaveLength(90);
  });
  it("two kinds share the coarser period", () => {
    const a = chartAsked("hrv e km", ctx)!;
    expect(a.period).toBe("month");
    expect(a.measures.map((m) => m.key)).toEqual(["hrv", "km"]);
    expect(view("hrv e km").panels.map((p) => p.points.length)).toEqual([12, 12]);
  });
  it("says a period and a stretch in any order", () => {
    expect(chartAsked("grafico km per settimana marzo 2026", ctx)).toMatchObject({
      period: "week",
      span: { from: "2026-03-01", to: "2026-03-31" },
    });
    expect(chartAsked("grafico km marzo 2026 per giorno", ctx)?.period).toBe("day");
    expect(chartAsked("power 5m per mese dal 2022", ctx)?.span.from).toBe("2022-01-01");
  });
  it("never reaches past today", () => {
    expect(chartAsked("grafico km 2027", ctx)).toBeNull();
    expect(chartAsked("grafico km 2026", ctx)?.span.to).toBe(today);
  });
});

describe("what it draws", () => {
  it("adds up totals, with a real zero and the open period marked", () => {
    const [p] = view("grafico km", {
      acts: [act("2026-10-03", 40), act("2026-10-05", 60), act("2026-11-02", 30, "Run")],
    }).panels;
    expect(p!.draw).toBe("bars");
    expect(p!.points.at(-2)!.value).toBe(100);
    expect(p!.points[0]!.value).toBe(0);
    expect(p!.points.at(-1)).toMatchObject({ value: 30, open: true });
  });
  it("counts only the sport named", () => {
    const [p] = view("grafico km corsa", {
      acts: [act("2026-11-02", 30, "Run"), act("2026-11-03", 50)],
    }).panels;
    expect(p!.points.at(-1)!.value).toBe(30);
  });
  it("means levels over a period and leaves gaps for no reading", () => {
    const [p] = view("grafico hrv per mese", {
      chartWellness: {
        days: [well("2026-10-01", 50), well("2026-10-02", 70), well("2026-11-01", null)],
      },
    }).panels;
    expect(p!.draw).toBe("line");
    expect(p!.points.at(-2)!.value).toBe(60);
    expect(p!.points.at(-1)!.value).toBeNull();
  });
  it("form is fitness minus fatigue, and may be negative", () => {
    const [p] = view("grafico forma", { chartWellness: { days: [well(today, 1)] } }).panels;
    expect(p!.points.at(-1)!.value).toBe(-10);
    expect(p!.ticks[0]!).toBeLessThanOrEqual(-10);
  });
  it("cuts curves at the cap, and says so", () => {
    const a = chartAsked("power 5m per mese dal 2022", ctx)!;
    expect(chartCurves(a, ctx)).toHaveLength(MAX_CURVE_PERIODS);
    expect(chartCurves(a, ctx)[0]!.from).toBe("2024-12-01");
    const v = view("power 5m per mese dal 2022");
    expect(v.panels[0]!.points).toHaveLength(MAX_CURVE_PERIODS);
    expect(v.note).toMatch(/24.*59/);
    expect(chartCurves(chartAsked("power 5m per mese", ctx)!, ctx)).toHaveLength(12);
  });
  it("reads each curve at the length asked, while the others wait", () => {
    const a = chartAsked("power 5m per mese", ctx)!;
    const curve = { secs: [60, 300], watts: [400, 280] } as unknown as PowerCurve;
    const need = chartCurves(a, ctx).at(-1)!;
    const v = buildChart(a, { ...ctx, curveReads: { [curveKey(need)]: { curve } } })
      .view as ChartView;
    expect(v.panels[0]!.points.at(-1)!.value).toBe(280);
    expect(v.panels[0]!.draw).toBe("points");
    expect(v.loading).toBe(true);
  });
  it("sets two stretches side by side", () => {
    const [p] = view("grafico km 2025 vs 2026", {
      acts: [act("2025-02-03", 40), act("2026-02-03", 70)],
    }).panels;
    expect(p!.names).toHaveLength(2);
    expect(p!.points).toHaveLength(12);
    expect(p!.points[1]).toMatchObject({ value: 40, other: 70 });
  });
  it("two measures are two charts", () => {
    const v = view("grafico km vs hrv");
    expect(v.panels).toHaveLength(2);
    expect(v.panels.map((p) => p.draw)).toEqual(["bars", "line"]);
  });
});

describe("its names", () => {
  it("are what was said, not how much of it has happened", () => {
    expect(chartRows("grafico km 2025 vs 2026", { ...ctx, acts: [] })[0]!.q).toBe(
      "Km · 2025 and 2026",
    );
    expect(chartRows("power 5m per mese dal 2022", { ...ctx, acts: [] })[0]!.q).toContain(
      "since 2022",
    );
  });
  it("don't say the unit twice", () => {
    expect(view("hrv e km").panels.map((p) => p.title)).toEqual(["HRV (ms)", "Km"]);
  });
});

describe("the ticks", () => {
  it("are round", () => {
    expect(niceTicks([100, 1180], true)).toEqual([0, 500, 1000, 1500]);
    expect(niceTicks([52, 71], false)).toEqual([50, 60, 70, 80]);
    expect(niceTicks([56, 64], false)).toEqual([55, 60, 65]);
    expect(niceTicks([30.01, 30.02], false, 1)).toEqual([30, 30.1]);
    expect(niceTicks([69.2, 71.8], false, 1)).toEqual([69, 70, 71, 72]);
    expect(niceTicks([], true)).toEqual([0, 1]);
  });
  it("cover what's drawn", () => {
    const t = niceTicks([1800, 7], true);
    expect(t[0]).toBe(0);
    expect(t.at(-1)!).toBeGreaterThanOrEqual(1800);
  });
});

describe("the row", () => {
  const data = { ...ctx, acts: [act("2026-10-03", 40)] };
  const row = (q: string) => chartRows(q, data)[0]!;
  it("opens in the panel, and goes to its page", () => {
    const r = row("grafico km");
    expect(r.detail?.view.kind).toBe("chart");
    expect(r.value).toBe("40 km");
    expect(r.dest).toEqual({ kind: "route", to: "/chart", search: { q: "grafico km" } });
    expect(r.detail?.open).toBe("Open the chart");
  });
  it("its chips are questions, read back as charts", () => {
    const r = row("grafico km");
    const chips = r.follow!;
    expect(chips.slice(0, 3).map((c) => [c.label, !!c.on])).toEqual([
      ["Day", false],
      ["Week", false],
      ["Month", true],
    ]);
    expect(chips.map((c) => c.label)).toContain("2025");
    expect(chips.map((c) => c.label)).toContain("vs hrv");
    expect(chips.map((c) => c.label)).toContain("e dislivello");
    expect(chips.map((c) => c.label)).toContain("corsa");
    for (const c of chips) expect(chartAsked(c.query, ctx), c.query).not.toBeNull();
    expect(chartAsked(chips[1]!.query, ctx)?.period).toBe("week");
    const prev = chartAsked(chips.at(-1)!.query, ctx)!;
    expect(chips.at(-1)!.label.startsWith("‹")).toBe(true);
    expect(prev).toMatchObject({ period: "month", span: { from: "2024-12-01", to: "2025-11-30" } });
  });
  it("adds what's beside it as a second chart", () => {
    const chip = row("grafico km").follow!.find((c) => c.label === "vs hrv")!;
    expect(chartAsked(chip.query, ctx)!.measures.map((m) => m.key)).toEqual(["km", "hrv"]);
    const after = row("grafico km 2025").follow!.map((c) => c.label);
    expect(after).toContain("vs 2024");
    const paired = chartAsked(
      row("grafico km 2025").follow!.find((c) => c.label === "vs 2024")!.query,
      ctx,
    )!;
    expect(paired.second?.from).toBe("2024-01-01");
  });
  it("before a cut chart comes what wasn't shown", () => {
    const prev = row("power 5m per mese dal 2022").follow!.at(-1)!;
    expect(chartAsked(prev.query, ctx)!.span).toEqual({ from: "2022-12-01", to: "2024-11-30" });
  });
  it("a curve isn't offered by the day", () => {
    const labels = row("power 5m per mese").follow!.map((c) => c.label);
    expect(labels).not.toContain("Day");
    expect(labels).toContain("Week");
    expect(labels).toContain("e fc 5m");
  });
  it("a word that needs more asks for it", () => {
    expect(row("fc").follow!.map((c) => c.query)).toEqual([
      "fc 5m",
      "fc 20m",
      "fc 60m",
      "fc media oggi",
    ]);
    expect(row("fc").answer).toBe("For how long?");
    expect(row("power")).toBeUndefined();
    expect(row("grafico").follow!.map((c) => c.query)).toContain("grafico km");
  });
  it("a name stays a name", () => {
    expect(chartRows("forma", { ...data, takenNames: ["Forma"] })).toEqual([]);
    expect(chartRows("grafico forma", { ...data, takenNames: ["Forma"] })[0]?.id).toBe("chart");
  });
  it("says which word wasn't understood", () => {
    const left = chartLeftover("km banane", today)!;
    expect(left).toMatchObject({ known: "km", unknown: ["banane"] });
    for (const c of left.follow) expect(chartAsked(c.query, ctx), c.query).not.toBeNull();
    expect(chartLeftover("km marzo", today)).toBeNull();
    expect(chartLeftover("banane", today)).toBeNull();
  });
  it("wins over other readings of the same words", () => {
    const d = { ...data, native: false, climbs: [] } as IntentData;
    expect(intentEntries("hrv e km", d)[0]!.id).toBe("chart");
    expect(intentEntries("km e dislivello marzo", d)[0]!.id).not.toBe("chart");
  });
  it("needs its curves read, and its days", () => {
    expect(askNeeds("power 5m per mese", { ...ctx, climbs: [] }).curves).toHaveLength(12);
    expect(askNeeds("grafico km", { ...ctx, climbs: [] }).curves).toEqual([]);
    expect(chartWellnessSpan(chartAsked("grafico km", ctx)!, today)).toBeNull();
    expect(chartWellnessSpan(chartAsked("hrv e km", ctx)!, today)).toEqual({
      from: "2025-12-01",
      to: today,
    });
  });
});
