// What suggestions read, from what the app has loaded anyway. Read-only: unlike useFocus it never opens a training
// block, so asking the bar for a workout can't change anything.
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useLocalStore } from "@/hooks/use-local-store";
import { computeFocus, type FocusState } from "@/lib/focus";
import {
  allActivitiesQuery,
  eventsQuery,
  offEventsQuery,
  powerCurvesQuery,
  racesQuery,
  rideZonesQuery,
  wellnessQuery,
  workoutsQuery,
} from "@/lib/queries";
import { raceFrom, type Focus } from "@/lib/races";
import { CHECK_IN, FOCUS_PIN, FOCUS_STATE, readSetting } from "@/lib/settings";
import { hasSource } from "@/lib/source";
import { knownRunThreshold, mainSport } from "@/lib/sport";
import { buildPool, type SuggestInput } from "@/lib/suggest";
import { addDays, isoDate } from "@/lib/training";
import { readinessFor, readinessRows } from "@/lib/readiness";
import { crownFor, morningWellness } from "@/lib/tree";

/** The block you're in, as the tree last settled it: your pin, then the last block. A pin has no start: it's your choice. */
function storedFocus(run: boolean): { focus: Focus; since: string | null } | null {
  const suffix = run ? "_run" : "";
  const pin = readSetting<Focus>(`${FOCUS_PIN}${suffix}`);
  if (pin) return { focus: pin, since: null };
  const blocks = readSetting<FocusState>(`${FOCUS_STATE}${suffix}`)?.blocks;
  return blocks?.[blocks.length - 1] ?? null;
}

export function useSuggestInput(): SuggestInput | undefined {
  const today = isoDate(new Date());
  const sport = mainSport();
  const enabled = hasSource();
  const { data: acts } = useQuery({ ...allActivitiesQuery(), enabled });
  const { data: wellness } = useQuery({ ...wellnessQuery(90), enabled });
  const { data: raceEvents } = useQuery({ ...racesQuery(today), enabled });
  const { data: events } = useQuery({
    ...eventsQuery({ oldest: today, newest: addDays(today, 90) }),
    enabled,
  });
  // Further ahead than the crown looks: a coming day can be marked too.
  const { data: offEvents } = useQuery({
    ...offEventsQuery({ oldest: addDays(today, -90), newest: addDays(today, 30) }),
    enabled,
  });
  const { data: workouts } = useQuery({ ...workoutsQuery(), enabled });
  const { data: zones } = useQuery({
    ...rideZonesQuery("ride"),
    enabled: enabled && sport !== "run",
  });
  const { data: curves } = useQuery({ ...powerCurvesQuery(), enabled: enabled && sport !== "run" });
  const [checkIn] = useLocalStore(CHECK_IN, true);
  const ftp = zones?.ftp ?? null;

  const pool = useMemo(() => {
    const th = { ftp, pace: knownRunThreshold() };
    return { th, list: buildPool(workouts ?? [], sport, th) };
  }, [workouts, sport, ftp]);

  return useMemo(() => {
    if (!acts || !wellness || !events || !raceEvents || !offEvents) return undefined;
    const races = raceEvents.map(raceFrom);
    const crown = crownFor(wellness, acts, today, offEvents, checkIn);
    const stored = storedFocus(sport === "run");
    const focus =
      stored?.focus ??
      computeFocus({
        races,
        today,
        acts,
        wellness,
        c42: curves?.find((c) => c.id.includes("42")),
        c1y: curves?.find((c) => c.id.includes("1y") || c.id.includes("365")),
        sport,
      }).focus;
    // This morning's parts, as the crown read them.
    const rows = checkIn ? wellness : readinessRows(wellness);
    const parts = readinessFor(morningWellness(rows, acts, today), today).components;
    const part = (key: string) => parts.find((c) => c.key === key)?.score ?? null;
    return {
      today,
      sport,
      focus,
      blockSince: stored?.since ?? null,
      focusPinned: stored?.since === null,
      feel: part("feel"),
      sleep: part("sleep"),
      weight:
        [...wellness].sort((a, b) => b.id.localeCompare(a.id)).find((w) => w.weight)?.weight ??
        null,
      races,
      events,
      offEvents,
      acts,
      wellness,
      score: crown.score,
      form: crown.form,
      th: pool.th,
      pool: pool.list,
    };
  }, [acts, wellness, events, raceEvents, offEvents, curves, checkIn, today, sport, pool]);
}
