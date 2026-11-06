// The questions kept at hand, as the words they were typed in, so "questo mese" stays this month. Follows the account.
import { useCallback } from "react";
import { useLocalStore } from "@/hooks/use-local-store";
import { PINNED, readSetting, writeSetting } from "@/lib/settings";

export const MAX_PINS = 3;

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export function usePins() {
  const [pins, setPins] = useLocalStore<string[]>(PINNED, readSetting<string[]>(PINNED) ?? []);
  const isPinned = useCallback((q: string) => pins.some((p) => same(p, q)), [pins]);
  /** False when there's no room left. */
  const toggle = useCallback(
    (q: string) => {
      const next = pins.some((p) => same(p, q))
        ? pins.filter((p) => !same(p, q))
        : [...pins, q.trim()];
      if (next.length > MAX_PINS) return false;
      setPins(() => next);
      writeSetting(PINNED, next);
      void import("@/lib/cloud")
        .then(({ saveProfile }) => saveProfile({ pinned: JSON.stringify(next) }))
        .catch((e) => console.warn("Pinned questions not saved", e));
      return true;
    },
    [pins, setPins],
  );
  return { pins, isPinned, toggle };
}
