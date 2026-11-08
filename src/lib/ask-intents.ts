// What the bar can do beyond finding: "best + a climb's name", "best 20 min", "km quest'anno", "peso 70". Each reads a command
// word and what follows it. Everything here is your own data; nothing is written unless a row saying so is chosen.
import { parseISO } from "date-fns";
import { activityKind } from "./activity-kind";
import { curveFit, omPD, valueAt, whoSet } from "./analysis";
import { norm, type Dest, type Entry } from "./ask";
import { CHART_WORD, chartLeftover, chartRows } from "./ask-chart";
import { climbPredictRows } from "./ask-climb";
import { compareQuestions, manyCommand, manyParts } from "./ask-compare";
import { curveOf, lengthChips, openWords } from "./ask-detail";
import { distributionRows } from "./ask-distribution";
import { effortRows, type CurveRead, type RideSignal } from "./ask-efforts";
import { filterRows } from "./ask-filter";
import { timeRows } from "./ask-time";
import type { Histograms } from "./intervals";
import {
  matchClimbs,
  namesTime,
  plain,
  SPORT_WORDS,
  type Here,
  type IntentClimb,
} from "./ask-read";
import { command, near, simplify } from "./ask-sentence";
import {
  daysIn,
  monthSpan,
  spanTitle,
  whenCandidates,
  type Span,
  type WhenCandidate,
} from "./ask-when";
import { FEEL_LABEL, recentFeel } from "./felt";
import { briochesFor, intakeTarget } from "./fuel";
import { format, num, t } from "./i18n";
import {
  entrySchema,
  isFreeRide,
  isPlanned,
  type Activity,
  type ManualActivity,
  type OffKind,
  type PlannedEvent,
  type PowerCurve,
  type Wellness,
} from "./intervals";
import { formatPace } from "./pace";
import {
  advice,
  ceiling,
  ceilingText,
  readinessFor,
  readinessRows,
  recommendation,
  type Ceiling,
} from "./readiness";
import { BEST_DISTANCES, BEST_LABEL, bestOfCurves, bestsAmong, RUN_DUR } from "./run-metrics";
import type { Attempt } from "./segments";
import { isSport, type MainSport } from "./sport";
import {
  dayName,
  suggestDay,
  suggestWeek,
  type DaySuggestion,
  type SuggestFilter,
  type SuggestInput,
} from "./suggest";
import { addDays, formatClock, formatDuration, loadFromRpe } from "./training";
import { morningWellness, offEventOn, rideRecords } from "./tree";
import { workoutEntries, workoutsNamed } from "./ask-workouts";
import type { WorkoutKind } from "./workout-templates";

export { matchClimbs, namesTime, SPORT_WORDS, type IntentClimb };

export type WellnessField =
  "weight" | "bodyFat" | "sleepSecs" | "hrv" | "sleepQuality" | "fatigue" | "stress" | "mood";
export type WriteAction =
  | { kind: "wellness"; date: string; field: WellnessField; value: number; label: string }
  | { kind: "off"; off: OffKind; today: string; label: string }
  | { kind: "brioche"; activityId: string; count: number; label: string }
  | { kind: "feel"; activityId: string; feel: number; label: string }
  | {
      kind: "ride";
      date: string;
      name: string;
      type: "Ride" | "Run";
      seconds: number;
      load?: number;
      label: string;
    }
  | { kind: "log"; entry: ManualActivity; label: string }
  | { kind: "undo"; label: string }
  | { kind: "batch"; parts: BatchPart[]; day: string; label: string }
  | { kind: "remove-plan"; event: PlannedEvent; label: string }
  | { kind: "move-plan"; id: string; from: string; to: string; label: string };

/** One thing in a line that saves several. A brioche can go on the activity logged in the same line: `activityId: "$log"`. */
export type BatchPart = { title: string; detail: string; action: WriteAction };
export const LOGGED_IN_BATCH = "$log";

export type IntentData = {
  today: string;
  sport: MainSport;
  /** Accounts without intervals.icu type their HRV; otherwise it comes from the watch. */
  native: boolean;
  climbs: IntentClimb[];
  acts?: Activity[] | undefined;
  curves?: PowerCurve[] | undefined;
  /** The best power of a stretch a phrase asked about, once it's been read. */
  rangeCurve?: (Span & { curve: PowerCurve | null; failed?: boolean }) | undefined;
  /** The curves of the stretches a question is about, by `curveKey`; and those "fc 3 min" reads. */
  curveReads?: Record<string, CurveRead> | undefined;
  /** The days a chart being asked for reads, once read. */
  chartWellness?: { days?: Wellness[] | undefined; failed?: boolean } | undefined;
  /** Names that stay names when said alone, beyond the climbs. */
  forestNames?: string[] | undefined;
  hrCurves?: PowerCurve[] | undefined;
  /** Each activity's histogram, by id, once read; null when it couldn't be. */
  histograms?: Record<string, Histograms | null> | undefined;
  /** Zone tops, for zones worked out from histograms. */
  zoneTops?: { power: number[]; hr: number[] } | undefined;
  /** The streams of the rides a question is about, by id, once read; null when they couldn't be. */
  signals?: Record<string, RideSignal | null> | undefined;
  /** The page being read: a question that names nothing is about it. */
  here?: Here | null | undefined;
  /** The running analysis, only if it's already been done. */
  runs?:
    | { id: string; bests: (number | null)[]; date?: string; curve?: (number | null)[] }[]
    | undefined;
  /** Threshold pace, m/s. */
  runThreshold?: number | null | undefined;
  ftp?: number | null | undefined;
  /** Latest weight, kg. */
  weight?: number | null | undefined;
  /** The last thing saved by typing, still there to undo. */
  lastSaved?: string | null | undefined;
  /** What suggestions read; without it, typing asks for none. */
  suggest?: SuggestInput | undefined;
  offEvents?: PlannedEvent[] | undefined;
  /** What's planned from today on. */
  events?: PlannedEvent[] | undefined;
};

const route = (
  to: string,
  search?: Record<string, string>,
  params?: Record<string, string>,
): Dest => ({
  kind: "route",
  to,
  ...(search ? { search } : {}),
  ...(params ? { params } : {}),
});
const write = (action: WriteAction): Dest => ({ kind: "write", action });
const number = (s: string) => Number(s.replace(",", "."));
const dayText = (date: string) => format(parseISO(date.slice(0, 10)), "d MMM yyyy");
const passes = (n: number) =>
  t(n === 1 ? "1 pass" : `${n} passes`, n === 1 ? "1 passaggio" : `${n} passaggi`);

const climbDest = (c: IntentClimb, sport: MainSport) =>
  route("/segments/$id", { sport }, { id: c.id });
/** The analysis hasn't found any climbs on this device yet. */
const noIndex = (): Entry => ({
  id: "climb-none",
  q: t(
    "Open Segments once to read your activities",
    "Apri Segmenti una volta per leggere le attività",
  ),
  page: "segments",
  kind: "ride",
  exact: true,
  dest: route("/segments"),
});

function climbRows(
  d: IntentData,
  rest: string,
  what: "best" | "last" | "count",
  span?: WhenCandidate,
): Entry[] {
  if (!d.climbs.length) return [noIndex()];
  const pool = span
    ? d.climbs.map((c) => ({
        ...c,
        attempts: c.attempts.filter((a) => a.date >= span.from && a.date.slice(0, 10) <= span.to),
      }))
    : d.climbs;
  const found = rest
    ? matchClimbs(pool, rest)
    : [...pool]
        .sort((a, b) => Number(b.saved) - Number(a.saved) || b.attempts.length - a.attempts.length)
        .slice(0, 3)
        .map((c, i) => ({ c, score: 3 - i }));
  return found.map(({ c, score }) => {
    const base = {
      id: `${what}-${c.id}`,
      q: span ? `${c.name} · ${span.q}` : c.name,
      page: "segments" as const,
      kind: "ride" as const,
      exact: true,
      boost: score,
      dest: climbDest(c, d.sport),
    };
    const n = c.attempts.length;
    if (!n)
      return {
        ...base,
        answer: span
          ? t("No passes in this stretch", "Nessun passaggio in questo periodo")
          : t("No passes yet", "Ancora nessun passaggio"),
      };
    if (what === "count") {
      const year = d.today.slice(0, 4);
      const inYear = c.attempts.filter((a) => a.date.startsWith(year)).length;
      const last = c.attempts.reduce((m, a) => (a.date > m ? a.date : m), "");
      return {
        ...base,
        value: String(n),
        answer: `${t(`${inYear} this year`, `${inYear} quest'anno`)} · ${t("last", "ultimo")} ${dayText(last)}`,
      };
    }
    const a =
      what === "best"
        ? c.attempts.reduce((m, x) => (x.duration < m.duration ? x : m))
        : c.attempts.reduce((m, x) => (x.date > m.date ? x : m));
    const effort =
      d.sport === "run"
        ? `${formatPace(c.length / a.duration)}/km`
        : a.avgWatts != null
          ? `${Math.round(a.avgWatts)} W`
          : null;
    return {
      ...base,
      value: formatClock(a.duration),
      answer: [dayText(a.date), effort, passes(n)].filter(Boolean).join(" · "),
    };
  });
}

function durationOf(s: string): { secs: number; label: string } | null {
  const m =
    /^(\d+(?:[.,]\d+)?) ?(s|sec|secondi|secondo|seconds?|m|min|minuti|minuto|minutes?|h|ora|ore|hours?)$/.exec(
      s,
    );
  if (!m) return null;
  const n = number(m[1]!);
  const u = m[2]![0];
  const secs = Math.round(u === "s" ? n : u === "m" ? n * 60 : n * 3600);
  if (secs < 1 || secs > 6 * 3600) return null;
  return { secs, label: u === "s" ? `${n} s` : u === "m" ? `${n} min` : `${n} h` };
}

/** How a best's words say what it's measured in: "potenza 5 min", "passo 20 min", "tempo su 10 km". */
function bestWords(body: string) {
  const m =
    /^(potenza|power|watts?|passo|pace|tempo|time)(?: (?:su|sui|sul|di|for|over|at|on))? (.+)$/.exec(
      body,
    );
  return { said: m?.[1] ?? null, text: m?.[2] ?? body };
}

/** The length of an effort, its unit written out; a bare number only where the word before says it's a length. */
function bestLength(text: string, bare: boolean) {
  const both = /^(\d{1,2})h(\d{2})$/.exec(text);
  if (both) {
    const secs = Number(both[1]) * 3600 + Number(both[2]) * 60;
    return secs > 0 && secs <= 6 * 3600 ? { secs, label: formatDuration(secs) } : null;
  }
  return durationOf(/^\d+$/.test(text) && bare ? `${text} min` : text);
}

const isPower = (said: string | null) => !!said && /^(potenza|power|watt)/.test(said);
const isPace = (said: string | null) => !!said && /^(passo|pace)$/.test(said);

/** A curve to look at in the panel, with the other lengths a tap away. */
function curveDetail(
  curve: PowerCurve | undefined,
  secs: number,
  word: string,
  opensRide: boolean,
) {
  const view = curveOf(curve, secs, "W");
  return view
    ? {
        detail: {
          view,
          lengths: lengthChips(secs, (l) => `${word} ${l}`),
          open: opensRide ? openWords.ride() : openWords.curve(),
        },
      }
    : {};
}

function bestPower(d: IntentData, body: string, span?: WhenCandidate): Entry[] {
  const { said, text } = bestWords(body);
  if (d.sport === "run" || isPace(said)) return [];
  const dur = bestLength(text, isPower(said));
  if (!dur) return [];
  const base = {
    id: "best-power",
    page: "analysis" as const,
    kind: "value" as const,
    exact: true,
    dest: route("/analysis", { plot: "power" }),
  };
  if (span) {
    if (span.from > d.today) return [];
    const q = `${t(`Best ${dur.label}`, `Miglior ${dur.label}`)} · ${span.q}`;
    const read = d.rangeCurve;
    if (!read || read.from !== span.from || read.to !== span.to)
      return [{ ...base, q, answer: t("Loading…", "Caricamento…") }];
    if (read.failed)
      return [{ ...base, q, answer: t("Needs a connection", "Serve la connessione") }];
    const w = valueAt(read.curve ?? undefined, dur.secs) || null;
    return [
      {
        ...base,
        q,
        ...(w != null
          ? { value: `${Math.round(w)} W` }
          : { answer: t("Nothing that long", "Nessuno sforzo così lungo") }),
      },
    ];
  }
  const cAll = d.curves?.find((c) => c.id.includes("all"));
  const c42 = d.curves?.find((c) => c.id.includes("42"));
  const c1y = d.curves?.find((c) => c.id.includes("1y") || c.id.includes("365"));
  const ever = valueAt(cAll, dur.secs) || null;
  const now = valueAt(c42, dur.secs);
  const year = valueAt(c1y, dur.secs);
  const best = ever ?? year ?? now;
  if (best == null) return [];
  // The ride that set it, when the curve says and it's one this device knows; else the curve itself.
  const setBy = whoSet(ever != null ? cAll : year != null ? c1y : c42, dur.secs);
  const ride = setBy ? d.acts?.find((a) => a.id === setBy) : undefined;
  return [
    {
      ...base,
      ...(ride
        ? { page: "ride" as const, dest: route("/rides/$id", undefined, { id: ride.id }) }
        : {}),
      ...curveDetail(ever != null ? cAll : year != null ? c1y : c42, dur.secs, "miglior", !!ride),
      q: t(`Best ${dur.label}`, `Miglior ${dur.label}`),
      value: `${Math.round(best)} W`,
      answer:
        ever != null
          ? [
              t("All time", "Di sempre"),
              ride?.name ?? null,
              ride ? dayText(ride.start_date_local) : null,
              year != null ? t(`year ${Math.round(year)} W`, `anno ${Math.round(year)} W`) : null,
              now != null
                ? t(`42 days ${Math.round(now)} W`, `42 giorni ${Math.round(now)} W`)
                : null,
            ]
              .filter(Boolean)
              .join(" · ")
          : year != null
            ? `${t("Last year", "Ultimo anno")}${now != null ? ` · ${t("last 42 days", "ultimi 42 giorni")} ${Math.round(now)} W` : ""}`
            : t("Last 42 days", "Ultimi 42 giorni"),
    },
  ];
}

