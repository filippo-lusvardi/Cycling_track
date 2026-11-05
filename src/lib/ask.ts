// Asking the tree: what you type becomes a few alternatives to choose from. It all runs on this device, with no AI: a
// list of questions and words in both languages, plus your own rides, climbs, races and months. Among equally good
// matches your season of the moment decides which comes first, and the less you've typed, the more it decides.
import { parseISO } from "date-fns";
import type { WriteAction } from "./ask-intents";
import { paramEntries, type ParamData } from "./ask-params";
import { near } from "./ask-sentence";
import { whenCandidates, type Span } from "./ask-when";
import { GARDEN_GUIDE, TREE_GUIDE, type GuideItem } from "./guides";
import { format, t } from "./i18n";
import type { Activity, PlannedEvent, Wellness } from "./intervals";
import { mainSport } from "./sport";
import { addDays, formatDuration } from "./training";
import type { Season } from "./tree";

export type Kind =
  "body" | "perf" | "plan" | "place" | "legend" | "ride" | "far" | "value" | "when";
export type Page =
  | "tree"
  | "garden"
  | "body"
  | "analysis"
  | "segments"
  | "rides"
  | "ride"
  | "calendar"
  | "workouts"
  | "plan"
  | "pantry"
  | "years"
  | "settings"
  | "forest"
  | "legend"
  | "zones"
  | "recap"
  | "programme"
  | "save";

export type LegendTab = "tree" | "garden" | "ask";
export type Dest =
  | { kind: "route"; to: string; search?: Record<string, string>; params?: Record<string, string> }
  | { kind: "legend"; term: string; tab: LegendTab }
  /** Saves something: choosing the row that says so is the confirmation. */
  | { kind: "write"; action: WriteAction }
  /** The answer is the row itself. */
  | { kind: "stay" };

export type Entry = {
  id: string;
  q: string;
  page: Page;
  kind: Kind;
  dest: Dest;
  words?: string[];
  /** The question in both languages: it can be typed in either, whatever the app's. */
  also?: string;
  answer?: string;
  /** The answer itself, shown large at the row's end. */
  value?: string;
  /** A stretch of time, whose short answer is worked out when the row is shown. */
  span?: Span;
  /** Read straight from what was typed, so it always comes first. */
  exact?: boolean;
  /** Ahead of what's otherwise equal (a saved climb over a detected one). */
  boost?: number;
};

export type Alt = Entry & { ghost: string | null };

