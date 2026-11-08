// "grafico km", "hrv e km", "power 5m per mese", "grafico km 2025 vs 2026": a measure over time, read from the words and
// drawn by `ChartView`. Only reads, and a word left over means it isn't a chart, so anything else keeps its meaning. Pure.
import { addMonths, format as dateFormat, parseISO, startOfISOWeek, startOfMonth } from "date-fns";
import { valueAt } from "./analysis";
import type { Dest, Entry } from "./ask";
import {
  lengthText,
  spanPhrase,
  type AskChip,
  type AskDetail,
  type ChartPanel,
  type ChartView,
} from "./ask-detail";
import { curveKey, type CurveRead } from "./ask-efforts";
import { activityDay, takeLength, takeTime } from "./ask-read";
import { command } from "./ask-sentence";
import { daysIn, spanTitle, type Span } from "./ask-when";
import { format, num, t } from "./i18n";
import type { Activity, Wellness } from "./intervals";
import { isSport, type MainSport } from "./sport";
import { addDays, computeForm } from "./training";

export type Period = "day" | "week" | "month";
type Kind = "total" | "level" | "best";
type MeasureKey =
  | "km"
  | "hours"
  | "climb"
  | "load"
  | "count"
  | "speed"
  | "weight"
  | "fat"
  | "sleep"
  | "hrv"
  | "fitness"
  | "fatigue"
  | "form"
  | "power"
  | "hr";

type MeasureInfo = {
  kind: Kind;
  /** The word the bar reads it by, whatever the app's language. */
  say: string;
  name: () => string;
  unit: string;
  digits: number;
  words: RegExp;
};

const MEASURES: Record<MeasureKey, MeasureInfo> = {
  km: {
    kind: "total",
    say: "km",
    name: () => "Km",
    unit: "km",
    digits: 0,
    words: /^(?:km|chilometri|kilometers|kilometres|distanza|distance)$/,
  },
  hours: {
    kind: "total",
    say: "ore",
    name: () => t("Hours", "Ore"),
    unit: "h",
    digits: 1,
    words: /^(?:ore|hours|tempo|time|volume)$/,
  },
  climb: {
    kind: "total",
    say: "dislivello",
    name: () => t("Climbing", "Dislivello"),
    unit: "m",
    digits: 0,
    words: /^(?:dislivello|climbing|elevation)$/,
  },
  load: {
    kind: "total",
    say: "carico",
    name: () => t("Load", "Carico"),
    unit: "",
    digits: 0,
    words: /^(?:carico|load|tss)$/,
  },
  count: {
    kind: "total",
    say: "attivita",
    name: () => t("Activities", "Attività"),
    unit: "",
    digits: 0,
    words: /^(?:attivita|activities|count|numero|conteggio|sedute)$/,
  },
  speed: {
    kind: "best",
    say: "velocita",
    name: () => t("Mean speed", "Velocità media"),
    unit: "km/h",
    digits: 1,
    words: /^(?:velocita|speed|kmh)$/,
  },
  weight: {
    kind: "level",
    say: "peso",
    name: () => t("Weight", "Peso"),
    unit: "kg",
    digits: 1,
    words: /^(?:peso|weight)$/,
  },
  fat: {
    kind: "level",
    say: "grasso",
    name: () => t("Body fat", "Grasso corporeo"),
    unit: "%",
    digits: 1,
    words: /^(?:grasso|fat)$/,
  },
  sleep: {
    kind: "level",
    say: "sonno",
    name: () => t("Sleep", "Sonno"),
    unit: "h",
    digits: 1,
    words: /^(?:sonno|sleep)$/,
  },
  hrv: { kind: "level", say: "hrv", name: () => "HRV", unit: "ms", digits: 0, words: /^hrv$/ },
  fitness: {
    kind: "level",
    say: "fitness",
    name: () => "Fitness",
    unit: "",
    digits: 0,
    words: /^(?:fitness|ctl)$/,
  },
  fatigue: {
    kind: "level",
    say: "fatica",
    name: () => t("Fatigue", "Fatica"),
    unit: "",
    digits: 0,
    words: /^(?:fatica|fatigue|atl)$/,
  },
  form: {
    kind: "level",
    say: "forma",
    name: () => t("Form", "Forma"),
    unit: "",
    digits: 0,
    words: /^(?:forma|form|tsb)$/,
  },
  power: {
    kind: "best",
    say: "power",
    name: () => t("Best power", "Miglior potenza"),
    unit: "W",
    digits: 0,
    words: /^(?:potenza|power|watt|watts)$/,
  },
  hr: {
    kind: "best",
    say: "fc",
    name: () => t("Highest HR", "FC massima"),
    unit: "bpm",
    digits: 0,
    words: /^(?:fc|hr|bpm|battiti)$/,
  },
};

export type Measure = { key: MeasureKey; secs?: number; sport?: MainSport };

export type ChartAsked = {
  measures: Measure[];
  period: Period;
  span: Span;
  /** The same measure over a second stretch, drawn beside the first. */
  second?: Span;
  secondNamed?: string;
  /** The stretch's own name, when one was said; otherwise the default for the measure. */
  named: string | null;
  /** What it's limited to, when a sport was named. */
  sport: MainSport | null;
  /** Whether the period was said: a chip that changes the stretch keeps it only then. */
  periodNamed: boolean;
  /** The default stretch started later than it would, because that's when the data does: this day. */
  since?: string;
};

