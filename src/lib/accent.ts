// The app's accent colour (buttons, links, the active nav item, focus rings) following today's readiness season, as
// the crown does: fresh green in spring, leaf green in summer, amber in autumn, icy blue in winter. Each tone is light
// enough to carry the dark text buttons use. Off, the accent is the classic blue of styles.css.
import { LAST_SEASON, readSetting, SEASON_ACCENT, writeSetting } from "./settings";
import type { Season } from "./tree";

export const SEASON_ACCENT_COLOR: Record<Season, string> = {
  spring: "oklch(0.84 0.14 130)",
  summer: "oklch(0.78 0.13 155)",
  autumn: "oklch(0.78 0.14 60)",
  winter: "oklch(0.86 0.06 230)",
};

/** Whether the accent follows the season on this device (on unless turned off). */
export const accentFollowsSeason = () => readSetting<boolean>(SEASON_ACCENT) !== false;

/** Set the accent from the setting and the last known season; call at startup and whenever either changes. */
export function applyAccent() {
  const root = document.documentElement.style;
  const season = readSetting<Season>(LAST_SEASON);
  const color = accentFollowsSeason() && season ? SEASON_ACCENT_COLOR[season] : null;
  for (const v of ["--primary", "--ring"])
    if (color) root.setProperty(v, color);
    else root.removeProperty(v);
}

/** Remember today's season (from the crown) and recolour the app if it changed. */
export function rememberSeason(season: Season | null) {
  if (!season || readSetting<Season>(LAST_SEASON) === season) return;
  writeSetting(LAST_SEASON, season);
  applyAccent();
}
