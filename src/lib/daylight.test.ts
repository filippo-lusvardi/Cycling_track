import { describe, expect, it } from "vitest";
import { daylight, moonAge, sunTimes } from "./daylight";

// Times are built in the test runner's own time zone; the checks are about shape, with generous margins.
const at = (y: number, m: number, d: number, h: number, min = 0) => new Date(y, m - 1, d, h, min);

describe("daylight", () => {
  it("has long summer days and short winter ones at about 45° N", () => {
    const june = sunTimes(at(2026, 6, 21, 12));
    const dec = sunTimes(at(2026, 12, 21, 12));
    expect(june.sunset - june.sunrise).toBeGreaterThan(15);
    expect(june.sunset - june.sunrise).toBeLessThan(16);
    expect(dec.sunset - dec.sunrise).toBeGreaterThan(8.3);
    expect(dec.sunset - dec.sunrise).toBeLessThan(9.2);
  });

  it("is night at midnight with a moon, day at solar noon with a high sun", () => {
    const night = daylight(at(2026, 11, 3, 0, 30));
    expect(night.part).toBe("night");
    expect(night.light).toBe(0);
    expect(night.sun).toBeNull();
    expect(night.moon).not.toBeNull();
    const { sunrise, sunset } = sunTimes(at(2026, 11, 3, 12));
    const noonH = (sunrise + sunset) / 2;
    const noon = daylight(at(2026, 11, 3, Math.floor(noonH), Math.round((noonH % 1) * 60)));
    expect(noon.part).toBe("day");
    expect(noon.light).toBe(1);
    expect(noon.sun!.alt).toBeGreaterThan(0.95);
    expect(noon.moon).toBeNull();
  });

  it("glows at sunrise, the sun low at the left", () => {
    const { sunrise } = sunTimes(at(2026, 11, 3, 12));
    const d = daylight(at(2026, 11, 3, Math.floor(sunrise), Math.round((sunrise % 1) * 60) + 5));
    expect(d.part).toBe("dawn");
    expect(d.glow).toBeGreaterThan(0.8);
    expect(d.sun!.x).toBeLessThan(0.05);
    expect(d.light).toBeGreaterThan(0.3);
    expect(d.light).toBeLessThan(1);
  });

  it("knows the moon's phase", () => {
    // 2026-01-03 was a full moon, 2026-01-18 a new moon.
    expect(Math.abs(moonAge(new Date(Date.UTC(2026, 0, 3, 10))) - 0.5)).toBeLessThan(0.04);
    const nm = moonAge(new Date(Date.UTC(2026, 0, 18, 19)));
    expect(Math.min(nm, 1 - nm)).toBeLessThan(0.04);
  });
});