/** Curves are one request each, so only so many periods are read. */
export const MAX_CURVE_PERIODS = 24;

export const CHART_WORD = /^(?:grafico|grafici|chart|charts|andamento|trend)$/;
/** Said alone, these mean their chart. Words that mean other things too ("tempo", "time", "numero") need more said. */
const ALONE =
  /^(?:km|chilometri|kilometers|kilometres|ore|hours|dislivello|climbing|carico|load|hrv|peso|weight|grasso|sonno|sleep|fitness|ctl|fatica|fatigue|atl|forma|form|tsb)$/;
/** This needs a length, so alone it asks for one. Power alone already answers, with a few points of its curve. */
const HR_ALONE = /^(?:fc|hr|bpm|battiti)$/;
const VS = /^(?:vs\.?|versus|contro)$/;
const SPORT_WORD: [RegExp, MainSport][] = [
  [/^(?:uscita|uscite|pedalata|pedalate|ride|rides|giro|bici|bike)$/, "ride"],
  [/^(?:corsa|corse|run|runs)$/, "run"],
];
const FILLER = new Set(
  "e and di del della dei delle il la lo le i the of in per over a al my mio mia miei mie show mostrami media medie medio medi mean average avg".split(
    " ",
  ),
);
const PERIOD_WORDS: [RegExp, Period][] = [
  [/(?:^| )(?:(?:per|by|al|a) (?:giorno|day)|giornaliero|daily)(?= |$)/, "day"],
  [/(?:^| )(?:(?:per|by|alla|a) (?:settimana|week)|settimanale|weekly)(?= |$)/, "week"],
  [/(?:^| )(?:(?:per|by|al|a) (?:mese|month)|mensile|monthly)(?= |$)/, "month"],
];

function takePeriod(s: string): { period: Period | null; rest: string } {
  for (const [re, period] of PERIOD_WORDS) {
    const m = re.exec(s);
    if (m) return { period, rest: s.replace(m[0], " ") };
  }
  return { period: null, rest: s };
}

type Side = {
  measures: Measure[];
  times: { span: Span; q: string }[];
  sport: MainSport | null;
};

/** The measures and the time in some words, or null when any word means neither. */
function readSide(text: string, today: string): Side | null {
  let s = ` ${text} `
    .replace(/ frequenza cardiaca /g, " fc ")
    .replace(/ heart rate /g, " fc ")
    .replace(/ body fat /g, " fat ")
    .replace(/,/g, " ");
  // "dal 2022": from then until today, where "dal 3 al 5 marzo" is a stretch the time reader knows.
  let since: Span | null = null;
  const from = / (?:dal|da|since) (\d{4}) /.exec(s);
  if (from) {
    since = { from: `${from[1]}-01-01`, to: today };
    s = s.replace(from[0], " ");
  }
  const lengths: number[] = [];
  for (;;) {
    const { length, rest } = takeLength(s);
    if (!length) break;
    lengths.push(length.secs);
    s = rest;
  }
  const measures: Measure[] = [];
  const others: string[] = [];
  let sport: MainSport | null = null;
  for (const w of s.split(" ").filter(Boolean)) {
    const key = (Object.keys(MEASURES) as MeasureKey[]).find((k) => MEASURES[k].words.test(w));
    if (key) {
      measures.push({ key });
      continue;
    }
    const named = SPORT_WORD.find(([re]) => re.test(w));
    if (named && !sport) {
      sport = named[1];
      if (/e$/.test(w) || /s$/.test(w)) measures.push({ key: "count" });
      continue;
    }
    others.push(w);
  }
  // A length belongs to the curves, in order; one length is shared by all of them.
  const curves = measures.filter((m) => m.key === "power" || m.key === "hr");
  if (lengths.length > 1 && lengths.length !== curves.length) return null;
  if (lengths.length && !curves.length) return null;
  if (curves.length && !lengths.length) return null;
  curves.forEach((m, i) => (m.secs = lengths[lengths.length > 1 ? i : 0]!));
  const times: Side["times"] = since
    ? [{ span: since, q: t(`since ${since.from.slice(0, 4)}`, `dal ${since.from.slice(0, 4)}`) }]
    : [];
  // Small words stay until the time is read: "dal 3 al 5 marzo" needs its "al". Two can be said together: "2025 e 2026".
  let left = others;
  while (left.some((w) => !FILLER.has(w))) {
    if (since || times.length === 2) return null;
    const found = takeTime(left, today);
    if (!found) return null;
    times.push({ span: { from: found.when.from, to: found.when.to }, q: found.when.q });
    left = found.rest;
  }
  return { measures, times, sport };
}

const hasCurve = (m: Measure) => m.key === "power" || m.key === "hr";

const monthsBack = (today: string, n: number) =>
  dateFormat(addMonths(startOfMonth(parseISO(today)), -(n - 1)), "yyyy-MM-dd");

/** With nothing said, what suits the measure: totals and bests by month over a year, daily levels by day over 90 days. */
function defaults(
  kinds: Kind[],
  period: Period | null,
  today: string,
): { period: Period; span: Span } {
  const onlyLevels = kinds.every((k) => k === "level");
  const p = period ?? (onlyLevels ? "day" : "month");
  if (p === "month") return { period: p, span: { from: monthsBack(today, 12), to: today } };
  if (p === "week")
    return { period: p, span: { from: addDays(startOf(today, "week"), -7 * 11), to: today } };
  return { period: p, span: { from: addDays(today, onlyLevels ? -89 : -29), to: today } };
}

