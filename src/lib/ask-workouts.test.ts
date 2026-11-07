import { describe, expect, it } from "vitest";
import { alternatives } from "./ask";
import { intentEntries, liveEntries, type IntentData } from "./ask-intents";
import { buildPool, builtInWorkout } from "./suggest";
import { easyRide, longRide, recoveryRide } from "./plan/layout";
import { speciesOf } from "./workout-species";
import { workoutTemplates } from "./workout-templates";

const today = "2026-11-06";
const live = (sport: "ride" | "run" = "ride") => liveEntries({ today, sport } as never);
const find = (q: string, sport: "ride" | "run" = "ride") =>
  alternatives(q, null, live(sport)).filter((a) => a.id.startsWith("workout-"));

describe("a workout's species", () => {
  it("is known for every workout, in either language", () => {
    for (const sport of ["ride", "run"] as const)
      for (const w of workoutTemplates(sport)) expect(speciesOf(w.name()), w.id).toBeTruthy();
    for (const w of [longRide(3600, false), easyRide(3600, false), recoveryRide(2700, false)])
      expect(speciesOf(w.name), w.name).toBeTruthy();
    expect(speciesOf("Merlo acquaiolo 3 x 15")).toBe("Dipper");
    expect(speciesOf("Dipper 3 x 15")).toBe("Dipper");
    expect(speciesOf("Mugo pine 120")).toBe("Mugo");
    expect(speciesOf("Cirmolo 60 (copia)")).toBe("Cirmolo");
  });
  it("stays out of names of your own", () => {
    for (const name of [
      "Giro con Marco",
      "Oak Street loop",
      "Orso e amici",
      "Classic sweet spot 60",
      null,
    ])
      expect(speciesOf(name)).toBeNull();
  });
});

describe("typing a workout", () => {
  it("finds it by name, whole or half typed", () => {
    expect(find("Faggio 90").concat(find("Beech 90"))[0]!.id).toBe("workout-d-endurance-flow-90");
    expect(find("beec")[0]!.q).toMatch(/Beech|Faggio/);
    expect(find("merlo")[0]!.id).toMatch(/over-under/);
  });
  it("finds it in the language the app isn't in", () => {
    expect(find("quercia 180")[0]!.id).toBe("workout-r-long");
    expect(find("oak 180")[0]!.id).toBe("workout-r-long");
  });
  it("forgives a slip", () => {
    expect(find("camosco").length).toBeGreaterThan(0);
  });
  it("finds it by what the work is called", () => {
    expect(find("sweet spot").length).toBeGreaterThan(0);
    expect(find("over under")[0]!.id).toMatch(/over-under/);
    expect(find("bestie").length).toBeGreaterThan(0);
  });
  it("needs a word: a couple of letters or a bare number stays out", () => {
    expect(find("c")).toEqual([]);
    expect(find("al")).toEqual([]);
    expect(find("60")).toEqual([]);
  });
  it("brings the plain form of a kind of work first", () => {
    expect(find("soglia")[0]!.q).toMatch(/^Chamois|^Camoscio/);
    expect(find("vo2")[0]!.q).toMatch(/^Eagle|^Aquila/);
    expect(find("tempo")[0]!.q).toMatch(/^Juniper|^Ginepro/);
    expect(find("fondo")[0]!.q).toMatch(/^Beech|^Faggio/);
  });
  it("doesn't take ordinary words for a slip", () => {
    for (const word of ["forma", "passo", "orto"]) expect(find(word), word).toEqual([]);
  });
  it("keeps to your sport", () => {
    expect(find("sprint", "run")).toEqual([]);
    expect(find("oak 90", "run")[0]!.id).toBe("workout-w-long");
  });
  it("opens every workout, warm-ups and tri bike ones too, though they're never suggested", () => {
    const th = { ftp: 250, pace: 4 };
    const pool = buildPool([], "ride", th).map((w) => w.id);
    expect(pool).not.toContain("d-race-warmup-15");
    expect(builtInWorkout("d-race-warmup-15", "ride", th)?.seconds).toBeGreaterThan(0);
    expect(builtInWorkout("d-aero-builder-60", "ride", th)?.seconds).toBeGreaterThan(0);
    expect(builtInWorkout("nope", "ride", th)).toBeNull();
    expect(find("primul")[0]!.dest).toMatchObject({
      to: "/suggest",
      search: { id: "d-race-warmup-15" },
    });
  });
  it("finds your own, without a species", () => {
    const pool = [{ id: "lib-1", name: "Mia salita", mine: true, seconds: 3600 }] as never;
    const rows = liveEntries({ today, sport: "ride", suggest: { pool } } as never);
    expect(alternatives("mia sal", null, rows)[0]!.dest).toMatchObject({ search: { id: "lib-1" } });
  });
  it("reads a name and a day", () => {
    const d = { today, sport: "ride", climbs: [] } as unknown as IntentData;
    for (const typed of ["cirmolo 60 sabato", "Cirmolo 60 saturday"]) {
      const [row] = intentEntries(typed, d);
      expect(row?.dest, typed).toMatchObject({
        search: { id: "d-sweet-spot-classic-60", date: "2026-11-07" },
      });
    }
    expect(intentEntries("faggio 90 domani", d)[0]?.dest).toMatchObject({
      search: { id: "d-endurance-flow-90", date: "2026-11-07" },
    });
    const all = intentEntries("beech domani", d);
    expect(all.length).toBe(3);
    expect(all.every((r) => r.id.startsWith("workout-day-d-endurance-flow"))).toBe(true);
  });
  it("leaves a line that isn't a workout and a day to what it means", () => {
    const d = { today, sport: "ride", climbs: [] } as unknown as IntentData;
    expect(intentEntries("orso e amici", d).some((r) => r.id.startsWith("workout-day"))).toBe(
      false,
    );
  });
});