export const PAGE_LABEL: Record<Page, () => string> = {
  tree: () => t("Tree", "Albero"),
  garden: () => t("Garden", "Orto"),
  body: () => t("Body", "Corpo"),
  analysis: () => t("Analysis", "Analisi"),
  segments: () => t("Segments", "Segmenti"),
  rides: () => t("Activities", "Attività"),
  ride: () => t("Activity", "Attività"),
  calendar: () => t("Calendar", "Calendario"),
  workouts: () => t("Workouts", "Allenamenti"),
  plan: () => t("Plan", "Piano"),
  pantry: () => t("Pantry", "Dispensa"),
  years: () => t("Years", "Anni"),
  settings: () => t("Settings", "Impostazioni"),
  forest: () => t("Forest", "Bosco"),
  legend: () => t("Legend", "Legenda"),
  zones: () => t("Zones", "Zone"),
  recap: () => t("Recap", "Riepilogo"),
  programme: () => t("Plan", "Programma"),
  save: () => t("Save", "Salva"),
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

/** Where each page is: the list behind "All", sorted by time rather than by kind. */
export type ListPage = Exclude<Page, "ride" | "recap" | "programme" | "save">;

export const PAGE_DEST: Record<ListPage, Dest> = {
  tree: route("/"),
  garden: route("/garden"),
  body: route("/analysis", { view: "body" }),
  analysis: route("/analysis"),
  segments: route("/segments"),
  rides: route("/rides"),
  calendar: route("/calendar"),
  workouts: route("/workouts"),
  plan: route("/plan"),
  pantry: route("/garden", { zoom: "pantry" }),
  years: route("/", { zoom: "years" }),
  settings: route("/settings"),
  forest: route("/forest"),
  legend: { kind: "legend", term: "crown", tab: "tree" },
  zones: route("/analysis", { view: "zones" }),
};

export const INDEX: { when: () => string; pages: ListPage[] }[] = [
  { when: () => t("Today", "Oggi"), pages: ["tree", "garden"] },
  {
    when: () => t("Before", "Prima"),
    pages: ["rides", "years", "pantry", "analysis", "body", "zones", "segments"],
  },
  { when: () => t("Ahead", "Poi"), pages: ["plan", "calendar", "workouts"] },
  { when: () => t("More", "Altro"), pages: ["legend", "settings", "forest"] },
];

/** Pages that only exist with the Garden on. */
export const gardenPage = (p: Page) => p === "garden" || p === "pantry";

const TODAY_SHEET = route("/", { sheet: "today" });

function questions(): Entry[] {
  return [
    {
      id: "today",
      q: t("How am I today?", "Come sto oggi?"),
      also: `${"How am I today?"} ${"Come sto oggi?"}`,
      page: "tree",
      kind: "body",
      dest: TODAY_SHEET,
      words: [
        "feel",
        "tired",
        "checkin",
        "readiness",
        "season",
        "mood",
        "sento",
        "stanco",
        "stanca",
        "stagione",
        "umore",
      ],
    },
    {
      id: "sleep",
      q: t("How am I sleeping?", "Come sto dormendo?"),
      also: `${"How am I sleeping?"} ${"Come sto dormendo?"}`,
      page: "body",
      kind: "body",
      dest: route("/analysis", { plot: "sleep" }),
      words: ["sleep", "night", "hrv", "rest", "sonno", "notte", "notti", "dormire", "riposo"],
    },
    {
      id: "week",
      q: t("What changed this week?", "Cos'è cambiato questa settimana?"),
      also: `${"What changed this week?"} ${"Cos'è cambiato questa settimana?"}`,
      page: "tree",
      kind: "body",
      dest: TODAY_SHEET,
      words: ["wind", "trend", "vento", "tendenza"],
    },
    {
      id: "fatigue",
      q: t("How much fatigue am I building?", "Quanta fatica sto accumulando?"),
      also: `${"How much fatigue am I building?"} ${"Quanta fatica sto accumulando?"}`,
      page: "analysis",
      kind: "body",
      dest: PAGE_DEST.analysis,
      words: ["load", "atl", "recovery", "carico", "stanchezza", "recupero"],
    },
    {
      id: "weight",
      q: t("What do I weigh?", "Quanto peso?"),
      also: `${"What do I weigh?"} ${"Quanto peso?"}`,
      page: "body",
      kind: "body",
      dest: route("/analysis", { plot: "weight" }),
      words: ["weight", "mass", "composition", "fat", "massa", "composizione", "grasso"],
    },
    {
      id: "analysis",
      q: t("Analysis", "Analisi"),
      also: `${"Analysis"} ${"Analisi"}`,
      page: "analysis",
      kind: "perf",
      dest: PAGE_DEST.analysis,
      words: [
        "progress",
        "ftp",
        "fitness",
        "power",
        "watt",
        "form",
        "progressi",
        "potenza",
        "forma",
        "improving",
        "migliorando",
      ],
    },
    {
      id: "climbs",
      q: t("My climbs", "Le mie salite"),
      also: `${"My climbs"} ${"Le mie salite"}`,
      page: "segments",
      kind: "perf",
      dest: PAGE_DEST.segments,
      words: ["segments", "summit", "pass", "segmenti", "vetta", "passi", "tempi"],
    },
    {
      id: "activities",
      q: t("My activities", "Le mie attività"),
      also: `${"My activities"} ${"Le mie attività"}`,
      page: "rides",
      kind: "place",
      dest: PAGE_DEST.rides,
      words: [
        "rides",
        "runs",
        "list",
        "history",
        "uscite",
        "pedalata",
        "pedalate",
        "giri",
        "corse",
        "storico",
        "lista",
        "bici",
      ],
    },
    {
      id: "planned",
      q: t("What's planned?", "Cosa c'è in programma?"),
      also: `${"What's planned?"} ${"Cosa c'è in programma?"}`,
      page: "calendar",
      kind: "plan",
      dest: PAGE_DEST.calendar,
      words: ["plan", "tomorrow", "calendar", "piano", "domani", "calendario", "settimana"],
    },
    {
      id: "race",
      q: t("Add a race", "Aggiungi una gara"),
      also: `${"Add a race"} ${"Aggiungi una gara"}`,
      page: "calendar",
      kind: "plan",
      dest: PAGE_DEST.calendar,
      words: ["races", "event", "gare", "evento", "competizione", "nuova"],
    },
    {
      id: "log",
      q: t("Log a workout", "Registra un allenamento"),
      also: `${"Log a workout"} ${"Registra un allenamento"}`,
      page: "calendar",
      kind: "plan",
      dest: PAGE_DEST.calendar,
      words: ["add", "session", "file", "fit", "upload", "aggiungi", "seduta", "carica"],
    },
    {
      id: "plan",
      q: t("My training plan", "Il mio piano"),
      also: `${"My training plan"} ${"Il mio piano di allenamento"}`,
      page: "plan",
      kind: "plan",
      dest: PAGE_DEST.plan,
      words: ["plan", "training", "piano", "allenamento", "programma", "week", "settimana"],
    },
    {
      id: "plan-settings",
      q: t("Plan settings", "Impostazioni del piano"),
      also: `${"Plan settings"} ${"Impostazioni del piano"}`,
      page: "plan",
      kind: "plan",
      dest: route("/plan/settings"),
      words: ["giorni", "days", "obiettivo", "goal"],
    },
    {
      id: "workouts",
      q: t("My workouts", "I miei allenamenti"),
      also: `${"My workouts"} ${"I miei allenamenti"}`,
      page: "workouts",
      kind: "plan",
      dest: PAGE_DEST.workouts,
      words: ["library", "intervals", "libreria", "ripetute", "sedute"],
    },
    {
      id: "garden",
      q: t("My garden", "Il mio orto"),
      also: `${"My garden"} ${"Il mio orto"}`,
      page: "garden",
      kind: "place",
      dest: PAGE_DEST.garden,
      words: [
        "orto",
        "giardino",
        "sports",
        "run",
        "gym",
        "swim",
        "plants",
        "sport",
        "corsa",
        "palestra",
        "nuoto",
        "piante",
        "pomodori",
      ],
    },
    {
      id: "pantry",
      q: t("The pantry", "La dispensa"),
      also: `${"The pantry"} ${"La dispensa"}`,
      page: "pantry",
      kind: "place",
      dest: PAGE_DEST.pantry,
      words: ["jars", "jar", "vasi", "barattoli", "conserve", "marmellata"],
    },
    {
      id: "years",
      q: t("My years", "I miei anni"),
      also: `${"My years"} ${"I miei anni"}`,
      page: "years",
      kind: "place",
      dest: PAGE_DEST.years,
      words: ["rings", "year", "history", "anelli", "anno", "scorso", "storia", "sezione"],
    },
    {
      id: "settings",
      q: t("Settings", "Impostazioni"),
      also: `${"Settings"} ${"Impostazioni"}`,
      page: "settings",
      kind: "place",
      dest: PAGE_DEST.settings,
      words: ["language", "account", "key", "lingua", "chiave", "esci", "impostazioni"],
    },
    {
      id: "legend",
      q: t("Legend", "Legenda"),
      also: `${"Legend"} ${"Legenda"}`,
      page: "legend",
      kind: "place",
      dest: PAGE_DEST.legend,
      words: [
        "guida",
        "guide",
        "help",
        "explain",
        "mean",
        "aiuto",
        "spiega",
        "significa",
        "istruzioni",
      ],
    },
    {
      id: "guide-search",
      q: t("How to search", "Come si cerca"),
      also: "how to search come cercare ricerca",
      page: "legend",
      kind: "place",
      dest: { kind: "legend", term: "find", tab: "ask" },
      words: ["guida", "guide", "help", "aiuto", "barra", "bar", "scrivere", "typing"],
    },
    {
      id: "forest",
      q: t("The forest", "Il bosco"),
      also: `${"The forest"} ${"Il bosco"}`,
      page: "forest",
      kind: "far",
      dest: PAGE_DEST.forest,
      words: [
        "forests",
        "friends",
        "team",
        "bosco",
        "boschi",
        "foreste",
        "foresta",
        "amici",
        "compagni",
        "squadra",
      ],
    },
  ];
}

/** Other words for the parts of the tree and the garden. */
const LEGEND_WORDS: Record<string, string[]> = {
  crown: [
    "seasons",
    "winter",
    "summer",
    "autumn",
    "spring",
    "stagioni",
    "inverno",
    "estate",
    "autunno",
    "primavera",
  ],
  sky: ["rain", "clouds", "sun", "weather", "pioggia", "nuvole", "sole", "meteo"],
  wind: ["vento"],
  limit: ["ceiling", "tetto"],
  focus: ["block", "blocco"],
  buds: ["gemma"],
  trunk: ["tronco", "ctl"],
  branches: ["branch", "ramo"],
  leaves: ["leaf", "red", "colours", "foglia", "rosse", "colori", "verdi"],
  birds: ["brioche", "sparrow", "passero", "merlo", "uccello", "uccelli"],
  squirrel: ["scoiattolo"],
  owl: ["gufo", "civetta"],
  rest: ["dots", "riposo", "puntini"],
  knots: ["sick", "injury", "spiral", "malattia", "infortunio", "spirale"],
  weeks: ["golden", "dorata"],
  sprouts: ["sprout", "germoglio"],
  plants: ["vegetable", "ortaggio", "frutta"],
  animals: ["hedgehog", "frog", "snail", "riccio", "rana", "lumaca"],
};

function legendEntry(g: GuideItem, tab: LegendTab): Entry | null {
  if (!g.id) return null;
  return {
    id: `legend-${g.id}`,
    q: g.term,
    page: "legend",
    kind: "legend",
    dest: { kind: "legend", term: g.id, tab },
    words: LEGEND_WORDS[g.id] ?? [],
    answer: g.text,
  };
}

const ENGLISH_MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

function monthEntries(today: string): Entry[] {
  const first = parseISO(`${today.slice(0, 7)}-01`);
  const out: Entry[] = [];
  // The year just gone, then the months ahead: a month's name means the latest one that has happened, or else the next.
  for (const back of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, -1, -2, -3, -4, -5]) {
    const d = new Date(first.getFullYear(), first.getMonth() - back, 1);
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    out.push({
      id: `month-${month}`,
      q: format(d, "MMMM yyyy"),
      page: "calendar",
      kind: "place",
      dest: route("/calendar", { month }),
      words: [ENGLISH_MONTHS[d.getMonth()]!],
    });
  }
  return out;
}

