// What the bar can do beyond finding: "best manghen", "best 20 min", "km quest'anno", "peso 68.2". Each reads a command
// word and what follows it. Everything here is your own data; nothing is written unless a row saying so is chosen.
import { parseISO } from "date-fns";
import { activityKind } from "./activity-kind";
import { valueAt } from "./analysis";
import { norm, type Dest, type Entry } from "./ask";
import { whenCandidates } from "./ask-when";
import { FEEL_LABEL, recentFeel } from "./felt";
import { briochesFor, intakeTarget } from "./fuel";
import { format, num, t } from "./i18n";
import {
  entrySchema,
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
import { BEST_DISTANCES, BEST_LABEL, bestsAmong } from "./run-metrics";
import type { Attempt } from "./segments";
import { isSport, type MainSport } from "./sport";
import { formatClock, formatDuration } from "./training";
import { morningWellness, offEventOn, rideRecords } from "./tree";

export type WellnessField = "weight" | "bodyFat" | "sleepSecs" | "hrv";
export type WriteAction =
  | { kind: "wellness"; date: string; field: WellnessField; value: number; label: string }
  | { kind: "off"; off: OffKind; today: string; label: string }
  | { kind: "brioche"; activityId: string; count: number; label: string }
  | { kind: "feel"; activityId: string; feel: number; label: string };

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
  runs?: { id: string; bests: (number | null)[] }[] | undefined;
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
  q: t("Open Segments once to read your rides", "Apri Segmenti una volta per leggere le uscite"),
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
        answer: `${t(`${inYear} this year`, `${inYear} quest'anno`)} · ${t("last", "ultima")} ${dayText(last)}`,
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
      q: t(`Best ${dur.label}`, `Migliore ${dur.label}`),
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
      q: t(`Best ${BEST_LABEL[i]}`, `Migliori ${BEST_LABEL[i]}`),
      page: "ride",
      kind: "value",
      exact: true,
      value: formatClock(best.secs),
      dest: route("/rides/$id", undefined, { id: best.id }),
    },
  ];
}

