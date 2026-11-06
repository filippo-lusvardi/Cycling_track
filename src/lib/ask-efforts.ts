// "power today 3m", "fc 5 min sabato scorso", "velocità media marzo": a metric, a length and a time, however they're typed.
// One day or one ride is read from its streams, which also says which ride it was; longer stretches from the curves.
import { mmp, valueAt, whoSet } from "./analysis";
import {
  aroundChips,
  curveFrom,
  curveOf,
  lengthChips,
  lengthText,
  openWords,
  targetPhrase,
  type AskDetail,
} from "./ask-detail";
import type { Dest, Entry } from "./ask";
import {
  readAsk,
  activityDay,
  type Asked,
  type Here,
  type IntentClimb,
  type Length,
} from "./ask-read";
import { command, simplify } from "./ask-sentence";
import { parseISO } from "date-fns";
import { format, t } from "./i18n";
import { addDays } from "./training";
import type { Activity, PowerCurve } from "./intervals";
import { formatPace } from "./pace";
import { bestOfCurves, RUN_DUR } from "./run-metrics";
import { isSport, type MainSport } from "./sport";
import type { Span } from "./ask-when";

/** What a question needs read before it can answer, so it's read only when asked. */
export type CurveNeed = Span & { metric: "power" | "hr"; sport: MainSport };

export type EffortNeeds = {
  rideIds: string[];
  curves: CurveNeed[];
  hrCurves: MainSport | null;
};

export const curveKey = (c: CurveNeed) => `${c.metric}|${c.from}|${c.to}|${c.sport}`;

export type CurveRead = { curve: PowerCurve | null; failed?: boolean };

export type RideSignal = { watts: (number | null)[]; heartrate: (number | null)[] };

export type EffortData = {
  today: string;
  sport: MainSport;
  acts?: Activity[] | undefined;
  climbs?: IntentClimb[] | undefined;
  here?: Here | null | undefined;
  ftp?: number | null | undefined;
  weight?: number | null | undefined;
  runs?: { date?: string; curve?: (number | null)[] }[] | undefined;
  /** By activity id, once read; null when it couldn't be. */
  signals?: Record<string, RideSignal | null> | undefined;
  rangeCurve?: (Span & { curve: PowerCurve | null; failed?: boolean }) | undefined;
  /** The curves of the stretches asked about, by `curveKey`, once read. */
  curveReads?: Record<string, CurveRead> | undefined;
  hrCurves?: PowerCurve[] | undefined;
};

const RECENT_DAYS = 42;
const POWER_MARKS = [5, 60, 300, 1200];
const HR_MARKS = [60, 300, 1200];

const clockOf = (secs: number) =>
  secs < 60 ? `${secs} s` : secs < 3600 ? `${Math.round(secs / 60)} min` : `${secs / 3600} h`;
const pastDay = (today: string, days: number) => addDays(today, -days);

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

/** A runner's power words mean pace, as they do everywhere else in the bar. */
export function effective(a: Asked, sport: MainSport): Asked {
  return a.metric === "power" && sport === "run" && a.sport !== "ride"
    ? { ...a, metric: "pace" }
    : a;
}

export function askedIn(query: string, d: EffortData): Asked | null {
  const ctx = {
    today: d.today,
    sport: d.sport,
    acts: d.acts,
    climbs: d.climbs,
    here: d.here,
  };
  for (const s of [command(query), simplify(query)]) {
    const a = s ? readAsk(s, ctx) : null;
    if (a) return effective(a, d.sport);
  }
  return null;
}

/** The activities a question is about, today's end of a stretch being today. */
export function activitiesOf(a: Asked, d: EffortData): Activity[] {
  const acts = d.acts ?? [];
  const t0 = a.target;
  if (t0?.kind === "ride") return acts.filter((x) => x.id === t0.id);
  const from = t0?.kind === "span" ? t0.from : pastDay(d.today, RECENT_DAYS - 1);
  const to = t0?.kind === "span" ? t0.to : d.today;
  return acts.filter((x) => {
    const day = activityDay(x);
    return day >= from && day <= to && (!a.sport || isSport(x, a.sport));
  });
}

const carries = (metric: "power" | "hr") => (x: Activity) =>
  metric === "power" ? x.icu_average_watts != null : x.average_heartrate != null;

/** Whether streams answer this: one ride, or one day already lived. */
export function readsStreams(a: Asked, today: string) {
  const t0 = a.target;
  if (!t0) return false;
  if (t0.kind === "ride") return true;
  const end = t0.to < today ? t0.to : today;
  return t0.from === end;
}

