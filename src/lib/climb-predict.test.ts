import { describe, expect, it, vi } from "vitest";
import { climbPredictRows, parseClimb, rangeText } from "./ask-climb";
import { intentEntries, type IntentData } from "./ask-intents";
import {
  correctionFrom,
  holdablePower,
  modelSeconds,
  powerForTime,
  timeAtPower,
} from "./climb-predict";
import type { PowerCurve } from "./intervals";
import type { Attempt } from "./segments";

vi.hoisted(() => localStorage.setItem("cadence_language", JSON.stringify("it")));

// 10 km at 8%.
const climb = { length: 10000, gain: 800 };
const pass = (duration: number, avgWatts: number | null = 250) =>
  ({ date: "2026-06-01T09:00:00", duration, avgWatts, gain: 800 }) as Attempt;
const curve = (id: string, w: number): PowerCurve => ({
  id,
  label: id,
  secs: [300, 1200, 2400, 3600, 7200],
  watts: [w + 80, w + 30, w, w - 15, w - 50],
});

describe("the model", () => {
  it("gives what a rider actually climbs at: about 15 km/h for 4 W/kg at 8%", () => {
    const secs = modelSeconds(280, 70, climb);
    expect((climb.length / secs) * 3.6).toBeGreaterThan(14);
    expect((climb.length / secs) * 3.6).toBeLessThan(17);
  });

  it("goes the right way: more power, less time; more weight, more time", () => {
    expect(modelSeconds(300, 70, climb)).toBeLessThan(modelSeconds(250, 70, climb));
    expect(modelSeconds(250, 80, climb)).toBeGreaterThan(modelSeconds(250, 70, climb));
  });

  it("time and power are the two ways of the same sum", () => {
    const t = modelSeconds(250, 70, climb);
    expect(powerForTime(t, 70, climb, []).watts).toBeCloseTo(250, 0);
  });

  it("your passes correct it, within reason", () => {
    const t = modelSeconds(250, 70, climb);
    expect(correctionFrom([pass(t * 1.1)], 70, climb).factor).toBeCloseTo(1.1, 2);
    expect(correctionFrom([pass(t * 3)], 70, climb).factor).toBe(1.3);
    expect(correctionFrom([pass(t, null)], 70, climb)).toEqual({ factor: 1, passes: 0 });
    expect(timeAtPower(250, 70, climb, [pass(t * 1.1)]).secs).toBeCloseTo(t * 1.1, 0);
  });

  it("the range narrows with what it knows", () => {
    const wide = timeAtPower(250, 70, climb, []);
    const t = modelSeconds(250, 70, climb);
    const narrow = timeAtPower(250, 70, climb, [pass(t), pass(t), pass(t)]);
    expect(wide.high - wide.low).toBeGreaterThan(narrow.high - narrow.low);
  });

  it("settles on what your curve holds for as long as it takes", () => {
    const w = holdablePower(curve("42d", 260), 70, climb, [])!;
    const secs = modelSeconds(w, 70, climb);
    expect(w).toBeGreaterThan(220);
    expect(w).toBeLessThan(300);
    // The curve read at the time it takes gives the same power back.
    expect(secs).toBeGreaterThan(1200);
    expect(holdablePower(undefined, 70, climb, [])).toBeNull();
  });

  it("says a range the way it reads", () => {
    expect(rangeText({ secs: 3000, low: 2880, high: 3120 })).toBe("48–52 min");
    expect(rangeText({ secs: 4200, low: 4080, high: 4440 })).toBe("1h 08–1h 14");
    expect(rangeText({ secs: 3600, low: 3480, high: 3720 })).toBe("58 min–1h 02");
  });
});

describe("asking", () => {
  const verdana = {
    id: "v",
    name: "Passo Verdana",
    length: 10000,
    gain: 800,
    saved: true,
    attempts: [],
  };
  const d: IntentData = {
    today: "2026-11-06",
    sport: "ride",
    native: false,
    climbs: [verdana],
    weight: 70,
    curves: [curve("42d", 260), curve("1y", 280)],
  };
  const top = (q: string, over: Partial<IntentData> = {}) =>
    intentEntries(q, { ...d, ...over })[0]!;

  it("reads the three questions", () => {
    expect(parseClimb("quanto ci metto sul verdana")).toEqual({ kind: "time", name: "verdana" });
    expect(parseClimb("how long up verdana")).toEqual({ kind: "time", name: "verdana" });
    expect(parseClimb("verdana a 250 w")).toEqual({ kind: "at", name: "verdana", watts: 250 });
    expect(parseClimb("quanto ci metto sul verdana a 250 w")).toEqual({
      kind: "at",
      name: "verdana",
      watts: 250,
    });
    expect(parseClimb("che potenza per stare sotto 1h sul verdana")).toMatchObject({
      kind: "power",
      name: "verdana",
      secs: 3600,
    });
    expect(parseClimb("potenza per verdana in 45 min")).toMatchObject({
      name: "verdana",
      secs: 2700,
    });
    expect(parseClimb("verdana")).toBeNull();
  });

  it("answers in a range, with what it's based on", () => {
    const r = top("quanto ci metto sul verdana");
    expect(r.q).toBe("Passo Verdana: quanto ci metti");
    expect(r.value).toMatch(/–/);
    expect(r.answer).toContain("ai tuoi");
    expect(r.answer).toContain("ancora nessun passaggio");
    expect(r.dest).toMatchObject({ to: "/segments/$id", params: { id: "v" } });
    expect(top("verdana a 250 w").value).toMatch(/–/);
    expect(top("verdana a 250 w").answer).toContain("3.6 W/kg");
  });

  it("says when the power asked for is beyond you", () => {
    expect(top("che potenza per stare sotto 30 min sul verdana").answer).toContain("sopra i tuoi");
    expect(top("che potenza per stare sotto 2h sul verdana").answer).toContain("dentro i tuoi");
  });

  it("is honest about what it lacks", () => {
    expect(top("verdana a 250 w", { weight: null }).answer).toBe("Serve il tuo peso");
    expect(
      top("quanto ci metto sul verdana", { climbs: [{ ...verdana, gain: undefined }] }).answer,
    ).toBe("Pendenza della salita non nota");
    expect(top("quanto ci metto sul verdana", { curves: [] }).answer).toBe(
      "Serve la tua curva di potenza",
    );
  });

  it("rides only, and only for a climb it knows", () => {
    expect(climbPredictRows("quanto ci metto sul verdana", { ...d, sport: "run" })).toEqual([]);
    expect(climbPredictRows("quanto ci metto sul nulla", d)).toEqual([]);
    expect(top("potenza 5 min")?.id).not.toBe("climb-predict");
  });
});
