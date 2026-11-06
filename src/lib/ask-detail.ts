// What an answer shows when it opens in the panel: a small chart, and chips that ask again with one thing changed. A chip
// is only a question in words, read like anything typed. Pure.
import { format as dateFormat, parseISO } from "date-fns";
import type { Here, Target } from "./ask-read";
import { monthSpan, shiftSpan, spanTitle, type Span } from "./ask-when";
import type { DistMetric } from "./distribution";
import { format, t } from "./i18n";
import type { PowerCurve } from "./intervals";
import { addDays } from "./training";

export type AskChip = { label: string; query: string; on?: boolean };

export type CurveView = {
  kind: "curve";
  unit: string;
  points: { secs: number; value: number }[];
  /** The length asked about, marked on the curve. */
  at: number | null;
};

export type DistributionView = {
  kind: "distribution";
  metric: DistMetric;
  ids: string[];
  days: number;
  /** The same question about the other metric, when it has one. */
  other?: string | undefined;
};

export type AskDetail = {
  view: CurveView | DistributionView;
  lengths?: AskChip[];
  prev?: AskChip;
  now?: string;
  next?: AskChip;
  /** What going to the full page is called. */
  open: string;
};

export const openWords = {
  ride: () => t("Open the activity", "Apri l'attività"),
  recap: () => t("Open the recap", "Apri il riepilogo"),
  curve: () => t("Open the curve", "Apri la curva"),
  zones: () => t("Open the zones", "Apri le zone"),
};

const CURVE_SECS = [5, 15, 30, 60, 120, 180, 300, 600, 1200, 2400, 3600];
const LENGTHS = [5, 60, 300, 1200, 3600];

export const lengthText = (secs: number) =>
  secs < 60 ? `${secs}s` : secs % 3600 === 0 ? `${secs / 3600}h` : `${Math.round(secs / 60)}m`;
const lengthLabel = (secs: number) =>
  secs < 60 ? `${secs} s` : secs < 3600 ? `${Math.round(secs / 60)} min` : `${secs / 3600} h`;

/** The lengths on offer, with the one asked about among them. */
export function lengthChips(at: number | null, ask: (length: string) => string): AskChip[] {
  const all =
    at != null && !LENGTHS.includes(at) ? [...LENGTHS, at].sort((a, b) => a - b) : LENGTHS;
  return all.map((secs) => ({
    label: lengthLabel(secs),
    query: ask(lengthText(secs)),
    ...(secs === at ? { on: true } : {}),
  }));
}

/** A curve from whatever reads a length: the streams of a day, or a stretch's curve. */
export function curveFrom(
  read: (secs: number) => number | null | undefined,
  at: number | null,
  unit: string,
): CurveView | null {
  const secs = at != null && !CURVE_SECS.includes(at) ? [...CURVE_SECS, at] : CURVE_SECS;
  const points = [...secs]
    .sort((a, b) => a - b)
    .flatMap((s) => {
      const value = read(s);
      return value ? [{ secs: s, value }] : [];
    });
  return points.length >= 2 ? { kind: "curve", unit, points, at } : null;
}

export const curveOf = (c: PowerCurve | undefined, at: number | null, unit: string) =>
  c
    ? curveFrom(
        (secs) => {
          const i = c.secs.findIndex((s) => s >= secs);
          return i >= 0 ? c.watts[i] : null;
        },
        at,
        unit,
      )
    : null;

const wholeMonth = (s: Span) => {
  const m = monthSpan(Number(s.from.slice(0, 4)), Number(s.from.slice(5, 7)) - 1);
  return m.from === s.from && m.to === s.to;
};
const wholeYear = (s: Span) =>
  s.from.endsWith("-01-01") && s.to.endsWith("-12-31") && s.from.slice(0, 4) === s.to.slice(0, 4);
const longDay = (day: string) => format(parseISO(day), "d MMMM yyyy").toLowerCase();

/**
 * A stretch in words the bar reads whatever the app's language. Today and yesterday stay words, so that a question pinned
 * after tapping a chip keeps meaning today.
 */
export function spanPhrase(s: Span, today?: string): string {
  if (today && s.from === s.to && s.from === today) return t("today", "oggi");
  if (today && s.from === s.to && s.from === addDays(today, -1)) return t("yesterday", "ieri");
  if (wholeYear(s)) return s.from.slice(0, 4);
  if (wholeMonth(s)) return format(parseISO(s.from), "MMMM yyyy").toLowerCase();
  if (s.from === s.to) return longDay(s.from);
  return `dal ${longDay(s.from)} al ${longDay(s.to)}`;
}

/** The target in words; nothing when it's the page being read, which a question names by not naming anything. */
export function targetPhrase(target: Target, here?: Here | null, today?: string): string {
  if (target.kind === "ride")
    return here?.kind === "ride" && here.id === target.id ? "" : target.name;
  if (here?.kind === "recap" && here.from === target.from && here.to === target.to) return "";
  return spanPhrase(target, today);
}

const spanLabel = (s: Span, today: string) =>
  wholeMonth(s) ? dateFormat(parseISO(s.from), "MM/yyyy") : spanTitle(s, today);

/** Before and after, for a stretch: never into what hasn't happened. */
export function aroundChips(
  target: Target,
  today: string,
  ask: (phrase: string) => string,
): Pick<AskDetail, "prev" | "next" | "now"> {
  if (target.kind === "ride") return {};
  const before = shiftSpan(target, -1);
  const after = shiftSpan(target, 1);
  return {
    now: target.q,
    prev: { label: spanLabel(before, today), query: ask(spanPhrase(before, today)) },
    ...(after.from <= today
      ? { next: { label: spanLabel(after, today), query: ask(spanPhrase(after, today)) } }
      : {}),
  };
}
