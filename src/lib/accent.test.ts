import { beforeEach, describe, expect, it } from "vitest";
import { applyAccent, lastWeather, rememberTree, surfaceOf } from "./accent";
import { LAST_SEASON, readSetting, SEASON_ACCENT, writeSetting } from "./settings";

const root = () => document.documentElement;
const hue = () => root().style.getPropertyValue("--surface-h");

beforeEach(() => {
  localStorage.clear();
  root().removeAttribute("style");
  root().className = "";
});

describe("surfaceOf", () => {
  it("takes the season's hue", () => {
    expect(surfaceOf("autumn", "sun").hue).toBe(55);
    expect(surfaceOf("winter", "sun").hue).toBe(240);
  });

  it("loses colour and light as the weather worsens", () => {
    const [sun, partly, clouds, rain] = (["sun", "partly", "clouds", "rain"] as const).map((w) =>
      surfaceOf("summer", w),
    );
    expect(sun!.chroma).toBeGreaterThan(partly!.chroma);
    expect(partly!.chroma).toBeGreaterThan(clouds!.chroma);
    expect(clouds!.chroma).toBeGreaterThan(rain!.chroma);
    expect(sun!.lift).toBeGreaterThan(rain!.lift);
  });

  it("counts no weather as fair", () => {
    expect(surfaceOf("spring", null)).toEqual(surfaceOf("spring", "partly"));
  });
});

describe("the app's colours", () => {
  it("stay classic before there is a season", () => {
    applyAccent();
    expect(hue()).toBe("");
    expect(root().classList.contains("tree-colors")).toBe(false);
  });

  it("follow a new tree, season and weather both", () => {
    rememberTree("autumn", "sun", 0.5);
    expect(hue()).toBe("55");
    const sunny = root().style.getPropertyValue("--surface-c");
    expect(root().classList.contains("tree-colors")).toBe(true);
    rememberTree("autumn", "rain", 0.5);
    expect(root().style.getPropertyValue("--surface-c")).not.toBe(sunny);
    expect(lastWeather()).toEqual({ weather: "rain", phase: 0.5 });
  });

  it("keep the last tree on a day without values", () => {
    rememberTree("summer", "clouds", 0.2);
    rememberTree(null, null, 0);
    expect(readSetting(LAST_SEASON)).toBe("summer");
    expect(lastWeather()).toEqual({ weather: "clouds", phase: 0.2 });
  });

  it("go back to classic when the setting is off", () => {
    rememberTree("spring", "sun", 1);
    writeSetting(SEASON_ACCENT, false);
    applyAccent();
    expect(hue()).toBe("");
    expect(root().style.getPropertyValue("--primary")).toBe("");
    expect(root().classList.contains("tree-colors")).toBe(false);
  });
});