/** A stretch that was named, read in periods that suit its length. */
function periodFor(span: Span, kinds: Kind[]): Period {
  const n = daysIn(span);
  const levels = kinds.every((k) => k === "level");
  if (n <= (levels ? 120 : 45)) return "day";
  return n <= (levels ? 400 : 200) ? "week" : "month";
}

/** What was typed as a chart: said to be one, read per period, or several measures and nothing else. */
export function chartAsked(
  query: string,
  ctx: { today: string; sport: MainSport },
): ChartAsked | null {
  const all = command(query);
  if (!all) return null;
  const words = all.split(" ");
  const said = words.some((w) => CHART_WORD.test(w));
  const noWord = words.filter((w) => !CHART_WORD.test(w)).join(" ");
  const { period, rest } = takePeriod(noWord);
  // Each "vs" sets apart measures or stretches, in any order: "km vs hrv 2025 vs 2026", "2025 vs 2026 km e hrv".
  const parts = rest.split(/ (?:vs\.?|versus|contro) /);
  const sides: Side[] = [];
  for (const part of parts) {
    const side = readSide(part.trim(), ctx.today);
    if (!side || (!side.measures.length && !side.times.length)) return null;
    sides.push(side);
  }
  const measures = sides.flatMap((x) => x.measures);
  const times = sides.flatMap((x) => x.times);
  if (!measures.length || measures.length > 3 || times.length > 2) return null;
  // "km 2025 vs hrv 2026" is two different questions, and "km vs 2025" has nothing to set 2025 against.
  if (times.length === 2 && sides.filter((x) => x.times.length && x.measures.length).length === 2)
    return null;
  if (times.length === 1 && sides.some((x) => x.times.length && !x.measures.length)) return null;
  if (new Set(measures.map((m) => `${m.key}${m.secs ?? ""}`)).size !== measures.length) return null;
  // Curves are one read per period, for each stretch: three of them over two stretches is too many.
  if (times.length === 2 && measures.filter(hasCurve).length > 2) return null;

  const alone = words.length === 1 && ALONE.test(words[0]!);
  // Several measures over two stretches can't mean anything else; without a "vs", "km marzo e hrv aprile" could.
  const plainly = parts.length > 1 && measures.length > 1 && times.length === 2;
  if (
    !said &&
    !period &&
    !alone &&
    !plainly &&
    (parts.length > 1 || times.length || measures.length < 2)
  )
    return null;

  const kinds = measures.map((m) => MEASURES[m.key].kind);
  const sport = sides.find((x) => x.sport)?.sport ?? null;
  const within: Measure[] = measures.map((m) => (sport ? { ...m, sport } : m));
  const seen: Span[] = [];
  for (const { span } of times) {
    if (span.from > ctx.today) return null;
    const whole = { from: span.from, to: minDay(span.to, ctx.today) };
    // One day is a number, not a chart; and on the way to "marzo 2026", "marzo 20" isn't what's meant.
    if (whole.from === whole.to) return null;
    seen.push(whole);
  }
  const [span, second] = seen;
  if (span) {
    return {
      measures: within,
      period: period ?? periodFor(span, kinds),
      span,
      ...(second ? { second, secondNamed: times[1]!.q } : {}),
      named: times[0]!.q,
      sport,
      periodNamed: !!period,
    };
  }
  return {
    measures: within,
    ...defaults(kinds, period, ctx.today),
    named: null,
    sport,
    periodNamed: !!period,
  };
}

const minDay = (a: string, b: string) => (a < b ? a : b);

type Bucket = { from: string; to: string; open: boolean };

const startOf = (day: string, p: Period) => {
  const d = parseISO(day);
  if (p === "day") return day;
  return dateFormat(p === "week" ? startOfISOWeek(d) : startOfMonth(d), "yyyy-MM-dd");
};
const nextStart = (start: string, p: Period) =>
  p === "day"
    ? addDays(start, 1)
    : p === "week"
      ? addDays(start, 7)
      : dateFormat(addMonths(parseISO(start), 1), "yyyy-MM-dd");

/** Whole periods, from the one the stretch starts in; none reaches past today. */
export function periodsOf(span: Span, p: Period, today: string): Bucket[] {
  const out: Bucket[] = [];
  for (
    let from = startOf(span.from, p);
    from <= span.to && from <= today;
    from = nextStart(from, p)
  ) {
    const end = addDays(nextStart(from, p), -1);
    out.push({ from, to: minDay(end, today), open: end > today });
  }
  return out;
}

/** Which periods a curve is read for: the latest ones, up to the cap. */
const curvePeriods = (span: Span, p: Period, today: string) =>
  periodsOf(span, p, today).slice(-MAX_CURVE_PERIODS);

const curveSport = (m: Measure, sport: MainSport): MainSport =>
  m.key === "power" ? "ride" : (m.sport ?? sport);

/**
 * One read per period: nothing is read until it's asked. A default stretch waits for the activities, so that nothing is read
 * for the months before the first one.
 */
export function chartCurves(
  a: ChartAsked,
  ctx: { today: string; sport: MainSport; acts?: Activity[] | undefined },
) {
  if (!a.measures.some(hasCurve)) return [];
  if (!a.named && !ctx.acts) return [];
  const fit = fitToData(a, ctx);
  return fit.measures.filter(hasCurve).flatMap((m) =>
    [fit.span, ...(fit.second ? [fit.second] : [])].flatMap((span) =>
      curvePeriods(span, fit.period, ctx.today).map((b) => ({
        metric: m.key as "power" | "hr",
        from: b.from,
        to: b.to,
        sport: curveSport(m, ctx.sport),
      })),
    ),
  );
}

