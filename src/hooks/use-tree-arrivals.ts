// Works out what has happened to the tree since this device last saw it, once the tree is on screen, and marks it seen.
import { useCallback, useLayoutEffect, useMemo, useState } from "react";
import { RECENT_DAYS } from "@/components/tree/geometry";
import type { Held } from "@/components/tree/TreeRows";
import { planArrivals, returnShoots, type Arrivals, type Seen } from "@/lib/arrivals";
import { TREE_SEEN } from "@/lib/settings";
import type { TreeDay } from "@/lib/tree";

export type Play = Pick<Arrivals, "sap" | "birds"> & {
  /** The last empty day before the sap's ride, if it's a return from a long gap. */
  shootDay: string | null;
};

function readSeen(): Seen | null {
  try {
    const raw = localStorage.getItem(TREE_SEEN);
    return raw ? (JSON.parse(raw) as Seen) : null;
  } catch {
    return null;
  }
}

function writeSeen(seen: Seen) {
  try {
    localStorage.setItem(TREE_SEEN, JSON.stringify(seen));
  } catch {
    /* Private window or full storage: the tree just plays again next time. */
  }
}

const stillPlease = () =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** The day before a ride, when that day holds its return shoot. */
function shootBefore(days: TreeDay[], ride: string | null) {
  if (!ride) return null;
  const i = days.findIndex((d) => d.branches.some((b) => b.id === ride));
  const before = days[i + 1]?.date;
  return before && returnShoots(days).has(before) ? before : null;
}

export function useTreeArrivals(days: TreeDay[], ready: boolean) {
  const [play, setPlay] = useState<Play | null>(null);
  // Before paint, so a new branch is never seen for a moment and then taken away.
  useLayoutEffect(() => {
    if (!ready || play) return;
    const { sap, birds, next } = planArrivals(days, readSeen(), RECENT_DAYS);
    writeSeen(next);
    if ((sap || birds.length) && !stillPlease())
      setPlay({ sap, birds, shootDay: shootBefore(days, sap) });
  }, [days, ready, play]);
  const held = useMemo<Held | null>(
    () =>
      play && {
        ride: play.sap,
        shootDay: play.shootDay,
        birds: Object.fromEntries(
          play.birds.filter((c) => c.to > c.from).map((c) => [c.id, c.to - c.from]),
        ),
      },
    [play],
  );
  const done = useCallback(() => setPlay(null), []);
  return { play, held, done };
}