const SPORT_WORDS: [RegExp, (a: Activity) => boolean][] = [
  [/^(uscita|ride|giro|bici|bike)$/, (a) => isSport(a, "ride")],
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

function totals(d: IntentData, what: string, rest: string): Entry[] {
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
  const m = metric[what]!;
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
    return day >= span.from && day <= end;
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
  if (/^(non piu |no longer |not )(malat[oa]|sick|ill)$|^(guarit[oa]|recovered)$/.test(s))
    return offRow(d, "SICK", false);
  if (/^(non piu |no longer |not )(infortunat[oa]|injured)$/.test(s))
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
    /^(?:sensazion[ei]|feel|feeling|uscita|giro|corsa|attivita|ride|run) (ottim[ao]|buon[ao]|normale|scars[ao]|pessim[ao]|strong|good|normal|poor|weak)$/.exec(
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

/** "plan tomorrow": the Calendar on that day, its plan page open. Today or ahead only. */
function planRows(d: IntentData, rest: string): Entry[] {
  const typed = plain(rest);
  const days = whenCandidates(rest, d.today).filter((c) => c.from === c.to && c.from >= d.today);
  const hits = !typed
    ? days.filter((c) => c.id === "tomorrow")
    : [
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
  return hits
    .filter((c) => (seen.has(c.from) ? false : (seen.add(c.from), true)))
    .slice(0, 3)
    .map((c, i) => {
      const there = (d.events ?? []).find(
        (e) => e.date === c.from && (e.category === "WORKOUT" || e.category.startsWith("RACE")),
      );
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

/** The rows a command typed in full gives; nothing when it isn't one. */
export function intentEntries(query: string, d: IntentData): Entry[] {
  const s = command(query);
  if (!s) return [];
  const saved = writes(d, s);
  if (saved.length) return saved;

  const planning = /^(?:plan|pianifica|schedule)(?: (.*))?$/.exec(s) ?? /^programma (.+)$/.exec(s);
  if (planning) return planRows(d, (planning[1] ?? "").trim());

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
    /^(km|chilometri|ore|hours|tempo|time|dislivello|climbing|attivita|activities|uscite|rides|carico|load) (.+)$/.exec(
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
    return totals(d, what, m[2]!);
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
  workouts?:
    | {
        id: string;
        name: string;
        type: string | null;
        moving_time: number | null;
        icu_training_load: number | null;
      }[]
    | undefined;
};

const DO_WORDS = ["fare", "allenamento", "oggi", "should", "train", "today", "consiglio", "advice"];

/** The best match in the library for what today calls for, by time and intensity. */
export function matchWorkout(
  workouts: NonNullable<LiveData["workouts"]>,
  target: { minutes: number; intensity: number },
  sport: MainSport,
) {
  const of = (w: (typeof workouts)[number]) => {
    if (!w.moving_time || !w.icu_training_load) return null;
    const hours = w.moving_time / 3600;
    const intensity = Math.sqrt(w.icu_training_load / (hours * 100));
    return (
      Math.abs(hours * 60 - target.minutes) / target.minutes +
      Math.abs(intensity - target.intensity) * 2
    );
  };
  const isRun = (w: (typeof workouts)[number]) => /run/i.test(w.type ?? "");
  let best: (typeof workouts)[number] | null = null;
  let score = Infinity;
  for (const w of workouts) {
    if (isRun(w) !== (sport === "run")) continue;
    const s = of(w);
    if (s != null && s < score) {
      best = w;
      score = s;
    }
  }
  return best;
}

/** Answers that come from today's state, matched like any other phrase. */
export function liveEntries(d: LiveData): Entry[] {
  const out: Entry[] = [];
  const sheet = route("/", { sheet: "today" });
  const planned = (d.planned ?? []).find(
    (e) => e.date === d.today && (e.category === "WORKOUT" || e.category.startsWith("RACE")),
  );
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
  if (!planned && d.score != null && d.score >= 40 && d.workouts?.length) {
    const rec = recommendation(d.score, d.form ?? null);
    const w = matchWorkout(d.workouts, rec, d.sport);
    if (w)
      out.push({
        id: "do-workout",
        q: w.name,
        page: "workouts",
        kind: "plan",
        boost: -6,
        also: "cosa faccio what should",
        words: DO_WORDS,
        answer: `${t("Fits today", "Adatta a oggi")} · ${formatDuration(w.moving_time)} · ${t("load", "carico")} ${w.icu_training_load}`,
        dest: route("/workouts"),
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
    const rec = rideRecords(d.acts, d.today, d.sport);
    const noun = d.sport === "run" ? t("run", "corsa") : t("ride", "uscita");
    const longest = d.acts.find((a) => a.id === rec.longest);
    const climbing = d.acts.find((a) => a.id === rec.mostClimbing);
    if (longest)
      out.push({
        id: "record-longest",
        q: t(`Longest ${noun}`, d.sport === "run" ? "Corsa più lunga" : "Uscita più lunga"),
        also: "longest piu lunga",
        page: "ride",
        kind: "ride",
        value: `${Math.round((longest.distance ?? 0) / 1000)} km`,
        answer: `${longest.name ?? ""} · ${dayText(longest.start_date_local)}`,
        dest: route("/rides/$id", undefined, { id: longest.id }),
      });
    if (climbing)
      out.push({
        id: "record-climbing",
        q: t(
          `Most climbing`,
          d.sport === "run" ? "Corsa con più dislivello" : "Uscita con più dislivello",
        ),
        also: "most climbing piu dislivello",
        page: "ride",
        kind: "ride",
        value: `${num(Math.round(climbing.total_elevation_gain ?? 0))} m`,
        answer: `${climbing.name ?? ""} · ${dayText(climbing.start_date_local)}`,
        dest: route("/rides/$id", undefined, { id: climbing.id }),
      });
  }
  return out;
}
