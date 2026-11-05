// What the bar can do beyond finding: "best + a climb's name", "best 20 min", "km quest'anno", "peso 70". Each reads a command
// word and what follows it. Everything here is your own data; nothing is written unless a row saying so is chosen.
import { parseISO } from "date-fns";
import { activityKind } from "./activity-kind";
import { curveFit, omPD, valueAt } from "./analysis";
import { norm, type Dest, type Entry } from "./ask";
import { daysIn, whenCandidates, type WhenCandidate } from "./ask-when";
import { FEEL_LABEL, recentFeel } from "./felt";
import { briochesFor, intakeTarget } from "./fuel";
import { format, num, t } from "./i18n";
import {
  entrySchema,
  isPlanned,
  type Activity,
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
import { addDays, formatClock, formatDuration } from "./training";
import { morningWellness, offEventOn, rideRecords } from "./tree";
import type { WorkoutKind } from "./workout-templates";

export type WellnessField = "weight" | "bodyFat" | "sleepSecs" | "hrv";
export type WriteAction =
  | { kind: "wellness"; date: string; field: WellnessField; value: number; label: string }
  | { kind: "off"; off: OffKind; today: string; label: string }
  | { kind: "brioche"; activityId: string; count: number; label: string }
  | { kind: "feel"; activityId: string; feel: number; label: string }
  | { kind: "ride"; date: string; name: string; type: "Ride" | "Run"; label: string };

export type IntentClimb = {
  id: string;
  name: string;
  length: number;
  saved: boolean;
  attempts: Attempt[];
};

export type IntentData = {
  today: string;
  sport: MainSport;
  /** Accounts without intervals.icu type their HRV; otherwise it comes from the watch. */
  native: boolean;
  climbs: IntentClimb[];
  acts?: Activity[] | undefined;
  curves?: PowerCurve[] | undefined;
  /** The running analysis, only if it's already been done. */
  runs?:
    | { id: string; bests: (number | null)[]; date?: string; curve?: (number | null)[] }[]
    | undefined;
  /** Threshold pace, m/s. */
  runThreshold?: number | null | undefined;
  ftp?: number | null | undefined;
  /** Latest weight, kg. */
  weight?: number | null | undefined;
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
const plain = (s: string) => norm(s).trim().replace(/\s+/g, " ");
/** As typed, but keeping what numbers need: "68.2", "12/11", "14%". */
const command = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9'.,%/ ]/g, " ")
    .trim()
    .replace(/\s+/g, " ");
const number = (s: string) => Number(s.replace(",", "."));
const dayText = (date: string) => format(parseISO(date.slice(0, 10)), "d MMM yyyy");
const passes = (n: number) =>
  t(n === 1 ? "1 pass" : `${n} passes`, n === 1 ? "1 passaggio" : `${n} passaggi`);

/** Climbs whose name holds every word typed, the closest first. */
function matchClimbs(climbs: IntentClimb[], rest: string) {
  const words = rest.split(" ").filter(Boolean);
  const scored = climbs.flatMap((c) => {
    const name = plain(c.name);
    const parts = name.split(/[ ']/);
    if (
      !words.every((w) => parts.some((p) => p.startsWith(w)) || (w.length >= 3 && name.includes(w)))
    )
      return [];
    const start = name.startsWith(words.join(" ")) ? 20 : 0;
    return [{ c, score: start + (c.saved ? 10 : 0) + Math.min(c.attempts.length, 9) }];
  });
  return scored.sort((a, b) => b.score - a.score || a.c.name.localeCompare(b.c.name)).slice(0, 3);
}

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

function climbRows(d: IntentData, rest: string, what: "best" | "last" | "count"): Entry[] {
  if (!d.climbs.length) return [noIndex()];
  const found = rest
    ? matchClimbs(d.climbs, rest)
    : [...d.climbs]
        .sort((a, b) => Number(b.saved) - Number(a.saved) || b.attempts.length - a.attempts.length)
        .slice(0, 3)
        .map((c, i) => ({ c, score: 3 - i }));
  return found.map(({ c, score }) => {
    const base = {
      id: `${what}-${c.id}`,
      q: c.name,
      page: "segments" as const,
      kind: "ride" as const,
      exact: true,
      boost: score,
      dest: climbDest(c, d.sport),
    };
    const n = c.attempts.length;
    if (!n) return { ...base, answer: t("No passes yet", "Ancora nessun passaggio") };
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

function bestPower(d: IntentData, rest: string): Entry[] {
  const dur = durationOf(rest);
  if (!dur) return [];
  const c42 = d.curves?.find((c) => c.id.includes("42"));
  const c1y = d.curves?.find((c) => c.id.includes("1y") || c.id.includes("365"));
  const now = valueAt(c42, dur.secs);
  const year = valueAt(c1y, dur.secs);
  const best = year ?? now;
  if (best == null) return [];
  return [
    {
      id: "best-power",
      q: t(`Best ${dur.label}`, `Miglior ${dur.label}`),
      page: "analysis",
      kind: "value",
      exact: true,
      value: `${Math.round(best)} W`,
      answer:
        year != null
          ? `${t("Last year", "Ultimo anno")}${now != null ? ` · ${t("last 42 days", "ultimi 42 giorni")} ${Math.round(now)} W` : ""}`
          : t("Last 42 days", "Ultimi 42 giorni"),
      dest: route("/analysis", { plot: "power" }),
    },
  ];
}

function bestRun(d: IntentData, rest: string): Entry[] {
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
  const best = bestsAmong(d.runs)[i];
  if (!best)
    return [{ ...open, answer: t("No run that long yet", "Ancora nessuna corsa così lunga") }];
  return [
    {
      id: "best-run",
      q: t(`Best ${BEST_LABEL[i]}`, `Miglior tempo su ${BEST_LABEL[i]}`),
      page: "ride",
      kind: "value",
      exact: true,
      value: formatClock(best.secs),
      dest: route("/rides/$id", undefined, { id: best.id }),
    },
  ];
}

const SPORT_WORDS: [RegExp, (a: Activity) => boolean][] = [
  [/^(uscita|pedalata|ride|giro|bici|bike)$/, (a) => isSport(a, "ride")],
  [/^(corsa|run)$/, (a) => isSport(a, "run")],
  [/^(nuoto|nuotata|swim)$/, (a) => activityKind(a) === "swim"],
  [/^(camminata|escursione|walk|hike)$/, (a) => /walk|hike/i.test(a.type ?? "")],
  [/^(palestra|forza|gym|strength)$/, (a) => /weight|workout/i.test(a.type ?? "")],
  [/^(attivita|activity|seduta|session)$/, () => true],
];

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

function totals(d: IntentData, what: string, rest: string, only: MainSport | null = null): Entry[] {
  const metric: Record<
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
  const m = what === "count" && only ? { ...metric[what]!, ...SPORT_NOUN[only] } : metric[what]!;
  const typed = plain(rest);
  const all = whenCandidates(rest, d.today);
  const span =
    all.find((c) => c.exact) ??
    all.find((c) => plain(c.q) === typed) ??
    all.find((c) => plain(c.q).startsWith(typed)) ??
    all.find((c) =>
      plain(c.also ?? "")
        .split(" ")
        .some((w) => w.startsWith(typed)),
    );
  if (!span || span.from > d.today) return [];
  const end = span.to < d.today ? span.to : d.today;
  const acts = (d.acts ?? []).filter((a) => {
    const day = a.start_date_local.slice(0, 10);
    return day >= span.from && day <= end && (!only || isSport(a, only));
  });
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

function writes(d: IntentData, s: string): Entry[] {
  const today = t("today", "oggi");
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

/** Whether these words, all of them, name a time: any day or stretch, past or ahead. */
function namesTime(phrase: string, today: string) {
  const typed = plain(phrase);
  return whenCandidates(phrase, today).find(
    (c) =>
      c.exact ||
      plain(c.q) === typed ||
      (!typed.includes(" ") &&
        plain(c.also ?? "")
          .split(" ")
          .includes(typed)),
  );
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

/** "plan saturday ride with Marco": what's left beside the day is the ride's own name, as you wrote it. */
function planRows(d: IntentData, rest: string, raw: string): Entry[] {
  const dates = planDays(d, rest);
  if (dates.length) return dates;
  if (namesTime(rest, d.today)) return [];
  const words = rest.split(" ");
  const split = splitTime(words, d.today);
  if (split && !(split.when.from === split.when.to && split.when.from >= d.today)) return [];
  const [from, to] = split?.name ?? [0, words.length];
  const left = words.slice(from, to).join(" ");
  if (!left) return [];
  const date = split?.when.from ?? addDays(d.today, 1);
  const asked = readSuggest(left, d.today);
  if (asked?.kind && !asked.minutes && !asked.day && !asked.week)
    return suggestRows(d, { ...asked, day: date });
  // The raw words line up with the plain ones unless punctuation split a word; then the plain ones have to do.
  const rawWords = raw.trim().split(/\s+/).slice(1);
  const named = rawWords.length === words.length ? rawWords.slice(from, to).join(" ") : left;
  const name = cap(named).slice(0, 120);
  const type = RUN_NAME.test(left)
    ? "Run"
    : RIDE_NAME.test(left) || d.sport === "ride"
      ? "Ride"
      : "Run";
  const there = (d.events ?? []).find((e) => e.date === date && isPlanned(e));
  const when = format(parseISO(date), "EEEE d MMMM");
  return [
    saveRow(
      `save-ride-${date}`,
      t(`Plan: ${name}`, `Pianifica: ${name}`),
      there?.name ? `${when} · ${t("already", "già")}: ${there.name}` : when,
      { kind: "ride", date, name, type, label: name },
    ),
  ];
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

type SuggestAsk = SuggestFilter & { day?: string | undefined; week?: { from: string; to: string } };

/** What's asked for beside the word itself: a day or a week, a length, a kind, in any order. Null if something's left. */
function readSuggest(rest: string, today: string): SuggestAsk | null {
  const out: SuggestAsk = {};
  let text = ` ${rest.replace(/\bsweet spot\b/, "sweetspot")} `;
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

function suggestRows(d: IntentData, asked: SuggestAsk): Entry[] {
  const input = d.suggest;
  if (!input) return [];
  if (asked.week) {
    const w = suggestWeek(input, asked.week.from, asked.week.to);
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
        answer: t(
          `${w.sessions} sessions · ${w.hard} hard`,
          `${w.sessions} sedute · ${w.hard} ${w.hard === 1 ? "intensa" : "intense"}`,
        ),
        dest: route("/suggest", { from: w.from, to: w.to }),
      },
    ];
  }
  const filter = { minutes: asked.minutes, kind: asked.kind };
  return dayRows(d, suggestDay(input, asked.day ?? d.today, filter), filter);
}

/** The rows a command typed in full gives; nothing when it isn't one. */
export function intentEntries(query: string, d: IntentData): Entry[] {
  const s = command(query);
  if (!s) return [];
  const saved = writes(d, s);
  if (saved.length) return saved;

  const planning = /^(?:plan|pianifica|schedule)(?: (.*))?$/.exec(s) ?? /^programma (.+)$/.exec(s);
  if (planning) return planRows(d, (planning[1] ?? "").trim(), query);

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

  m =
    /^(?:best|migliori?|migliore|miglior|record|pr|pb)(?: (?:su |sul |sulla |del |della |di |al |on |in )?(.*))?$/.exec(
      s,
    );
  if (m) {
    const rest = (m[1] ?? "").trim();
    const numeric = [...bestPower(d, rest), ...bestRun(d, rest)];
    return numeric.length ? numeric : climbRows(d, rest, "best");
  }
  m =
    /^(?:quante volte|how many times|how often|quanti passaggi|passaggi)(?: (?:su |sul |sulla |al |il |la |on |up )?(.*))?$/.exec(
      s,
    );
  if (m) return climbRows(d, (m[1] ?? "").trim(), "count");

  m = /^(?:ultim[aoe]|last|latest) (.+)$/.exec(s);
  if (m) {
    const rest = m[1]!.trim();
    const activity = lastActivity(d, rest);
    if (activity.length) return activity;
    // "ultima settimana" and the like are stretches of time, not climbs.
    return d.climbs.length ? climbRows(d, rest, "last").filter((e) => e.id !== "climb-none") : [];
  }
  m =
    /^(km|chilometri|ore|hours|tempo|time|dislivello|climbing|attivita|activities|uscite|pedalate|rides|corse|runs|carico|load) (.+)$/.exec(
      s,
    );
  if (m) {
    const what = /km|chilo/.test(m[1]!)
      ? "km"
      : /ore|hours|tempo|time/.test(m[1]!)
        ? "time"
        : /dislivello|climbing/.test(m[1]!)
          ? "climb"
          : /carico|load/.test(m[1]!)
            ? "load"
            : "count";
    const only = /uscite|pedalate|rides/.test(m[1]!)
      ? "ride"
      : /corse|runs/.test(m[1]!)
        ? "run"
        : null;
    return totals(d, what, m[2]!, only);
  }
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
  const out: Entry[] = [];
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