const metres = (m: number | null | undefined) => (m ? `${Math.round(m)} m` : null);

function rideAnswer(a: Activity) {
  return [
    format(parseISO(a.start_date_local), "EEE d MMM"),
    formatDuration(a.moving_time),
    metres(a.total_elevation_gain),
  ]
    .filter(Boolean)
    .join(" · ");
}

export type AskData = {
  today: string;
  garden: boolean;
  acts?: Activity[] | undefined;
  wellness?: Wellness[] | undefined;
  races?: PlannedEvent[] | undefined;
  /** Saved and detected climbs, under the names you see. */
  climbs?: AskClimb[] | undefined;
  /** What's planned from today on. */
  events?: PlannedEvent[] | undefined;
  params?: ParamData | undefined;
  /** The forests you're in. */
  forests?: { id: string; name: string; trees: number }[] | undefined;
};

export type AskClimb = {
  id: string;
  name: string;
  length: number;
  gain?: number | undefined;
  rides: number | null;
  saved: boolean;
};

/** Today's activity, the question it raises. */
export function todayRideEntry(a: Activity): Entry {
  return {
    id: "today-ride",
    q: t("How did today go?", "Com'è andata oggi?"),
    also: `${"How did today go?"} ${"Com'è andata oggi?"}`,
    page: "ride",
    kind: "ride",
    dest: route("/rides/$id", undefined, { id: a.id }),
    words: [a.name ?? "", "oggi", "today"],
    answer: [a.name, formatDuration(a.moving_time), metres(a.total_elevation_gain)]
      .filter(Boolean)
      .join(" · "),
  };
}

