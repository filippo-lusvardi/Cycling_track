// A value as it was: "peso 28 marzo", "fitness ultimo manghen", "hrv settembre 2025". One day reads that day; anything
// longer reads its average.
import { isValid, parseISO } from "date-fns";
import type { Entry } from "./ask";
import { namesTime, matchClimbs, SPORT_WORDS, type IntentClimb } from "./ask-intents";
import { command } from "./ask-sentence";
import { spanTitle, type Span } from "./ask-when";
import { format, t } from "./i18n";
import type { Activity, Wellness } from "./intervals";
import { addDays, computeForm, formatDuration } from "./training";

type Metric = {
  id: string;
  words: string[];
  label: () => string;
  read: (w: Wellness) => number | null | undefined;
  show: (n: number, averaged: boolean) => string;
  /** Rarely measured and slow to change, so the last reading before the day still says something. */
  lasting?: boolean;
  page: "analysis" | "body";
};

const METRICS: Metric[] = [
  {
    id: "fitness",
    words: ["fitness", "ctl"],
    label: () => "Fitness",
    read: (w) => w.ctl,
    show: (n) => String(Math.round(n)),
    page: "analysis",
  },
  {
    id: "fatigue",
    words: ["fatica", "fatigue", "atl"],
    label: () => t("Fatigue", "Fatica"),
    read: (w) => w.atl,
    show: (n) => String(Math.round(n)),
    page: "analysis",
  },
  {
    id: "form",
    words: ["forma", "form", "tsb"],
    label: () => t("Form", "Forma"),
    read: (w) => (w.ctl != null && w.atl != null ? computeForm(w.ctl, w.atl) : null),
    show: (n) => String(Math.round(n)),
    page: "analysis",
  },
  {
    id: "ramp",
    words: ["ramp rate", "ramp"],
    label: () => "Ramp rate",
    read: (w) => w.rampRate,
    show: (n) => n.toFixed(1),
    page: "analysis",
  },
  {
    id: "weight",
    words: ["peso", "weight", "pesavo", "pesavi"],
    label: () => t("Weight", "Peso"),
    read: (w) => w.weight,
    show: (n, averaged) => `${averaged ? n.toFixed(1) : n} kg`,
    lasting: true,
    page: "body",
  },
  {
    id: "fat",
    words: ["grasso corporeo", "massa grassa", "body fat", "grasso"],
    label: () => t("Body fat", "Grasso corporeo"),
    read: (w) => w.bodyFat,
    show: (n, averaged) => `${averaged ? n.toFixed(1) : n} %`,
    lasting: true,
    page: "body",
  },
  {
    id: "hrv",
    words: ["hrv"],
    label: () => "HRV",
    read: (w) => w.hrv,
    show: (n) => `${Math.round(n)} ms`,
    page: "body",
  },
  {
    id: "sleep",
    words: ["ore di sonno", "sonno", "sleep", "dormito"],
    label: () => t("Sleep", "Sonno"),
    read: (w) => w.sleepSecs,
    show: (n) => formatDuration(Math.round(n)),
    page: "body",
  },
  {
    id: "eftp",
    words: ["eftp"],
    label: () => "eFTP",
    read: (w) => w.eftp,
    show: (n) => `${Math.round(n)} W`,
    lasting: true,
    page: "analysis",
  },
];

/** How far back the last reading of something that lasts still counts. */
const LASTING_DAYS = 14;

export type PastSources = {
  today: string;
  acts?: Activity[] | undefined;
  climbs?: IntentClimb[] | undefined;
};

export type PastAsk = {
  metric: Metric;
  span: Span;
  /** The ride or climb it was asked about, when it wasn't a date. */
  ref?: { name: string; activityId?: string | undefined; climbId?: string | undefined };
};