const levels = new Set<MeasureKey>(["weight", "fat", "sleep", "hrv", "fitness", "fatigue", "form"]);
/** Measured on the body: what's known about them is only the days read for this chart. The others follow from the activities. */
const BODY = new Set<MeasureKey>(["weight", "fat", "sleep", "hrv"]);

/** The days a chart needs read from wellness, when it needs any. */
export function chartWellnessSpan(a: ChartAsked, today: string): Span | null {
  if (!a.measures.some((m) => levels.has(m.key))) return null;
  const spans = [a.span, ...(a.second ? [a.second] : [])].flatMap((s) =>
    periodsOf(s, a.period, today),
  );
  return spans.length
    ? {
        from: spans.reduce((x, b) => (b.from < x ? b.from : x), spans[0]!.from),
        to: spans.reduce((x, b) => (b.to > x ? b.to : x), spans[0]!.to),
      }
    : null;
}

/** What fitting a chart to its data reads: the activities, and the days read for it. */
type FitData = {
  today: string;
  sport: MainSport;
  acts?: Activity[] | undefined;
  /** The days `chartWellnessSpan` asked for, once read. */
  chartWellness?: { days?: Wellness[] | undefined; failed?: boolean } | undefined;
};

export type ChartData = FitData & {
  curveReads?: Record<string, CurveRead> | undefined;
  /** Names of climbs and forests: said alone, a name stays a name. */
  takenNames?: string[] | undefined;
};

const TOTAL_READ: Partial<Record<MeasureKey, (a: Activity) => number>> = {
  km: (a) => (a.distance ?? 0) / 1000,
  hours: (a) => (a.moving_time ?? 0) / 3600,
  climb: (a) => a.total_elevation_gain ?? 0,
  load: (a) => a.icu_training_load ?? 0,
  count: () => 1,
};

const LEVEL_READ: Partial<Record<MeasureKey, (w: Wellness) => number | null>> = {
  weight: (w) => w.weight,
  fat: (w) => w.bodyFat,
  sleep: (w) => (w.sleepSecs != null ? w.sleepSecs / 3600 : null),
  hrv: (w) => w.hrv,
  fitness: (w) => w.ctl,
  fatigue: (w) => w.atl,
  form: (w) => (w.ctl != null && w.atl != null ? computeForm(w.ctl, w.atl) : null),
};

const earliest = (days: string[]) =>
  days.length ? days.reduce((x, day) => (day < x ? day : x)) : null;

/** The first activity that counts for this measure. */
function firstActivity(m: Measure, acts: Activity[], sport: MainSport): string | null {
  const counts = (a: Activity) => {
    if (m.key === "fitness" || m.key === "fatigue" || m.key === "form") return true;
    if (m.key === "speed")
      return isSport(a, m.sport ?? sport) && (a.moving_time ?? 0) > 0 && a.distance != null;
    if (m.key === "power") return a.icu_average_watts != null && isSport(a, curveSport(m, sport));
    if (m.key === "hr") return a.average_heartrate != null && isSport(a, curveSport(m, sport));
    return (!m.sport || isSport(a, m.sport)) && (TOTAL_READ[m.key]?.(a) ?? 0) > 0;
  };
  return earliest(acts.filter(counts).map(activityDay));
}

function firstReading(m: Measure, span: Span, days: Wellness[]): string | null {
  const read = LEVEL_READ[m.key]!;
  return earliest(
    days.filter((w) => w.id >= span.from && w.id <= span.to && (read(w) ?? 0) > 0).map((w) => w.id),
  );
}

/**
 * The first day with anything to draw, or undefined while that isn't known yet. Curves are read before the days are, and both
 * must agree on the same periods, so next to a curve only the activities decide.
 */
function firstData(a: ChartAsked, d: FitData): string | null | undefined {
  const curves = a.measures.some(hasCurve);
  const asked = curves ? a.measures.filter((m) => !BODY.has(m.key)) : a.measures;
  const body = asked.filter((m) => BODY.has(m.key));
  if (asked.length > body.length && !d.acts) return undefined;
  if (body.length && !d.chartWellness?.days) return undefined;
  return earliest(
    asked.flatMap((m) => {
      const first = BODY.has(m.key)
        ? firstReading(m, a.span, d.chartWellness!.days!)
        : firstActivity(m, d.acts!, d.sport);
      return first ? [first] : [];
    }),
  );
}

/** Nothing is drawn so few wide periods that the chart says nothing, unless they were asked for. */
const MIN_PERIODS = 4;
const SHORTEST_DAYS = 7;
const FINER: Partial<Record<Period, Period>> = { month: "week", week: "day" };

/**
 * A default stretch begins when the data does: someone who started a month ago doesn't get eleven empty months. A stretch that
 * was named stays what was named.
 */
export function fitToData(a: ChartAsked, d: FitData): ChartAsked {
  if (a.named || a.second || a.since) return a;
  const first = firstData(a, d);
  if (!first || first <= a.span.from) return a;
  const from = minDay(first, addDays(d.today, 1 - SHORTEST_DAYS));
  if (from <= a.span.from) return a;
  const span = { from, to: a.span.to };
  let period = a.period;
  // Curves aren't read by the day: that would spend their reads on a few weeks.
  const finest: Period = a.measures.some(hasCurve) ? "week" : "day";
  while (
    !a.periodNamed &&
    period !== finest &&
    periodsOf(span, period, d.today).length < MIN_PERIODS
  )
    period = FINER[period]!;
  return { ...a, span, period, since: first };
}