const withDetail = (detail: AskDetail | undefined) => (detail ? { detail } : {});

const wordOf = (metric: "power" | "hr") => (metric === "power" ? "power" : "hr");

/** A curve to look at, with the lengths and the days around it a tap away. */
function effortDetail(
  a: Asked,
  d: EffortData,
  read: (secs: number) => number | null | undefined,
  at: number | null,
  opensRide: boolean,
): AskDetail | undefined {
  const metric = a.metric as "power" | "hr";
  const view = curveFrom(read, at, metric === "power" ? "W" : "bpm");
  if (!view) return undefined;
  const phrase = a.target ? targetPhrase(a.target, d.here, d.today) : "";
  const say = (length: string, where: string) =>
    [wordOf(metric), length, where].filter(Boolean).join(" ");
  return {
    view,
    lengths: lengthChips(at, (length) => say(length, phrase)),
    ...(a.target
      ? aroundChips(a.target, d.today, (where) => say(at ? lengthText(at) : "", where))
      : {}),
    open:
      opensRide || a.target?.kind === "ride"
        ? openWords.ride()
        : metric === "power"
          ? openWords.curve()
          : openWords.recap(),
  };
}

const NO_NEEDS: EffortNeeds = { rideIds: [], curves: [], hrCurves: null };

/** What this question needs read. */
export function needsOfAsked(a: Asked | null, d: EffortData): EffortNeeds {
  if (!a || (a.shape !== "best" && a.shape !== "marks")) return NO_NEEDS;
  if (a.metric !== "power" && a.metric !== "hr") return NO_NEEDS;
  const sport = a.metric === "power" ? "ride" : (a.sport ?? d.sport);
  if (!a.target) return a.metric === "hr" ? { ...NO_NEEDS, hrCurves: sport } : NO_NEEDS;
  if (a.target.kind === "span" && a.target.from > d.today) return NO_NEEDS;
  if (readsStreams(a, d.today))
    return {
      ...NO_NEEDS,
      rideIds: activitiesOf(a, d)
        .filter(carries(a.metric))
        .map((x) => x.id),
    };
  const { from, to } = a.target as Span;
  return { ...NO_NEEDS, curves: [{ metric: a.metric, from, to, sport }] };
}

export const effortNeeds = (query: string, d: EffortData) => needsOfAsked(askedIn(query, d), d);

type Reading =
  | { state: "loading" | "failed" | "nothing" | "no-signal" }
  | { state: "ok"; at: (secs: number) => { value: number; ride?: Activity; read: number } | null };

function reading(a: Asked, d: EffortData): Reading {
  const metric = a.metric as "power" | "hr";
  if (readsStreams(a, d.today)) {
    const acts = activitiesOf(a, d);
    if (!acts.length) return { state: "nothing" };
    const here = acts.filter(carries(metric));
    if (!here.length) return { state: "no-signal" };
    const signals = here.map((x) => d.signals?.[x.id]);
    if (signals.some((s) => s === undefined)) return { state: "loading" };
    if (signals.every((s) => s === null)) return { state: "failed" };
    return {
      state: "ok",
      at: (secs) => {
        let best: { value: number; ride: Activity; read: number } | null = null;
        here.forEach((x, i) => {
          const s = signals[i];
          if (!s) return;
          const v = mmp(metric === "power" ? s.watts : s.heartrate, [secs])[0];
          if (v && (!best || v > best.value)) best = { value: v, ride: x, read: secs };
        });
        return best;
      },
    };
  }
  const span = a.target as (Span & { kind: "span" }) | null;
  if (!span) return { state: "nothing" };
  const legacy = metric === "power" ? d.rangeCurve : undefined;
  const held =
    d.curveReads?.[
      curveKey({
        metric,
        from: span.from,
        to: span.to,
        sport: metric === "power" ? "ride" : (a.sport ?? d.sport),
      })
    ] ?? (legacy && legacy.from === span.from && legacy.to === span.to ? legacy : undefined);
  if (!held) return { state: "loading" };
  if (held.failed) return { state: "failed" };
  if (!held.curve) return { state: "nothing" };
  const curve = held.curve;
  return {
    state: "ok",
    at: (secs) => {
      const value = valueAt(curve, secs);
      if (!value) return null;
      // Which ride set it, when the curve says and it's one this device knows.
      const id = whoSet(curve, secs);
      const named = id ? d.acts?.find((x) => x.id === id) : undefined;
      // A ride outside the stretch can't have set its best: then the id isn't to be trusted, and no ride is named.
      const day = named ? activityDay(named) : "";
      const ride = named && day >= span.from && day <= span.to ? named : undefined;
      return { value, read: curve.secs.find((s) => s >= secs) ?? secs, ...(ride ? { ride } : {}) };
    },
  };
}

