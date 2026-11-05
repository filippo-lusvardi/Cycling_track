// A stretch of time, past or ahead, in one place: what happened, how the body was, what's planned.
import { threeZone } from "./analysis";
import { activityKind, type Kind } from "./activity-kind";
import { daysIn, shiftSpan, type Span } from "./ask-when";
import {
  isPlanned,
  type Activity,
  type OffKind,
  type PlannedEvent,
  type Wellness,
} from "./intervals";
import { addDays } from "./training";

export type Totals = { count: number; secs: number; km: number; climb: number; load: number };

const emptyTotals = (): Totals => ({ count: 0, secs: 0, km: 0, climb: 0, load: 0 });

function totalsOf(acts: Activity[]): Totals {
  const t = emptyTotals();
  for (const a of acts) {
    t.count++;
    t.secs += a.moving_time ?? 0;
    t.km += (a.distance ?? 0) / 1000;
    t.climb += a.total_elevation_gain ?? 0;
    t.load += a.icu_training_load ?? 0;
  }
  return t;
}

const dayOf = (a: Activity) => a.start_date_local.slice(0, 10);
const mean = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);

export type RecapWeek = { start: string; end: string; secs: number; load: number };

export type Recap = {
  /** Whole days already lived in the stretch. */
  pastDays: number;
  acts: Activity[];
  totals: Totals;
  byKind: { kind: Kind; totals: Totals }[];
  restDays: number;
  offDays: { sick: number; injured: number };
  sleepSecs: number | null;
  hrv: number | null;
  /** HRV over the 60 days before the stretch. */
  usualHrv: number | null;
  ctl: { from: number; to: number } | null;
  /** Shares of low, middle and high intensity, 0 to 1. */
  mix: { low: number; mid: number; high: number } | null;
  /** Week by week, on stretches long enough to have a shape. */
  weeks: RecapWeek[];
  longest: Activity[];
  /** Your own stretch before this one, for the small line that compares them. */
  before: { totals: Totals; restDays: number; span: Span } | null;
  planned: PlannedEvent[];
  plannedSecs: number;
  plannedLoad: number;
};

function restIn(acts: Activity[], off: Map<string, OffKind>, from: string, to: string) {
  const trained = new Set(acts.map(dayOf));
  let rest = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) if (!trained.has(d) && !off.has(d)) rest++;
  return rest;
}

export function buildRecap(input: {
  span: Span;
  today: string;
  acts: Activity[];
  wellness: Wellness[];
  events: PlannedEvent[];
  off: Map<string, OffKind>;
}): Recap {
  const { span, today, wellness, events, off } = input;
  const pastTo = span.to < today ? span.to : today;
  const hasPast = span.from <= today;
  const acts = hasPast
    ? input.acts
        .filter((a) => dayOf(a) >= span.from && dayOf(a) <= pastTo)
        .sort((a, b) => b.start_date_local.localeCompare(a.start_date_local))
    : [];
  const pastDays = hasPast ? daysIn({ from: span.from, to: pastTo }) : 0;

  const kinds = new Map<Kind, Activity[]>();
  for (const a of acts) kinds.set(activityKind(a), [...(kinds.get(activityKind(a)) ?? []), a]);
  const byKind = [...kinds.entries()]
    .map(([kind, list]) => ({ kind, totals: totalsOf(list) }))
    .sort((a, b) => b.totals.secs - a.totals.secs);

  const offDaysCount = { sick: 0, injured: 0 };
  if (hasPast)
    for (let d = span.from; d <= pastTo; d = addDays(d, 1)) {
      if (off.get(d) === "SICK") offDaysCount.sick++;
      if (off.get(d) === "INJURED") offDaysCount.injured++;
    }

  const within = wellness.filter((w) => w.id >= span.from && w.id <= pastTo);
  const usual = wellness.filter((w) => w.id >= addDays(span.from, -60) && w.id < span.from);
  const withCtl = within.filter((w) => w.ctl != null).sort((a, b) => a.id.localeCompare(b.id));

  const zoneSum: number[] = [];
  for (const a of acts) a.zoneTimes?.forEach((s, i) => (zoneSum[i] = (zoneSum[i] ?? 0) + s));

  const weeks: RecapWeek[] = [];
  if (hasPast && daysIn(span) >= 21) {
    for (let start = span.from; start <= pastTo; start = addDays(start, 7)) {
      const last = addDays(start, 6);
      const end = last > pastTo ? pastTo : last;
      const here = acts.filter((a) => dayOf(a) >= start && dayOf(a) <= end);
      weeks.push({
        start,
        end,
        secs: here.reduce((s, a) => s + (a.moving_time ?? 0), 0),
        load: here.reduce((s, a) => s + (a.icu_training_load ?? 0), 0),
      });
    }
    weeks.reverse();
  }

  let before: Recap["before"] = null;
  if (hasPast && span.to <= today && daysIn(span) > 1) {
    const prev = shiftSpan(span, -1);
    const theirs = input.acts.filter((a) => dayOf(a) >= prev.from && dayOf(a) <= prev.to);
    before = {
      span: prev,
      totals: totalsOf(theirs),
      restDays: restIn(theirs, off, prev.from, prev.to),
    };
  }

  const planFrom = span.from > today ? span.from : today;
  const planned = events
    .filter((e) => e.date >= planFrom && e.date <= span.to && isPlanned(e))
    // What was planned for today stops being news once today has an activity.
    .filter((e) => e.date !== today || !acts.some((a) => dayOf(a) === today))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    pastDays,
    acts,
    totals: totalsOf(acts),
    byKind,
    restDays: hasPast ? restIn(acts, off, span.from, pastTo) : 0,
    offDays: offDaysCount,
    sleepSecs: mean(within.flatMap((w) => (w.sleepSecs ? [w.sleepSecs] : []))),
    hrv: mean(within.flatMap((w) => (w.hrv ? [w.hrv] : []))),
    usualHrv: mean(usual.flatMap((w) => (w.hrv ? [w.hrv] : []))),
    ctl: withCtl.length > 1 ? { from: withCtl[0]!.ctl!, to: withCtl.at(-1)!.ctl! } : null,
    mix: threeZone(zoneSum),
    weeks,
    longest: [...acts].sort((a, b) => (b.moving_time ?? 0) - (a.moving_time ?? 0)).slice(0, 2),
    before,
    planned,
    plannedSecs: planned.reduce((s, e) => s + (e.moving_time ?? 0), 0),
    plannedLoad: planned.reduce((s, e) => s + (e.icu_training_load ?? 0), 0),
  };
}