/**
 * Before this day there's nothing, so nothing should offer to go there. Empty when that can't be said: the body's readings are
 * only known for the days read, and could go further back.
 */
function historyFrom(a: ChartAsked, d: FitData): string {
  if (!d.acts || a.measures.some((m) => BODY.has(m.key))) return "";
  const firsts = a.measures.flatMap((m) => {
    const first = firstActivity(m, d.acts!, d.sport);
    return first ? [first] : [];
  });
  return earliest(firsts) ?? d.today;
}

type Read = { values: (number | null)[]; waiting: boolean; failed: number };

function readMeasure(m: Measure, buckets: Bucket[], d: ChartData): Read {
  const kind = MEASURES[m.key].kind;
  const of = (b: Bucket) =>
    (d.acts ?? []).filter((a) => {
      const day = activityDay(a);
      return day >= b.from && day <= b.to;
    });
  if (kind === "total") {
    const read = TOTAL_READ[m.key]!;
    return {
      values: buckets.map((b) =>
        of(b)
          .filter((a) => !m.sport || isSport(a, m.sport))
          .reduce((sum, a) => sum + read(a), 0),
      ),
      waiting: !d.acts,
      failed: 0,
    };
  }
  if (m.key === "speed") {
    const sport = m.sport ?? d.sport;
    return {
      values: buckets.map((b) => {
        const acts = of(b).filter(
          (a) => isSport(a, sport) && (a.moving_time ?? 0) > 0 && a.distance != null,
        );
        const secs = acts.reduce((s, a) => s + a.moving_time!, 0);
        return secs ? (acts.reduce((s, a) => s + a.distance!, 0) / secs) * 3.6 : null;
      }),
      waiting: !d.acts,
      failed: 0,
    };
  }
  if (kind === "level") {
    const read = LEVEL_READ[m.key]!;
    const days = d.chartWellness?.days ?? [];
    return {
      values: buckets.map((b) => {
        const vals = days
          .filter((w) => w.id >= b.from && w.id <= b.to)
          .flatMap((w) => {
            const v = read(w);
            return v != null && (v > 0 || m.key === "form") ? [v] : [];
          });
        return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
      }),
      waiting: !d.chartWellness?.days && !d.chartWellness?.failed,
      failed: d.chartWellness?.failed ? buckets.length : 0,
    };
  }
  let waiting = false;
  let failed = 0;
  const values = buckets.map((b) => {
    const held =
      d.curveReads?.[
        curveKey({
          metric: m.key as "power" | "hr",
          from: b.from,
          to: b.to,
          sport: curveSport(m, d.sport),
        })
      ];
    if (!held) {
      waiting = true;
      return null;
    }
    if (held.failed) {
      failed++;
      return null;
    }
    return held.curve ? valueAt(held.curve, m.secs!) : null;
  });
  return { values, waiting, failed };
}

const NICE = [1, 2, 2.5, 5, 10];

/** Axis ticks anyone would write, never finer than the measure is shown: not 1800, 900, 450, nor 57,5 for whole numbers. */
export function niceTicks(values: number[], fromZero: boolean, digits = 0): number[] {
  const seen = values.filter((v) => Number.isFinite(v));
  if (!seen.length) return [0, 1];
  const least = 10 ** -digits;
  const lo = fromZero ? Math.min(0, ...seen) : Math.min(...seen);
  const hi = Math.max(...seen, fromZero ? 0 : -Infinity);
  const raw = Math.max((hi - lo) / 3, least);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const whole = (n: number) => Math.abs(n / least - Math.round(n / least)) < 1e-9;
  const step = (NICE.find((n) => n * mag >= raw - 1e-9 && whole(n * mag)) ?? 10) * mag;
  const start = Math.floor(lo / step + 1e-9) * step;
  const round = (v: number) => Math.round(v / least) * least;
  const ticks = [round(start)];
  while (ticks.at(-1)! < hi - 1e-9) ticks.push(round(ticks.at(-1)! + step));
  if (ticks.length < 2) ticks.push(round(start + step));
  return ticks.map((v) => Number(v.toFixed(Math.max(digits, 0))));
}

const label = (b: Bucket, p: Period, long: boolean) =>
  p === "month"
    ? long
      ? dateFormat(parseISO(b.from), "MM/yy")
      : format(parseISO(b.from), "MMM").toLowerCase()
    : dateFormat(parseISO(b.from), "d/M");

function measureName(m: Measure) {
  const base = MEASURES[m.key].name();
  if (m.secs == null) return base;
  const secs = m.secs;
  return `${base} ${secs < 60 ? `${secs} s` : secs < 3600 ? `${Math.round(secs / 60)} min` : `${secs / 3600} h`}`;
}

const drawOf = (m: Measure): ChartPanel["draw"] => {
  const kind = MEASURES[m.key].kind;
  return kind === "total" ? "bars" : kind === "best" ? "points" : "line";
};

