import { describe, expect, it, vi } from "vitest";
import type { Activity, PlannedEvent } from "./intervals";
import type { Race } from "./races";
import {
  buildPool,
  dayAsk,
  suggestDay,
  suggestWeek,
  targetText,
  type SuggestInput,
} from "./suggest";
import { addDays } from "./training";

vi.hoisted(() => localStorage.setItem("cadence_language", JSON.stringify("it")));

// A Thursday.
const today = "2026-11-05";
const th = { ftp: 250 };
const act = (date: string, intensity: number, secs = 5400, type = "Ride") =>
  ({
    id: date,
    name: date,
    type,
    start_date_local: `${date}T09:00:00`,
    moving_time: secs,
    icu_intensity: intensity,
    icu_training_load: 80,
  }) as unknown as Activity;
const base: SuggestInput = {
  today,
  sport: "ride",
  focus: "vo2",
  races: [],
  events: [],
  offEvents: [],
  acts: [],
  wellness: [],
  score: 85,
  form: 0,
  th,
  pool: buildPool([], "ride", th),
};
const race = (date: string, priority: "A" | "B" | "C" = "A", type = "Ride") =>
  ({ id: date, name: "Gara", date, priority, type, info: null }) as unknown as Race;
const event = (date: string, category: string, extra: Partial<PlannedEvent> = {}) =>
  ({ id: date, date, end: null, category, type: "Ride", name: "X", ...extra }) as PlannedEvent;
const weekHistory = Array.from({ length: 20 }, (_, i) => act(addDays(today, -1 - i), 65, 7200));

describe("what a day asks", () => {
  it("follows readiness today", () => {
    expect(dayAsk({ ...base, score: 85 }, today)).toBe("quality");
    expect(dayAsk({ ...base, score: 85, form: -30 }, today)).toBe("tempo");
    expect(dayAsk({ ...base, score: 60 }, today)).toBe("steady");
    expect(dayAsk({ ...base, score: 45 }, today)).toBe("easy");
    expect(dayAsk({ ...base, score: 30 }, today)).toBe("rest");
  });

  it("never puts a hard day next to another", () => {
    const acts = [act(addDays(today, -1), 95)];
    expect(dayAsk({ ...base, acts }, today)).toBe("steady");
    const events = [
      event(addDays(today, 3), "WORKOUT", { moving_time: 3600, icu_training_load: 100 }),
    ];
    expect(dayAsk({ ...base, events }, addDays(today, 2))).toBe("steady");
    expect(dayAsk({ ...base, events }, addDays(today, 1))).toBe("quality");
  });

  it("keeps quality off the days around a free ride and a race", () => {
    const events = [event(addDays(today, 3), "NOTE")];
    expect(dayAsk({ ...base, events }, addDays(today, 2))).toBe("steady");
    const races = [race(addDays(today, 3), "C")];
    expect(
      dayAsk({ ...base, races, events: [event(addDays(today, 3), "RACE_C")] }, addDays(today, 2)),
    ).toBe("steady");
  });

  it("knows off days, race days, the day after and the taper", () => {
    const offEvents = [event(today, "SICK")];
    expect(dayAsk({ ...base, offEvents }, today)).toBe("off");
    const races = [race(addDays(today, 5))];
    expect(dayAsk({ ...base, races }, addDays(today, 5))).toBe("race");
    expect(dayAsk({ ...base, races }, addDays(today, 6))).toBe("easy");
    expect(dayAsk({ ...base, races }, today)).toBe("easy");
  });

  it("isn't moved by a race in another sport", () => {
    const races = [race(addDays(today, 5), "A", "Run")];
    expect(dayAsk({ ...base, races }, today)).toBe("quality");
  });

  it("is easy once you've already been out today", () => {
    expect(dayAsk({ ...base, acts: [act(today, 60)] }, today)).toBe("easy");
  });

  it("holds back a future day when the form is deep", () => {
    expect(dayAsk({ ...base, form: -30 }, addDays(today, 2))).toBe("steady");
  });
});