/** Short answers for the questions the data can settle right here. */
function answers(data: AskData): Record<string, string> {
  const out: Record<string, string> = {};
  const rows = data.wellness ?? [];
  const row = rows.find((w) => w.id === data.today);
  const then = rows.find((w) => w.id === addDays(data.today, -42));
  if (row?.ctl != null && then?.ctl != null)
    out["analysis"] = t(
      `Fitness ${Math.round(row.ctl)}, ${Math.round(then.ctl)} six weeks ago`,
      `Fitness ${Math.round(row.ctl)}, era ${Math.round(then.ctl)} sei settimane fa`,
    );
  if (row?.sleepSecs)
    out["sleep"] = t(
      `${formatDuration(row.sleepSecs)} last night`,
      `${formatDuration(row.sleepSecs)} stanotte`,
    );
  const weight = [...rows].reverse().find((w) => w.weight != null)?.weight;
  if (weight != null) out["weight"] = `${weight} kg`;
  return out;
}

/** Stretches of time: the fixed phrases, and with something typed, whatever can be read from it. */
export function whenEntries(query: string, today: string): Entry[] {
  return whenCandidates(query, today).map((c) => ({
    id: `when-${c.id}`,
    q: c.q,
    ...(c.also ? { also: c.also } : {}),
    ...(c.words ? { words: c.words } : {}),
    ...(c.exact ? { exact: true } : {}),
    page: c.from > today ? "programme" : "recap",
    kind: "when",
    span: { from: c.from, to: c.to },
    dest: route("/recap", { from: c.from, to: c.to }),
  }));
}