const dayLabel = (day: string) => format(parseISO(day), "d MMM yyyy");

const metricLine = {
  power: () => t("Power", "Potenza"),
  hr: () => t("HR", "FC"),
  pace: () => t("Pace", "Passo"),
  speed: () => t("Speed", "Velocità"),
};

const shown = (metric: "power" | "hr", v: number) =>
  `${Math.round(v)} ${metric === "power" ? "W" : "bpm"}`;

function targetName(a: Asked) {
  const t0 = a.target;
  return !t0
    ? t(`last ${RECENT_DAYS} days`, `ultimi ${RECENT_DAYS} giorni`)
    : t0.kind === "ride"
      ? t0.name
      : t0.q;
}

function emptyText(state: "failed" | "nothing" | "no-signal" | "loading", metric: "power" | "hr") {
  if (state === "loading") return t("Loading…", "Caricamento…");
  if (state === "failed") return t("Needs a connection", "Serve la connessione");
  if (state === "nothing") return t("No activities", "Nessuna attività");
  return metric === "power"
    ? t("No power recorded", "Nessun dato di potenza")
    : t("No heart rate recorded", "Nessun dato di FC");
}

function destFor(a: Asked, ride?: Activity): Dest {
  if (ride) return route("/rides/$id", undefined, { id: ride.id });
  if (a.target?.kind === "ride") return route("/rides/$id", undefined, { id: a.target.id });
  if (a.target?.kind === "span" && a.metric !== "power")
    return route("/recap", { from: a.target.from, to: a.target.to });
  if (a.metric === "power") return route("/analysis", { plot: "power" });
  if (a.metric === "pace") return route("/analysis", { plot: "bests" });
  return route("/analysis", { view: "zones" });
}

function bestRow(a: Asked, d: EffortData, length: Length): Entry[] {
  const metric = a.metric as "power" | "hr";
  const title =
    metric === "power"
      ? t(`Best ${length.label}`, `Miglior ${length.label}`)
      : t(`Highest HR ${length.label}`, `FC più alta ${length.label}`);
  const base = {
    id: `effort-${metric}-best`,
    q: `${title} · ${targetName(a)}`,
    page: "analysis" as const,
    kind: "value" as const,
    exact: true,
    dest: destFor(a),
  };
  const r = reading(a, d);
  if (r.state !== "ok") return [{ ...base, answer: emptyText(r.state, metric) }];
  const got = r.at(length.secs);
  if (!got) return [{ ...base, answer: t("Nothing that long", "Nessuno sforzo così lungo") }];
  const name = got.ride?.name;
  const named = got.ride && !readsStreams(a, d.today);
  const day = got.ride ? activityDay(got.ride) : null;
  const recent =
    metric === "power" &&
    (a.target?.kind === "span"
      ? a.target.to >= pastDay(d.today, RECENT_DAYS)
      : !!day && day >= pastDay(d.today, RECENT_DAYS));
  return [
    {
      ...base,
      page: got.ride ? "ride" : base.page,
      dest: destFor(a, got.ride),
      value: shown(metric, got.value),
      ...withDetail(effortDetail(a, d, (x) => r.at(x)?.value, length.secs, !!got.ride)),
      answer:
        [
          name && a.target?.kind !== "ride" ? name : null,
          // Over a stretch, the day it happened too.
          named && day ? dayLabel(day) : null,
          got.read !== length.secs
            ? t(`read at ${clockOf(got.read)}`, `letti sui ${clockOf(got.read)}`)
            : null,
          recent && d.weight ? `${(got.value / d.weight).toFixed(2)} W/kg` : null,
          recent && d.ftp ? `${Math.round((got.value / d.ftp) * 100)}% FTP` : null,
        ]
          .filter(Boolean)
          .join(" · ") || undefined,
    } as Entry,
  ];
}

