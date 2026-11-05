// Which part of the legend is open, from anywhere: the typed questions, "All" and the first run all ask for it.
import { useSyncExternalStore } from "react";
import type { LegendTab } from "@/lib/ask";

export type LegendState = { term: string; tab: LegendTab } | null;

let state: LegendState = null;
const listeners = new Set<() => void>();

const set = (next: LegendState) => {
  state = next;
  listeners.forEach((l) => l());
};

export const openLegend = (term: string, tab: LegendTab) => set({ term, tab });
export const closeLegend = () => set(null);

export const useLegend = () =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
