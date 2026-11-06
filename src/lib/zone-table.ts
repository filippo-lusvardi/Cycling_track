// Zones as rows to read: number, name and range. The Zone tab and the typed answers both use these.
import { ZONE_NAMES } from "./analysis";
import { t } from "./i18n";
import { formatPace } from "./pace";
import { paceZoneTops, RUN_ZONE_NAMES } from "./run-metrics";
import type { MainSport } from "./sport";

export type ZoneRow = { zone: number; name: string; range: string };

export const zoneNames = (sport: MainSport) => (sport === "run" ? RUN_ZONE_NAMES : ZONE_NAMES);

/** Rows from each zone's upper bound; the last zone is open whatever its top says. */
function fromTops(tops: number[], unit: string, names: readonly string[]): ZoneRow[] {
  return tops.map((top, i) => {
    const low = Math.round(tops[i - 1] ?? 0);
    const range =
      i === 0
        ? `< ${Math.round(top)} ${unit}`
        : i === tops.length - 1
          ? `> ${low} ${unit}`
          : `${low + 1}–${Math.round(top)} ${unit}`;
    return { zone: i + 1, name: names[i] ?? "", range };
  });
}

export const powerRows = (tops: number[]) => fromTops(tops, "W", ZONE_NAMES);

/** Heart-rate zones by name: "FTP" means nothing for a heart rate, so Z4 reads as threshold on the bike too. */
export const hrZoneNames = (sport: MainSport): readonly string[] =>
  zoneNames(sport).map((n, i) => (i === 3 ? t("Threshold", "Soglia") : n));

export const hrRows = (tops: number[], sport: MainSport) =>
  fromTops(tops, "bpm", hrZoneNames(sport));

/** Pace runs the other way: zone 1 is the slowest, and its top is the speed where it ends. */
export function paceRows(threshold: number, pct?: number[] | null): ZoneRow[] {
  const tops = paceZoneTops(threshold, pct);
  return tops.map((top, i) => ({
    zone: i + 1,
    name: RUN_ZONE_NAMES[i] ?? "",
    range:
      i === 0
        ? `> ${formatPace(top)}`
        : i === tops.length - 1
          ? `< ${formatPace(tops[i - 1])}`
          : `${formatPace(tops[i - 1])}–${formatPace(top)}`,
  }));
}