function marksRow(a: Asked, d: EffortData): Entry[] {
  const metric = a.metric as "power" | "hr";
  const base = {
    id: `effort-${metric}-marks`,
    q: `${metricLine[metric]()} · ${targetName(a)}`,
    page: "analysis" as const,
    kind: "value" as const,
    exact: true,
    dest: destFor(a),
  };
  const r = reading(a, d);
  if (r.state !== "ok") return [{ ...base, answer: emptyText(r.state, metric) }];
  const marks = (metric === "power" ? POWER_MARKS : HR_MARKS).flatMap((secs) => {
    const got = r.at(secs);
    return got ? [`${clockOf(secs)} ${shown(metric, got.value)}`] : [];
  });
  return [
    {
      ...base,
      ...withDetail(effortDetail(a, d, (x) => r.at(x)?.value, null, false)),
      answer: marks.length
        ? marks.join(" · ")
        : t("Nothing long enough", "Nessuno sforzo abbastanza lungo"),
    },
  ];
}

/** "fc 3 min": a person's own highest heart rate over that length, lately and further back. */
function hrAllRow(a: Asked, d: EffortData, length: Length): Entry[] {
  const base = {
    id: "effort-hr-best",
    q: t(`Highest HR ${length.label}`, `FC più alta ${length.label}`),
    page: "analysis" as const,
    kind: "value" as const,
    exact: true,
    dest: route("/analysis", { view: "zones" }),
  };
  if (!d.hrCurves) return [{ ...base, answer: t("Loading…", "Caricamento…") }];
  const find = (key: string) => d.hrCurves!.find((c) => c.id.includes(key));
  const now = valueAt(find("42"), length.secs);
  const year = valueAt(find("1y") ?? find("365"), length.secs);
  const ever = valueAt(find("all"), length.secs);
  const value = now ?? year ?? ever;
  if (value == null)
    return [{ ...base, answer: t("Nothing that long", "Nessuno sforzo così lungo") }];
  const capped = d.hrCurves.find((c) => c.capped)?.capped;
  const source =
    now != null ? find("42") : year != null ? (find("1y") ?? find("365")) : find("all");
  const id = whoSet(source, length.secs);
  const ride = id ? d.acts?.find((x) => x.id === id) : undefined;
  return [
    {
      ...base,
      value: shown("hr", value),
      ...(ride
        ? { page: "ride" as const, dest: route("/rides/$id", undefined, { id: ride.id }) }
        : {}),
      answer: [
        ride?.name ?? null,
        ride ? dayLabel(activityDay(ride)) : null,
        now != null ? t(`Last ${RECENT_DAYS} days`, `Ultimi ${RECENT_DAYS} giorni`) : null,
        year != null ? t(`year ${Math.round(year)} bpm`, `anno ${Math.round(year)} bpm`) : null,
        ever != null
          ? t(`all time ${Math.round(ever)} bpm`, `di sempre ${Math.round(ever)} bpm`)
          : null,
        capped ? t(`from the last ${capped} activities`, `dalle ultime ${capped} attività`) : null,
      ]
        .filter(Boolean)
        .join(" · "),
    },
  ];
}

const paceRows = (a: Asked, d: EffortData, length: Length): Entry[] => {
  const base = {
    id: "effort-pace-best",
    q: `${t(`Best pace ${length.label}`, `Miglior passo ${length.label}`)} · ${targetName(a)}`,
    page: "analysis" as const,
    kind: "value" as const,
    exact: true,
    dest: route("/analysis", { plot: "bests" }),
  };
  const i = RUN_DUR.findIndex((s) => s >= length.secs);
  if (i < 0) return [{ ...base, answer: t("Nothing that long", "Nessuno sforzo così lungo") }];
  if (!d.runs?.some((r) => r.curve))
    return d.sport === "run"
      ? [{ ...base, answer: t("Open Analysis once", "Apri l'Analisi una volta") }]
      : [];
  const t0 = a.target;
  if (t0?.kind === "ride")
    return [
      {
        ...base,
        answer: t("Open it to see its pace", "Aprila per vedere il passo"),
        dest: destFor(a),
      },
    ];
  const best = bestOfCurves(
    d.runs.flatMap((r) => {
      const day = r.date?.slice(0, 10);
      return r.curve && day && (!t0 || (day >= t0.from && day <= t0.to)) ? [r.curve] : [];
    }),
  )[i];
  return [
    {
      ...base,
      ...(best != null
        ? { value: `${formatPace(best)}/km` }
        : { answer: t("Nothing that long", "Nessuno sforzo così lungo") }),
    },
  ];
};

