// "uscite sopra 100 km", "top 5 per dislivello 2025", "uscite indoor marzo": a list of your own activities, opened on the
// Activities page. The same filter reads what's typed and fills that page. Pure.
import type { Entry } from "./ask";
import { activityDay, takeTime, type ReadContext } from "./ask-read";
import { command, simplify } from "./ask-sentence";
import { spanTitle } from "./ask-when";
import { num, t } from "./i18n";
import type { Activity } from "./intervals";
import { isSport, type MainSport } from "./sport";
import { formatDuration } from "./training";

export type FilterField = "km" | "m" | "time" | "watts" | "hr" | "load" | "speed";

export type ActivityFilter = {
  from?: string | undefined;
  to?: string | undefined;
  sport?: MainSport | undefined;
  place?: "indoor" | "outdoor" | undefined;
  field?: FilterField | undefined;
  op?: "above" | "below" | undefined;
  value?: number | undefined;
  sort?: FilterField | undefined;
  limit?: number | undefined;
};

const FIELDS: readonly FilterField[] = ["km", "m", "time", "watts", "hr", "load", "speed"];

const speedOf = (a: Activity) =>
  a.distance && a.moving_time && !a.trainer ? (a.distance / a.moving_time) * 3.6 : null;

const READ: Record<FilterField, (a: Activity) => number | null> = {
  km: (a) => (a.distance ? a.distance / 1000 : null),
  m: (a) => a.total_elevation_gain ?? null,
  time: (a) => a.moving_time ?? null,
  watts: (a) => a.icu_average_watts ?? null,
  hr: (a) => a.average_heartrate ?? null,
  load: (a) => a.icu_training_load ?? null,
  speed: speedOf,
};

const SHOW: Record<FilterField, (n: number) => string> = {
  km: (n) => `${num(Math.round(n))} km`,
  m: (n) => `${num(Math.round(n))} m`,
  time: (n) => formatDuration(n),
  watts: (n) => `${Math.round(n)} W`,
  hr: (n) => `${Math.round(n)} bpm`,
  load: (n) => String(Math.round(n)),
  speed: (n) => `${n.toFixed(1)} km/h`,
};

export function applyFilter(acts: Activity[], f: ActivityFilter): Activity[] {
  const kept = acts.filter((a) => {
    const day = activityDay(a);
    if (f.from && day < f.from) return false;
    if (f.to && day > f.to) return false;
    if (f.sport && !isSport(a, f.sport)) return false;
    if (f.place === "indoor" && !a.trainer) return false;
    if (f.place === "outdoor" && a.trainer) return false;
    if (f.field && f.value != null) {
      const v = READ[f.field](a);
      if (v == null) return false;
      if (f.op === "below" ? v >= f.value : v <= f.value) return false;
    }
    if (f.sort && READ[f.sort](a) == null) return false;
    return true;
  });
  const sorted = f.sort
    ? [...kept].sort((a, b) => READ[f.sort!](b)! - READ[f.sort!](a)!)
    : [...kept].sort((a, b) => b.start_date_local.localeCompare(a.start_date_local));
  return f.limit ? sorted.slice(0, f.limit) : sorted;
}

/** The words for a list: "Uscite sopra 100 km · 2025". */
export function filterTitle(f: ActivityFilter, today: string): string {
  const noun =
    f.sport === "ride"
      ? t("Rides", "Uscite")
      : f.sport === "run"
        ? t("Runs", "Corse")
        : t("Activities", "Attività");
  const place =
    f.place === "indoor" ? "indoor" : f.place === "outdoor" ? t("outdoor", "all'aperto") : null;
  const rule =
    f.field && f.value != null
      ? `${f.op === "below" ? t("under", "sotto") : t("over", "sopra")} ${SHOW[f.field](f.value)}`
      : null;
  const sorted = f.sort ? `${t("by", "per")} ${FIELD_NAME[f.sort]()}` : null;
  const head = f.limit ? `Top ${f.limit}` : null;
  const when = f.from && f.to ? spanTitle({ from: f.from, to: f.to }, today) : null;
  return [
    [head, head ? noun.toLowerCase() : noun, place, rule, sorted].filter(Boolean).join(" "),
    when,
  ]
    .filter(Boolean)
    .join(" · ");
}

