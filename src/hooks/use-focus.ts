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
import {
  durabilityQuery,
  powerCurvesQuery,
  racesQuery,
  rideZonesQuery,
  runDataQuery,
} from "@/lib/queries";
import type { RunData } from "@/lib/run-data";
import {
  bestOfCurves,
  fadeProfile,
  paceZones,
  RUN_DUR,
} from "@/lib/run-metrics";
import { mainSport } from "@/lib/sport";
import { addDays } from "@/lib/training";
import { raceFrom, type Focus } from "@/lib/races";
import { FOCUS_PIN, FOCUS_STATE } from "@/lib/settings";

const FADE_DAYS = 90;
const FADE_MIN_SECS = 90 * 60;

/**
 * What the focus needs from a runner's runs: GAP curves in place of power ones (only ratios are taken from them, so
 * they fill the same shape), late-run fade, and each run's own drift, intensity and zones where its source has none.
 */
function runFocusInput(data: RunData, acts: Activity[], today: string) {
  const curve = (days: number) => {
    const since = addDays(today, -days);
    return {
      id: `${days}d`,
      label: `${days}d`,
      secs: RUN_DUR,
      watts: bestOfCurves(data.runs.filter((r) => r.date >= since).map((r) => r.s.gapCurve)).map(
        (v) => v ?? 0,
      ),
    };
  };
  const fadeSince = addDays(today, -FADE_DAYS);
  const byId = new Map(data.runs.map((r) => [r.a.id, r.s]));
  const threshold = data.threshold;
  return {
    c42: curve(42),
    c1y: curve(365),
    fade: fadeProfile(
      data.runs
        .filter((r) => r.date >= fadeSince && (r.a.moving_time ?? 0) >= FADE_MIN_SECS)
        .map((r) => r.s.fade),
    ),
    acts: acts.map((a): Activity => {
      const s = byId.get(a.id);
      if (!s) return a;
      return {
        ...a,
        decoupling: a.decoupling ?? s.drift,
        icu_intensity:
          a.icu_intensity ?? (threshold && s.ngp ? (s.ngp / threshold) * 100 : null),
        zoneTimes:
          threshold && !a.zoneTimes.some((z) => z > 0) ? paceZones(s, threshold) : a.zoneTimes,
      };
    }),
  };
}

/** Today's training focus: computed from races and power, held as a block on this device, or pinned by hand. */
export function useFocus(acts: Activity[], wellness: Wellness[], today: string) {
  const sport = mainSport();
  const isRun = sport === "run";
  const { data: events } = useQuery(racesQuery(today));
  const { data: curves } = useQuery({ ...powerCurvesQuery(), enabled: !isRun });
  const { data: zones } = useQuery(rideZonesQuery());
  const dur = useQuery({ ...durabilityQuery(), enabled: !isRun });
  const { data: runData } = useQuery({ ...runDataQuery(), enabled: isRun });
  // A block in one sport means nothing in the other: each keeps its own.
  const [state, setState] = useLocalStore<FocusState | null>(
    isRun ? `${FOCUS_STATE}_run` : FOCUS_STATE,
    null,
  );
  const [pin, setPin] = useLocalStore<Focus | null>(isRun ? `${FOCUS_PIN}_run` : FOCUS_PIN, null);
  const run = useMemo(() => (runData ? runFocusInput(runData, acts, today) : null), [runData, acts, today]);

  const races = useMemo(
    () => (events ?? []).map(raceFrom).sort((a, b) => a.date.localeCompare(b.date)),
    [events],
  );
  const c42 = isRun ? run?.c42 : curves?.find((c) => c.id.includes("42"));
  const c1y = isRun ? run?.c1y : curves?.find((c) => c.id.includes("1y") || c.id.includes("365"));
  const focusActs = isRun ? (run?.acts ?? acts) : acts;
  const result = useMemo(
    () =>
      computeFocus({
        races,
        today,
        acts: focusActs,
        wellness,
        c42,
        c1y,
        durability: dur.data ?? null,
        sport,
        fade: run?.fade ?? null,
      }),
    [races, today, focusActs, wellness, c42, c1y, dur.data, sport, run?.fade],
  );
  // Only once the races and the curves have loaded, so a cold start doesn't open a block on partial data.
  // Durability too (a failed load counts as done: it only adds a reason).
  const ready = isRun
    ? !!events && !!runData
    : !!events && !!curves && (dur.isFetched || dur.isError);
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
    session: focusSession({ focus, races, today, zones, c1y, sport, threshold: runData?.threshold ?? null }),
    why: focusWhy({ ...result, focus }, races, today, sport),
  };
}

export type FocusInfo = ReturnType<typeof useFocus>;
