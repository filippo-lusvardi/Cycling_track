// The two sports Cirmolo is built around. The main sport grows the tree; everything else goes to the garden.
// Pure functions take the sport as a parameter (a friend's tree in a forest follows their sport, not this device's);
// only routes and hooks read the setting, through mainSport().
import { activityKind, type Kind } from "./activity-kind";
import { t } from "./i18n";
import {
  ANALYSIS_BOTH,
  MAIN_SPORT,
  readSetting,
  RUN_THRESHOLD,
  RUN_THRESHOLD_EST,
  RUN_THRESHOLD_ICU,
  SOURCE,
} from "./settings";

export type MainSport = "ride" | "run";

/** Bike rides of every kind. */
export const RIDE_KINDS = new Set<Kind>(["road", "gravel", "mtb", "indoor", "ebike"]);

type Typed = { type: string | null; trainer?: boolean };

/** Which main sport an activity counts for; null for everything else (swims, gym, walks and hikes…). */
export function sportOfActivity(a: Typed): MainSport | null {
  const kind = activityKind(a);
  if (RIDE_KINDS.has(kind)) return "ride";
  return kind === "run" ? "run" : null;
}

export const isSport = (a: Typed, sport: MainSport) => sportOfActivity(a) === sport;

/** A sport's name and the words for its sessions, for text about a sport other than this device's (a forest's). */
export const sportWords = (sport: MainSport) =>
  sport === "run"
    ? {
        name: t("Running", "Corsa"),
        ride: "run",
        rides: "runs",
        Rides: "Runs",
        uscite: "corse",
        Uscite: "Corse",
        dellUscita: "della corsa",
      }
    : {
        name: t("Cycling", "Ciclismo"),
        ride: "ride",
        rides: "rides",
        Rides: "Rides",
        uscite: "uscite",
        Uscite: "Uscite",
        dellUscita: "dell'uscita",
      };

/** This device's main sport: cycling unless running was chosen. Changing it reloads the page (see MainSportPanel). */
export const mainSport = (): MainSport =>
  readSetting<MainSport>(MAIN_SPORT) === "run" ? "run" : "ride";

/** Whether Analysis offers both sports, not just the main one. */
export const analysisBoth = () => readSetting<boolean>(ANALYSIS_BOTH) === true;

/** The wording for this device's main sport. For text only: what's computed takes the sport as a parameter. */
export const byMain = <T>(ride: T, run: T): T => (mainSport() === "run" ? run : ride);

/** Threshold pace (m/s) as far as this device knows right now: set by hand, else last estimated; null before either. */
export const icuRunThreshold = () =>
  readSetting<string>(SOURCE) === "native" ? null : readSetting<number>(RUN_THRESHOLD_ICU);

/** The threshold pace in use: intervals.icu's, so the two apps agree; then one typed here; then the estimate. */
export const knownRunThreshold = () =>
  icuRunThreshold() ?? readSetting<number>(RUN_THRESHOLD) ?? readSetting<number>(RUN_THRESHOLD_EST);

/** Goes outdoors over a route: what the segment analysis looks at. */
export const isOutdoorActivity = (a: Typed) => {
  const sport = sportOfActivity(a);
  return sport != null && !a.trainer && !(a.type ?? "").startsWith("Virtual");
};