const FIELD_NAME: Record<FilterField, () => string> = {
  km: () => t("distance", "distanza"),
  m: () => t("climbing", "dislivello"),
  time: () => t("time", "tempo"),
  watts: () => t("power", "potenza"),
  hr: () => t("HR", "FC"),
  load: () => t("load", "carico"),
  speed: () => t("speed", "velocità"),
};

const NOUN = /\b(uscite|pedalate|giri|rides|corse|runs|attivita|activities|allenamenti)\b/;
const FIELD_WORD: [RegExp, FilterField][] = [
  [/\b(?:km|chilometri|distanza|distance)\b/, "km"],
  [/\b(?:dislivello|climbing|elevation|gain|metri)\b/, "m"],
  [/\b(?:ore|tempo|durata|time|hours)\b/, "time"],
  [/\b(?:potenza|watt|watts|power)\b/, "watts"],
  [/\b(?:fc|hr|bpm)\b/, "hr"],
  [/\b(?:carico|load)\b/, "load"],
  [/\b(?:velocita|speed)\b/, "speed"],
];
const SUPERLATIVE: [RegExp, FilterField][] = [
  [/\bpiu lunghe\b|\blongest\b/, "km"],
  [/\bpiu dure\b|\bhardest\b/, "load"],
  [/\bpiu veloci\b|\bfastest\b/, "speed"],
  [/\bcon piu dislivello\b|\bmost climbing\b/, "m"],
];
const RULE =
  /\b(?:con )?(sopra(?: (?:i|a|ai))?|oltre(?: (?:i|a))?|over|above|more than|piu di|sotto(?: (?:i|a|ai))?|under|below|less than|meno di) (\d+(?:[.,]\d+)?) ?(km\/h|km|metri|m|ore|ora|h|minuti|min|w|watts?|bpm)?(?= |$)/;
const SMALL = /^(?:le|i|gli|the|mie|miei|my|con|per|by|di|del|della|in|a|nel|nella|su|e)$/;

function ruleOf(unit: string | undefined, n: number, named: FilterField | null) {
  if (!unit) return named ? { field: named, value: named === "time" ? n * 3600 : n } : null;
  if (unit === "km/h") return { field: "speed" as const, value: n };
  if (unit === "km") return { field: "km" as const, value: n };
  if (unit === "m" || unit === "metri") return { field: "m" as const, value: n };
  if (unit === "ore" || unit === "ora" || unit === "h")
    return { field: "time" as const, value: n * 3600 };
  if (unit === "min" || unit === "minuti") return { field: "time" as const, value: n * 60 };
  if (unit === "bpm") return { field: "hr" as const, value: n };
  return { field: "watts" as const, value: n };
}

