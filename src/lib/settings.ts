// Per-device settings in localStorage, JSON-encoded like useLocalStore so both can share keys.

export const API_KEY = "cadence_api_key";
export const GITHUB_TOKEN = "cadence_github_token";
export const GIST_ID = "cadence_gist_id";
export const SEGMENTS = "cadence_segments";
/** How many years of rides the segment analysis covers (0 = all). */
export const SEGMENT_HISTORY = "cadence_segment_history";

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

export const hasApiKey = () => !!readSetting<string>(API_KEY);