const inSpan = (date: string | undefined, span?: Span) =>
  !span || (!!date && date.slice(0, 10) >= span.from && date.slice(0, 10) <= span.to);

/** A runner's best pace for a length, ever or in a stretch. */
function bestPace(d: IntentData, body: string, span?: WhenCandidate): Entry[] {
  const { said, text } = bestWords(body);
  if (d.sport !== "run" && !isPace(said)) return [];
  const dur = bestLength(text, isPace(said));
  const i = dur ? RUN_DUR.findIndex((s) => s >= dur.secs) : -1;
  if (!dur || i < 0) return [];
  const title = t(`Best pace ${dur.label}`, `Miglior passo ${dur.label}`);
  const base = {
    id: "best-pace",
    q: span ? `${title} · ${span.q}` : title,
    page: "analysis" as const,
    kind: "value" as const,
    exact: true,
    dest: route("/analysis", { plot: "bests" }),
  };
  if (!d.runs?.some((r) => r.curve))
    return d.sport === "run"
      ? [{ ...base, answer: t("Open Analysis once", "Apri l'Analisi una volta") }]
      : [];
  const best = bestOfCurves(
    d.runs.flatMap((r) => (r.curve && inSpan(r.date, span) ? [r.curve] : [])),
  )[i];
  return [
    {
      ...base,
      ...(best != null
        ? {
            value: `${formatPace(best)}/km`,
            ...(span ? {} : { answer: t("All time", "Di sempre") }),
          }
        : { answer: t("Nothing that long", "Nessuno sforzo così lungo") }),
    },
  ];
}

function bestRun(d: IntentData, body: string, span?: WhenCandidate): Entry[] {
  const rest = bestWords(body).text;
  const named = /^(mezza|half)/.test(rest)
    ? 21.097
    : /^(maratona|marathon)/.test(rest)
      ? 42.195
      : null;
  const m = /^(\d+(?:[.,]\d+)?) ?k(?:m)?$/.exec(rest);
  const km = named ?? (m ? number(m[1]!) : null);
  if (km == null) return [];
  const i = BEST_DISTANCES.findIndex((b) => Math.abs(b / 1000 - km) < 0.5);
  if (i < 0) return [];
  const open: Entry = {
    id: "best-run-open",
    q: t("Best times", "Migliori tempi"),
    page: "analysis",
    kind: "perf",
    exact: true,
    dest: route("/analysis", { plot: "bests" }),
  };
  if (!d.runs) return d.sport === "run" ? [open] : [];
  const best = bestsAmong(d.runs.filter((r) => inSpan(r.date, span)))[i];
  if (!best)
    return [{ ...open, answer: t("No run that long yet", "Ancora nessuna corsa così lunga") }];
  const title = t(`Best ${BEST_LABEL[i]}`, `Miglior tempo su ${BEST_LABEL[i]}`);
  return [
    {
      id: "best-run",
      q: span ? `${title} · ${span.q}` : title,
      page: "ride",
      kind: "value",
      exact: true,
      value: formatClock(best.secs),
      dest: route("/rides/$id", undefined, { id: best.id }),
    },
  ];
}

function lastActivity(d: IntentData, rest: string): Entry[] {
  const hit = SPORT_WORDS.find(([re]) => re.test(rest));
  if (!hit) return [];
  const a = (d.acts ?? []).find(hit[1]);
  if (!a) return [];
  return [
    {
      id: "last-activity",
      q: a.name ?? a.type ?? t("Activity", "Attività"),
      page: "ride",
      kind: "ride",
      exact: true,
      answer: [
        dayText(a.start_date_local),
        formatDuration(a.moving_time),
        a.distance ? `${(a.distance / 1000).toFixed(1)} km` : null,
      ]
        .filter(Boolean)
        .join(" · "),
      dest: route("/rides/$id", undefined, { id: a.id }),
    },
  ];
}

const SPORT_NOUN: Record<MainSport, { en: string; it: string }> = {
  ride: { en: "Rides", it: "Uscite" },
  run: { en: "Runs", it: "Corse" },
};

/** The stretch these words name, or start naming. */
function resolveSpan(rest: string, today: string): WhenCandidate | undefined {
  const typed = plain(rest);
  if (!typed) return undefined;
  const all = whenCandidates(rest, today);
  return (
    all.find((c) => c.exact) ??
    all.find((c) => plain(c.q) === typed) ??
    all.find((c) => plain(c.q).startsWith(typed)) ??
    all.find((c) =>
      plain(c.also ?? "")
        .split(" ")
        .some((w) => w.startsWith(typed)),
    )
  );
}

const TOTAL_METRIC: Record<
  string,
  { read: (a: Activity) => number; show: (n: number) => string; en: string; it: string }
> = {
  km: {
    read: (a) => (a.distance ?? 0) / 1000,
    show: (n) => `${num(Math.round(n))} km`,
    en: "Km",
    it: "Km",
  },
  time: {
    read: (a) => a.moving_time ?? 0,
    show: (n) => formatDuration(n),
    en: "Time",
    it: "Tempo",
  },
  climb: {
    read: (a) => a.total_elevation_gain ?? 0,
    show: (n) => `${num(Math.round(n))} m`,
    en: "Climbing",
    it: "Dislivello",
  },
  count: { read: () => 1, show: (n) => String(n), en: "Activities", it: "Attività" },
  load: {
    read: (a) => a.icu_training_load ?? 0,
    show: (n) => num(Math.round(n)),
    en: "Load",
    it: "Carico",
  },
};

const totalMetric = (what: string, only: MainSport | null) =>
  what === "count" && only ? { ...TOTAL_METRIC[what]!, ...SPORT_NOUN[only] } : TOTAL_METRIC[what]!;

/** The stretch asked and its activities, up to today. */
function totalSpan(d: IntentData, rest: string, only: MainSport | null) {
  const span = resolveSpan(rest, d.today);
  if (!span || span.from > d.today) return null;
  const end = span.to < d.today ? span.to : d.today;
  const acts = (d.acts ?? []).filter((a) => {
    const day = a.start_date_local.slice(0, 10);
    return day >= span.from && day <= end && (!only || isSport(a, only));
  });
  return { span, end, acts };
}

function totals(d: IntentData, what: string, rest: string, only: MainSport | null = null): Entry[] {
  const m = totalMetric(what, only);
  const read = totalSpan(d, rest, only);
  if (!read) return [];
  const { span, acts } = read;
  const sum = acts.reduce((s, a) => s + m.read(a), 0);
  return [
    {
      id: `total-${what}`,
      q: `${t(m.en, m.it)} · ${span.q}`,
      page: "recap",
      kind: "value",
      exact: true,
      value: m.show(sum),
      answer:
        what === "count"
          ? formatDuration(acts.reduce((s, a) => s + (a.moving_time ?? 0), 0))
          : t(`${acts.length} activities`, `${acts.length} attività`),
      dest: route("/recap", { from: span.from, to: span.to }),
    },
  ];
}

export type AveragePer = "day" | "week" | "month" | "activity";

const PER_DAYS: Record<Exclude<AveragePer, "activity">, number> = {
  day: 1,
  week: 7,
  month: 365.25 / 12,
};

const perLabel = (per: AveragePer, only: MainSport | null) =>
  per === "day"
    ? t("per day", "al giorno")
    : per === "week"
      ? t("per week", "a settimana")
      : per === "month"
        ? t("per month", "al mese")
        : only === "ride"
          ? t("per ride", "a uscita")
          : only === "run"
            ? t("per run", "a corsa")
            : t("per activity", "ad attività");

const oneDecimal = (n: number) =>
  Number.isInteger(n) ? num(n) : n.toFixed(1).replace(".", t(".", ","));

/**
 * "ore medie 2026", "media delle ore 2026", "km a settimana 2026": a total spread over the stretch's
 * days up to today, so the year still running is averaged over the weeks it has had. Without a
 * "per", the usual ones for that length of stretch.
 */
function averages(
  d: IntentData,
  what: string,
  rest: string,
  only: MainSport | null,
  per: AveragePer | null,
): Entry[] {
  const m = totalMetric(what, only);
  const read = totalSpan(d, rest, only);
  if (!read) return [];
  const { span, end, acts } = read;
  const days = Math.round((parseISO(end).getTime() - parseISO(span.from).getTime()) / 864e5) + 1;
  const sum = acts.reduce((s, a) => s + m.read(a), 0);
  const pers: AveragePer[] = per
    ? [per]
    : days <= 10
      ? ["day", "activity"]
      : days <= 60
        ? ["week", "day", "activity"]
        : ["week", "month", "activity"];
  // Counting activities per activity says nothing.
  const asked = pers.filter((p) => !(p === "activity" && what === "count"));
  const total = m.show(sum);
  return asked.map((p) => {
    const over =
      p === "activity"
        ? t(`Over ${acts.length} activities`, `Su ${acts.length} attività`)
        : p === "day"
          ? t(`Over ${days} days`, `Su ${days} giorni`)
          : p === "week"
            ? t(`Over ${oneDecimal(days / 7)} weeks`, `Su ${oneDecimal(days / 7)} settimane`)
            : t(
                `Over ${oneDecimal(days / PER_DAYS.month)} months`,
                `Su ${oneDecimal(days / PER_DAYS.month)} mesi`,
              );
    const value =
      p === "activity"
        ? acts.length
          ? m.show(sum / acts.length)
          : "–"
        : what === "count"
          ? oneDecimal(Math.round((sum / days) * PER_DAYS[p] * 10) / 10)
          : m.show((sum / days) * PER_DAYS[p]);
    return {
      id: `average-${what}-${p}`,
      q: `${t(m.en, m.it)} ${perLabel(p, only)} · ${span.q}`,
      page: "recap",
      kind: "value",
      exact: true,
      value,
      answer: `${over} · ${t(`${total} in all`, `${total} in tutto`)}`,
      dest: route("/recap", { from: span.from, to: span.to }),
    } satisfies Entry;
  });
}

const AVERAGE_WORD =
  /(?:^| )(?:in media|on average|media|medie|medio|medi|average|avg|mean)(?: (?:di|del|dei|delle|degli|della|dello|of|the))*(?= |$)/;
const PER_WORDS: [RegExp, AveragePer][] = [
  [/(?:^| )(?:(?:a|alla|per) settimana|settimanali?|weekly|(?:per|a) week)(?= |$)/, "week"],
  [/(?:^| )(?:(?:al|per|a) mese|mensili?|monthly|(?:per|a) month)(?= |$)/, "month"],
  [/(?:^| )(?:(?:al|per|a) giorno|giornalier[aoie]|daily|(?:per|a) day)(?= |$)/, "day"],
  [
    /(?:^| )(?:(?:per|ad?) (?:attivita|uscita|pedalata|corsa)|per (?:activity|ride|run)|an? (?:activity|ride|run))(?= |$)/,
    "activity",
  ],
];

/** An average asked: what's left once its words are out, and the "per" if one was said. */
function averageAsked(
  s: string,
): { rest: string; per: AveragePer | null; only: MainSport | null; word: boolean } | null {
  let rest = ` ${s} `;
  let said = false;
  let per: AveragePer | null = null;
  let only: MainSport | null = null;
  const avg = AVERAGE_WORD.exec(rest);
  if (avg) {
    said = true;
    rest = rest.replace(AVERAGE_WORD, " ");
  }
  for (const [re, p] of PER_WORDS) {
    const hit = re.exec(rest);
    if (!hit) continue;
    if (per) return null;
    per = p;
    said = true;
    if (p === "activity") {
      if (/uscita|pedalata|ride/.test(hit[0])) only = "ride";
      else if (/corsa|run/.test(hit[0])) only = "run";
    }
    rest = rest.replace(re, " ");
  }
  return said ? { rest: rest.replace(/\s+/g, " ").trim(), per, only, word: !!avg } : null;
}

/** "ore medie 2026", "media delle ore 2026": a total's averages, or nothing. */
function averageRows(s: string, d: IntentData, needWord = false): Entry[] {
  const average = averageAsked(s);
  if (needWord && !average?.word) return [];
  const asked = average && totalAsked(average.rest);
  return asked ? averages(d, asked.what, asked.rest, asked.only ?? average.only, average.per) : [];
}

