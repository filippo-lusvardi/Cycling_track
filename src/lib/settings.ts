// Per-device settings in localStorage, JSON-encoded like useLocalStore so both can share keys.

export const API_KEY = "cadence_api_key";
export const GITHUB_TOKEN = "cadence_github_token";
export const GIST_ID = "cadence_gist_id";
export const SEGMENTS = "cadence_segments";
/** The sport that grows the tree, "ride" (default) or "run". Follows the account. */
export const MAIN_SPORT = "cadence_main_sport";
/** Analysis shows both sports, with a toggle between them. Follows the account. */
export const ANALYSIS_BOTH = "cadence_analysis_both";
/** The morning check-in is asked and its answers count toward readiness (true, the default). Follows the account. */
export const CHECK_IN = "cadence_check_in";
/** The Garden is part of the app (true, the default); off, for someone tracking one sport only. Follows the account. */
export const GARDEN = "cadence_garden";
/** Threshold pace set by hand (m/s), from the account. */
export const RUN_THRESHOLD = "cadence_run_threshold";
/** Threshold pace as intervals.icu has it (m/s), read with the athlete's zones: it wins, so the two apps agree. */
export const RUN_THRESHOLD_ICU = "cadence_run_threshold_icu";
/** Zone limits set by hand, as % of each threshold (see ZoneTops). Follows the account. */
export const ZONE_TOPS = "cadence_zone_tops";
/** Threshold pace last estimated on this device (m/s), for what can't wait for the analysis of every run. */
export const RUN_THRESHOLD_EST = "cadence_run_threshold_est";
/** How many years of rides the segment analysis covers (0 = all). */
export const SEGMENT_HISTORY = "cadence_segment_history";
/** UI language, "en" or "it". */
export const LANGUAGE = "cadence_language";
/** Hide scores on the Tree's home view until tapped. */
export const QUIET_TREE = "cadence_quiet_tree";
/** The training blocks chosen so far on this device (see lib/focus holdFocus). */
export const FOCUS_STATE = "cadence_focus";
/** A focus pinned by hand, overriding the computed one. */
export const FOCUS_PIN = "cadence_focus_pin";
/** Some of this account's activities come from Garmin devices, so derived views show Garmin's attribution. */
export const GARMIN = "cadence_garmin";
/** Where this account's training data comes from: "intervals" (default) or "native" (uploaded ride files). */
export const SOURCE = "cadence_source";
/** The app's colours follow today's tree, its season and weather (true, the default), or stay the classic blue. */
export const SEASON_ACCENT = "cadence_season_accent";
/** Today's readiness season as last computed on this device, so the colours are right from the first paint. */
export const LAST_SEASON = "cadence_last_season";
/** Today's form-weather and how fair it is within its kind, as last computed on this device, for the same reason. */
export const LAST_WEATHER = "cadence_last_weather";
/** The sports in the garden and which vegetable grows for each (a sport that's missing has no bed). Follows the account. */
export const GARDEN_CROPS = "cadence_garden_crops";
/** This device doesn't send speed measurements (Firebase Performance Monitoring). Kept across sign-outs. */
export const NO_PERF = "cadence_no_perf";

/** This device uses the bottom bar and its menu instead of asking the tree. */
export const CLASSIC_NAV = "cadence_classic_nav";
/** How each person has arranged the recap and activity pages. Follows the account. */
export const LAYOUTS = "cadence_layouts";
/** The legend has been shown once on this device. */
export const LEGEND_SEEN = "cadence_legend_seen";
/** The last activity opened on this device, so today's isn't asked about once it has been read. */
export const LAST_RIDE_SEEN = "cadence_last_ride_seen";

export function readSetting<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

/** Zone limits set by hand; a kind that's missing or null uses the standard percentages. */
export type ZoneTops = {
  power?: number[] | null;
  hr?: number[] | null;
  runHr?: number[] | null;
  pace?: number[] | null;
};
export const zoneTops = () => readSetting<ZoneTops>(ZONE_TOPS) ?? {};

/** Whether this account uses the morning check-in. */
export const checkInOn = () => readSetting<boolean>(CHECK_IN) !== false;

/** Whether this account has the Garden. */
export const gardenOn = () => readSetting<boolean>(GARDEN) !== false;

export function writeSetting<T>(key: string, value: T | null) {
  try {
    if (value == null || value === "") localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
    queueMicrotask(() => window.dispatchEvent(new CustomEvent("local-store", { detail: key })));
  } catch {
    /* storage unavailable */
  }
}