describe("picking workouts", () => {
  it("fits the block first, then something easier, then shorter", () => {
    const { picks } = suggestDay(base, today);
    expect(picks.length).toBeGreaterThanOrEqual(2);
    expect(picks[0]!.workout.kind).toBe("vo2");
    expect(picks[0]!.why).toBe("Il tuo blocco");
    expect(picks[1]!.why).toBe("Più tranquilla");
    expect(picks[1]!.workout.kind).toBe("endurance");
    expect(new Set(picks.map((p) => p.workout.id)).size).toBe(picks.length);
  });

  it("offers as easier only what really is", () => {
    for (const focus of ["base", "aerobic", "vo2", "anaerobic", "sprint"] as const) {
      const { picks } = suggestDay({ ...base, focus }, today);
      const easier = picks.find((p) => p.why === "Più tranquilla");
      if (easier) expect(easier.workout.load).toBeLessThan(picks[0]!.workout.load);
    }
  });

  it("leaves race simulations for when there's a race", () => {
    const aerobic = { ...base, focus: "aerobic" as const };
    for (const p of suggestDay(aerobic, today).picks)
      expect(p.workout.id).not.toMatch(/race|ironman|70-3/);
  });

  it("prefers the block's main kind", () => {
    expect(suggestDay({ ...base, focus: "aerobic" }, today).picks[0]!.workout.kind).toBe(
      "threshold",
    );
  });

  it("always gives the same answer", () => {
    expect(suggestDay(base, today)).toEqual(suggestDay(base, today));
    expect(suggestWeek(base, today, addDays(today, 6))).toEqual(
      suggestWeek(base, today, addDays(today, 6)),
    );
  });

  it("prefers your own workout in a close call", () => {
    const pool = buildPool(
      [
        {
          id: "m",
          name: "Mia VO2",
          type: "Ride",
          description: "- 10m 60%\n\n5x\n- 4m 115%\n- 3m 50%",
          moving_time: null,
          icu_training_load: null,
        },
      ],
      "ride",
      th,
    );
    expect(suggestDay({ ...base, pool }, today).picks[0]!.workout.name).toBe("Mia VO2");
  });

  it("ignores workouts of the other sport", () => {
    const pool = buildPool(
      [
        {
          id: "r",
          name: "Corsa",
          type: "Run",
          description: "- 40m 80%",
          moving_time: 2400,
          icu_training_load: 40,
        },
      ],
      "ride",
      th,
    );
    expect(pool.some((w) => w.name === "Corsa")).toBe(false);
  });

  it("passes over a name planned lately", () => {
    const first = suggestDay(base, today).picks[0]!.workout;
    const events = [
      event(addDays(today, 8), "WORKOUT", {
        name: first.name,
        moving_time: 3600,
        icu_training_load: 40,
      }),
    ];
    expect(suggestDay({ ...base, events }, today).picks[0]!.workout.name).not.toBe(first.name);
  });

  it("filters by time", () => {
    const { picks } = suggestDay(base, today, { minutes: 60 });
    expect(picks.length).toBeGreaterThan(0);
    for (const p of picks) {
      expect(p.workout.seconds).toBeLessThanOrEqual(60 * 60 * 1.15);
      expect(p.workout.seconds).toBeGreaterThanOrEqual(60 * 60 * 0.5);
    }
  });

  it("filters by kind, saying so if the day asks for less", () => {
    const easy = suggestDay({ ...base, score: 45 }, today, { kind: "threshold" });
    expect(easy.picks.every((p) => p.workout.kind === "threshold")).toBe(true);
    expect(easy.picks.length).toBeGreaterThan(0);
    expect(easy.harderThanAsked).toBe(true);
    expect(suggestDay(base, today, { kind: "endurance" }).harderThanAsked).toBe(false);
  });

  it("gives nothing on an off or race day", () => {
    expect(suggestDay({ ...base, offEvents: [event(today, "SICK")] }, today).picks).toEqual([]);
    expect(suggestDay({ ...base, races: [race(today)] }, today).picks).toEqual([]);
  });

  it("says a coming day depends on the morning", () => {
    expect(suggestDay(base, today).conditional).toBe(false);
    expect(suggestDay(base, addDays(today, 1)).conditional).toBe(true);
  });

  it("works for running", () => {
    const thRun = { pace: 4 };
    const run: SuggestInput = {
      ...base,
      sport: "run",
      th: thRun,
      focus: "aerobic",
      pool: buildPool([], "run", thRun),
    };
    const { picks } = suggestDay(run, today);
    expect(picks.length).toBeGreaterThan(0);
    expect(picks[0]!.workout.type).toBe("Run");
  });
});

