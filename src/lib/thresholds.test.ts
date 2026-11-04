import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { icuPaceToSpeed, patchedSettings, saveThresholds, speedToIcuPace } from "./intervals";
import {
  HR_ZONE_PCT,
  hrZoneTops,
  OPEN_ZONE,
  POWER_ZONE_PCT,
  powerZoneTops,
  validZoneTops,
} from "./metrics";
import { ceiling } from "./readiness";
import { PACE_ZONE_PCT, paceZones, paceZoneTops } from "./run-metrics";
import {
  API_KEY,
  RUN_THRESHOLD,
  RUN_THRESHOLD_EST,
  RUN_THRESHOLD_ICU,
  SOURCE,
  writeSetting,
} from "./settings";
import { knownRunThreshold } from "./sport";

describe("zone limits", () => {
  it("are the standard ones unless set", () => {
    expect(powerZoneTops(200)).toEqual(POWER_ZONE_PCT.map((p) => Math.round(2 * p)));
    expect(powerZoneTops(200, null)).toEqual(powerZoneTops(200));
    expect(hrZoneTops(180)).toEqual(hrZoneTops(180, HR_ZONE_PCT));
    expect(paceZoneTops(4)).toEqual(paceZoneTops(4, PACE_ZONE_PCT));
  });
  it("move what's counted in each zone when set", () => {
    expect(powerZoneTops(200, [50, 60, 70, 80, 90, 100, OPEN_ZONE])[0]).toBe(100);
    const s = {
      gapHist: Array(40)
        .fill(0)
        .map((_, i) => (i === 15 ? 100 : 0)),
    };
    const usual = paceZones(s, 4);
    const moved = paceZones(s, 4, [10, 20, 30, 40, 50, 60, OPEN_ZONE]);
    expect(usual.reduce((a, b) => a + b, 0)).toBe(100);
    expect(moved).not.toEqual(usual);
  });
  it("must be seven, rising, with the last one open", () => {
    expect(validZoneTops(POWER_ZONE_PCT)).toBe(true);
    expect(validZoneTops(PACE_ZONE_PCT)).toBe(true);
    expect(validZoneTops([55, 75, 90, 105, 120, 150])).toBe(false);
    expect(validZoneTops([55, 75, 70, 105, 120, 150, OPEN_ZONE])).toBe(false);
    expect(validZoneTops([55, 55, 90, 105, 120, 150, OPEN_ZONE])).toBe(false);
    expect(validZoneTops([55, 75, 90, 105, 120, 150, 200])).toBe(false);
    expect(validZoneTops([0, 75, 90, 105, 120, 150, OPEN_ZONE])).toBe(false);
    expect(validZoneTops([NaN, 75, 90, 105, 120, 150, OPEN_ZONE])).toBe(false);
  });
  it("set today's pace ceiling", () => {
    const none = { power: [], hr: [] };
    expect(ceiling(60, none, 4)!.pace).toBeCloseTo(4 * 0.88);
    expect(ceiling(45, none, 4)!.pace).toBeCloseTo(4 * 0.78);
    expect(ceiling(60, none, 4, [50, 60, 70, 80, 90, 100, OPEN_ZONE])!.pace).toBeCloseTo(2.4);
  });
});

describe("intervals.icu's threshold pace", () => {
  it("is neither read nor written until its unit is known", () => {
    expect(icuPaceToSpeed(4)).toBeNull();
    const { next } = patchedSettings({ threshold_pace: 4 }, { pace: 3 });
    expect(next["threshold_pace"]).toBe(4);
  });
  it("converts both ways, whichever unit it turns out to be", () => {
    expect(icuPaceToSpeed(speedToIcuPace(4, "m/s"), "m/s")).toBe(4);
    expect(icuPaceToSpeed(speedToIcuPace(4, "s/km"), "s/km")).toBe(4);
    expect(speedToIcuPace(4, "s/km")).toBe(250);
    expect(icuPaceToSpeed(0, "m/s")).toBeNull();
    expect(icuPaceToSpeed(undefined, "m/s")).toBeNull();
  });
});

describe("the threshold pace in use", () => {
  beforeEach(() => localStorage.clear());
  it("prefers intervals.icu's, then one typed here, then the estimate", () => {
    writeSetting(RUN_THRESHOLD_EST, 3);
    expect(knownRunThreshold()).toBe(3);
    writeSetting(RUN_THRESHOLD, 4);
    expect(knownRunThreshold()).toBe(4);
    writeSetting(RUN_THRESHOLD_ICU, 5);
    expect(knownRunThreshold()).toBe(5);
  });
  it("ignores intervals.icu's without intervals.icu", () => {
    writeSetting(RUN_THRESHOLD, 4);
    writeSetting(RUN_THRESHOLD_ICU, 5);
    writeSetting(SOURCE, "native");
    expect(knownRunThreshold()).toBe(4);
  });
});

describe("writing thresholds to intervals.icu", () => {
  const stored = {
    id: 42,
    types: ["Ride"],
    ftp: 250,
    indoor_ftp: 240,
    lthr: 170,
    max_hr: 190,
    power_zones: [55, 75, 90, 105, 120, 150, 999],
    hr_zones: [1, 2, 3],
  };
  const calls: { url: string; method: string; body: unknown }[] = [];
  beforeEach(() => {
    calls.length = 0;
    localStorage.clear();
    writeSetting(API_KEY, "secret");
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      calls.push({
        url,
        method: init?.method ?? "GET",
        body: init?.body ? JSON.parse(init.body as string) : null,
      });
      const body = url.endsWith("/athlete/0") ? { sportSettings: [stored] } : stored;
      return new Response(JSON.stringify(body), { status: 200 });
    });
  });
  afterEach(() => vi.unstubAllGlobals());
  it("changes only what's asked, keeping every other setting", async () => {
    await saveThresholds("ride", { ftp: 255 });
    const put = calls.find((c) => c.method === "PUT")!;
    expect(put.url).toContain("/athlete/0/sport-settings/42?recalcHrZones=false");
    expect(put.body).toEqual({ ...stored, ftp: 255 });
  });
  it("asks for heart-rate zones to be redone only when heart rate changed", async () => {
    await saveThresholds("ride", { lthr: 172 });
    expect(calls.find((c) => c.method === "PUT")!.url).toContain("recalcHrZones=true");
    calls.length = 0;
    await saveThresholds("ride", { lthr: 170 });
    expect(calls.find((c) => c.method === "PUT")!.url).toContain("recalcHrZones=false");
  });
  it("refuses a sport intervals.icu has no settings for", async () => {
    await expect(saveThresholds("run", { lthr: 172 })).rejects.toThrow();
    expect(calls.some((c) => c.method === "PUT")).toBe(false);
  });
});