/** Everything that can be found: the questions, the legend, and this person's own rides, climbs, races and months. */
export function allEntries(data: AskData): Entry[] {
  const said = answers(data);
  const base = questions()
    .filter((e) => data.garden || !gardenPage(e.page))
    .map((e) => (said[e.id] ? { ...e, answer: said[e.id]! } : e));
  const legend = [
    ...TREE_GUIDE.filter((g) => data.garden || g.id !== "sprouts").map((g) =>
      legendEntry(g, "tree"),
    ),
    ...(data.garden ? GARDEN_GUIDE.map((g) => legendEntry(g, "garden")) : []),
  ].filter((e): e is Entry => !!e);
  // The newest of each name: a hundred "Morning ride" would be one answer anyway.
  const names = new Set<string>();
  const rides: Entry[] = [];
  for (const a of data.acts ?? []) {
    const name = a.name?.trim();
    if (!name || names.has(name)) continue;
    names.add(name);
    rides.push({
      id: `ride-${a.id}`,
      q: name,
      page: "ride",
      kind: "ride",
      dest: route("/rides/$id", undefined, { id: a.id }),
      answer: rideAnswer(a),
    });
  }
  const climbs: Entry[] = (data.climbs ?? []).map((c) => ({
    id: `segment-${c.id}`,
    q: c.name,
    page: "segments",
    kind: "ride",
    boost: c.saved ? 8 : 0,
    dest: route("/segments/$id", { sport: mainSport() }, { id: c.id }),
    answer: [
      `${(c.length / 1000).toFixed(1)} km`,
      metres(c.gain),
      c.rides ? t(`${c.rides} passes`, `${c.rides} passaggi`) : null,
    ]
      .filter(Boolean)
      .join(" · "),
  }));
  const when = whenEntries("", data.today);
  // Friends stay at a distance: a forest comes up only when its name is clearly being typed.
  const forests: Entry[] = (data.forests ?? []).map((f) => ({
    id: `forest-${f.id}`,
    q: f.name,
    page: "forest",
    kind: "far",
    boost: 40,
    dest: route("/forest/$fid", undefined, { fid: f.id }),
    answer: t(`${f.trees} trees`, `${f.trees} alberi`),
  }));
  const params: Entry[] = data.params ? paramEntries(data.params) : [];
  const races: Entry[] = (data.races ?? [])
    .filter((r) => r.name && r.date >= data.today)
    .map((r) => ({
      id: `race-${r.id}`,
      q: r.name!,
      page: "calendar",
      kind: "plan",
      dest: route("/calendar", { month: r.date.slice(0, 7) }),
      answer: format(parseISO(r.date), "EEE d MMM yyyy"),
    }));
  return [
    ...when,
    ...params,
    ...base,
    ...legend,
    ...rides,
    ...climbs,
    ...races,
    ...forests,
    ...monthEntries(data.today),
  ];
}

