// Every run's numbers, for the pages built from many runs. A run's streams are read at most once (its summary stays
// with the run), so only the first look at a long history takes time.
import { fillRunLoads, getActivities, getRunSummary } from "./source";
import type { Activity } from "./intervals";
import { bestOfCurves, estimateThreshold, type RunSummary, type ThresholdFit } from "./run-metrics";
import {
  readSetting,
  RUN_THRESHOLD,
  RUN_THRESHOLD_EST,
  SEGMENT_HISTORY,
  writeSetting,
} from "./settings";
import { icuRunThreshold, isSport } from "./sport";
import { addDays, isoDate } from "./training";

export type RunEntry = { a: Activity; date: string; s: RunSummary };

export type RunData = {
  runs: RunEntry[];
  /** Threshold pace in use (m/s); `manual` when set in Settings. */
  threshold: number | null;
  manual: boolean;
  /** What the last 90 days' efforts say, whatever is in use. */
  fit: ThresholdFit | null;
};

/** How far back runs are read: the same choice as the segment analysis's, so a long history stays optional. */
const historyFrom = (today: string) => {
  const years = readSetting<number>(SEGMENT_HISTORY) ?? 2;
  return years ? addDays(today, -365 * years) : "2000-01-01";
};

type Progress = { done: number; total: number } | null;
let progress: Progress = null;
const listeners = new Set<() => void>();
const setProgress = (p: Progress) => {
  progress = p;
  listeners.forEach((l) => l());
};
export const runProgress = {
  get: () => progress,
  subscribe(l: () => void) {
    listeners.add(l);
    return () => void listeners.delete(l);
  },
};

const FIT_DAYS = 90;

/** The threshold from the curves of the last 90 days. */
export function fitFrom(runs: Pick<RunEntry, "date" | "s">[], today: string) {
  const since = addDays(today, -FIT_DAYS);
  const curves = runs.filter((r) => r.date > since).map((r) => r.s.gapCurve);
  return curves.length ? estimateThreshold(bestOfCurves(curves)) : null;
}

export async function getRunData(): Promise<RunData> {
  const today = isoDate(new Date());
  const acts = (await getActivities({ oldest: historyFrom(today), newest: today })).filter((a) =>
    isSport(a, "run"),
  );
  const runs: RunEntry[] = [];
  let done = 0;
  // Newest first, two at a time; one that can't be read doesn't hold up the rest.
  for (let i = 0; i < acts.length; i += 2) {
    const batch = acts.slice(i, i + 2);
    const got = await Promise.all(
      batch.map((a) =>
        getRunSummary(a.id).catch((e) => {
          console.warn("Run not analysed", a.id, e);
          return null;
        }),
      ),
    );
    got.forEach((s, k) => {
      const a = batch[k]!;
      if (s) runs.push({ a, date: a.start_date_local.slice(0, 10), s });
    });
    done += batch.length;
    // Once the summaries come straight from the device there's nothing worth a progress bar.
    if (acts.length > 4) setProgress({ done, total: acts.length });
  }
  setProgress(null);
  const fit = fitFrom(runs, today);
  writeSetting(RUN_THRESHOLD_EST, fit?.speed ?? null);
  await fillRunLoads().catch((e) => console.warn("Run loads not filled", e));
  const set = icuRunThreshold() ?? readSetting<number>(RUN_THRESHOLD);
  return { runs, threshold: set ?? fit?.speed ?? null, manual: set != null, fit };
}