const WEEKDAY =
  /^(?:lunedi|martedi|mercoledi|giovedi|venerdi|sabato|domenica|monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/;
const LINK =
  /^(?:(?:dell|all|nell|sull|l)'|(?:a|ad|al|alla|allo|il|la|lo|di|del|della|dello|in|nel|nella|on|at|the|of) )/;
const LAST = /^(?:ultim[oa]|last|latest|most recent) /;
/** A number on its own is a value to save ("peso 78"), never a day. */
const VALUE = /^\d+(?:[.,]\d+)?%?$|^\d+ \d+$/;

function metricIn(s: string): { metric: Metric; body: string } | null {
  for (const metric of METRICS)
    for (const w of metric.words) {
      if (s.startsWith(`${w} `)) return { metric, body: s.slice(w.length + 1) };
      if (s.endsWith(` ${w}`)) return { metric, body: s.slice(0, -w.length - 1) };
    }
  return null;
}

/** What these words name as a stretch of the past; a day that's still ahead means the last one that's been. */
function pastSpan(body: string, today: string): Span | null {
  if (VALUE.test(body)) return null;
  const hit = namesTime(body, today);
  if (!hit) return null;
  if (hit.from <= today) return { from: hit.from, to: hit.to < today ? hit.to : today };
  if (hit.from !== hit.to) return null;
  if (WEEKDAY.test(body)) {
    const back = addDays(hit.from, -7);
    return { from: back, to: back };
  }
  if (!/\d/.test(body) || /^tra |^in /.test(body)) return null;
  const year = `${Number(hit.from.slice(0, 4)) - 1}${hit.from.slice(4)}`;
  return isValid(parseISO(year)) ? { from: year, to: year } : null;
}

const dayOf = (a: Activity) => a.start_date_local.slice(0, 10);

/** The latest activity or pass that these words name. */
function latestNamed(body: string, d: PastSources): (PastAsk["ref"] & { date: string }) | null {
  const last = LAST.exec(body);
  const words = last ? body.slice(last[0].length) : body;
  const acts = [...(d.acts ?? [])]
    .filter((a) => dayOf(a) <= d.today)
    .sort((a, b) => b.start_date_local.localeCompare(a.start_date_local));
  if (last) {
    const kind = SPORT_WORDS.find(([re]) => re.test(words));
    if (kind) {
      const a = acts.find(kind[1]);
      return a
        ? { name: a.name ?? a.type ?? t("Activity", "Attività"), activityId: a.id, date: dayOf(a) }
        : null;
    }
  }
  const typed = words.split(" ").filter(Boolean);
  if (!typed.some((w) => w.length >= 3)) return null;
  const named = acts.find((a) => {
    const parts = command(a.name ?? "").split(/[ ']/);
    return typed.every((w) => parts.some((p) => p.startsWith(w)));
  });
  const passes = matchClimbs(d.climbs ?? [], words)
    .flatMap(({ c }) => c.attempts.map((at) => ({ c, at, date: at.date.slice(0, 10) })))
    .filter((p) => p.date <= d.today)
    .sort((x, y) => y.date.localeCompare(x.date));
  const pass = passes[0];
  if (pass && (!named || pass.date > dayOf(named)))
    return {
      name: pass.c.name,
      climbId: pass.c.id,
      ...(acts.some((a) => a.id === pass.at.trackId) ? { activityId: pass.at.trackId } : {}),
      date: pass.date,
    };
  return named
    ? { name: named.name ?? t("Activity", "Attività"), activityId: named.id, date: dayOf(named) }
    : null;
}

/** What's being asked, if it's a value of the past: only when the whole phrase is understood. */
export function pastAsked(query: string, d: PastSources): PastAsk | null {
  const s = command(query);
  const found = metricIn(s);
  if (!found) return null;
  const direct = pastSpan(found.body, d.today);
  if (direct) return { metric: found.metric, span: direct };
  const body = found.body.replace(LINK, "");
  if (body !== found.body) {
    const linked = pastSpan(body, d.today);
    if (linked) return { metric: found.metric, span: linked };
  }
  const ref = latestNamed(body, d);
  if (!ref) return null;
  const { date, ...rest } = ref;
  return { metric: found.metric, span: { from: date, to: date }, ref: rest };
}

/** The days to load to answer. */
export const pastWindow = ({ metric, span }: PastAsk): Span => ({
  from: metric.lasting && span.from === span.to ? addDays(span.from, -LASTING_DAYS) : span.from,
  to: span.to,
});

const dayLabel = (date: string) => format(parseISO(date), "d MMMM yyyy");

/** The row answering it. `wellness` undefined means still on its way. */
export function pastRows(
  query: string,
  d: PastSources & { wellness?: Wellness[] | undefined; failed?: boolean },
): Entry[] {
  const asked = pastAsked(query, d);
  if (!asked) return [];
  const { metric, span, ref } = asked;
  const one = span.from === span.to;
  const when = ref
    ? `${ref.name}, ${format(parseISO(span.from), "d MMM yyyy")}`
    : one
      ? dayLabel(span.from)
      : spanTitle(span, d.today);
  const row = (value: string | null, answer?: string): Entry => ({
    id: `past-${metric.id}`,
    q: `${metric.label()} · ${when}`,
    page: metric.page,
    kind: "value",
    exact: true,
    ...(value != null ? { value } : {}),
    ...(answer ? { answer } : {}),
    dest: ref?.activityId
      ? { kind: "route", to: "/rides/$id", params: { id: ref.activityId } }
      : ref?.climbId
        ? { kind: "route", to: "/segments/$id", params: { id: ref.climbId } }
        : { kind: "route", to: "/recap", search: { from: span.from, to: span.to } },
  });
  if (d.failed) return [row(null, t("Couldn't read that", "Impossibile leggere questo dato"))];
  if (!d.wellness) return [row("…")];
  const readings = d.wellness.flatMap((w) => {
    const v = metric.read(w);
    return v != null ? [{ day: w.id, v }] : [];
  });
  if (one) {
    const exact = readings.find((r) => r.day === span.from);
    if (exact) return [row(metric.show(exact.v, false))];
    const earlier = metric.lasting
      ? readings
          .filter((r) => r.day < span.from && r.day >= addDays(span.from, -LASTING_DAYS))
          .sort((a, b) => b.day.localeCompare(a.day))[0]
      : undefined;
    return earlier
      ? [
          row(
            metric.show(earlier.v, false),
            t(`Last reading: ${dayLabel(earlier.day)}`, `Ultimo dato: ${dayLabel(earlier.day)}`),
          ),
        ]
      : [row("–", t("Nothing that day", "Nessun dato quel giorno"))];
  }
  const inside = readings.filter((r) => r.day >= span.from && r.day <= span.to);
  if (!inside.length)
    return [row("–", t("Nothing in this stretch", "Nessun dato in questo periodo"))];
  const mean = inside.reduce((n, r) => n + r.v, 0) / inside.length;
  return [
    row(
      metric.show(mean, true),
      t(
        `Average of ${inside.length} ${inside.length === 1 ? "day" : "days"}`,
        `Media di ${inside.length} ${inside.length === 1 ? "giorno" : "giorni"}`,
      ),
    ),
  ];
}
