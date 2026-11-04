// The app's colours following today's tree. The accent (buttons, links, the active nav item, focus rings) takes the
// season as the crown does. The surfaces (cards, bars, dialogs) take the season's hue, as saturated as the weather is
// fair: nearly grey in rain. Under the sky, styles.css also mixes in the hour's sky (`html.tree-colors`). The accent
// tones are light enough to carry the dark text buttons use; the surfaces stay dark enough for the data colours, which
// never change. Off, or before there is a season, the app is the classic blue of styles.css.
import { LAST_SEASON, LAST_WEATHER, readSetting, SEASON_ACCENT, writeSetting } from "./settings";
import type { Season, Weather } from "./tree";

export const SEASON_ACCENT_COLOR: Record<Season, string> = {
  spring: "oklch(0.84 0.14 130)",
  summer: "oklch(0.78 0.13 155)",
  autumn: "oklch(0.78 0.14 60)",
  winter: "oklch(0.86 0.06 230)",
};

const SEASON_SURFACE: Record<Season, { hue: number; chroma: number }> = {
  spring: { hue: 125, chroma: 0.032 },
  summer: { hue: 155, chroma: 0.032 },
  autumn: { hue: 55, chroma: 0.034 },
  winter: { hue: 240, chroma: 0.028 },
};

/** What the weather does to a season's surface: how much of its colour stays, how much lightness it adds. */
const WEATHER_SURFACE: Record<Weather, { keep: number; lift: number }> = {
  sun: { keep: 1.25, lift: 0.012 },
  partly: { keep: 1, lift: 0 },
  clouds: { keep: 0.65, lift: -0.008 },
  rain: { keep: 0.4, lift: -0.018 },
};

/** The surfaces' hue, chroma and lightness shift for a tree; no weather yet counts as fair. */
export function surfaceOf(season: Season, weather: Weather | null) {
  const { hue, chroma } = SEASON_SURFACE[season];
  const { keep, lift } = WEATHER_SURFACE[weather ?? "partly"];
  return { hue, chroma: Math.round(chroma * keep * 10000) / 10000, lift };
}

/** The Android status bar and the like, in the app's classic background (index.html). */
const CLASSIC_THEME = "#0b1220";

/** Whether the colours follow the tree on this device (on unless turned off). */
export const accentFollowsSeason = () => readSetting<boolean>(SEASON_ACCENT) !== false;

type LastWeather = { weather: Weather | null; phase: number };

/** Today's weather as last computed on this device. */
export const lastWeather = (): LastWeather =>
  readSetting<LastWeather>(LAST_WEATHER) ?? { weather: null, phase: 0 };

/** Set the colours from the setting and the last known tree; call at startup and whenever either changes. */
export function applyAccent() {
  const html = document.documentElement;
  const season = accentFollowsSeason() ? readSetting<Season>(LAST_SEASON) : null;
  const tree = season ? surfaceOf(season, lastWeather().weather) : null;
  const vars: Record<string, string | null> = {
    "--primary": season && SEASON_ACCENT_COLOR[season],
    "--ring": season && SEASON_ACCENT_COLOR[season],
    "--surface-h": tree && String(tree.hue),
    "--surface-c": tree && String(tree.chroma),
    "--surface-dl": tree && String(tree.lift),
    "--text-h": tree && String(tree.hue),
  };
  for (const [name, value] of Object.entries(vars))
    if (value) html.style.setProperty(name, value);
    else html.style.removeProperty(name);
  html.classList.toggle("tree-colors", !!tree);
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute(
      "content",
      tree
        ? `oklch(${(0.18 + tree.lift).toFixed(3)} ${(tree.chroma * 0.83).toFixed(4)} ${tree.hue})`
        : CLASSIC_THEME,
    );
}

/** Remember today's tree (mine, from the crown) and recolour the app if it changed. A day without a value keeps the last. */
export function rememberTree(season: Season | null, weather: Weather | null, phase: number) {
  const seasonChanged = !!season && readSetting<Season>(LAST_SEASON) !== season;
  const last = lastWeather();
  const weatherChanged = !!weather && last.weather !== weather;
  if (seasonChanged) writeSetting(LAST_SEASON, season);
  if (weather && (weatherChanged || last.phase !== phase))
    writeSetting(LAST_WEATHER, { weather, phase });
  if (seasonChanged || weatherChanged) applyAccent();
}
