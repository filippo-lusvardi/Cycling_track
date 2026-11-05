import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createNote, isPlanned, readBack, scheduleWorkout, understoodSeconds } from "./intervals";
import { API_KEY, writeSetting } from "./settings";

const warning = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({ toast: { warning } }));

const ride = {
  name: "Prova",
  type: "Ride",
  description: "Warmup\n- 10m 60%\n\nMain set 2x\n- 5m 100%\n- 5m 50%",
};
const minutes30 = 30 * 60;

describe("what intervals.icu understood", () => {
  it("takes the workout's own duration first", () => {
    expect(
      understoodSeconds({ workout_doc: { duration: 1800, steps: [{}] }, moving_time: 5 }),
    ).toBe(1800);
  });
  it("counts a workout with no steps as nothing", () => {
    expect(understoodSeconds({ workout_doc: { steps: [] } })).toBe(0);
  });
  it("falls back on the time, and doesn't guess without one", () => {
    expect(understoodSeconds({ workout_doc: {}, moving_time: 600 })).toBe(600);
    expect(understoodSeconds({})).toBeNull();
    expect(understoodSeconds({ workout_doc: null })).toBeNull();
  });
});

describe("comparing it with our reading", () => {
  it("accepts small differences", () => {
    expect(readBack(ride, minutes30)).toBe("same");
    expect(readBack(ride, minutes30 * 1.04)).toBe("same");
  });
  it("flags a different length, and no steps at all", () => {
    expect(readBack(ride, minutes30 * 1.2)).toBe("different");
    expect(readBack(ride, 0)).toBe("different");
  });
  it("says nothing when there's nothing to compare", () => {
    expect(readBack(ride, null)).toBe("unknown");
    expect(readBack({ type: "Ride", description: "Easy with friends" }, 3600)).toBe("unknown");
    expect(readBack({ type: "Ride", description: "- 10km 80%" }, 3600)).toBe("unknown");
  });
});

describe("a note on the calendar", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("has no sport, so it never counts as something planned", async () => {
    localStorage.clear();
    writeSetting(API_KEY, "secret");
    let sent: Record<string, unknown> = {};
    vi.stubGlobal("fetch", async (_url: string, init?: RequestInit) => {
      sent = JSON.parse(init!.body as string);
      return new Response(JSON.stringify({ id: 5 }), { status: 200 });
    });
    await expect(createNote("Cirmolo plan", "testo", "2026-11-10")).resolves.toBe("5");
    expect(sent).toEqual({
      category: "NOTE",
      name: "Cirmolo plan",
      description: "testo",
      start_date_local: "2026-11-10T00:00:00",
    });
    expect(isPlanned({ category: "NOTE", type: null, description: "testo" })).toBe(false);
  });
});

describe("planning a workout", () => {
  let answer: object;
  let body: Record<string, unknown>;
  beforeEach(() => {
    localStorage.clear();
    writeSetting(API_KEY, "secret");
    warning.mockClear();
    vi.stubGlobal("fetch", async (_url: string, init?: RequestInit) => {
      body = JSON.parse(init!.body as string);
      return new Response(JSON.stringify(answer), { status: 200 });
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("sends the steps as text, and stays quiet when they're read the same", async () => {
    answer = { id: 7, workout_doc: { duration: minutes30, steps: [{}] } };
    await expect(scheduleWorkout(ride, "2026-11-10")).resolves.toBe("7");
    expect(body).toMatchObject({
      category: "WORKOUT",
      type: "Ride",
      description: ride.description,
      start_date_local: "2026-11-10T00:00:00",
    });
    expect(warning).not.toHaveBeenCalled();
  });
  it("warns, but still plans, when they're not", async () => {
    answer = { id: 8, workout_doc: { steps: [] } };
    await expect(scheduleWorkout(ride, "2026-11-10")).resolves.toBe("8");
    expect(warning).toHaveBeenCalledOnce();
  });
  it("stays quiet when the answer doesn't say", async () => {
    answer = { id: 9 };
    await scheduleWorkout(ride, "2026-11-10");
    expect(warning).not.toHaveBeenCalled();
  });
});
