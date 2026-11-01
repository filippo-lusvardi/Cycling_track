import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { useLocalStore } from "@/hooks/use-local-store";
import {
  computeFocus,
  dayRole,
  focusSession,
  focusWhy,
  holdFocus,
  racesKey,
  type FocusState,
} from "@/lib/focus";
import type { Activity, Wellness } from "@/lib/intervals";
import { durabilityQuery, powerCurvesQuery, racesQuery, rideZonesQuery } from "@/lib/queries";
import { raceFrom, type Focus } from "@/lib/races";
import { FOCUS_PIN, FOCUS_STATE } from "@/lib/settings";

/** Today's training focus: computed from races and power, held as a block on this device, or pinned by hand. */
export function useFocus(acts: Activity[], wellness: Wellness[], today: string) {
  const { data: events } = useQuery(racesQuery(today));
  const { data: curves } = useQuery(powerCurvesQuery());
  const { data: zones } = useQuery(rideZonesQuery());
  const dur = useQuery(durabilityQuery());
  const [state, setState] = useLocalStore<FocusState | null>(FOCUS_STATE, null);
  const [pin, setPin] = useLocalStore<Focus | null>(FOCUS_PIN, null);

  const races = useMemo(
    () => (events ?? []).map(raceFrom).sort((a, b) => a.date.localeCompare(b.date)),
    [events],
  );
  const c42 = curves?.find((c) => c.id.includes("42"));
  const c1y = curves?.find((c) => c.id.includes("1y") || c.id.includes("365"));
  const result = useMemo(
    () => computeFocus({ races, today, acts, wellness, c42, c1y, durability: dur.data ?? null }),
    [races, today, acts, wellness, c42, c1y, dur.data],
  );
  // Only once the races and the curves have loaded, so a cold start doesn't open a block on partial data.
  // Durability too (a failed load counts as done: it only adds a reason).
  const ready = !!events && !!curves && (dur.isFetched || dur.isError);
  const next = ready ? holdFocus(state, result.focus, today, racesKey(races)) : state;
  useEffect(() => {
    if (ready && JSON.stringify(next) !== JSON.stringify(state)) setState(() => next);
  }, [ready, next, state, setState]);

  const block = next?.blocks[next.blocks.length - 1] ?? null;
  const focus = pin ?? block?.focus ?? result.focus;
  return {
    focus,
    pinned: pin,
    setPin: (f: Focus | null) => setPin(() => f),
    since: pin ? null : (block?.since ?? null),
    blocks: next?.blocks ?? [],
    races,
    role: dayRole(races, today),
    session: focusSession({ focus, races, today, zones, c1y }),
    why: focusWhy({ ...result, focus }, races, today),
  };
}

export type FocusInfo = ReturnType<typeof useFocus>;