/** The list these words ask for, or null when any word is left over. */
export function readFilter(typed: string, ctx: ReadContext): ActivityFilter | null {
  const f: ActivityFilter = {};
  let s = ` ${typed} `;
  const noun = NOUN.exec(s)?.[1];
  if (noun) {
    s = s.replace(NOUN, " ");
    f.sport = /uscite|pedalate|giri|rides/.test(noun)
      ? "ride"
      : /corse|runs/.test(noun)
        ? "run"
        : undefined;
  }
  // Top N, or a plain "le 5 uscite più lunghe".
  const top = /\btop(?: (\d{1,3}))?\b/.exec(s);
  if (top) {
    f.limit = top[1] ? Number(top[1]) : 10;
    s = s.replace(top[0], " ");
  }
  for (const [re, field] of SUPERLATIVE) {
    if (!re.test(s)) continue;
    f.sort = field;
    s = s.replace(re, " ");
    const count = /(?:^| )(\d{1,3})(?= )/.exec(s);
    f.limit = f.limit ?? (count ? Number(count[1]) : 10);
    if (count) s = s.replace(count[0], " ");
    break;
  }
  const rule = RULE.exec(s);
  let fieldInWords: FilterField | null = null;
  if (!f.sort)
    for (const [re, field] of FIELD_WORD) {
      if (!re.test(s.replace(RULE, " "))) continue;
      fieldInWords = field;
      s = s.replace(rule ? "" : re, rule ? "" : " ");
      break;
    }
  if (rule) {
    const n = Number(rule[2]!.replace(",", "."));
    const r = ruleOf(rule[3], n, fieldInWords);
    if (!r) return null;
    f.field = r.field;
    f.value = r.value;
    f.op = /^(sotto|under|below|less|meno)/.test(rule[1]!) ? "below" : "above";
    s = s.replace(RULE, " ");
    if (fieldInWords) s = s.replace(FIELD_WORD.find(([, x]) => x === fieldInWords)![0], " ");
  } else if (fieldInWords && f.limit) f.sort = fieldInWords;
  else if (fieldInWords) return null;

  const place = /\b(indoor|rulli|trainer|outdoor|aperto|fuori)\b/.exec(s);
  if (place) {
    f.place = /indoor|rulli|trainer/.test(place[1]!) ? "indoor" : "outdoor";
    s = s.replace(place[0], " ").replace(/\ball'? /, " ");
  }
  // Something to filter by, and something being filtered.
  if (f.limit && !f.sort) return null;
  if (!f.limit && !f.field && !f.place) return null;
  if (!noun && !f.limit) return null;
  if (!noun && f.limit) f.sport = ctx.sport;

  const words = s.split(" ").filter(Boolean);
  const when = takeTime(words, ctx.today);
  if (when) {
    f.from = when.when.from;
    f.to = when.when.to;
  }
  if ((when?.rest ?? words).some((w) => !SMALL.test(w))) return null;
  return f;
}

const context = (d: { today: string; sport: MainSport; acts?: Activity[] | undefined }) => ({
  today: d.today,
  sport: d.sport,
  acts: d.acts,
});

const isField = (v: unknown): v is FilterField => FIELDS.includes(v as FilterField);

/** The filter as a page's search params. */
export function filterSearch(f: ActivityFilter): Record<string, string> {
  return {
    filter: "1",
    ...Object.fromEntries(
      Object.entries(f).flatMap(([k, v]) => (v == null ? [] : [[k, String(v)]])),
    ),
  };
}

/** The filter back from a page's search params; null when none was asked. */
export function filterFromSearch(s: Record<string, unknown>): ActivityFilter | null {
  if (s["filter"] == null) return null;
  const day = (v: unknown) =>
    typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined;
  const count = (v: unknown) => {
    const n = Number(v);
    return v != null && Number.isFinite(n) && n >= 0 ? n : undefined;
  };
  const f: ActivityFilter = {
    from: day(s["from"]),
    to: day(s["to"]),
    sport: s["sport"] === "ride" || s["sport"] === "run" ? s["sport"] : undefined,
    place: s["place"] === "indoor" || s["place"] === "outdoor" ? s["place"] : undefined,
    field: isField(s["field"]) ? s["field"] : undefined,
    op: s["op"] === "above" || s["op"] === "below" ? s["op"] : undefined,
    value: count(s["value"]),
    sort: isField(s["sort"]) ? s["sort"] : undefined,
    limit: count(s["limit"]),
  };
  return Object.fromEntries(Object.entries(f).filter(([, v]) => v != null)) as ActivityFilter;
}

export function filterRows(
  typed: string,
  d: { today: string; sport: MainSport; acts?: Activity[] | undefined },
): Entry[] {
  const ctx = context(d);
  const f =
    readFilter(typed, ctx) ?? readFilter(simplify(typed), ctx) ?? readFilter(command(typed), ctx);
  if (!f) return [];
  const found = applyFilter(d.acts ?? [], f);
  const base = {
    id: "activity-filter",
    q: filterTitle(f, d.today),
    page: "rides" as const,
    kind: "value" as const,
    exact: true,
    dest: { kind: "route" as const, to: "/rides", search: filterSearch(f) },
  };
  if (!found.length) return [{ ...base, answer: t("No activities", "Nessuna attività") }];
  if (f.sort) {
    const read = READ[f.sort];
    const show = SHOW[f.sort];
    return [
      {
        ...base,
        value: show(read(found[0]!)!),
        answer: found
          .slice(0, 3)
          .map((a) => `${a.name ?? ""} ${show(read(a)!)}`.trim())
          .join(" · "),
      },
    ];
  }
  const km = found.reduce((n, a) => n + (a.distance ?? 0), 0) / 1000;
  const secs = found.reduce((n, a) => n + (a.moving_time ?? 0), 0);
  return [
    {
      ...base,
      value: String(found.length),
      answer: [km ? `${num(Math.round(km))} km` : null, secs ? formatDuration(secs) : null]
        .filter(Boolean)
        .join(" · "),
    },
  ];
}