describe("targets", () => {
  it("names the main set in your numbers", () => {
    const w = { description: "- 10m 60%\n3x\n- 12m 95-100%\n- 5m 50%" };
    // A range is read as its middle, as in the rest of the app.
    expect(targetText(w, "ride", { ftp: 300 })).toBe("293 W");
    expect(targetText(w, "ride", {})).toBe("98% FTP");
    expect(targetText({ description: "- 10m Ramp 50-80%" }, "ride", { ftp: 300 })).toBe(
      "150–240 W",
    );
    expect(targetText({ description: "plain words" }, "ride", th)).toBeNull();
  });
});

describe("a week", () => {
  const to = addDays(today, 6);
  const input: SuggestInput = { ...base, acts: weekHistory };
  const pickedKinds = (w: ReturnType<typeof suggestWeek>) =>
    w.days.map((d) => d.picks[0]?.workout.kind ?? null);

  it("spreads at most two hard days, never side by side", () => {
    const w = suggestWeek(input, today, to);
    const hard = w.days.flatMap((d, i) => (d.ask === "quality" ? [i] : []));
    expect(hard.length).toBeGreaterThan(0);
    expect(hard.length).toBeLessThanOrEqual(2);
    for (let i = 1; i < hard.length; i++) expect(hard[i]! - hard[i - 1]!).toBeGreaterThan(1);
  });

  it("has a long day at the weekend and a free day", () => {
    const w = suggestWeek(input, today, to);
    const long = w.days.find((d) => d.ask === "long");
    expect(long).toBeTruthy();
    expect(["2026-11-07", "2026-11-08"]).toContain(long!.date);
    expect(w.days.some((d) => d.rest)).toBe(true);
    const i = w.days.indexOf(long!);
    expect(w.days[i - 1]?.ask).not.toBe("quality");
    expect(w.days[i + 1]?.ask).not.toBe("quality");
  });

  it("fits a week the size of yours, without repeating a workout", () => {
    // About five hours a week lately.
    const acts = Array.from({ length: 12 }, (_, i) => act(addDays(today, -1 - i * 2), 65, 6000));
    const w = suggestWeek({ ...input, acts }, today, to);
    const picks = w.days.flatMap((d) => (d.picks[0] ? [d.picks[0].workout] : []));
    expect(picks.length).toBeGreaterThanOrEqual(3);
    expect(new Set(picks.map((p) => p.id)).size).toBe(picks.length);
    expect(w.seconds).toBeLessThanOrEqual(5 * 3600 * 1.1 * 1.25);
  });

  it("counts a block day as hard, whatever kind it picked", () => {
    const w = suggestWeek({ ...input, focus: "aerobic" }, today, to);
    expect(w.hard).toBe(w.days.filter((d) => d.ask === "quality").length);
  });

  it("keeps one hard day when strained or in base", () => {
    const hardDays = (x: SuggestInput) =>
      suggestWeek(x, today, to).days.filter((d) => d.ask === "quality").length;
    expect(hardDays({ ...input, focus: "base" })).toBeLessThanOrEqual(1);
    expect(hardDays({ ...input, form: -30 })).toBeLessThanOrEqual(1);
  });

  it("leaves what's planned where it is, without suggesting on top", () => {
    const events = [event("2026-11-07", "NOTE", { name: "Giro con Marco" })];
    const w = suggestWeek({ ...input, events }, today, to);
    const sat = w.days.find((d) => d.date === "2026-11-07")!;
    expect(sat.planned[0]!.name).toBe("Giro con Marco");
    expect(sat.picks).toEqual([]);
    expect(sat.rest).toBe(false);
    // Nothing hard the day before or after.
    expect(w.days.find((d) => d.date === "2026-11-06")!.ask).not.toBe("quality");
    expect(w.days.find((d) => d.date === "2026-11-08")!.ask).not.toBe("quality");
  });

  it("suggests nothing on off days or race days, and eases into a race", () => {
    const offEvents = [event("2026-11-06", "SICK", { end: "2026-11-07" })];
    const off = suggestWeek({ ...input, offEvents }, today, to);
    expect(off.days.find((d) => d.date === "2026-11-06")!.picks).toEqual([]);
    const taper = suggestWeek(
      { ...input, races: [race("2026-11-08")], events: [event("2026-11-08", "RACE_A")] },
      today,
      to,
    );
    expect(taper.days.filter((d) => d.date < "2026-11-09").some((d) => d.ask === "quality")).toBe(
      false,
    );
    expect(taper.days.find((d) => d.date === "2026-11-08")!.picks).toEqual([]);
  });

  it("stays within what you've been doing", () => {
    const w = suggestWeek(
      { ...input, acts: [act(addDays(today, -2), 65, 3600), act(addDays(today, -9), 65, 3600)] },
      today,
      to,
    );
    // Half an hour a week lately: the proposal doesn't jump to a full week.
    expect(pickedKinds(w).filter(Boolean).length).toBeLessThanOrEqual(3);
  });

  it("starts from today for a week already begun", () => {
    const w = suggestWeek(input, "2026-11-02", "2026-11-08");
    expect(w.from).toBe(today);
    expect(w.days[0]!.date).toBe(today);
  });

  it("is respectful of a low morning", () => {
    const w = suggestWeek({ ...input, score: 30 }, today, to);
    expect(w.days[0]!.ask).toBe("rest");
    expect(w.days[0]!.picks).toEqual([]);
  });
});

