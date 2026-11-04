// A tree page's sky: today's form as the weather. The clouds sit between the top bar and the hills.
import { useEffect } from "react";
import { resetSky, setSky } from "@/lib/sky-store";
import type { Weather } from "@/lib/tree";

export function useTreeSky(weather: Weather | null, phase: number) {
  useEffect(() => {
    setSky({ weather, phase, peakPx: 90, horizonPx: window.innerHeight * 0.4 });
  }, [weather, phase]);
  useEffect(() => resetSky, []);
}
