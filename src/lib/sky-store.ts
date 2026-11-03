// What the page's sky shows beyond the hour: today's weather (Home and the Garden set it; the forests leave it clear)
// and how high the sun and moon may climb (below Home's recap). Read by the sky behind the page.
import { useSyncExternalStore } from "react";
import type { Weather } from "./tree";

export type SkyState = { weather: Weather | null; phase: number; peakPx: number | null };

let state: SkyState = { weather: null, phase: 0, peakPx: null };
const listeners = new Set<() => void>();

export function setSky(next: Partial<SkyState>) {
  const merged = { ...state, ...next };
  if (
    merged.weather === state.weather &&
    merged.phase === state.phase &&
    merged.peakPx === state.peakPx
  )
    return;
  state = merged;
  listeners.forEach((l) => l());
}

/** Back to a clear sky with the default heights (when a page that set them goes away). */
export const resetSky = () => setSky({ weather: null, phase: 0, peakPx: null });

export function useSkyState(): SkyState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}