describe("from the evidence", () => {
  const weeks = Array.from({ length: 12 }, (_, i) => act(addDays(today, -2 - i * 2), 65, 5400));
  const trained: SuggestInput = { ...base, acts: weeks };
  const tokm = (date: string, km: number, secs = 3600, type = "Run") =>
    ({
      id: `${date}-${km}`,
      name: `${km} km`,
      type,
      start_date_local: `${date}T09:00:00`,
      moving_time: secs,
      distance: km * 1000,
      icu_intensity: 60,
    }) as unknown as Activity;
  const thRun = { pace: 4 };
  const runner: SuggestInput = {
    ...base,
    sport: "run",
    focus: "aerobic",
    th: thRun,
    pool: buildPool([], "run", thRun),
    acts: [1, 3, 5, 8, 10, 12].map((d) => tokm(addDays(today, -d), 10)),
  };

  describe("a taper keeps its intensity", () => {
    const ahead = (days: number, priority: "A" | "B" = "A") => [
      race(addDays(today, days), priority),
    ];
    it("has short hard sessions in the last ten days of an A race", () => {
      const asks = [9, 8, 7, 6, 5, 4, 3, 2].map((d) =>
        dayAsk({ ...trained, races: ahead(d) }, today),
      );
      expect(asks.filter((a) => a === "sharp").length).toBe(3);
      expect(asks.filter((a) => a === "quality").length).toBe(0);
    });
    it("picks a short hard workout, about half the volume", () => {
      const s = suggestDay({ ...trained, races: ahead(6) }, today);
      expect(s.ask).toBe("sharp");
      expect(["vo2", "threshold"]).toContain(s.picks[0]!.workout.kind);
      expect(s.picks[0]!.workout.seconds).toBeLessThanOrEqual(75 * 60);
    });
    it("opens the legs the day before", () => {
      const s = suggestDay({ ...trained, races: ahead(1) }, today);
      expect(s.ask).toBe("opener");
      expect(s.picks[0]!.workout.id).toMatch(/opener/);
    });
    it("still listens to the morning", () => {
      expect(dayAsk({ ...trained, races: ahead(6), score: 30 }, today)).toBe("rest");
      expect(dayAsk({ ...trained, races: ahead(6), feel: 20 }, today)).toBe("easy");
    });
    it("stays easy for a B race", () => {
      expect(dayAsk({ ...trained, races: ahead(3, "B") }, today)).toBe("easy");
    });
    it("takes a marathon down from three weeks, with nothing longer after", () => {
      const marathon = {
        ...race(addDays(today, 20), "A", "Run"),
        info: { discipline: "run", kind: "runMarathon", minutes: null, sprint: false },
      } as unknown as Race;
      const on = (input: SuggestInput) =>
        suggestWeek(input, today, addDays(today, 6)).days.reduce(
          (n, d) => n + (d.picks[0]?.workout.seconds ?? 0),
          0,
        );
      expect(on({ ...runner, races: [marathon] })).toBeLessThan(on(runner));
    });
  });

  describe("two hard days in any seven", () => {
    const hardTwice = [act(addDays(today, -2), 92), act(addDays(today, -4), 92)];
    it("counts what's done", () => {
      expect(dayAsk({ ...trained, acts: [...weeks, ...hardTwice] }, today)).toBe("steady");
      expect(dayAsk({ ...trained, acts: [...weeks, hardTwice[0]!] }, today)).toBe("quality");
    });
    it("counts what's planned too", () => {
      const events = [
        event(addDays(today, 3), "WORKOUT", {
          name: "A",
          moving_time: 3600,
          icu_training_load: 100,
        }),
        event(addDays(today, 5), "WORKOUT", {
          name: "B",
          moving_time: 3600,
          icu_training_load: 100,
        }),
      ];
      expect(dayAsk({ ...trained, events }, today)).toBe("steady");
    });
    it("lets a day through once the week has moved on", () => {
      expect(dayAsk({ ...trained, acts: [...weeks, ...hardTwice] }, addDays(today, 4))).toBe(
        "quality",
      );
    });
    it("never lets a typed kind be refused", () => {
      const s = suggestDay({ ...trained, acts: [...weeks, ...hardTwice] }, today, { kind: "vo2" });
      expect(s.picks.length).toBeGreaterThan(0);
      expect(s.harderThanAsked).toBe(true);
    });
    it("holds across the week's edge", () => {
      const acts = [...weeks, ...hardTwice];
      const w = suggestWeek({ ...trained, acts }, today, addDays(today, 6));
      expect(w.days[0]!.ask).not.toBe("quality");
      for (const d of w.days.filter((x) => x.ask === "quality"))
        expect(hardCountForTest(w.days, acts, d.date)).toBeLessThanOrEqual(2);
    });
  });
  const hardCountForTest = (
    days: { date: string; ask: string }[],
    acts: Activity[],
    date: string,
  ) => {
    const hard = new Set([
      ...acts
        .filter((a) => (a.icu_intensity ?? 0) >= 85)
        .map((a) => a.start_date_local.slice(0, 10)),
      ...days.filter((d) => d.ask === "quality").map((d) => d.date),
    ]);
    let most = 0;
    for (let s = -6; s <= 0; s++) {
      let n = 0;
      for (let i = 0; i < 7; i++) if (hard.has(addDays(date, s + i))) n++;
      most = Math.max(most, n);
    }
    return most;
  };

  describe("what counts as hard", () => {
    it("crosses sports: a hard ride blocks a hard run", () => {
      const acts = [...(runner.acts ?? []), act(addDays(today, -1), 95)];
      expect(dayAsk({ ...runner, acts }, today)).toBe("steady");
    });
    it("counts a big ride by its work, not an ordinary one", () => {
      const ride = (kj: number) =>
        ({ ...act(addDays(today, -1), 65, 14400), joules: kj * 1000 }) as Activity;
      const on = (kj: number) =>
        dayAsk({ ...trained, weight: 70, acts: [...weeks, ride(kj)] }, today);
      expect(on(2400)).toBe("steady");
      expect(on(1000)).toBe("quality");
    });
    it("counts a run near your longest", () => {
      const long = tokm(addDays(today, -1), 10, 80 * 60);
      expect(dayAsk({ ...runner, acts: [...runner.acts, long] }, today)).toBe("steady");
      const short = tokm(addDays(today, -1), 10, 40 * 60);
      expect(dayAsk({ ...runner, acts: [...runner.acts, short] }, today)).toBe("quality");
    });
  });

  describe("a run beyond your recent longest", () => {
    // 10 km in an hour: about 2.8 m/s. The cap is 11 km, about 66 minutes.
    it("is never the suggestion", () => {
      for (const d of [0, 1, 2, 3, 4, 5, 6])
        for (const p of suggestDay(runner, addDays(today, d)).picks)
          expect(p.workout.seconds * (10000 / 3600)).toBeLessThanOrEqual(11000);
    });
    it("nor in a week's long day", () => {
      for (const d of suggestWeek(runner, today, addDays(today, 6)).days)
        for (const p of d.picks)
          expect(p.workout.seconds * (10000 / 3600)).toBeLessThanOrEqual(11000);
    });
    it("is offered and said when you ask by time", () => {
      const s = suggestDay(runner, today, { minutes: 120, kind: "endurance" });
      expect(s.picks.length).toBeGreaterThan(0);
      for (const p of s.picks)
        expect(!!p.overLongest).toBe(p.workout.seconds * (10000 / 3600) > 11000);
      expect(s.picks.some((p) => p.overLongest)).toBe(true);
    });
    it("doesn't count rides", () => {
      const ride = { ...tokm(addDays(today, -1), 100, 14400, "Ride") } as Activity;
      const before = suggestDay(runner, addDays(today, 3)).picks.map((p) => p.workout.id);
      const after = suggestDay({ ...runner, acts: [...runner.acts, ride] }, addDays(today, 3));
      expect(after.picks.map((p) => p.workout.id)).toEqual(before);
    });
    it("merges runs under 15 minutes apart", () => {
      const a = tokm(addDays(today, -2), 8, 2880);
      const b = {
        ...tokm(addDays(today, -2), 8, 2880),
        id: "b",
        start_date_local: `${addDays(today, -2)}T09:50:00`,
      } as Activity;
      const s = suggestDay({ ...runner, acts: [a, b] }, addDays(today, 3), { minutes: 90 });
      expect(s.picks[0]!.overLongest).toBeUndefined();
    });
    it("doesn't cap a very short baseline at nothing", () => {
      const short = { ...runner, acts: [tokm(addDays(today, -2), 2, 720)] };
      const s = suggestDay(short, addDays(today, 3));
      expect(s.picks.length).toBeGreaterThan(0);
      expect(["endurance", "recovery"]).toContain(s.picks[0]!.workout.kind);
    });
    it("leaves cycling alone", () => {
      expect(suggestDay(trained, today).picks.some((p) => p.overLongest)).toBe(false);
    });
  });

  describe("the morning's parts get their own say", () => {
    const hrv = (week: number) =>
      Array.from({ length: 35 }, (_, i) => ({
        id: addDays(today, -i),
        hrv: i < 7 ? week : 60 + (i % 3),
        sleepSecs: null,
        sleepQuality: null,
        ctl: 50,
        atl: 50,
        stress: null,
        fatigue: null,
        mood: null,
      }));
    it("a low feel stops a hard session even with a high score", () => {
      expect(dayAsk({ ...trained, score: 90, feel: 30 }, today)).toBe("steady");
      expect(dayAsk({ ...trained, score: 90, feel: 80 }, today)).toBe("quality");
    });
    it("clearly short sleep does too", () => {
      expect(dayAsk({ ...trained, score: 90, sleep: 20 }, today)).toBe("steady");
      expect(dayAsk({ ...trained, score: 90, sleep: 60 }, today)).toBe("quality");
    });
    it("a low week of HRV with a low feel steps down further", () => {
      expect(dayAsk({ ...trained, score: 90, feel: 30, wellness: hrv(40) }, today)).toBe("easy");
    });
    it("a low week of HRV alone doesn't", () => {
      expect(dayAsk({ ...trained, score: 90, wellness: hrv(40) }, today)).toBe("quality");
    });
    it("a high week of HRV is no bonus", () => {
      expect(dayAsk({ ...trained, score: 60, wellness: hrv(90) }, today)).toBe("steady");
    });
  });

  describe("picking formats", () => {
    it("rotates by what you did lately", () => {
      const first = suggestDay(trained, today).picks[0]!.workout;
      const done = { ...act(addDays(today, -6), 95), name: first.name } as Activity;
      const next = suggestDay({ ...trained, acts: [...weeks, done] }, today).picks[0]!.workout;
      expect(next.name).not.toBe(first.name);
      expect(next.kind).toBe(first.kind);
    });
    it("doesn't lead with sweet spot where threshold fits", () => {
      const aerobic = { ...trained, focus: "aerobic" as const };
      for (const d of [0, 1, 2, 3])
        expect(suggestDay(aerobic, addDays(today, d)).picks[0]?.workout.id ?? "").not.toMatch(
          /sweet-spot/,
        );
    });
    it("never leads with low cadence", () => {
      for (const focus of ["base", "aerobic", "vo2", "anaerobic", "sprint"] as const)
        for (const minutes of [undefined, 60, 75, 90]) {
          const s = suggestDay({ ...trained, focus }, today, { minutes });
          expect(s.picks[0]?.workout.id ?? "").not.toMatch(/big-gear|torque|low-cadence/);
        }
    });
    it("leaves test warm-ups out and race warm-ups out", () => {
      expect(base.pool.some((w) => /ftp-test|race-warmup/.test(w.id))).toBe(false);
    });
    it("gives an anaerobic block one such session a week", () => {
      const w = suggestWeek({ ...trained, focus: "anaerobic" }, today, addDays(today, 13));
      const kinds = w.days.flatMap((d) =>
        d.ask === "quality" && d.picks[0] ? [d.picks[0].workout.kind] : [],
      );
      expect(kinds.filter((k) => k === "anaerobic").length).toBeLessThanOrEqual(1);
    });
    it("moves on after six weeks in a block", () => {
      const old = { ...trained, focus: "aerobic" as const, blockSince: addDays(today, -50) };
      const s = suggestDay(old, today);
      expect(s.picks[0]!.workout.kind).toBe("vo2");
      expect(s.picks[0]!.why).toBe("Per variare");
      const young = { ...old, blockSince: addDays(today, -10) };
      expect(suggestDay(young, today).picks[0]!.workout.kind).toBe("threshold");
    });
    it("respects a block you chose yourself", () => {
      const pinned = { ...trained, focus: "aerobic" as const, blockSince: null };
      expect(suggestDay(pinned, today).picks[0]!.workout.kind).toBe("threshold");
    });
    it("says when a session only maintains", () => {
      const s = suggestDay({ ...trained, focus: "vo2" }, today, { minutes: 30 });
      const short = s.picks.find((p) => /per mantenere/.test(p.why));
      if (short) expect(short.workout.seconds).toBeLessThanOrEqual(30 * 60 * 1.15);
      expect(suggestDay(trained, today).picks[0]!.why).toBe("Il tuo blocco");
    });
  });

  describe("long days and short weeks", () => {
    it("grows the long day from your own longest", () => {
      const of = (mins: number) => {
        const acts = [...weeks, act(addDays(today, -7), 65, mins * 60)];
        const w = suggestWeek({ ...trained, acts }, today, addDays(today, 6));
        return w.days.find((d) => d.ask === "long")?.picks[0]?.workout.seconds ?? 0;
      };
      expect(of(240)).toBeGreaterThanOrEqual(of(100));
    });
    it("doesn't call a session long when it isn't", () => {
      const week = suggestWeek({ ...trained, acts: weeks }, today, addDays(today, 6));
      for (const d of week.days)
        if (d.picks[0]?.why === "Lungo")
          expect(d.picks[0].workout.seconds).toBeGreaterThan(5400 * 1.1);
    });
    it("imposes no minimum on someone who rides short", () => {
      const acts = Array.from({ length: 12 }, (_, i) => act(addDays(today, -2 - i * 2), 65, 2400));
      const w = suggestWeek({ ...trained, acts }, today, addDays(today, 6));
      const long = w.days.find((d) => d.ask === "long");
      if (long?.picks[0]) expect(long.picks[0].workout.seconds).toBeLessThan(2 * 3600);
    });
    it("keeps two sessions in a very short week", () => {
      const acts = [act(addDays(today, -3), 65, 1800), act(addDays(today, -8), 65, 1800)];
      const w = suggestWeek({ ...trained, acts }, today, addDays(today, 6));
      expect(w.sessions).toBeGreaterThanOrEqual(2);
    });
  });

  describe("back from a break", () => {
    const back = (gap: number, ago = 3) => [
      ...weeks.map((a) => ({
        ...a,
        start_date_local: `${addDays(a.start_date_local.slice(0, 10), -gap)}T09:00:00`,
      })),
      act(addDays(today, -ago), 65),
    ];
    it("gives one hard day at most", () => {
      const w = suggestWeek({ ...trained, acts: back(20) }, today, addDays(today, 6));
      expect(w.days.filter((d) => d.ask === "quality").length).toBeLessThanOrEqual(1);
    });
    it("counts time off on the calendar", () => {
      const offEvents = [event(addDays(today, -5), "SICK", { end: addDays(today, -2) })];
      const w = suggestWeek({ ...trained, offEvents }, today, addDays(today, 6));
      expect(w.days.filter((d) => d.ask === "quality").length).toBeLessThanOrEqual(1);
    });
    it("marks old targets as approximate after a long break", () => {
      expect(suggestDay({ ...trained, acts: back(30) }, today).picks[0]!.target).toMatch(/^~/);
      expect(suggestDay({ ...trained, acts: back(16) }, today).picks[0]!.target).not.toMatch(/^~/);
    });
    it("goes back to normal two weeks on", () => {
      const w = suggestWeek({ ...trained, acts: back(20, 20) }, today, addDays(today, 6));
      expect(w.days.length).toBe(7);
      expect(dayAsk({ ...trained, acts: weeks }, today)).toBe("quality");
    });
  });

  describe("the load ratio", () => {
    const rows = (ctl: number, atl: number) => [
      {
        id: today,
        hrv: null,
        sleepSecs: null,
        sleepQuality: null,
        ctl,
        atl,
        stress: null,
        fatigue: null,
        mood: null,
      },
    ];
    it("no longer holds a day back by itself", () => {
      expect(dayAsk({ ...trained, wellness: rows(50, 90), form: 0 }, addDays(today, 2))).toBe(
        "quality",
      );
    });
    it("leaves deep form as a soft guard for the next days only", () => {
      expect(dayAsk({ ...trained, form: -30 }, addDays(today, 2))).toBe("steady");
      expect(dayAsk({ ...trained, form: -30 }, addDays(today, 5))).toBe("quality");
    });
  });
});