/** Lower case, no accents, no punctuation but the apostrophe. */
export const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9' ]/g, " ");

function wordScore(token: string, e: Entry): number {
  const phrase = norm(e.q).trim();
  const words = phrase.split(/[ ']/);
  if (phrase === token) return 70;
  if (phrase.startsWith(token)) return 60;
  if (words.some((w) => w.startsWith(token))) return token.length > 1 ? 45 : 18;
  const alias = [...(e.words ?? []), ...(e.also ?? "").split(/[ ']/)].map(norm);
  if (alias.includes(token)) return 42;
  if (alias.some((w) => w.startsWith(token))) return token.length > 1 ? 32 : 6;
  if ([...words, ...alias].some((w) => near(token, w) || near(token, w.slice(0, token.length + 1))))
    return 22;
  return 0;
}

const isLow = (season: Season | null) => season === "winter" || season === "autumn";

/** How much the season brings a kind of thing closer; a whole word speaks for itself. */
function closeness(kind: Kind, season: Season | null, typed: number) {
  if (!season) return 0;
  const weight = typed === 1 ? 2.2 : typed === 2 ? 1.4 : 1;
  if (kind === "body") return (isLow(season) ? 16 : 0) * weight;
  if (kind === "perf") return (isLow(season) ? -14 : 14) * weight;
  return 0;
}

/** At most `max` alternatives for what's been typed, the best first. */
export function alternatives(
  query: string,
  season: Season | null,
  entries: Entry[],
  max = 3,
): Alt[] {
  const tokens = norm(query).trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return [];
  const joined = tokens.join(" ");
  const scored: { e: Entry; score: number }[] = [];
  for (const e of entries) {
    // Friends are never a guess: only a clear search finds them.
    if (e.kind === "far" && joined.length < 3) continue;
    // Your own rides, the legend's parts and the months need more than one letter to step forward.
    if (
      (e.kind === "ride" || e.kind === "legend" || e.kind === "value" || e.kind === "when") &&
      joined.length < 2 &&
      !e.exact
    )
      continue;
    if (e.id.startsWith("month-") && joined.length < 3) continue;
    if (e.exact) {
      scored.push({ e, score: 90 + (e.boost ?? 0) });
      continue;
    }
    const each = tokens.map((token) => wordScore(token, e));
    if (each.some((s) => !s)) continue;
    const score =
      each.reduce((a, b) => a + b, 0) / each.length +
      closeness(e.kind, season, joined.length) +
      (e.boost ?? 0) -
      // A word that's both a page and a part of the legend means the page.
      (e.kind === "legend" ? 30 : 0);
    // Nothing weak enough to be a near-spelling of something else ("soglia", "foglia").
    if (score <= 0) continue;
    scored.push({ e, score });
  }
  // The same row reached by two ways (a command and a phrase) counts once.
  const seen = new Set<string>();
  return scored
    .sort((a, b) => b.score - a.score || a.e.q.length - b.e.q.length)
    .filter(({ e }) => {
      const key = `${e.q}|${JSON.stringify(e.dest)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, max)
    .map(({ e }) => ({
      ...e,
      ghost: norm(e.q).startsWith(joined) ? e.q.slice(query.trimEnd().length) : null,
    }));
}

export type Moment = {
  season: Season | null;
  /** The morning check-in is on, not done and not skipped today. */
  checkInDue: boolean;
  /** Today's latest activity, if any. */
  ride: Activity | null;
  /** That activity has been opened on this device. */
  rideSeen: boolean;
  /** A workout or race is planned today. */
  planned: boolean;
  hour: number;
  /** 0 is Sunday. */
  weekday?: number;
};

/** The day is done: nothing is waiting, so nothing is offered. */
export const dayIsDone = (m: Moment) =>
  !m.checkInDue && ((!!m.ride && m.rideSeen) || (!m.ride && !m.planned && m.hour >= 18));

/** What's close to hand right now, with nothing typed: the moment first, then what the season brings near. */
export function nowEntries(m: Moment, entries: Entry[]): Entry[] {
  if (dayIsDone(m)) return [];
  const pick = (...ids: string[]) =>
    ids.flatMap((id) => {
      const e = entries.find((x) => x.id === id);
      return e ? [e] : [];
    });
  const near = isLow(m.season) ? ["sleep", "week"] : ["climbs", "activities"];
  // With nothing else waiting, what today calls for comes first.
  const open = entries.some((e) => e.id === "do-today") ? ["do-today", near[0]!] : near;
  if (m.checkInDue) return pick("today", ...near);
  if (m.ride && !m.rideSeen) return [todayRideEntry(m.ride), ...pick(near[0]!)];
  if (m.planned) return pick("planned", near[0]!);
  // At the week's turn, a look back joins what's close to hand.
  if (m.weekday === 0) return pick(...open, "when-this-week");
  if (m.weekday === 1) return pick(...open, "when-last-7");
  return pick(...open);
}

/** The bar's line: the moment's question, or plainly an invitation. */
export function barText(m: Moment) {
  if (m.checkInDue) return t("How am I today?", "Come sto oggi?");
  if (m.ride && !m.rideSeen) return t("How did today go?", "Com'è andata oggi?");
  return t("Ask the tree…", "Chiedi all'albero…");
}

/** The short answer for a stretch of time, worked out only for the rows on screen. */
export function spanAnswer(e: Entry, data: AskData): string | undefined {
  if (!e.span) return e.answer;
  const { from, to } = e.span;
  if (from > data.today) {
    const planned = (data.events ?? []).filter(
      (p) =>
        p.date >= from &&
        p.date <= to &&
        (p.category === "WORKOUT" || /^RACE_[ABC]$/.test(p.category)),
    );
    if (!planned.length) return t("Nothing planned", "Niente in programma");
    if (from === to || planned.length === 1) {
      const p = planned[0]!;
      return [
        p.name,
        formatDuration(p.moving_time || null),
        p.icu_training_load
          ? t(`load ${p.icu_training_load}`, `carico ${p.icu_training_load}`)
          : null,
      ]
        .filter((v) => v && v !== "–")
        .join(" · ");
    }
    const secs = planned.reduce((a, p) => a + (p.moving_time ?? 0), 0);
    return [
      t(`${planned.length} planned`, `${planned.length} in programma`),
      secs ? formatDuration(secs) : null,
    ]
      .filter(Boolean)
      .join(" · ");
  }
  const end = to < data.today ? to : data.today;
  const acts = (data.acts ?? []).filter((a) => {
    const d = a.start_date_local.slice(0, 10);
    return d >= from && d <= end;
  });
  if (from === to)
    return acts.length
      ? acts
          .map((a) => a.name)
          .filter(Boolean)
          .join(", ")
      : t("Nothing recorded", "Nessuna attività");
  const days = new Set(acts.map((a) => a.start_date_local.slice(0, 10))).size;
  let total = 0;
  for (let d = from; d <= end; d = addDays(d, 1)) total++;
  const secs = acts.reduce((a, x) => a + (x.moving_time ?? 0), 0);
  return [
    t(`${acts.length} activities`, `${acts.length} attività`),
    secs ? formatDuration(secs) : null,
    t(`${total - days} rest days`, `${total - days} di riposo`),
  ]
    .filter(Boolean)
    .join(" · ");
}