function panelOf(m: Measure, a: ChartAsked, d: ChartData) {
  const curve = hasCurve(m);
  const all = periodsOf(a.span, a.period, d.today);
  const buckets = curve ? all.slice(-MAX_CURVE_PERIODS) : all;
  const long = all.length > 13;
  const read = readMeasure(m, buckets, d);
  const info = MEASURES[m.key];
  const other = a.second
    ? periodsOf(a.second, a.period, d.today).slice(curve ? -MAX_CURVE_PERIODS : 0)
    : null;
  const otherRead = other ? readMeasure(m, other, d) : null;
  const seen = [...read.values, ...(otherRead?.values ?? [])].filter((v): v is number => v != null);
  const size = Math.max(buckets.length, other?.length ?? 0);
  const panel: ChartPanel = {
    title: info.unit && m.key !== "km" ? `${measureName(m)} (${info.unit})` : measureName(m),
    unit: info.unit,
    digits: info.digits,
    draw: drawOf(m),
    points: Array.from({ length: size }, (_, i) => {
      const b = buckets[i];
      const named = b ?? other?.[i];
      return {
        label: named ? label(named, a.period, long) : String(i + 1),
        value: read.values[i] ?? null,
        ...(otherRead ? { other: otherRead.values[i] ?? null } : {}),
        ...(b?.open && !otherRead ? { open: true } : {}),
      };
    }),
    ticks: niceTicks(seen, info.kind === "total", info.digits),
  };
  return {
    panel,
    read,
    cut: curve && all.length > MAX_CURVE_PERIODS ? all.length : 0,
    openBucket: all.at(-1)?.open ? all.at(-1)! : null,
  };
}

function summary(m: Measure, values: (number | null)[]) {
  const info = MEASURES[m.key];
  const seen = values.filter((v): v is number => v != null);
  if (!seen.length) return undefined;
  const n =
    info.kind === "total"
      ? seen.reduce((s, v) => s + v, 0)
      : m.key === "speed" || info.kind === "level"
        ? seen.reduce((s, v) => s + v, 0) / seen.length
        : Math.max(...seen);
  // Totals that add up to nothing are no data, not a result.
  if (info.kind === "total" && n === 0) return undefined;
  const scale = 10 ** info.digits;
  return [num(Math.round(n * scale) / scale), info.unit].filter(Boolean).join(" ");
}

const everyWord = (p: Period) =>
  p === "day"
    ? t("By day", "Per giorno")
    : p === "week"
      ? t("By week", "Per settimana")
      : t("By month", "Per mese");

function answerOf(a: ChartAsked) {
  const per = everyWord(a.period);
  if (a.measures.length === 1) {
    const m = a.measures[0]!;
    const kind = MEASURES[m.key].kind;
    if (m.key !== "speed" && kind === "best")
      return a.period === "month"
        ? t("The best of each month", "Il migliore di ogni mese")
        : a.period === "week"
          ? t("The best of each week", "Il migliore di ogni settimana")
          : t("The best of each day", "Il migliore di ogni giorno");
    if (kind === "level" && a.period === "day")
      return t(
        "Each day measured; gaps are days with no reading",
        "Ogni giorno misurato; i buchi sono giorni senza misura",
      );
    if (kind === "level") return `${per}: ${t("the mean of the period", "la media del periodo")}`;
    return per;
  }
  const lv = a.measures.filter((m) => MEASURES[m.key].kind === "level");
  return lv.length && a.period !== "day"
    ? `${per}; ${lv.map((m) => MEASURES[m.key].name()).join(", ")} ${t("as the period's mean", "come media del periodo")}`
    : per;
}

function spanName(a: ChartAsked) {
  if (a.named) return a.named;
  if (a.since) {
    const day = parseISO(a.since);
    return t(`since ${format(day, "d MMMM")}`, `dal ${format(day, "d MMMM")}`);
  }
  if (a.period === "month") return t("last 12 months", "ultimi 12 mesi");
  if (a.period === "week") return t("last 12 weeks", "ultime 12 settimane");
  return a.measures.every((m) => levels.has(m.key))
    ? t("last 90 days", "ultimi 90 giorni")
    : t("last 30 days", "ultimi 30 giorni");
}

export const measuresName = (a: ChartAsked) =>
  a.measures.map(measureName).join(a.measures.length > 1 ? ` ${t("and", "e")} ` : "");

function noteOf(a: ChartAsked, built: ReturnType<typeof panelOf>[], failed: number) {
  const notes: string[] = [];
  const cut = Math.max(...built.map((b) => b.cut));
  if (cut) {
    const shown = MAX_CURVE_PERIODS;
    notes.push(
      a.period === "month"
        ? t(
            `Showing the last ${shown} months of ${cut}: choose a shorter stretch for the others.`,
            `Mostrati gli ultimi ${shown} mesi di ${cut}: scegli un periodo più breve per gli altri.`,
          )
        : a.period === "week"
          ? t(
              `Showing the last ${shown} weeks of ${cut}: choose a shorter stretch for the others.`,
              `Mostrate le ultime ${shown} settimane di ${cut}: scegli un periodo più breve per le altre.`,
            )
          : t(
              `Showing the last ${shown} days of ${cut}: choose a shorter stretch for the others.`,
              `Mostrati gli ultimi ${shown} giorni di ${cut}: scegli un periodo più breve per gli altri.`,
            ),
    );
  }
  const open = built.find((b) => b.openBucket)?.openBucket;
  const anything = built.some((b) => b.read.values.some(Boolean));
  if (
    open &&
    anything &&
    a.measures.some((m) => MEASURES[m.key].kind === "total") &&
    a.period !== "day"
  )
    notes.push(
      a.period === "month"
        ? t(
            `${format(parseISO(open.from), "MMMM")} isn't over yet.`,
            `${format(parseISO(open.from), "MMMM")} è ancora in corso.`,
          )
        : t("This week isn't over yet.", "Questa settimana è ancora in corso."),
    );
  if (failed)
    notes.push(t(`Unable to read ${failed} periods.`, `Impossibile leggere ${failed} periodi.`));
  return notes.join(" ");
}

