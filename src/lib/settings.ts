// Per-device settings in localStorage, JSON-encoded like useLocalStore so both can share keys.

export const API_KEY = "cadence_api_key";
export const GITHUB_TOKEN = "cadence_github_token";
export const GIST_ID = "cadence_gist_id";
export const SEGMENTS = "cadence_segments";
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

export function readSetting<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function writeSetting<T>(key: string, value: T | null) {
  try {
    if (value == null || value === "") localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
    queueMicrotask(() => window.dispatchEvent(new CustomEvent("local-store", { detail: key })));
  } catch {
    /* storage unavailable */
  }
}