function meanRow(a: Asked, d: EffortData): Entry[] {
  const sport = a.sport ?? d.sport;
  const acts = activitiesOf(a, d);
  const ride = a.target?.kind === "ride";
  const title = {
    power: () => t("Avg power", "Potenza media"),
    hr: () => t("Avg HR", "FC media"),
    pace: () => t("Avg pace", "Passo medio"),
    speed: () => t("Avg speed", "Velocità media"),
  }[a.metric]();
  const base = {
    id: `effort-${a.metric}-mean`,
    q: `${title} · ${targetName(a)}`,
    page: "recap" as const,
    kind: "value" as const,
    exact: true,
    dest: destFor(a),
  };
  if (a.metric === "power" || a.metric === "hr") {
    const read = (x: Activity) =>
      a.metric === "power" ? x.icu_average_watts : x.average_heartrate;
    const pool = acts.filter((x) => read(x) != null && x.moving_time);
    if (!pool.length)
      return [{ ...base, answer: emptyText(acts.length ? "no-signal" : "nothing", a.metric) }];
    const secs = pool.reduce((n, x) => n + (x.moving_time ?? 0), 0);
    const mean = pool.reduce((n, x) => n + read(x)! * (x.moving_time ?? 0), 0) / secs;
    return [
      {
        ...base,
        value: shown(a.metric, mean),
        ...(ride ? {} : { answer: t(`${pool.length} activities`, `${pool.length} attività`) }),
      },
    ];
  }
  // Distance over moving time. A home trainer's distance says nothing about speed, unless it's the ride asked for.
  const pool = acts.filter(
    (x) =>
      x.distance &&
      x.moving_time &&
      (ride || (isSport(x, a.metric === "pace" ? "run" : sport) && !x.trainer)),
  );
  if (!pool.length) return [{ ...base, answer: t("No activities", "Nessuna attività") }];
  const metres = pool.reduce((n, x) => n + (x.distance ?? 0), 0);
  const secs = pool.reduce((n, x) => n + (x.moving_time ?? 0), 0);
  return [
    {
      ...base,
      value:
        a.metric === "pace"
          ? `${formatPace(metres / secs)}/km`
          : `${((metres / secs) * 3.6).toFixed(1)} km/h`,
      ...(ride ? {} : { answer: t(`${pool.length} activities`, `${pool.length} attività`) }),
    },
  ];
}

function maxRow(a: Asked, d: EffortData): Entry[] {
  const pool = activitiesOf(a, d).filter((x) => x.max_heartrate);
  const base = {
    id: "effort-hr-max",
    q: `${t("Max HR", "FC massima")} · ${targetName(a)}`,
    page: "recap" as const,
    kind: "value" as const,
    exact: true,
    dest: destFor(a),
  };
  if (!pool.length)
    return [
      { ...base, answer: emptyText(activitiesOf(a, d).length ? "no-signal" : "nothing", "hr") },
    ];
  const top = pool.reduce((m, x) => (x.max_heartrate! > m.max_heartrate! ? x : m));
  return [
    {
      ...base,
      value: shown("hr", top.max_heartrate!),
      ...(a.target?.kind === "ride" ? {} : { answer: top.name ?? "" }),
      dest: route("/rides/$id", undefined, { id: top.id }),
    },
  ];
}

/** The rows an effort question gives; none when the words aren't one. */
export function effortRows(s: string, d: EffortData): Entry[] {
  const a = askedIn(s, d);
  return a ? askedRows(a, d) : [];
}

export function askedRows(a: Asked, d: EffortData): Entry[] {
  if (a.target?.kind === "span" && a.target.from > d.today)
    return [
      {
        id: `effort-${a.metric}-ahead`,
        q: `${metricLine[a.metric]()} · ${a.target.q}`,
        page: "programme",
        kind: "value",
        exact: true,
        answer: t("It hasn't happened yet", "Non è ancora successo"),
        dest: route("/recap", { from: a.target.from, to: a.target.to }),
      },
    ];
  if (a.shape === "mean") return meanRow(a, d);
  if (a.shape === "max") return maxRow(a, d);
  if (a.metric === "pace") return a.length ? paceRows(a, d, a.length) : [];
  if (a.metric === "speed") return [];
  if (a.shape === "marks") return marksRow(a, d);
  if (!a.target) return a.metric === "hr" ? hrAllRow(a, d, a.length!) : [];
  return bestRow(a, d, a.length!);
}