export type BuiltChart = {
  title: string;
  answer: string;
  value?: string;
  view: ChartView;
};

export function buildChart(asked: ChartAsked, d: ChartData): BuiltChart {
  const a = fitToData(asked, d);
  const built = a.measures.map((m) => panelOf(m, a, d));
  const failed = built.reduce((s, b) => s + b.read.failed, 0);
  const loading = built.some((b) => b.read.waiting);
  const note = noteOf(a, built, failed);
  const names: [string, string] | undefined = a.second
    ? [a.named ?? spanTitle(a.span, d.today), a.secondNamed ?? spanTitle(a.second, d.today)]
    : undefined;
  const panels = built.map((b) => (names ? { ...b.panel, names } : b.panel));
  const value =
    a.measures.length === 1 && !a.second
      ? summary(a.measures[0]!, built[0]!.read.values)
      : undefined;
  return {
    title: `${measuresName(a)} · ${a.second ? `${names![0]} ${t("and", "e")} ${names![1]}` : spanName(a)}`,
    answer: answerOf(a),
    ...(value ? { value } : {}),
    view: {
      kind: "chart",
      panels,
      ...(note ? { note } : {}),
      ...(loading ? { loading: true } : {}),
    },
  };
}

const sayMeasure = (m: Measure) => {
  const word = MEASURES[m.key].say;
  return m.secs != null ? `${word} ${lengthText(m.secs)}` : word;
};

