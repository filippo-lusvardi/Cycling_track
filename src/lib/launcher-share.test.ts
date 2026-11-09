import { describe, expect, it } from "vitest";
import { SEASON_ACCENT_COLOR } from "./accent";
import { newLauncherKey, SEASON_ACCENT_HEX } from "./launcher-share";

describe("launcher share", () => {
  it("has a hex colour for every season accent", () => {
    expect(Object.keys(SEASON_ACCENT_HEX).sort()).toEqual(Object.keys(SEASON_ACCENT_COLOR).sort());
    for (const hex of Object.values(SEASON_ACCENT_HEX)) expect(hex).toMatch(/^#[0-9A-F]{6}$/);
  });

  it("makes long, URL-safe, distinct keys", () => {
    const a = newLauncherKey();
    expect(a).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(newLauncherKey()).not.toBe(a);
  });
});