const TOTAL_ASKED =
  /^(km|chilometri|ore|hours|tempo|time|dislivello|climbing|attivita|activities|uscite|pedalate|rides|corse|runs|carico|load) (.+)$/;

/** "ore 2026", "km bici marzo": which total, of what sport, over which words of time. */
function totalAsked(s: string) {
  const m = TOTAL_ASKED.exec(s);
  if (!m) return null;
  const what = /km|chilo/.test(m[1]!)
    ? "km"
    : /ore|hours|tempo|time/.test(m[1]!)
      ? "time"
      : /dislivello|climbing/.test(m[1]!)
        ? "climb"
        : /carico|load/.test(m[1]!)
          ? "load"
          : "count";
  const words = m[2]!.split(" ");
  const ride = /^(?:bici|bike|uscita|uscite|pedalata|pedalate|ride|rides)$/;
  const run = /^(?:corsa|corse|run|runs)$/;
  const only: MainSport | null =
    /uscite|pedalate|rides/.test(m[1]!) || words.some((w) => ride.test(w))
      ? "ride"
      : /corse|runs/.test(m[1]!) || words.some((w) => run.test(w))
        ? "run"
        : null;
  return { what, only, rest: words.filter((w) => !ride.test(w) && !run.test(w)).join(" ") };
}

function fuelRow(d: IntentData, hours: number): Entry[] {
  const secs = Math.round(hours * 3600);
  const target = intakeTarget(secs, null, d.sport === "run");
  const label = formatDuration(secs);
  return [
    {
      id: "fuel",
      q: t(`Eating for ${label}`, `Mangiare per ${label}`),
      page: "body",
      kind: "value",
      exact: true,
      ...(target.grams
        ? {
            value: `${Math.round(target.grams)} g`,
            answer: t(
              `About ${briochesFor(target.grams)} brioches · ${Math.round(target.low)}–${Math.round(target.high)} g of carbs`,
              `Circa ${briochesFor(target.grams)} brioche · ${Math.round(target.low)}–${Math.round(target.high)} g di carboidrati`,
            ),
          }
        : { answer: t("Under 1h 15m there's no need", "Sotto 1h 15m non serve") }),
      dest: { kind: "stay" },
    },
  ];
}

const saveRow = (id: string, q: string, answer: string, action: WriteAction): Entry => ({
  id,
  q,
  answer,
  page: "save",
  kind: "plan",
  exact: true,
  dest: write(action),
});

/** Whether a value is one the save would accept at all. */
function allowed(field: WellnessField, value: number, today: string) {
  return entrySchema.safeParse({ date: today, [field]: value }).success;
}

function offRow(d: IntentData, off: OffKind, mark: boolean): Entry[] {
  const on = !!offEventOn(d.offEvents ?? [], d.today, off);
  const word = off === "SICK" ? t("illness", "malattia") : t("injury", "infortunio");
  if (mark === on)
    return [
      {
        id: "off-already",
        q: mark
          ? t(`Today is already marked: ${word}`, `Oggi è già segnato: ${word}`)
          : t(`Today isn't marked: ${word}`, `Oggi non è segnato: ${word}`),
        page: "tree",
        kind: "plan",
        exact: true,
        dest: route("/", { sheet: "today" }),
      },
    ];
  return [
    saveRow(
      "save-off",
      mark
        ? t(`Mark ${word} today`, `Segna ${word} oggi`)
        : t(`Remove ${word} from today`, `Togli ${word} da oggi`),
      t("Today, on the calendar", "Oggi, sul calendario"),
      { kind: "off", off, today: d.today, label: word },
    ),
  ];
}

type ScaleField = "sleepQuality" | "fatigue" | "stress" | "mood";

// intervals.icu's own 1–4 scales, 1 the best answer, named as the check-in names them.
const SCALE_NAMES: Record<ScaleField, { en: string; it: string; levels: [string, string][] }> = {
  sleepQuality: {
    en: "sleep",
    it: "sonno",
    levels: [
      ["great", "ottimo"],
      ["good", "buono"],
      ["average", "medio"],
      ["poor", "scarso"],
    ],
  },
  fatigue: {
    en: "fatigue",
    it: "fatica",
    levels: [
      ["low", "bassa"],
      ["average", "media"],
      ["high", "alta"],
      ["extreme", "estrema"],
    ],
  },
  stress: {
    en: "stress",
    it: "stress",
    levels: [
      ["low", "basso"],
      ["average", "medio"],
      ["high", "alto"],
      ["extreme", "estremo"],
    ],
  },
  mood: {
    en: "mood",
    it: "umore",
    levels: [
      ["great", "ottimo"],
      ["good", "buono"],
      ["OK", "OK"],
      ["low", "basso"],
    ],
  },
};

const SCALE_WORDS: [RegExp, ScaleField, number][] = [
  [/^(?:ho )?dormito (?:benissimo|molto bene)$|^slept (?:great|very well)$/, "sleepQuality", 1],
  [/^(?:ho )?dormito bene$|^slept well$/, "sleepQuality", 2],
  [/^(?:ho )?dormito cosi(?: cosi)?$|^slept ok$/, "sleepQuality", 3],
  [/^(?:ho )?dormito (?:male|malissimo)$|^slept (?:badly|poorly)$/, "sleepQuality", 4],
  [/^(?:riposat[oa]|fresc[oa]|rested|fresh)$/, "fatigue", 1],
  [/^(?:stanc[oa]|gambe pesanti|tired|heavy legs)$/, "fatigue", 3],
  [/^(?:stanchissim[oa]|distrutt[oa]|sfinit[oa]|exhausted|wrecked)$/, "fatigue", 4],
  [/^(?:tranquill[oa]|calm|relaxed)$/, "stress", 1],
  [/^(?:stressat[oa]|stressed)$/, "stress", 3],
  [/^molto stressat[oa]$|^very stressed$/, "stress", 4],
  [/^(?:di )?buon umore$|^(?:in a )?good mood$/, "mood", 2],
  [/^giu$|^(?:di )?cattivo umore$|^down$|^grumpy$|^(?:in a )?bad mood$/, "mood", 4],
];