/** The chart in words the bar reads whatever the app's language: a chip is only ever a question. */
function sayChart(
  a: ChartAsked,
  today: string,
  over: { period?: Period; span?: Span | null } = {},
) {
  const span = over.span === undefined ? (a.named ? a.span : null) : over.span;
  const period = over.period ?? (a.periodNamed ? a.period : null);
  const perWord = { day: "per giorno", week: "per settimana", month: "per mese" };
  return [
    "grafico",
    a.measures.map(sayMeasure).join(" e "),
    a.sport ? (a.sport === "run" ? "corsa" : "bici") : "",
    period ? perWord[period] : "",
    span ? spanPhrase(span, today) : "",
    a.second ? `vs ${spanPhrase(a.second, today)}` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

const PERIODS: [Period, () => string][] = [
  ["day", () => t("Day", "Giorno")],
  ["week", () => t("Week", "Settimana")],
  ["month", () => t("Month", "Mese")],
];

/** Day, week, month. A curve by the day would spend its reads on a few weeks, so it isn't offered. */
function periodChips(a: ChartAsked, today: string): AskChip[] {
  const curves = a.measures.some(hasCurve);
  return PERIODS.filter(([p]) => !curves || p !== "day").map(([p, name]) => ({
    label: name(),
    query: sayChart(a, today, { period: p }),
    ...(p === a.period ? { on: true } : {}),
  }));
}

/** What goes well beside each measure. */
const BESIDE: Partial<Record<MeasureKey, [MeasureKey, MeasureKey]>> = {
  km: ["hrv", "climb"],
  hours: ["hrv", "load"],
  climb: ["km", "load"],
  load: ["fitness", "km"],
  count: ["km", "hours"],
  speed: ["km", "load"],
  weight: ["km", "fat"],
  fat: ["weight", "km"],
  sleep: ["hrv", "load"],
  hrv: ["km", "sleep"],
  fitness: ["fatigue", "form"],
  fatigue: ["fitness", "form"],
  form: ["fitness", "fatigue"],
};

/** What could be added to the chart, as questions: another year, another measure, one sport. */
function nextWords(a: ChartAsked, today: string, history: string): AskChip[] {
  const out: AskChip[] = [];
  const hasYear = (y: string) => `${y}-12-31` >= history;
  const year = Number(today.slice(0, 4));
  const say = (extra: string) => `${sayChart(a, today)} ${extra}`;
  if (!a.second && a.span.from.endsWith("-01-01") && a.named && /^\d{4}$/.test(a.named)) {
    const before = String(Number(a.named) - 1);
    if (hasYear(before)) out.push({ label: `vs ${before}`, query: say(`vs ${before}`) });
  } else if (!a.named) {
    const y = String(year - 1);
    if (hasYear(y)) out.push({ label: y, query: say(y) });
  }
  const only = a.measures.length === 1 ? a.measures[0]! : null;
  if (only) {
    if (hasCurve(only)) {
      const other = only.key === "power" ? "fc" : "power";
      const word = `${other} ${lengthText(only.secs!)}`;
      const me = sayMeasure(only);
      out.push({ label: `e ${word}`, query: sayChart(a, today).replace(me, `${me} e ${word}`) });
    } else {
      const [first, second] = BESIDE[only.key]!;
      const said = sayChart(a, today);
      const add = (joined: string, m: MeasureKey) => ({
        label: `${joined} ${MEASURES[m].say}`,
        query: said.replace(
          MEASURES[only.key].say,
          `${MEASURES[only.key].say} ${joined} ${MEASURES[m].say}`,
        ),
      });
      out.push(add("vs", first), add("e", second));
    }
    if (!a.sport && MEASURES[only.key].kind === "total") {
      const said = sayChart(a, today);
      out.push({ label: "corsa", query: `${said} corsa` });
    }
  }
  return out;
}

/** The same number of periods before or after. */
function shifted(a: ChartAsked, dir: 1 | -1, today: string): Span | null {
  const all = periodsOf(a.span, a.period, today);
  // A chart that was cut goes on from what it shows.
  const shown = a.measures.some(hasCurve) ? all.slice(-MAX_CURVE_PERIODS) : all;
  const n = shown.length;
  if (!n) return null;
  const start = shown[0]!.from;
  const by = (day: string, count: number) =>
    a.period === "month"
      ? dateFormat(addMonths(parseISO(day), count), "yyyy-MM-dd")
      : addDays(day, count * (a.period === "week" ? 7 : 1));
  const from = by(start, dir * n);
  if (from > today) return null;
  // Whole periods, so the first and the last aren't cut short.
  return { from, to: minDay(addDays(by(from, n), -1), today) };
}

const spanChip = (s: Span) =>
  s.from.slice(0, 4) === s.to.slice(0, 4) && s.from.endsWith("-01-01") && s.to.endsWith("-12-31")
    ? s.from.slice(0, 4)
    : `${dateFormat(parseISO(s.from), "d/M/yy")}–${dateFormat(parseISO(s.to), "d/M/yy")}`;

function aroundChart(a: ChartAsked, today: string, history: string): AskChip[] {
  if (a.second) return [];
  const before = shifted(a, -1, today);
  // What's said from here on is that stretch, in periods of the one being read.
  const at = (s: Span | null, mark: (l: string) => string): AskChip[] =>
    s
      ? [{ label: mark(spanChip(s)), query: sayChart(a, today, { span: s, period: a.period }) }]
      : [];
  return [
    ...at(before && before.to >= history ? before : null, (l) => `‹ ${l}`),
    ...at(shifted(a, 1, today), (l) => `${l} ›`),
  ];
}

export const CHART_OPEN = () => t("Open the chart", "Apri il grafico");

/** Words that ask for a chart but don't yet say of what. */
export const chartWordAlone = (query: string) => CHART_WORD.test(command(query));

const askRow = (id: string, q: string, answer: string, follow: AskChip[]): Entry => ({
  id,
  q,
  answer,
  page: "analysis",
  kind: "value",
  exact: true,
  dest: { kind: "stay" },
  follow,
});

const ask = (query: string, label = query): AskChip => ({ label, query });

export function chartRows(query: string, d: ChartData): Entry[] {
  const word = command(query);
  if (chartWordAlone(word))
    return [
      askRow(
        "chart-of-what",
        t("A chart of what?", "Un grafico di cosa?"),
        t("Say what to draw", "Di' cosa disegnare"),
        ["km", "hrv", "peso", "forma", "power 5m", "distribuzione"].map((m) =>
          ask(`grafico ${m}`, m),
        ),
      ),
    ];
  if (HR_ALONE.test(word))
    return [
      askRow(
        "chart-length",
        t("Highest HR", "FC massima"),
        t("For how long?", "Per quanto tempo?"),
        [
          ...["5m", "20m", "60m"].map((l) => ask(`fc ${l}`, l)),
          ask("fc media oggi", t("mean today", "media oggi")),
        ],
      ),
    ];
  // Something with that very name stays itself.
  if (!word.includes(" ") && d.takenNames?.some((n) => command(n) === word)) return [];
  const asked = chartAsked(query, { today: d.today, sport: d.sport });
  if (!asked) return [];
  const a = fitToData(asked, d);
  const built = buildChart(a, d);
  const history = historyFrom(a, d);
  const dest: Dest = { kind: "route", to: "/chart", search: { q: word } };
  return [
    {
      id: "chart",
      q: built.title,
      page: "analysis",
      kind: "value",
      exact: true,
      answer: built.view.loading ? t("Loading…", "Caricamento…") : built.answer,
      ...(built.value && !built.view.loading ? { value: built.value } : {}),
      detail: { view: built.view, open: CHART_OPEN() },
      follow: [
        ...periodChips(a, d.today),
        ...nextWords(a, d.today, history),
        ...aroundChart(a, d.today, history),
      ],
      dest,
    },
  ];
}

/** "Ho capito km, non banane": a measure was understood, and these other words weren't. */
export function chartLeftover(
  query: string,
  today: string,
): { known: string; unknown: string[]; follow: AskChip[] } | null {
  const words = takePeriod(
    command(query)
      .split(" ")
      .filter((w) => !CHART_WORD.test(w))
      .join(" "),
  )
    .rest.split(" ")
    .filter(Boolean);
  const known: string[] = [];
  const unknown: string[] = [];
  for (const w of words) {
    if (FILLER.has(w) || /^\d/.test(w) || VS.test(w) || SPORT_WORD.some(([re]) => re.test(w)))
      continue;
    if ((Object.keys(MEASURES) as MeasureKey[]).some((k) => MEASURES[k].words.test(w)))
      known.push(w);
    else if (!takeTime([w], today)) unknown.push(w);
  }
  if (known.length !== 1 || !unknown.length) return null;
  const m = known[0]!;
  const year = String(Number(today.slice(0, 4)) - 1);
  return {
    known: m,
    unknown,
    follow: [
      ask(`grafico ${m} ${year}`, `${m} ${year}`),
      ask(`grafico ${m} per mese`, `${m} per mese`),
      ask(`grafico ${m}`),
    ],
  };
}