/** "stanco oggi", "gambe pesanti", "dormito male": one part of the morning check-in, in your own words. */
function scaleRow(d: IntentData, s: string): Entry[] {
  const said = s
    .replace(/^(?:sono|mi sento|ho le|i feel|i am|i'm|feeling) /, "")
    .replace(/ (?:oggi|today|stamattina|this morning)$/, "");
  const hit = SCALE_WORDS.find(([re]) => re.test(said));
  if (!hit) return [];
  const [, field, value] = hit;
  const scale = SCALE_NAMES[field];
  const [en, it] = scale.levels[value - 1]!;
  const level = t(en, it);
  return [
    saveRow(
      `save-${field}`,
      t(`Save ${scale.en}: ${level}`, `Segna ${scale.it}: ${level}`),
      t("today, in the check-in", "oggi, nel check-in"),
      { kind: "wellness", date: d.today, field, value, label: level },
    ),
  ];
}

function writes(d: IntentData, s: string): Entry[] {
  const today = t("today", "oggi");
  const scale = scaleRow(d, s);
  if (scale.length) return scale;
  let m =
    /^(?:peso|weight) (\d{2,3}(?:[.,]\d{1,2})?) ?(?:kg)?$/.exec(s) ??
    /^(\d{2,3}(?:[.,]\d{1,2})?) ?kg$/.exec(s);
  if (m) {
    const value = number(m[1]!);
    if (!allowed("weight", value, d.today)) return [];
    return [
      saveRow("save-weight", t(`Save weight ${value} kg`, `Salva peso ${value} kg`), today, {
        kind: "wellness",
        date: d.today,
        field: "weight",
        value,
        label: `${value} kg`,
      }),
    ];
  }
  m = /^(?:grasso|fat|body fat) (\d{1,2}(?:[.,]\d)?) ?%?$/.exec(s);
  if (m) {
    const value = number(m[1]!);
    if (!allowed("bodyFat", value, d.today)) return [];
    return [
      saveRow("save-fat", t(`Save body fat ${value}%`, `Salva grasso ${value}%`), today, {
        kind: "wellness",
        date: d.today,
        field: "bodyFat",
        value,
        label: `${value}%`,
      }),
    ];
  }
  m =
    /^(?:sonno|sleep|dormito|ho dormito|slept) (\d{1,2})(?:[.,](\d))? ?(?:h|ore|ora|hours?)? ?(\d{1,2})? ?(?:m|min)?$/.exec(
      s,
    );
  if (m) {
    const secs = Math.round(
      Number(m[1]) * 3600 +
        (m[2] ? (Number(m[2]) / 10) * 3600 : 0) +
        (m[3] ? Number(m[3]) * 60 : 0),
    );
    if (secs < 3600 || secs > 16 * 3600 || (m[3] && Number(m[3]) > 59)) return [];
    const label = formatDuration(secs);
    return [
      saveRow(
        "save-sleep",
        t(`Save sleep ${label}`, `Salva sonno ${label}`),
        t("last night", "stanotte"),
        { kind: "wellness", date: d.today, field: "sleepSecs", value: secs, label },
      ),
    ];
  }
  m = /^hrv (\d{1,3})$/.exec(s);
  if (m && d.native) {
    const value = Number(m[1]);
    if (!allowed("hrv", value, d.today)) return [];
    return [
      saveRow("save-hrv", t(`Save HRV ${value} ms`, `Salva HRV ${value} ms`), today, {
        kind: "wellness",
        date: d.today,
        field: "hrv",
        value,
        label: `${value} ms`,
      }),
    ];
  }
  if (
    /^(non piu |no longer |not )(malat[oa]|sick|ill)$|^(guarit[oa]|recovered|fine malattia)$/.test(
      s,
    )
  )
    return offRow(d, "SICK", false);
  if (/^(non piu |no longer |not )(infortunat[oa]|injured)$|^fine infortunio$/.test(s))
    return offRow(d, "INJURED", false);
  if (/^(malat[oa]|malattia|influenza|sick|ill) (oggi|today)$/.test(s))
    return offRow(d, "SICK", true);
  if (/^(infortunat[oa]|infortunio|injured|injury) (oggi|today)$/.test(s))
    return offRow(d, "INJURED", true);
  m = /^(\d{1,2}) brioch(?:e|es|i)$/.exec(s) ?? /^brioch(?:e|es|i) (\d{1,2})$/.exec(s);
  if (m) {
    const count = Number(m[1]);
    const a =
      (d.acts ?? []).find((x) => x.start_date_local.slice(0, 10) === d.today) ?? d.acts?.[0];
    if (!a || count > 20) return [];
    return [
      saveRow(
        "save-brioche",
        t(`Save ${count} brioches`, `Segna ${count} brioche`),
        `${a.name ?? t("Activity", "Attività")} · ${dayText(a.start_date_local)}`,
        {
          kind: "brioche",
          activityId: a.id,
          count,
          label: String(count),
        },
      ),
    ];
  }
  m =
    /^(?:sensazion[ei]|feel|feeling|uscita|pedalata|giro|corsa|attivita|ride|run) (ottim[ao]|buon[ao]|normale|scars[ao]|pessim[ao]|strong|good|normal|poor|weak)$/.exec(
      s,
    );
  if (m) {
    const feel = FEEL_INDEX.findIndex((re) => re.test(m![1]!)) + 1;
    const a =
      (d.acts ?? []).find((x) => x.start_date_local.slice(0, 10) === d.today) ?? d.acts?.[0];
    if (!a || !feel) return [];
    return [
      saveRow(
        "save-feel",
        t(`Save feel: ${FEEL_LABEL[feel - 1]}`, `Segna sensazione: ${FEEL_LABEL[feel - 1]}`),
        `${a.name ?? t("Activity", "Attività")} · ${dayText(a.start_date_local)}`,
        { kind: "feel", activityId: a.id, feel, label: FEEL_LABEL[feel - 1]! },
      ),
    ];
  }
  return [];
}

const FEEL_INDEX = [
  /^(ottim|strong)/,
  /^(buon|good)/,
  /^(normal)/,
  /^(scars|poor)/,
  /^(pessim|weak)/,
];

/** Single days from today on that what's typed names, or starts naming. */
function matchDays(rest: string, today: string): WhenCandidate[] {
  const typed = plain(rest);
  const days = whenCandidates(rest, today).filter((c) => c.from === c.to && c.from >= today);
  const hits = [
    ...days.filter((c) => c.exact),
    ...days.filter((c) => plain(c.q) === typed),
    ...days.filter(
      (c) =>
        plain(c.q).startsWith(typed) ||
        plain(c.also ?? "")
          .split(" ")
          .some((w) => w.startsWith(typed)),
    ),
  ];
  const seen = new Set<string>();
  return hits.filter((c) => (seen.has(c.from) ? false : (seen.add(c.from), true)));
}

/** A stretch of time named at the end of what's typed, and what's before it. */
function splitPeriod(text: string, today: string) {
  const words = text.split(" ").filter(Boolean);
  for (let n = Math.min(words.length - 1, 4); n >= 1; n--) {
    const span = namesTime(words.slice(words.length - n).join(" "), today);
    if (span) return { body: words.slice(0, words.length - n).join(" "), span };
  }
  return { body: text, span: undefined };
}

const DAY_LINK = /^(?:per|il|di|on|for|the)$/;

/** A time at the start or the end of what's typed, and which words are left. */
function splitTime(words: string[], today: string) {
  const longest = Math.min(words.length, 4);
  for (let n = longest; n >= 1; n--) {
    const skip = n < words.length && DAY_LINK.test(words[0]!) ? 1 : 0;
    const head = words.slice(skip, skip + n).join(" ");
    const hit = head && namesTime(head, today);
    if (hit) return { when: hit, name: [skip + n, words.length] as const };
    const tail = words.slice(words.length - n).join(" ");
    const atEnd = namesTime(tail, today);
    if (atEnd) {
      const end = words.length - n;
      return {
        when: atEnd,
        name: [0, end > 0 && DAY_LINK.test(words[end - 1]!) ? end - 1 : end] as const,
      };
    }
  }
  return null;
}

const RUN_NAME = /\b(corsa|corsetta|run|jog)\b/;
const RIDE_NAME = /\b(uscita|pedalata|giro|giretto|bici|ride|bike)\b/;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "plan tomorrow": the Calendar on that day, its plan page open. Today or ahead only. */
function planDays(d: IntentData, rest: string): Entry[] {
  const hits = rest
    ? matchDays(rest, d.today)
    : whenCandidates("", d.today).filter((c) => c.id === "tomorrow");
  return hits.slice(0, 3).map((c, i) => {
    const there = (d.events ?? []).find((e) => e.date === c.from && isPlanned(e));
    const date = format(parseISO(c.from), "EEEE d MMMM");
    return {
      id: `plan-${c.from}`,
      q: t(`Plan ${c.q.toLowerCase()}`, `Pianifica ${c.q.toLowerCase()}`),
      page: "calendar" as const,
      kind: "plan" as const,
      exact: true,
      boost: 3 - i,
      answer: there?.name ? `${date} · ${t("already", "già")}: ${there.name}` : date,
      dest: route("/calendar", { month: c.from.slice(0, 7), plan: c.from }),
    };
  });
}

/** What's said about an activity's size among its words, wherever it is: "3h", "3 ore", "1h30", "90 min", "150 load". */
function takeEffort(words: string[]) {
  let seconds: number | undefined;
  let load: number | undefined;
  const keep = words.map(() => true);
  const drop = (...at: number[]) => at.forEach((i) => (keep[i] = false));
  const HOURS = /^(?:h|ora|ore|hours?)$/;
  const MINS = /^(?:m|min|minuti|minutes?)$/;
  const LOAD = /^(?:load|carico|tss)$/;
  words.forEach((w, i) => {
    if (!keep[i]) return;
    const next = words[i + 1];
    let m: RegExpExecArray | null;
    if (load == null && (m = /^(\d{1,4})(load|carico|tss)$/.exec(w))) {
      load = Number(m[1]);
      drop(i);
    } else if (load == null && /^\d{1,4}$/.test(w) && next && LOAD.test(next)) {
      load = Number(w);
      drop(i, i + 1);
    } else if (load == null && LOAD.test(w) && next && /^\d{1,4}$/.test(next)) {
      load = Number(next);
      drop(i, i + 1);
    } else if (seconds != null) {
      return;
    } else if ((m = /^(\d{1,2})h(\d{1,2})$/.exec(w))) {
      seconds = Number(m[1]) * 3600 + Number(m[2]) * 60;
      drop(i);
    } else if ((m = /^(\d+(?:[.,]\d+)?)(h|ora|ore|hours?)$/.exec(w))) {
      seconds = Math.round(number(m[1]!) * 3600);
      drop(i);
      if (next && /^\d{1,2}$/.test(next) && !LOAD.test(words[i + 2] ?? "")) {
        seconds += Number(next) * 60;
        drop(i + 1);
      }
    } else if ((m = /^(\d{1,3})(m|min|minuti|minutes?)$/.exec(w))) {
      seconds = Number(m[1]) * 60;
      drop(i);
    } else if (/^\d+(?:[.,]\d+)?$/.test(w) && next && HOURS.test(next)) {
      seconds = Math.round(number(w) * 3600);
      drop(i, i + 1);
    } else if (/^\d{1,3}$/.test(w) && next && MINS.test(next)) {
      seconds = Number(w) * 60;
      drop(i, i + 1);
    }
  });
  const fits = seconds != null && seconds >= 60 && seconds <= 24 * 3600;
  return { seconds: fits ? seconds : undefined, load, keep };
}

/** The lengths to choose from when none was typed. */
const FREE_LENGTHS: Record<MainSport, number[]> = {
  ride: [3600, 7200, 10800],
  run: [1800, 3600, 5400],
};

/** "plan saturday ride with Marco 3h": what's left beside the day and the time is the activity's own name, as you wrote it. */
function planRows(d: IntentData, rest: string, raw: string): Entry[] {
  // A week comes first: its words would otherwise read as a stretch of time, or as a name.
  const week = rest ? readSuggest(rest, d.today) : null;
  if (week?.week) return suggestRows(d, week);
  const dates = planDays(d, rest);
  if (dates.length) return dates;
  if (namesTime(rest, d.today)) return [];
  const typedWords = rest.split(" ");
  const effort = takeEffort(typedWords);
  const words = typedWords.filter((_, i) => effort.keep[i]);
  const split = splitTime(words, d.today);
  if (split && !(split.when.from === split.when.to && split.when.from >= d.today)) return [];
  const [from, to] = split?.name ?? [0, words.length];
  const left = words.slice(from, to).join(" ");
  const date = split?.when.from ?? addDays(d.today, 1);
  const minutes = effort.seconds ? Math.round(effort.seconds / 60) : undefined;
  if (!left) return minutes ? suggestRows(d, { minutes, day: date }) : [];
  const asked = readSuggest(left, d.today);
  if (asked?.kind && !asked.minutes && !asked.day && !asked.week)
    return suggestRows(d, { ...asked, minutes, day: date });
  // The raw words line up with the plain ones unless punctuation split a word; then the plain ones have to do.
  const rawAll = raw.trim().split(/\s+/).slice(1);
  const rawWords =
    rawAll.length === typedWords.length ? rawAll.filter((_, i) => effort.keep[i]) : words;
  const named = rawWords
    .slice(from, to)
    .join(" ")
    .replace(/[,;:]+$/, "");
  const name = cap(named).slice(0, 120);
  const type = RUN_NAME.test(left)
    ? "Run"
    : RIDE_NAME.test(left) || d.sport === "ride"
      ? "Ride"
      : "Run";
  const there = (d.events ?? []).find((e) => e.date === date && isPlanned(e));
  const when = format(parseISO(date), "EEEE d MMMM");
  const lengths =
    effort.seconds != null ? [effort.seconds] : FREE_LENGTHS[type === "Run" ? "run" : "ride"];
  return lengths.map((seconds, i) => ({
    ...saveRow(
      `save-ride-${date}-${seconds}`,
      `${t(`Plan: ${name}`, `Pianifica: ${name}`)} · ${formatDuration(seconds)}`,
      [
        there?.name ? `${when} · ${t("already", "già")}: ${there.name}` : when,
        effort.load != null ? `${t("load", "carico")} ${effort.load}` : null,
      ]
        .filter(Boolean)
        .join(" · "),
      {
        kind: "ride",
        date,
        name,
        type,
        seconds,
        ...(effort.load != null ? { load: effort.load } : {}),
        label: name,
      },
    ),
    boost: lengths.length - i,
  }));
}

/** The words for each kind of activity; indoor before ride, so "giro sui rulli" is indoor. */
const LOG_WORDS: [string[], ManualActivity["type"]][] = [
  [["palestra", "pesi", "forza", "gym", "weights", "strength"], "WeightTraining"],
  [["rulli", "indoor", "trainer", "zwift", "turbo"], "VirtualRide"],
  [["corsa", "corsetta", "run", "jog", "jogging"], "Run"],
  [["camminata", "passeggiata", "escursione", "walk", "hike"], "Walk"],
  [["nuoto", "nuotata", "swim"], "Swim"],
  [["uscita", "pedalata", "giro", "giretto", "bici", "ride", "bike"], "Ride"],
];

/** Which kind these words name; one slip allowed on a word long enough to mean it ("palesta"). */
function logKind(words: string[]) {
  for (const [list, type] of LOG_WORDS)
    if (words.some((w) => list.includes(w))) return { type, fixed: null };
  for (const [list, type] of LOG_WORDS)
    for (const w of words) {
      const fixed = w.length >= 5 ? list.find((x) => near(w, x)) : undefined;
      if (fixed) return { type, fixed };
    }
  return null;
}

const LOG_LABEL: Record<ManualActivity["type"], () => string> = {
  Ride: () => t("Ride", "Uscita"),
  VirtualRide: () => t("Indoor ride", "Rulli"),
  Run: () => t("Run", "Corsa"),
  WeightTraining: () => t("Gym", "Palestra"),
  Walk: () => t("Walk", "Camminata"),
  Swim: () => t("Swim", "Nuoto"),
  Other: () => t("Other", "Altro"),
};
const LOG_FILLER = /^(?:di|de|of|a|an|un|una|per|the|this)$/;
const LOG_NOTHING = /^(?:allenamento|workout|seduta|session|attivita|activity)$/;
const LOG_PARTS_OF_DAY: [RegExp, string][] = [
  [/^(?:stamattina|mattina|morning)$/, "09:00"],
  [/^(?:pomeriggio|afternoon)$/, "15:00"],
  [/^(?:stasera|sera|evening|tonight)$/, "19:00"],
];
/** C: with no effort said, a middling one, as the form starts from. */
const LOG_RPE = 5;

type LogFields = {
  date: string;
  type: ManualActivity["type"];
  name: string;
  seconds: number;
  km?: number | undefined;
  load?: number | undefined;
  rpe?: number | undefined;
  time?: string | undefined;
  boost?: number | undefined;
};

function logRow(d: IntentData, f: LogFields): Entry {
  const minutes = Math.max(1, Math.round(f.seconds / 60));
  const estimate = f.load ?? loadFromRpe(minutes, f.rpe ?? LOG_RPE);
  const twin = (d.acts ?? []).find(
    (a) => a.start_date_local.slice(0, 10) === f.date && a.type === f.type,
  );
  const day = cap(spanTitle({ from: f.date, to: f.date }, d.today));
  return {
    ...saveRow(
      `save-log-${f.date}-${f.type}-${f.seconds}`,
      `${t(`Log: ${f.name}`, `Registra: ${f.name}`)} · ${formatDuration(f.seconds)}`,
      [
        f.time ? t(`${day} at ${f.time}`, `${day} alle ${f.time}`) : day,
        f.km != null ? `${f.km} km` : null,
        f.load != null
          ? `${t("load", "carico")} ${f.load}`
          : `${t("estimated load", "carico stimato")} ${estimate}`,
        f.rpe != null ? `RPE ${f.rpe}` : null,
        twin ? `${t("already", "già")}: ${twin.name ?? LOG_LABEL[f.type]()}` : null,
      ]
        .filter(Boolean)
        .join(" · "),
      {
        kind: "log",
        entry: {
          date: f.date,
          type: f.type,
          name: f.name,
          minutes,
          load: estimate,
          ...(f.time ? { time: f.time } : {}),
          ...(f.rpe != null ? { rpe: f.rpe } : {}),
          ...(f.km != null ? { distanceKm: f.km } : {}),
        },
        label: f.name,
      },
    ),
    ...(f.boost != null ? { boost: f.boost } : {}),
  };
}

/** "log 15m gym", "ieri ho fatto 1h di palestra", "registra corsa 5 km 30 min rpe 7 alle 18": what was done, today unless said. */
function logRows(d: IntentData, rest: string, rawRest: string, lengthRequired: boolean) {
  const typed = rest.split(" ").filter(Boolean);
  if (!typed.length) return null;
  const effort = takeEffort(typed);
  const keep = effort.keep;
  let km: number | undefined;
  let rpe: number | undefined;
  let time: string | undefined;
  let badTime = false;
  typed.forEach((w, i) => {
    if (!keep[i]) return;
    const next = typed[i + 1];
    let m: RegExpExecArray | null;
    if ((m = /^(\d+(?:[.,]\d+)?)km$/.exec(w))) {
      km = number(m[1]!);
      keep[i] = false;
    } else if (/^\d+(?:[.,]\d+)?$/.test(w) && next === "km") {
      km = number(w);
      keep[i] = keep[i + 1] = false;
    } else if ((m = /^rpe(\d{1,2})$/.exec(w))) {
      rpe = Number(m[1]);
      keep[i] = false;
    } else if (/^(?:rpe|sforzo)$/.test(w) && next && /^\d{1,2}$/.test(next)) {
      rpe = Number(next);
      keep[i] = keep[i + 1] = false;
    } else if (rpe == null && /^(?:facile|easy|legger[ao]|tranquill[ao])$/.test(w)) {
      rpe = 3;
      keep[i] = false;
    } else if (rpe == null && /^(?:dur[ao]|hard|intens[ao]|tost[ao])$/.test(w)) {
      rpe = 8;
      keep[i] = false;
    } else if (/^(?:alle|at)$/.test(w) && next && (m = /^(\d{1,2})(?:[.,](\d{2}))?$/.exec(next))) {
      // "18:30" reaches here as two words, once the colon has gone.
      const after = typed[i + 2];
      const joined = !m[2] && keep[i + 2] && after && /^\d{2}$/.test(after) ? after : null;
      const [h, min] = [Number(m[1]), Number(m[2] ?? joined ?? 0)];
      if (h > 23 || min > 59) badTime = true;
      time = `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
      keep[i] = keep[i + 1] = false;
      if (joined) keep[i + 2] = false;
    } else if (!time) {
      const part = LOG_PARTS_OF_DAY.find(([re]) => re.test(w));
      if (part) {
        time = part[1];
        keep[i] = false;
      }
    }
  });
  const { seconds, load } = effort;
  if (badTime || (rpe != null && (rpe < 1 || rpe > 10))) return null;
  if ((load ?? 0) > 1000 || (km ?? 0) > 1000 || (lengthRequired && !seconds)) return null;

  const words = typed.filter((_, i) => keep[i]);
  const split = splitTime(words, d.today);
  // Only what has happened: a day from today back.
  if (split && !(split.when.from === split.when.to && split.when.from <= d.today)) return null;
  const date = split?.when.from ?? d.today;
  const [start, end] = split?.name ?? [0, words.length];
  let from = start;
  let to = end;
  while (from < to && LOG_FILLER.test(words[from]!)) from++;
  while (to > from && LOG_FILLER.test(words[to - 1]!)) to--;
  const left = words.slice(from, to);
  const said = left.length && !(left.length === 1 && LOG_NOTHING.test(left[0]!));
  const known = said ? logKind(left) : null;
  const type = said ? (known?.type ?? "Other") : null;
  // A word we don't know could still be being typed: without a length it isn't one yet.
  if (!seconds && (!type || type === "Other")) return null;
  const rawAll = rawRest.trim().split(/\s+/);
  const rawWords = rawAll.length === typed.length ? rawAll.filter((_, i) => keep[i]) : words;
  const named =
    known?.fixed && left.length === 1
      ? known.fixed
      : rawWords
          .slice(from, to)
          .join(" ")
          .replace(/[,;:]+$/, "");
  const main: ManualActivity["type"] = d.sport === "run" ? "Run" : "Ride";
  const kinds: { type: ManualActivity["type"]; name: string }[] = type
    ? [{ type, name: cap(named).slice(0, 120) }]
    : [main, "WeightTraining" as const, "Walk" as const].map((x) => ({
        type: x,
        name: LOG_LABEL[x](),
      }));
  const lengths = seconds ? [seconds] : type === "Ride" ? FREE_LENGTHS.ride : [1800, 2700, 3600];
  return kinds.flatMap((k) =>
    lengths.map((secs, i) =>
      logRow(d, { ...k, date, seconds: secs, km, load, rpe, time, boost: lengths.length - i }),
    ),
  );
}

const USUAL_DAYS = 60;

/** "log" alone: what you actually do, most often first. Twice at least, or it isn't usual. */
function usualRows(d: IntentData): Entry[] {
  const since = addDays(d.today, -USUAL_DAYS);
  const seen = new Map<
    string,
    { type: ManualActivity["type"]; name: string; seconds: number; n: number }
  >();
  for (const a of d.acts ?? []) {
    if (a.start_date_local.slice(0, 10) < since || !a.name || !a.moving_time) continue;
    if (!a.type || !(a.type in LOG_LABEL)) continue;
    // To the quarter of an hour, so 44 and 46 minutes are the same habit.
    const seconds = Math.max(1, Math.round(a.moving_time / 900)) * 900;
    const key = `${a.type}|${a.name}|${seconds}`;
    const was = seen.get(key);
    if (was) was.n++;
    else seen.set(key, { type: a.type as ManualActivity["type"], name: a.name, seconds, n: 1 });
  }
  return [...seen.values()]
    .filter((u) => u.n >= 2)
    .sort((a, b) => b.n - a.n)
    .slice(0, 2)
    .map((u, i) => logRow(d, { ...u, date: d.today, boost: 2 - i }));
}

/** A log's words, whichever way it's said, with the raw ones lined up for the name. */
function logParts(s: string, query: string) {
  const rawAll = query.trim().split(/\s+/);
  const short = /^(?:log|logga|registra)(?: (.*))?$/.exec(s);
  if (short)
    return {
      rest: (short[1] ?? "").trim(),
      rawRest: rawAll.slice(1).join(" "),
      required: false,
    };
  const said = /^(?:(oggi|ieri|today|yesterday) )?(?:ho fatto|i did)(?: (.*))?$/.exec(s);
  if (!said) return null;
  const skip = said[1] ? 3 : 2;
  return {
    rest: `${said[1] ?? ""} ${said[2] ?? ""}`.trim(),
    rawRest: `${said[1] ?? ""} ${rawAll.slice(skip).join(" ")}`.trim(),
    required: true,
  };
}

function logAsked(s: string, query: string, d: IntentData) {
  const parts = logParts(s, query);
  if (!parts) return null;
  if (!parts.rest && !parts.required) return usualRows(d);
  return logRows(d, parts.rest, parts.rawRest, parts.required);
}

const activityRow = (a: Activity): Entry => ({
  id: `delete-${a.id}`,
  q: t(`Delete: ${a.name ?? "Activity"}`, `Elimina: ${a.name ?? "Attività"}`),
  answer: [dayText(a.start_date_local), formatDuration(a.moving_time)].join(" · "),
  page: "ride",
  kind: "ride",
  exact: true,
  // The page asks once more: a recorded activity doesn't come back.
  dest: route("/rides/$id", { delete: "1" }, { id: a.id }),
});

/** "elimina ultima corsa", "elimina ieri", "elimina Gym". Opens the activity, ready to confirm; nothing goes from here. */
function deleteRows(d: IntentData, s: string): Entry[] | null {
  const m = /^(?:elimina|cancella|delete)(?: (?:la|il|lo|the|my|mia|mio))? (.+)$/.exec(s);
  if (!m) return null;
  const rest = m[1]!.replace(/^l'/, "").trim();
  const acts = d.acts ?? [];
  const last = /^(?:ultim[aoe]|last|latest) (.+)$/.exec(rest);
  if (last) {
    const hit = SPORT_WORDS.find(([re]) => re.test(last[1]!));
    const a = hit && acts.find(hit[1]);
    return a ? [activityRow(a)] : null;
  }
  const when = namesTime(rest, d.today);
  if (when) {
    // Today can also hold what's planned: togli's own row says so.
    if (when.from !== when.to || when.from > d.today) return null;
    const that = acts.filter((a) => a.start_date_local.slice(0, 10) === when.from);
    if (that.length) return that.slice(0, 3).map(activityRow);
    if (when.from === d.today) return null;
    return [noteRow("delete-none", t("Nothing recorded that day", "Nessuna attività quel giorno"))];
  }
  if (matchDays(rest, d.today).length) return null;
  const words = plain(rest).split(" ");
  const named = acts.filter((a) => {
    const name = plain(a.name ?? "");
    return words.every((w) => name.includes(w));
  });
  return named.length ? named.slice(0, 3).map(activityRow) : null;
}

/** A row that only tells: nothing to choose, the words are the answer. */
function noteRow(id: string, q: string, answer?: string): Entry {
  return {
    id: `note-${id}`,
    q,
    ...(answer ? { answer } : {}),
    page: "save",
    kind: "plan",
    exact: true,
    dest: { kind: "stay" },
  };
}

const HINTS: [RegExp, () => string][] = [
  [/^(?:log|logga|registra)$/, () => t("log + length + activity", "registra + durata + attività")],
  [
    /^(?:plan|pianifica|schedule|programma)$/,
    () => t("plan + day + name + length", "pianifica + giorno + nome + durata"),
  ],
  [/^(?:togli|rimuovi|remove)$/, () => t("remove + day", "togli + giorno")],
  [/^(?:sposta|move)$/, () => t("move + day + to + day", "sposta + giorno + a + giorno")],
  [
    /^(?:elimina|delete)$/,
    () => t("delete + last activity, or a day", "elimina + ultima attività, o un giorno"),
  ],
  [
    /^(?:best|miglior|migliore|record)$/,
    () => t("best + climb, or a length", "miglior + salita, o una durata"),
  ],
  [
    /^(?:confronta|compare)$/,
    () => t("compare + stretch + and + stretch", "confronta + periodo + con + periodo"),
  ],
];

/** A command word alone: one quiet row with what can follow, after anything real. */
export function hintRows(query: string): Entry[] {
  const s = command(query);
  const hit = HINTS.find(([re]) => re.test(s));
  return hit ? [{ ...noteRow(`hint-${s}`, hit[1]()), boost: -60 }] : [];
}

/** When a command is clear but what follows can't be done: says why, and what can. Only when nothing else was found. */
export function explainRows(query: string, d: IntentData): Entry[] {
  const s = command(query);
  const parts = logParts(s, query);
  if (parts?.rest) {
    const rpe = /\b(?:rpe|sforzo) ?(\d{1,2})\b/.exec(parts.rest);
    if (rpe && (Number(rpe[1]) < 1 || Number(rpe[1]) > 10))
      return [noteRow("rpe", t("RPE goes from 1 to 10", "L'RPE va da 1 a 10"))];
    const typed = parts.rest.split(" ");
    const effort = takeEffort(typed);
    const words = typed.filter((_, i) => effort.keep[i]);
    const when = splitTime(words, d.today)?.when;
    if (when && when.to > d.today && when.from === when.to)
      return [
        noteRow(
          "log-ahead",
          t("You can't log what hasn't happened", "Non si può registrare il futuro"),
        ),
        ...planRows(d, parts.rest, `plan ${parts.rawRest}`),
      ];
    if (when && when.from !== when.to)
      return [noteRow("log-span", t("Log it on one day", "Registrala in un giorno solo"))];
    if (!effort.seconds && words.length)
      return [
        noteRow(
          "log-length",
          t("Add how long it lasted", "Aggiungi quanto è durata"),
          t(`log ${parts.rest} 1h`, `registra ${parts.rest} 1h`),
        ),
      ];
    return [];
  }
  const planning = /^(?:plan|pianifica|schedule|programma) (.+)$/.exec(s);
  if (planning) {
    const typed = planning[1]!.split(" ");
    const effort = takeEffort(typed);
    const when = splitTime(
      typed.filter((_, i) => effort.keep[i]),
      d.today,
    )?.when;
    if (when && when.from < d.today)
      return [
        noteRow("plan-past", t("You can't plan what's gone", "Non si può pianificare il passato")),
        ...(when.from === when.to
          ? (logRows(d, planning[1]!, query.trim().split(/\s+/).slice(1).join(" "), false) ?? [])
          : []),
      ].slice(0, 3);
    return [];
  }
  const ahead = () =>
    noteRow(
      "change-past",
      t("Plans change from today on", "I programmi si cambiano da oggi in poi"),
      t("For a recorded activity: delete + day", "Per un'attività già fatta: elimina + giorno"),
    );
  const removed = /^(?:togli|rimuovi|remove) (.+)$/.exec(s);
  if (removed && namesTime(removed[1]!, d.today)) return [ahead()];
  const moved = /^(?:sposta|move) (.+?) (?:a|al|alla|to|su|on|in) (.+)$/.exec(s);
  if (moved && (namesTime(moved[1]!, d.today) || namesTime(moved[2]!, d.today))) return [ahead()];
  if (
    /^(?:best|migliori?|migliore|miglior|record|quante volte|how many times|how often|quanti passaggi|passaggi|quanti tentativi|tentativi|attempts) ./.test(
      s,
    ) &&
    d.climbs.length
  )
    return [noteRow("no-climb", t("No climb goes by that name", "Nessuna salita si chiama così"))];
  const left = chartLeftover(query, d.today);
  if (left) {
    const words = left.unknown.join(" ");
    return [
      {
        ...noteRow(
          "not-understood",
          t(`Understood ${left.known}, not ${words}`, `Ho capito ${left.known}, non ${words}`),
          t("Try:", "Prova così:"),
        ),
        follow: left.follow,
      },
    ];
  }
  return [];
}

/** What typing can change on a day: your own workouts and activities. Races keep to their form. */
const changeable = (e: PlannedEvent) => e.category === "WORKOUT" || isFreeRide(e);

const planName = (e: PlannedEvent) => e.name ?? t("Planned workout", "Allenamento pianificato");
const longDay = (date: string) => format(parseISO(date), "EEEE d MMMM");

function nothingOn(date: string): Entry {
  return {
    id: `change-none-${date}`,
    q: t(`Nothing to change: ${longDay(date)}`, `Niente da modificare: ${longDay(date)}`),
    page: "calendar",
    kind: "plan",
    exact: true,
    dest: route("/calendar", { month: date.slice(0, 7), plan: date }),
  };
}

/** "togli sabato", "sposta sabato a domenica": each thing planned there is a row, and only choosing one changes it. */
function changeRows(d: IntentData, s: string): Entry[] | null {
  const moved = /^(?:sposta|move)(?: (?:il|la|lo|the))? (.+?) (?:a|al|alla|to|su|on|in) (.+)$/.exec(
    s,
  );
  if (moved) {
    const from = matchDays(moved[1]!, d.today)[0]?.from;
    const to = matchDays(moved[2]!, d.today)[0]?.from;
    if (!from || !to || from === to) return null;
    const there = (d.events ?? []).filter((e) => e.date === from && changeable(e));
    if (!there.length) return [nothingOn(from)];
    const busy = (d.events ?? []).find((e) => e.date === to && isPlanned(e));
    return there
      .slice(0, 3)
      .map((e) =>
        saveRow(
          `move-plan-${e.id}`,
          t(`Move: ${planName(e)}`, `Sposta: ${planName(e)}`),
          [
            `${longDay(from)} → ${longDay(to)}`,
            busy?.name ? `${t("already", "già")}: ${busy.name}` : null,
          ]
            .filter(Boolean)
            .join(" · "),
          { kind: "move-plan", id: e.id, from, to, label: planName(e) },
        ),
      );
  }
  const removed =
    /^(?:togli|rimuovi|cancella|elimina|remove|delete|cancel)(?: (?:il|la|lo|the))? (.+)$/.exec(s);
  if (!removed) return null;
  const date = matchDays(removed[1]!, d.today)[0]?.from;
  if (!date) return null;
  const there = (d.events ?? []).filter((e) => e.date === date && changeable(e));
  if (!there.length) return [nothingOn(date)];
  return there
    .slice(0, 3)
    .map((e) =>
      saveRow(
        `remove-plan-${e.id}`,
        t(`Remove: ${planName(e)}`, `Togli: ${planName(e)}`),
        longDay(date),
        { kind: "remove-plan", event: e, label: planName(e) },
      ),
    );
}

/** "settembre 2025 vs settembre 2026": each stretch as a row, opening its own recap. */
function compareRows(d: IntentData, s: string): Entry[] {
  const m =
    /^(?:confronta|compare) (.+?) (?:con|e|and|with) (.+)$/.exec(s) ??
    /^(.+?) (?:vs\.?|versus|contro|rispetto a|against) (.+)$/.exec(s);
  if (!m) return [];
  const [a, b] = [m[1]!.trim(), m[2]!.trim()];
  let left: Span | undefined = resolveSpan(a, d.today);
  let right: Span | undefined = resolveSpan(b, d.today);
  if (!left || !right) return [];
  const wholeMonth = (x: Span) =>
    monthSpan(Number(x.from.slice(0, 4)), Number(x.from.slice(5, 7)) - 1).to === x.to &&
    x.from.endsWith("-01");
  // "settembre 2025 vs 2026": the year said alone means the same month.
  const sameMonth = (x: Span, year: string) =>
    monthSpan(Number(year), Number(x.from.slice(5, 7)) - 1);
  if (/^20\d\d$/.test(b) && wholeMonth(left)) right = sameMonth(left, b);
  else if (/^20\d\d$/.test(a) && wholeMonth(right)) left = sameMonth(right, a);
  const row = (span: Span, boost: number): Entry => {
    const end = span.to < d.today ? span.to : d.today;
    const acts = (d.acts ?? []).filter((x) => {
      const day = x.start_date_local.slice(0, 10);
      return day >= span.from && day <= end;
    });
    const sum = (read: (x: Activity) => number | null | undefined) =>
      acts.reduce((n, x) => n + (read(x) ?? 0), 0);
    return {
      id: `compare-${span.from}-${span.to}`,
      // Side by side, a month always says its year.
      q: wholeMonth(span)
        ? cap(format(parseISO(span.from), "MMMM yyyy"))
        : spanTitle(span, d.today),
      page: "recap",
      kind: "value",
      exact: true,
      boost,
      value: `${num(Math.round(sum((x) => x.distance) / 1000))} km`,
      answer: [
        formatDuration(sum((x) => x.moving_time)),
        `${t("load", "carico")} ${num(Math.round(sum((x) => x.icu_training_load)))}`,
        t(`${acts.length} activities`, `${acts.length} attività`),
        span.to >= d.today ? t("so far", "finora") : null,
      ]
        .filter(Boolean)
        .join(" · "),
      dest: route("/recap", { from: span.from, to: span.to }),
    };
  };
  if (left.from > d.today || right.from > d.today) return [];
  return [row(left, 1), row(right, 0)];
}

/** A duration however it's typed, down to the unit still being written: "5", "5'", "5 mi", "1h30", "90 min", "30 s". */
function looseDuration(s: string): { secs: number; label: string } | null {
  const both = /^(\d{1,2}) ?h(?:ours?)? ?(\d{1,2}) ?(?:m[a-z]*)?$/.exec(s);
  if (both) {
    const secs = Number(both[1]) * 3600 + Number(both[2]) * 60;
    return secs ? { secs, label: formatDuration(secs) } : null;
  }
  const m = /^(\d+(?:[.,]\d+)?) ?('|s[a-z]*|m[a-z]*|h[a-z]*|or[a-z]*|o)?$/.exec(s);
  if (!m) return null;
  const n = number(m[1]!);
  const u = m[2] ?? "m";
  const unit = u === "'" ? "m" : u[0]!;
  const secs = Math.round(unit === "s" ? n : unit === "m" ? n * 60 : n * 3600);
  if (secs < 1 || secs > 12 * 3600) return null;
  return { secs, label: unit === "s" ? `${n} s` : unit === "m" ? `${n} min` : `${n} h` };
}

const powerTitle = (label: string) => t(`Power ${label}`, `Potenza ${label}`);
const powerPlot = route("/analysis", { plot: "power" });
const clockOf = (secs: number) =>
  secs < 60 ? `${secs} s` : secs < 3600 ? `${Math.round(secs / 60)} min` : formatDuration(secs);
/** A share of something, said as a share: "96%". */
const pct = (a: number, b: number) => `${Math.round((a / b) * 100)}%`;

const curvesOf = (d: IntentData) => ({
  c42: d.curves?.find((c) => c.id.includes("42")),
  c1y: d.curves?.find((c) => c.id.includes("1y") || c.id.includes("365")),
});

function fittedPower(d: IntentData, secs: number): number | null {
  const { c42, c1y } = curvesOf(d);
  const curve = c1y ?? c42;
  const fit = curveFit(curve);
  if (!fit || fit.r2 < 0.9) return null;
  const model = fit.omni
    ? omPD(fit, secs)
    : secs >= 180 && secs <= 1800
      ? fit.cp + fit.wPrime / secs
      : null;
  // You can't hold for longer more than you've ever held for less: past that, the fit is what's wrong.
  const shorter = curve!.secs.reduce<number | null>(
    (m, s, i) => (s < secs && curve!.watts[i] ? curve!.watts[i]! : m),
    null,
  );
  return model != null && (shorter == null || model <= shorter) ? model : null;
}

/** "potenza 5 min": what you've held for that long lately, against your year, your weight and your FTP. */
function powerRows(d: IntentData, dur: { secs: number; label: string }): Entry[] {
  const { c42, c1y } = curvesOf(d);
  if (!c42 && !c1y) return [];
  const now = valueAt(c42, dur.secs);
  const year = valueAt(c1y, dur.secs);
  const shown = now ?? year;
  const base = {
    id: "power",
    q: powerTitle(dur.label),
    page: "analysis" as const,
    kind: "value" as const,
    exact: true,
    boost: 2,
    dest: powerPlot,
  };
  if (shown == null) {
    const guess = fittedPower(d, dur.secs);
    return [
      {
        ...base,
        ...(guess != null ? { value: `~${Math.round(guess)} W` } : {}),
        answer: [
          t("Nothing that long yet", "Ancora nessuno sforzo così lungo"),
          guess != null ? t("estimate from your curve", "stima dalla tua curva") : null,
        ]
          .filter(Boolean)
          .join(" · "),
      },
    ];
  }
  const read = (c42 && now != null ? c42 : c1y)!.secs.find((s) => s >= dur.secs)!;
  const against =
    now != null && year != null
      ? now >= year
        ? t("Last 42 days · your best of the year", "Ultimi 42 giorni · il tuo meglio dell'anno")
        : t(
            `Last 42 days · ${pct(now, year)} of the year's ${Math.round(year)} W`,
            `Ultimi 42 giorni · ${pct(now, year)} dei ${Math.round(year)} W dell'anno`,
          )
      : now != null
        ? t("Last 42 days", "Ultimi 42 giorni")
        : t("Last year · not in the last 42 days", "Ultimo anno · non negli ultimi 42 giorni");
  const rows: Entry[] = [
    {
      ...base,
      ...curveDetail(c42 && now != null ? c42 : c1y, dur.secs, "potenza", false),
      value: `${Math.round(shown)} W`,
      answer: [
        read !== dur.secs ? t(`read at ${clockOf(read)}`, `letti sui ${clockOf(read)}`) : null,
        against,
        d.weight ? `${(shown / d.weight).toFixed(2)} W/kg` : null,
        d.ftp ? `${pct(shown, d.ftp)} FTP` : null,
      ]
        .filter(Boolean)
        .join(" · "),
    },
  ];
  // Only in the range the model reads well, and only when it's clearly more than what's on the curve.
  const best = Math.max(now ?? 0, year ?? 0);
  const model =
    read === dur.secs && dur.secs >= 180 && dur.secs <= 3600 ? fittedPower(d, dur.secs) : null;
  if (model != null && model >= best * 1.05)
    rows.push({
      ...base,
      id: "power-room",
      q: t(`Room at ${dur.label}`, `Margine su ${dur.label}`),
      boost: 1,
      value: `~${Math.round(model)} W`,
      answer: t(
        "What the rest of your curve expects at this length",
        "Quello che il resto della tua curva si aspetta su questa durata",
      ),
    });
  return rows;
}

const POWER_MARKS = [5, 60, 300, 1200];

/** "potenza" alone: a few points of the curve, and the curve itself. */
function powerOverview(d: IntentData): Entry[] {
  const { c42, c1y } = curvesOf(d);
  const points = POWER_MARKS.flatMap((secs) => {
    const w = valueAt(c42, secs) ?? valueAt(c1y, secs);
    return w ? [`${clockOf(secs)} ${Math.round(w)} W`] : [];
  });
  if (!points.length) return [];
  return [
    {
      id: "power",
      q: t("Power", "Potenza"),
      page: "analysis",
      kind: "value",
      exact: true,
      boost: 2,
      answer: points.join(" · "),
      dest: powerPlot,
    },
  ];
}

/** "passo 20 min": the same for running, from the pace curves of the running analysis. */
function paceRows(d: IntentData, dur: { secs: number; label: string }): Entry[] {
  const title = t(`Pace ${dur.label}`, `Passo ${dur.label}`);
  const base = {
    id: "pace",
    q: title,
    page: "analysis" as const,
    kind: "value" as const,
    exact: true,
    boost: 2,
    dest: route("/analysis", { plot: "bests" }),
  };
  const shortest = RUN_DUR[0]!;
  if (dur.secs < shortest)
    return [
      {
        ...base,
        answer: t(
          `Under ${shortest} s GPS can't read a pace`,
          `Sotto i ${shortest} s il GPS non legge un passo`,
        ),
      },
    ];
  if (!d.runs?.length || !d.runs.some((r) => r.curve))
    return d.sport === "run"
      ? [{ ...base, answer: t("Open Analysis once", "Apri l'Analisi una volta") }]
      : [];
  const i = RUN_DUR.findIndex((s) => s >= dur.secs);
  const since = (days: number) => {
    const from = addDays(d.today, -days);
    const curves = d.runs!.flatMap((r) => (r.curve && (r.date ?? "") >= from ? [r.curve] : []));
    return i < 0 ? null : (bestOfCurves(curves)[i] ?? null);
  };
  const now = since(42);
  const year = since(365);
  const shown = now ?? year;
  if (shown == null)
    return [{ ...base, answer: t("Nothing that long yet", "Ancora nessuno sforzo così lungo") }];
  return [
    {
      ...base,
      value: `${formatPace(shown)}/km`,
      answer: [
        now != null && year != null
          ? now >= year
            ? t(
                "Last 42 days · your best of the year",
                "Ultimi 42 giorni · il tuo meglio dell'anno",
              )
            : t(
                `Last 42 days · year ${formatPace(year)}/km`,
                `Ultimi 42 giorni · anno ${formatPace(year)}/km`,
              )
          : now != null
            ? t("Last 42 days", "Ultimi 42 giorni")
            : t("Last year · not in the last 42 days", "Ultimo anno · non negli ultimi 42 giorni"),
        d.runThreshold
          ? t(
              `${pct(shown, d.runThreshold)} of threshold`,
              `${pct(shown, d.runThreshold)} della soglia`,
            )
          : null,
        RUN_DUR[i] !== dur.secs
          ? t(`read at ${clockOf(RUN_DUR[i]!)}`, `letto sui ${clockOf(RUN_DUR[i]!)}`)
          : null,
      ]
        .filter(Boolean)
        .join(" · "),
    },
  ];
}

const KIND_WORDS: [RegExp, WorkoutKind][] = [
  [/^(recupero|scarico|recovery)$/, "recovery"],
  [/^(fondo|lungo|endurance|long|z2)$/, "endurance"],
  [/^(medio|tempo|sweet spot|sweetspot)$/, "tempo"],
  [/^(soglia|threshold|ftp)$/, "threshold"],
  [/^(vo2|vo2max)$/, "vo2"],
  [/^(sprint|anaerobico|anaerobic|velocita|speed)$/, "anaerobic"],
];
const SUGGEST_FILLER = new Set(
  "per un una il la lo di da su a an the for on in me allenamento workout seduta session".split(
    " ",
  ),
);

type SuggestAsk = SuggestFilter & {
  day?: string | undefined;
  week?: { from: string; to: string };
  load?: number | undefined;
};

/** What's asked for beside the word itself: a day or a week, a length, a kind, in any order. Null if something's left. */
function readSuggest(rest: string, today: string): SuggestAsk | null {
  const out: SuggestAsk = {};
  let text = ` ${rest.replace(/\bsweet spot\b/, "sweetspot")} `;
  const load =
    /\s(\d{2,4}) ?(?:load|carico|tss)(?=\s)/.exec(text) ??
    /\s(?:load|carico|tss) (\d{2,4})(?=\s)/.exec(text);
  if (load) {
    out.load = Number(load[1]);
    text = text.replace(load[0], " ");
  }
  const hours = /\s(\d+(?:[.,]\d+)?) ?(?:h|ore|ora|hours?)(?: ?(\d{1,2}))?(?=\s)/.exec(text);
  const mins = /\s(\d{2,3}) ?(?:m|min|minuti|minutes?)(?=\s)/.exec(text);
  if (hours) {
    out.minutes = Math.round(number(hours[1]!) * 60) + Number(hours[2] ?? 0);
    text = text.replace(hours[0], " ");
  } else if (mins) {
    out.minutes = Number(mins[1]);
    text = text.replace(mins[0], " ");
  }
  const left: string[] = [];
  for (const w of text.trim().split(" ").filter(Boolean)) {
    const kind = KIND_WORDS.find(([re]) => re.test(w));
    if (kind && !out.kind) out.kind = kind[1];
    else if (!SUGGEST_FILLER.has(w)) left.push(w);
  }
  const phrase = left.join(" ");
  if (!phrase) return out;
  if (/^(settimana|week)$/.test(phrase)) {
    out.week = { from: today, to: addDays(today, 6) };
    return out;
  }
  const span = whenCandidates(phrase, today).find(
    (c) => plain(c.q) === plain(phrase) && daysIn(c) === 7 && c.to >= today,
  );
  const named =
    /^(?:settimana prossima|prossima settimana|next week|questa settimana|this week)$/.test(phrase)
      ? whenCandidates("", today).find(
          (c) => c.id === (/prossima|next/.test(phrase) ? "next-week" : "this-week"),
        )
      : span;
  if (named) {
    out.week = { from: named.from, to: named.to };
    return out;
  }
  const day = matchDays(phrase, today)[0];
  if (!day) return null;
  out.day = day.from;
  return out;
}

const suggestDest = (date: string, id: string) => route("/suggest", { date, id });

/** The rows for a day: anything that stands in the way, then the workouts that fit. */
function dayRows(d: IntentData, s: DaySuggestion, filter: SuggestFilter): Entry[] {
  const today = d.today;
  const name = dayName(s.date, today);
  const calendar = route("/calendar", { month: s.date.slice(0, 7), plan: s.date });
  const out: Entry[] = [];
  const row = (id: string, q: string, answer: string | null, dest: Dest): Entry => ({
    id,
    q,
    page: "calendar",
    kind: "plan",
    exact: true,
    boost: 6,
    ...(answer ? { answer } : {}),
    dest,
  });
  if (s.ask === "off")
    return [
      row("suggest-off", t(`${name}: time off`, `${name}: giornata di stop`), null, calendar),
    ];
  if (s.ask === "race")
    return [row("suggest-race", t(`${name}: race`, `${name}: gara`), null, calendar)];
  const there = s.planned[0];
  if (there?.name)
    out.push(
      row(
        "suggest-there",
        t(`Already planned: ${there.name}`, `Già in programma: ${there.name}`),
        name,
        calendar,
      ),
    );
  if (s.ask === "rest" && !filter.kind && !filter.minutes)
    out.push({
      ...row(
        "suggest-rest",
        t(`${name}: rest`, `${name}: riposo`),
        null,
        route("/", { sheet: "today" }),
      ),
      page: "tree",
    });
  const first = t(`${name}, if you wake up well`, `${name}, se ti svegli bene`);
  s.picks.forEach((p, i) => {
    const hard = !["recovery", "endurance", "warmup"].includes(p.workout.kind);
    out.push({
      id: `suggest-${p.workout.id}`,
      q: p.workout.name,
      page: "workouts",
      kind: "plan",
      exact: true,
      boost: 3 - i,
      value: formatDuration(p.workout.seconds),
      answer: [
        i === 0 ? (s.conditional && hard ? first : name) : null,
        s.harderThanAsked && i === 0 ? t("the day asks for less", "la giornata chiede meno") : null,
        p.overLongest
          ? t(
              "longer than your recent longest run",
              "più lunga della tua corsa più lunga di recente",
            )
          : null,
        p.why,
        p.target,
      ]
        .filter(Boolean)
        .join(" · "),
      dest: suggestDest(s.date, p.workout.id),
    });
  });
  return out.slice(0, 3);
}

/** A workout's name and a day ("cirmolo 60 sabato", "faggio domani"): it opens ready for that day, and saves nothing. */
function workoutDayRows(typed: string, d: IntentData): Entry[] {
  const said = norm(typed).trim().replace(/\s+/g, " ");
  const found = workoutsNamed(said, d.sport, d.suggest?.pool);
  if (!found) return [];
  const day = matchDays(found.rest, d.today)[0];
  if (!day) return [];
  return found.workouts.slice(0, 3).map((w, i) => ({
    id: `workout-day-${w.id}`,
    q: w.name,
    page: "workouts" as const,
    kind: "plan" as const,
    exact: true,
    boost: 3 - i,
    value: formatDuration(w.seconds),
    answer: [dayName(day.from, d.today), w.label].join(" · "),
    dest: suggestDest(day.from, w.id),
  }));
}

function suggestRows(d: IntentData, asked: SuggestAsk): Entry[] {
  const input = d.suggest;
  if (!input) return [];
  if (asked.week) {
    const seconds = asked.minutes ? asked.minutes * 60 : undefined;
    const w = suggestWeek(input, asked.week.from, asked.week.to, { seconds, load: asked.load });
    const wanted = [
      seconds ? formatDuration(seconds) : null,
      asked.load ? `${t("load", "carico")} ${asked.load}` : null,
    ].filter(Boolean);
    return [
      {
        id: "suggest-week",
        q: t(
          `Week ${dayName(w.from, d.today).toLowerCase()} on`,
          `Settimana da ${dayName(w.from, d.today).toLowerCase()}`,
        ),
        page: "workouts",
        kind: "plan",
        exact: true,
        boost: 3,
        value: formatDuration(w.seconds),
        answer: [
          t(
            `${w.sessions} sessions · ${w.hard} hard`,
            `${w.sessions} sedute · ${w.hard} ${w.hard === 1 ? "intensa" : "intense"}`,
          ),
          wanted.length ? t(`asked ${wanted.join(" · ")}`, `chieste ${wanted.join(" · ")}`) : null,
          w.heldBack === "coming-back"
            ? t("you're coming back", "stai riprendendo")
            : w.heldBack === "taper"
              ? t("race coming", "gara vicina")
              : null,
        ]
          .filter(Boolean)
          .join(" · "),
        dest: route("/suggest", {
          from: w.from,
          to: w.to,
          ...(seconds ? { secs: String(seconds) } : {}),
          ...(asked.load ? { load: String(asked.load) } : {}),
        }),
      },
    ];
  }
  const filter = { minutes: asked.minutes, kind: asked.kind };
  return dayRows(d, suggestDay(input, asked.day ?? d.today, filter), filter);
}

const EVER = /\b(?:di sempre|all time|all-time|ever|assolut[oa])\b/;
const BEST =
  /^(?:best|migliori?|migliore|miglior|record|pr|pb)(?: (?:su |sul |sulla |del |della |di |al |on |in )?(.*))?$/;

/** The stretch whose power a best is asking about, so it's read only when asked. */
export function powerPeriodAsked(query: string, today: string): Span | null {
  for (const s of [command(query), simplify(query)]) {
    const m = BEST.exec(s);
    if (!m) continue;
    const { body, span } = splitPeriod((m[1] ?? "").replace(EVER, " ").trim(), today);
    if (!span || span.from > today) continue;
    const { said, text } = bestWords(body);
    if (!isPace(said) && bestLength(text, isPower(said))) return { from: span.from, to: span.to };
  }
  return null;
}

/** A climb's rows, for a stretch if one is named: unless those words are part of a climb's own name. */
function climbAsk(d: IntentData, text: string, what: "best" | "count"): Entry[] {
  const { body, span } = splitPeriod(text, d.today);
  if (span && body && !matchClimbs(d.climbs, text).length) return climbRows(d, body, what, span);
  return climbRows(d, text, what);
}

/** The rows a command typed in full gives; nothing when it isn't one. */
export function intentEntries(query: string, d: IntentData): Entry[] {
  const s = command(query);
  if (!s) return [];
  const names = { takenNames: [...d.climbs.map((c) => c.name), ...(d.forestNames ?? [])] };
  // "dislivello medio al mese 2025" is a number; only a chart word makes it a chart.
  // Without an average word "km al mese 2025" stays the chart it always was.
  if (!s.split(" ").some((w) => CHART_WORD.test(w))) {
    const average = averageRows(s, d, true);
    if (average.length) return average;
  }
  const chart = chartRows(query, { ...d, ...names });
  if (chart.length) return chart;
  if (/^(?:annulla|undo)$/.test(s))
    return [
      d.lastSaved
        ? {
            ...saveRow(
              "undo-last",
              t(`Undo: ${d.lastSaved}`, `Annulla: ${d.lastSaved}`),
              t("The last thing saved", "L'ultima cosa salvata"),
              { kind: "undo", label: d.lastSaved },
            ),
            value: t("Undo", "Annulla"),
          }
        : noteRow("undo-none", t("Nothing to undo", "Niente da annullare")),
    ];
  const saved = writes(d, s);
  if (saved.length) return saved;
  const batch = batchRows(query, s, d);
  if (batch.length) return batch;

  const deleting = deleteRows(d, s);
  if (deleting) return deleting;

  const planning = /^(?:plan|pianifica|schedule)(?: (.*))?$/.exec(s) ?? /^programma (.+)$/.exec(s);
  if (planning) return planRows(d, (planning[1] ?? "").trim(), query);

  const logged = logAsked(s, query, d);
  if (logged?.length) return logged;

  const changed = changeRows(d, s);
  if (changed) return changed;

  const many = manyRows(manyCommand(query), d);
  if (many.length) return many;
  const rows = readRows(s, d);
  if (rows.length) return rows;
  // As a sentence, what it comes down to; only reading, so a sentence never saves anything.
  const said = simplify(query);
  if (!said || said === s) return [];
  const chartSaid = chartRows(said, { ...d, ...names });
  if (chartSaid.length) return chartSaid;
  return manyRows(said, d).length ? manyRows(said, d) : readRows(said, d);
}

/** Several questions in one line: each must answer alone, and something with that very name stays itself. */
function manyRows(s: string, d: IntentData): Entry[] {
  const parts = manyParts(s, d.today);
  if (!parts) return [];
  const whole = plain(s);
  if (d.acts?.some((a) => a.name && plain(a.name) === whole)) return [];
  if (d.climbs.some((c) => plain(c.name) === whole)) return [];
  const rows = parts.map((p) => readRows(p, d)[0]);
  if (rows.some((r) => !r || r.id === "climb-none")) return [];
  return (rows as Entry[]).map((r, i) => ({
    ...r,
    id: `${r.id}-${i}`,
    exact: true,
    boost: parts.length - i,
  }));
}

const BATCH_SPLIT = /\s*,\s+|\s+(?:e|and)\s+/;

/**
 * "ieri 2h con Marco, gambe pesanti, 1 brioche": each part resolved on its own through what already saves one thing, then
 * offered together to confirm. Every part has to mean something, or it isn't this.
 */
function batchRows(query: string, s: string, d: IntentData): Entry[] {
  const parts = s.split(BATCH_SPLIT);
  const raws = query.trim().split(BATCH_SPLIT);
  if (parts.length < 2 || parts.length > 6 || parts.length !== raws.length) return [];
  const firstWords = parts[0]!.split(" ");
  const at = splitTime(firstWords, d.today);
  const wholeDay = at && at.when.from === at.when.to && at.when.from <= d.today;
  if (at && !wholeDay) return [];
  const day = wholeDay ? at.when.from : d.today;
  // The time goes with every part; said once at the start, only the first holds its words.
  const dayWords =
    at && at.name[0] > 0 ? firstWords.slice(0, at.name[0]) : at ? firstWords.slice(at.name[1]) : [];
  const stripDay = (p: string, i: number) =>
    i === 0 && at ? firstWords.slice(at.name[0], at.name[1]).join(" ") : p;
  const out: BatchPart[] = [];
  let logged = false;
  for (const [i, part] of parts.entries()) {
    const text = stripDay(part, i).trim();
    const raw =
      i === 0 && at ? raws[0]!.split(/\s+/).slice(at.name[0], at.name[1]).join(" ") : raws[i]!;
    if (!text) return [];
    const title = cap(raw.trim());
    const brioche = /^(\d{1,2}) brioch(?:e|es|i)$/.exec(text);
    if (brioche) {
      const count = Number(brioche[1]);
      if (count > 20) return [];
      out.push({
        title,
        detail: "",
        action: { kind: "brioche", activityId: "", count, label: title },
      });
      continue;
    }
    const one = writes(d, text)[0];
    if (one && one.dest.kind === "write") {
      const action = one.dest.action;
      if (action.kind === "off" && day !== d.today) return [];
      if (action.kind === "wellness") {
        const scale = SCALE_NAMES[action.field as ScaleField] ? ` (${action.value} / 4)` : "";
        out.push({ title, detail: `${one.q}${scale}`, action: { ...action, date: day } });
        continue;
      }
      if (action.kind === "off") {
        out.push({ title, detail: one.q, action });
        continue;
      }
      return [];
    }
    // A length and something else: an activity. "Con Marco" alone is your own sport.
    const named = /^(?:con|with) /.test(text) || / (?:con|with) /.test(text);
    const noKind = named && !logKind(text.split(" ").filter((w) => !/^\d/.test(w)))?.type;
    const sport = d.sport === "run" ? t("Run", "Corsa") : t("Ride", "Uscita");
    const logText = noKind ? `${sport.toLowerCase()} ${text}` : text;
    const row = (logRows(
      d,
      [...dayWords, logText].join(" "),
      [...dayWords, noKind ? `${sport.toLowerCase()} ${raw.trim()}` : raw.trim()].join(" "),
      true,
    ) ?? [])[0];
    if (!row || row.dest.kind !== "write" || row.dest.action.kind !== "log" || logged) return [];
    logged = true;
    out.push({ title, detail: row.answer ?? "", action: row.dest.action });
  }
  // A brioche goes on what's logged here, or else on that day's activity.
  const ofDay = (d.acts ?? []).find((a) => a.start_date_local.slice(0, 10) === day);
  for (const p of out) {
    if (p.action.kind !== "brioche") continue;
    if (!logged && !ofDay) return [];
    p.action = { ...p.action, activityId: logged ? LOGGED_IN_BATCH : ofDay!.id };
    p.detail = logged
      ? t("On the activity above", "Sull'attività qui sopra")
      : t(`On ${ofDay!.name ?? "the activity"}`, `Su ${ofDay!.name ?? "l'attività"}`);
  }
  if (out.length < 2) return [];
  const label = t(`Save ${out.length} things`, `Salva ${out.length} cose`);
  return [
    saveRow("save-batch", label, out.map((p) => p.title).join(" · "), {
      kind: "batch",
      parts: out,
      day,
      label,
    }),
  ];
}

/** The rows that only read. */
function readRows(typed: string, d: IntentData): Entry[] {
  const comparing = compareQuestions(typed, d);
  if (comparing.length) return comparing;
  const listed = filterRows(typed, d);
  if (listed.length) return listed;
  const timed = timeRows(typed, d);
  if (timed.length) return timed;
  const spread = distributionRows(typed, d);
  if (spread.length) return spread;
  const effort = effortRows(typed, d);
  if (effort.length) return effort;
  const climbAhead = climbPredictRows(typed, d);
  if (climbAhead.length) return climbAhead;

  const most =
    /^(?:potenza massima|massima potenza|max power|watt massimi|massimi watt) (.+)$/.exec(typed);
  const s = most
    ? `best potenza ${most[1]}`
    : EVER.test(typed) && /^(?:potenza|power|watts?|passo|pace) /.test(typed)
      ? `best ${typed}`
      : typed;

  const compared = compareRows(d, s);
  if (compared.length) return compared;

  const workoutDay = workoutDayRows(s, d);
  if (workoutDay.length) return workoutDay;

  const asking =
    /^(?:consiglia(?:mi)?|suggerisci(?:mi)?|suggest|recommend|idee|ideas)(?: (.*))?$/.exec(s) ??
    /^(?:allenamento|workout|cosa faccio|cosa posso fare|what should i do|what to do) (.+)$/.exec(
      s,
    );
  if (asking) {
    const said = (asking[1] ?? "").trim();
    // "Cosa faccio oggi" stays the day's own question, which answers why as well.
    const own = /^(?:cosa|what)/.test(s) && /^(oggi|today)$/.test(said);
    const asked = own ? null : readSuggest(said, d.today);
    const rows = asked ? suggestRows(d, asked) : [];
    if (rows.length) return rows;
  }

  const power =
    /^(?:quanti watt|potenza|power|watts?)(?: (?:per|su|sui|sul|di|for|over|at))?(?: (.+))?$/.exec(
      s,
    );
  const powerLast = /^(.+) (?:potenza|power|watts?)$/.exec(s);
  const paced = /^(?:passo|pace)(?: (?:per|su|sui|sul|di|for|over|at))?(?: (.+))?$/.exec(s);
  const durText = (power?.[1] ?? powerLast?.[1] ?? paced?.[1] ?? "").trim();
  const dur = durText ? looseDuration(durText) : null;
  if (power || powerLast) {
    if (dur) return d.sport === "run" ? paceRows(d, dur) : powerRows(d, dur);
    if (power && !durText && d.sport === "ride") {
      const all = powerOverview(d);
      if (all.length) return all;
    }
  } else if (paced && dur) {
    const rows = paceRows(d, dur);
    if (rows.length) return rows;
  }

  let m =
    /^(?:mangiare|mangio|quanto mangiare|fuel|eat|brioche|brioches|carbo|carboidrati) (?:per |for )?(\d+(?:[.,]\d+)?) ?(?:h|ore|ora|hours?)(?: ?(\d{1,2}))?$/.exec(
      s,
    );
  if (m) return fuelRow(d, number(m[1]!) + (m[2] ? Number(m[2]) / 60 : 0));

  m = BEST.exec(s);
  if (m) {
    const rest = (m[1] ?? "").replace(EVER, " ").trim().replace(/\s+/g, " ");
    const { body, span } = splitPeriod(rest, d.today);
    const numeric = [
      ...bestPower(d, body, span),
      ...bestPace(d, body, span),
      ...bestRun(d, body, span),
    ];
    return numeric.length ? numeric : climbAsk(d, rest, "best");
  }
  m =
    /^(?:quante volte|how many times|how many attempts|how often|quanti passaggi|passaggi|quanti tentativi|tentativi|attempts)(?: (?:su |sul |sulla |al |il |la |on |up |at )?(.*))?$/.exec(
      s,
    );
  if (m) return climbAsk(d, (m[1] ?? "").trim(), "count");

  m = /^(?:ultim[aoe]|last|latest) (.+)$/.exec(s);
  if (m) {
    const rest = m[1]!.trim();
    const activity = lastActivity(d, rest);
    if (activity.length) return activity;
    // "ultima settimana" and the like are stretches of time, not climbs.
    return d.climbs.length ? climbRows(d, rest, "last").filter((e) => e.id !== "climb-none") : [];
  }
  const average = averageRows(s, d);
  if (average.length) return average;
  const total = totalAsked(s);
  if (total) return totals(d, total.what, total.rest, total.only);
  return [];
}

export type LiveData = {
  today: string;
  sport: MainSport;
  checkIn: boolean;
  acts?: Activity[] | undefined;
  wellness?: Wellness[] | undefined;
  /** Season, score and form of today's crown. */
  score?: number | null | undefined;
  form?: number | null | undefined;
  zones?: { power: number[]; hr: number[] } | undefined;
  threshold?: number | null | undefined;
  pacePct?: number[] | null | undefined;
  planned?: PlannedEvent[] | undefined;
  races?: PlannedEvent[] | undefined;
  /** What suggestions read: "Cosa faccio oggi?" and "consiglia" have one answer. */
  suggest?: SuggestInput | undefined;
};

const DO_WORDS = ["fare", "allenamento", "oggi", "should", "train", "today", "consiglio", "advice"];

const SPORT_ALSO: Record<MainSport, string> = {
  ride: "uscita pedalata giro bici ride bike",
  run: "corsa run",
};

/** Your longest and hilliest, for one sport, however that sport is called. */
function recordRows(acts: Activity[], today: string, sport: MainSport, boost: number): Entry[] {
  const rec = rideRecords(acts, today, sport);
  const noun = sport === "run" ? "run" : "ride";
  const it = sport === "run" ? "Corsa" : "Uscita";
  const key = boost ? `-${sport}` : "";
  const longest = acts.find((a) => a.id === rec.longest);
  const climbing = acts.find((a) => a.id === rec.mostClimbing);
  const out: Entry[] = [];
  if (longest)
    out.push({
      id: `record-longest${key}`,
      q: t(`Longest ${noun}`, `${it} più lunga`),
      also: `longest piu lunga ${SPORT_ALSO[sport]}`,
      page: "ride",
      kind: "ride",
      boost,
      value: `${Math.round((longest.distance ?? 0) / 1000)} km`,
      answer: `${longest.name ?? ""} · ${dayText(longest.start_date_local)}`,
      dest: route("/rides/$id", undefined, { id: longest.id }),
    });
  if (climbing)
    out.push({
      id: `record-climbing${key}`,
      q: t(boost ? `Most climbing, ${noun}` : "Most climbing", `${it} con più dislivello`),
      also: `most climbing piu dislivello ${SPORT_ALSO[sport]}`,
      page: "ride",
      kind: "ride",
      boost,
      value: `${num(Math.round(climbing.total_elevation_gain ?? 0))} m`,
      answer: `${climbing.name ?? ""} · ${dayText(climbing.start_date_local)}`,
      dest: route("/rides/$id", undefined, { id: climbing.id }),
    });
  return out;
}

/** Answers that come from today's state, matched like any other phrase. */
export function liveEntries(d: LiveData): Entry[] {
  const out: Entry[] = workoutEntries(d.sport, d.today, d.suggest?.pool);
  const sheet = route("/", { sheet: "today" });
  const planned = (d.planned ?? []).find((e) => e.date === d.today && isPlanned(e));
  const limit: Ceiling | null =
    d.score != null && d.zones
      ? ceiling(d.score, d.zones, d.sport === "run" ? d.threshold : null, d.pacePct)
      : null;
  out.push({
    id: "do-today",
    q: t("What should I do today?", "Cosa faccio oggi?"),
    also: "what should do cosa faccio",
    page: "tree",
    kind: "plan",
    words: DO_WORDS,
    dest: sheet,
    ...(planned
      ? {
          answer: [planned.name, planned.moving_time ? formatDuration(planned.moving_time) : null]
            .filter(Boolean)
            .join(" · "),
        }
      : d.score != null
        ? {
            answer: [advice(d.score).title, limit ? ceilingText(limit) : null]
              .filter(Boolean)
              .join(" · "),
          }
        : {}),
  });
  if (!planned && d.score != null && d.score >= 40 && d.suggest) {
    const top = suggestDay(d.suggest, d.today).picks[0];
    if (top)
      out.push({
        id: "do-workout",
        q: top.workout.name,
        page: "workouts",
        kind: "plan",
        boost: -6,
        also: "cosa faccio what should",
        words: DO_WORDS,
        answer: [
          t("Fits today", "Adatta a oggi"),
          top.target,
          `${t("load", "carico")} ${top.workout.load}`,
        ]
          .filter(Boolean)
          .join(" · "),
        value: formatDuration(top.workout.seconds),
        dest: suggestDest(d.today, top.workout.id),
      });
  }
  // What's holding the crown where it is: the parts furthest below your normal.
  if (d.wellness?.length && d.acts) {
    const rows = d.checkIn ? d.wellness : readinessRows(d.wellness);
    const r = readinessFor(
      morningWellness(rows, d.acts, d.today),
      d.today,
      false,
      recentFeel(d.acts, d.today),
    );
    const low = [...r.components].sort((a, b) => a.score - b.score).slice(0, 2);
    if (low.length)
      out.push({
        id: "why-today",
        q: t("Why today?", "Perché oggi?"),
        also: "why perche",
        page: "tree",
        kind: "body",
        words: [
          "inverno",
          "autunno",
          "primavera",
          "estate",
          "piove",
          "pioggia",
          "nuvole",
          "winter",
          "autumn",
          "spring",
          "summer",
          "rain",
          "stagione",
          "readiness",
        ],
        answer: low.map((c) => `${c.label}: ${c.detail}`).join(" · "),
        dest: sheet,
      });
  }
  const next = (d.races ?? [])
    .filter((r) => r.date >= d.today)
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  const days = next
    ? Math.round((parseISO(next.date).getTime() - parseISO(d.today).getTime()) / 864e5)
    : 0;
  out.push({
    id: "next-race",
    q: t("Next race", "Prossima gara"),
    also: "next race prossima gara",
    page: "calendar",
    kind: "plan",
    words: ["manca", "quanto", "days", "gare", "races"],
    ...(next
      ? {
          value: days ? t(`${days} d`, `${days} g`) : t("today", "oggi"),
          answer: `${next.name ?? ""} · ${dayText(next.date)}`,
          dest: route("/calendar", { month: next.date.slice(0, 7) }),
        }
      : { answer: t("No race planned", "Nessuna gara in programma"), dest: route("/calendar") }),
  });
  if (d.acts?.length) {
    out.push(...recordRows(d.acts, d.today, d.sport, 0));
    // The other sport answers when it's named, after your own.
    out.push(...recordRows(d.acts, d.today, d.sport === "run" ? "ride" : "run", -5));
  }
  return out;
}
