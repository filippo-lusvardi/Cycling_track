// One reader for questions about efforts, whatever order the words come in: "power today 3m", "3 min potenza ieri",
// "quanti watt ho tenuto oggi per tre minuti". It only reads: what's asked and about what, or null when any word is left
// over, so a phrase that means something else (a climb called Passo, "fc soglia") keeps its meaning. Pure.
import { activityKind } from "./activity-kind";
import { norm } from "./ask";
import { spanTitle, whenCandidates, type WhenCandidate } from "./ask-when";
import type { Activity } from "./intervals";
import type { Attempt } from "./segments";
import { isSport, type MainSport } from "./sport";
import { t } from "./i18n";
import { addDays, formatDuration } from "./training";

export const plain = (s: string) => norm(s).trim().replace(/\s+/g, " ");

/** Whether these words, all of them, name a time: any day or stretch, past or ahead, in either language. */
export function namesTime(phrase: string, today: string) {
  const typed = plain(phrase);
  return whenCandidates(phrase, today).find((c) => {
    if (c.exact || plain(c.q) === typed) return true;
    const also = plain(c.also ?? "");
    // `also` holds the English name and then the Italian one.
    return typed.includes(" ")
      ? also.startsWith(`${typed} `) || also.endsWith(` ${typed}`)
      : also.split(" ").includes(typed);
  });
}

export const SPORT_WORDS: [RegExp, (a: Activity) => boolean][] = [
  [/^(uscita|pedalata|ride|giro|bici|bike)$/, (a) => isSport(a, "ride")],
  [/^(corsa|run)$/, (a) => isSport(a, "run")],
  [/^(nuoto|nuotata|swim)$/, (a) => activityKind(a) === "swim"],
  [/^(camminata|escursione|walk|hike)$/, (a) => /walk|hike/i.test(a.type ?? "")],
  [/^(palestra|forza|gym|strength)$/, (a) => /weight|workout/i.test(a.type ?? "")],
  [/^(attivita|activity|seduta|session)$/, () => true],
];

export type IntentClimb = {
  id: string;
  name: string;
  length: number;
  /** Metres climbed, when known. */
  gain?: number | undefined;
  saved: boolean;
  attempts: Attempt[];
};

/** Climbs whose name holds every word typed, the closest first. */
export function matchClimbs(climbs: IntentClimb[], rest: string) {
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

export type Metric = "power" | "hr" | "pace" | "speed";
export type Shape = "best" | "marks" | "mean" | "max";
export type Length = { secs: number; label: string };

/** The page someone is reading: a question that names nothing is about it. */
export type Here =
  { kind: "ride"; id: string } | { kind: "recap"; from: string; to: string; q: string };

export type Target =
  | { kind: "span"; from: string; to: string; q: string }
  | { kind: "ride"; id: string; name: string };

export type Asked = {
  metric: Metric;
  shape: Shape;
  length: Length | null;
  target: Target | null;
  /** "corsa" or "uscita" among the words: only that sport. */
  sport: MainSport | null;
};

export type ReadContext = {
  today: string;
  sport: MainSport;
  acts?: Activity[] | undefined;
  climbs?: IntentClimb[] | undefined;
  here?: Here | null | undefined;
};

export const FAMILIES: [Metric, RegExp][] = [
  ["power", /\b(?:quanti watt|potenza|power|watts?)\b/g],
  ["hr", /\b(?:frequenza cardiaca|battiti cardiaci|heart rate|battiti|bpm|fc|hr)\b/g],
  ["speed", /(?:\b(?:velocita|speed|kmh)\b|\bkm\/h(?= |$))/g],
  ["pace", /\b(?:passo|pace)\b/g],
];

/** Questions with an answer elsewhere: a threshold, a zone, a chart, all time, a comparison. Never a resting heart rate. */
const ELSEWHERE =
  /\b(?:soglia|threshold|lthr|riposo|resting|zon[ae]s?|z[1-7]|distribuzione|distribution|istogramma|histogram|curva|curve|grafico|chart|ftp|eftp|ramp|di sempre|all time|all-time|ever|assolut[oa]|vs|versus|contro|confronta|compare|rispetto)\b/;

const MEAN = /^(?:media|medio|medi|mean|average|avg)$/;
const MAX = /^(?:massima|massimo|max|highest|peak|picco)$/;
const RIDE_WORD = /^(?:uscita|uscite|pedalata|pedalate|ride|rides|giro|bici|bike)$/;
const RUN_WORD = /^(?:corsa|corse|run|runs)$/;
const LAST = /^(?:ultim[oa]|last|latest)$/;
const THIS = /^(?:questa|questo|this)$/;

const FILLER = new Set(
  (
    "best miglior migliore migliori record pr pb quanti quanta quanto qual quale quali che cosa " +
    "ho hai sono stato tenuto tenuti tenere tieni spinto spinti fatto fatti fare mantenuto held hold " +
    "sustained did do i is was what whats my me the show mostrami dimmi tell " +
    "il la lo le gli un una uno mio mia miei mie di del della dello dei delle per su sul sulla sui nel nella " +
    "in on at for over of a al alla da e l"
  ).split(" "),
);

const COUNTED: Record<string, number> = {
  un: 1,
  uno: 1,
  una: 1,
  one: 1,
  a: 1,
  an: 1,
  due: 2,
  two: 2,
  tre: 3,
  three: 3,
  quattro: 4,
  four: 4,
  cinque: 5,
  five: 5,
  sei: 6,
  six: 6,
  sette: 7,
  seven: 7,
  otto: 8,
  eight: 8,
  nove: 9,
  nine: 9,
  dieci: 10,
  ten: 10,
  dodici: 12,
  twelve: 12,
  quindici: 15,
  fifteen: 15,
  venti: 20,
  twenty: 20,
  trenta: 30,
  thirty: 30,
  quaranta: 40,
  forty: 40,
  sessanta: 60,
  sixty: 60,
};
const UNIT = "secondi|secondo|seconds?|secs?|minuti|minuto|minutes?|mins?|ore|ora|hours?";

/** Lengths as dictation says them: "tre minuti", "un'ora", "mezz'ora" become "3 minuti", "1 ora", "30 minuti". */
function spellNumbers(s: string) {
  return s
    .replace(/\b(?:mezz'?ora|mezza ora|half an hour)\b/g, "30 minuti")
    .replace(/\bun'ora\b/g, "1 ora")
    .replace(new RegExp(`\\b([a-z]+) (${UNIT})\\b`, "g"), (all, word: string, unit: string) =>
      COUNTED[word] != null ? `${COUNTED[word]} ${unit}` : all,
    );
}

function sized(secs: number, label: string): Length | null {
  return secs >= 1 && secs <= 12 * 3600 ? { secs, label } : null;
}

/** A length written with its unit, out of the phrase. A bare number is read later: it may be part of a date. */
export function takeLength(s: string): { length: Length | null; rest: string } {
  // "1h30" and "1h 30m" are one length, and "1h 30" at the end; "1h 6 novembre" is an hour and a date.
  const both =
    /(?:^| )(\d{1,2}) ?h(?:ours?)?(\d{1,2})(?: ?(?:m|min|mins|minuti|minutes?))?(?= |$)/.exec(s) ??
    /(?:^| )(\d{1,2}) ?h(?:ours?)? (\d{1,2})(?: ?(?:m|min|mins|minuti|minutes?)(?= |$)| *$)/.exec(
      s,
    );
  if (both) {
    const secs = Number(both[1]) * 3600 + Number(both[2]) * 60;
    return { length: sized(secs, formatDuration(secs)), rest: s.replace(both[0], " ") };
  }
  const one = new RegExp(`(?:^| )(\\d+(?:[.,]\\d+)?) ?('|s|m|h|${UNIT})(?= |$)`).exec(s);
  if (!one) return { length: null, rest: s };
  const n = Number(one[1]!.replace(",", "."));
  const u = one[2]!;
  const unit = u === "'" ? "m" : u[0] === "o" ? "h" : u[0]!;
  const secs = Math.round(unit === "s" ? n : unit === "m" ? n * 60 : n * 3600);
  const label = unit === "s" ? `${n} s` : unit === "m" ? `${n} min` : `${n} h`;
  return { length: sized(secs, label), rest: s.replace(one[0], " ") };
}

export const activityDay = (a: Activity) => a.start_date_local.slice(0, 10);

/** Longest run of words naming a time, anywhere in the phrase. A lone number isn't one here: it's a length. */
export function takeTime(words: string[], today: string) {
  for (let n = Math.min(words.length, 8); n >= 1; n--)
    for (let i = 0; i + n <= words.length; i++) {
      const phrase = words.slice(i, i + n).join(" ");
      if (/^\d{1,3}$/.test(phrase) || LAST.test(phrase) || THIS.test(phrase)) continue;
      const when = namesTime(phrase, today);
      if (when) return { when, rest: [...words.slice(0, i), ...words.slice(i + n)] };
    }
  return null;
}

/** One day goes by its everyday name when it has one: "Oggi", however it was said. */
const spanOf = (c: WhenCandidate, today: string): Target => ({
  kind: "span",
  from: c.from,
  to: c.to,
  q: c.from === today && c.to === today ? spanTitle(c, today) : c.q,
});

/** "ultima uscita", "last ride", "questa uscita", "ultimo manghen", a ride's own name; and which words it leaves. */
function takeRide(words: string[], ctx: ReadContext): { target: Target; rest: string[] } | null {
  const acts = ctx.acts ?? [];
  const named = (a: Activity): Target => ({
    kind: "ride",
    id: a.id,
    name: a.name ?? a.type ?? "",
  });
  const whole = plain(words.join(" "));
  if (whole.length >= 3) {
    const a = acts.find((x) => x.name && plain(x.name) === whole);
    if (a) return { target: named(a), rest: [] };
  }
  const at = words.findIndex((w) => LAST.test(w) || THIS.test(w));
  if (at < 0 || at + 1 >= words.length) return null;
  const next = words[at + 1]!;
  const rest = [...words.slice(0, at), ...words.slice(at + 2)];
  const sport = SPORT_WORDS.find(([re]) => re.test(next));
  if (THIS.test(words[at]!)) {
    if (!sport || ctx.here?.kind !== "ride") return null;
    const a = acts.find((x) => x.id === (ctx.here as { id: string }).id);
    return a ? { target: named(a), rest } : null;
  }
  if (sport) {
    const a = [...acts]
      .filter(sport[1])
      .sort((x, y) => y.start_date_local.localeCompare(x.start_date_local))[0];
    return a ? { target: named(a), rest } : null;
  }
  return null;
}

/** "ultimo manghen": the day of the last pass, whichever ride it was. Read after times, so "last week" stays one. */
function takeClimb(words: string[], ctx: ReadContext): { target: Target; rest: string[] } | null {
  const at = words.findIndex((w) => LAST.test(w));
  if (at < 0 || at + 1 >= words.length || !ctx.climbs?.length) return null;
  const climb = matchClimbs(ctx.climbs, words.slice(at + 1).join(" "))[0]?.c;
  const pass = climb?.attempts.reduce<Attempt | null>(
    (m, x) => (!m || x.date > m.date ? x : m),
    null,
  );
  if (!climb || !pass) return null;
  const date = pass.date.slice(0, 10);
  return {
    target: { kind: "span", from: date, to: date, q: `${climb.name} · ${date}` },
    rest: words.slice(0, at),
  };
}

export function takeTarget(
  words: string[],
  ctx: ReadContext,
): { target: Target | null; rest: string[] } {
  const ride = takeRide(words, ctx);
  if (ride) return ride;
  const time = takeTime(words, ctx.today);
  if (time) return { target: spanOf(time.when, ctx.today), rest: time.rest };
  return takeClimb(words, ctx) ?? { target: null, rest: words };
}

/** The sport named among the words, and what's left once the small words are gone. */
export function sift(words: string[]): { sport: MainSport | null; rest: string[] } {
  let sport: MainSport | null = null;
  const rest = words.filter((w) => {
    if (RIDE_WORD.test(w)) sport = "ride";
    else if (RUN_WORD.test(w)) sport = "run";
    else return !FILLER.has(w);
    return false;
  });
  return { sport, rest };
}

export const hereTarget = (ctx: ReadContext): Target | null => {
  const here = ctx.here;
  if (!here) return null;
  if (here.kind === "recap") return { kind: "span", from: here.from, to: here.to, q: here.q };
  const a = ctx.acts?.find((x) => x.id === here.id);
  return a ? { kind: "ride", id: a.id, name: a.name ?? a.type ?? "" } : null;
};

const DISTRIBUTION = /\b(?:distribuzione|distribution|istogramma|histogram)\b/;
const ZONES_WORD = /\b(?:zone|zones)\b/;
const NOT_A_DISTRIBUTION =
  /\b(?:soglia|threshold|lthr|riposo|resting|z[1-7]|curva|curve|grafico|chart|ftp|eftp|di sempre|all time|all-time|vs|versus|contro|confronta|compare|rispetto)\b/;
const RECENT_DISTRIBUTION_DAYS = 28;

export type AskedDistribution = {
  metric: "power" | "hr" | null;
  target: Target;
  onlySport: MainSport | null;
};

/** "distribuzione fc oggi", "zone marzo": how time was spread. "zone" alone stays the zones' own page. */
export function readDistribution(typed: string, ctx: ReadContext): AskedDistribution | null {
  if (NOT_A_DISTRIBUTION.test(typed)) return null;
  const dist = DISTRIBUTION.test(typed);
  if (!dist && !ZONES_WORD.test(typed)) return null;
  let s = typed.replace(DISTRIBUTION, " ").replace(ZONES_WORD, " ");
  let metric: "power" | "hr" | null = null;
  for (const [m, re] of FAMILIES) {
    if (m !== "power" && m !== "hr") continue;
    if (s.search(re) < 0) continue;
    if (metric) return null;
    metric = m;
    s = s.replace(re, " ");
  }
  const where = takeTarget(s.split(" ").filter(Boolean), ctx);
  const { sport, rest } = sift(where.rest);
  if (rest.length) return null;
  if (where.target) return { metric, target: where.target, onlySport: sport };
  if (!dist) return null;
  const here = hereTarget(ctx);
  if (here) return { metric, target: here, onlySport: sport };
  // "distribuzione" alone is the chart's own name; with a metric, your last few weeks.
  if (!metric) return null;
  return {
    metric,
    target: {
      kind: "span",
      from: addDays(ctx.today, 1 - RECENT_DISTRIBUTION_DAYS),
      to: ctx.today,
      q: t(`Last ${RECENT_DISTRIBUTION_DAYS} days`, `Ultimi ${RECENT_DISTRIBUTION_DAYS} giorni`),
    },
    onlySport: sport,
  };
}

/** What an effort question asks, or null when these words aren't one. */
export function readAsk(typed: string, ctx: ReadContext): Asked | null {
  let s = spellNumbers(typed);
  if (ELSEWHERE.test(s)) return null;
  const found = FAMILIES.filter(([, re]) => s.search(re) >= 0);
  // "passo" is the climbs' word too: it only counts alone. Two at once are two questions.
  const said = found.filter(([m]) => m !== "pace");
  if (said.length > 1) return null;
  const family = said[0] ?? found[0];
  if (!family) return null;
  const metric = family[0];
  s = s.replace(family[1], " ");

  const { length: written, rest } = takeLength(s);
  let length = written;
  let words = rest.split(" ").filter(Boolean);

  let shape: Shape | null = null;
  words = words.filter((w) => {
    if (MEAN.test(w)) shape = "mean";
    else if (MAX.test(w)) shape ??= "max";
    else return true;
    return false;
  });

  const where = takeTarget(words, ctx);
  let target = where.target;
  words = where.rest;
  const sifted = sift(words);
  const sport = sifted.sport;
  words = sifted.rest;

  // What's left is a length with no unit, where the word before says it's one, or something else entirely.
  if (
    !length &&
    words.length === 1 &&
    /^\d{1,3}$/.test(words[0]!) &&
    (target || metric !== "speed")
  ) {
    const n = Number(words[0]);
    length = sized(n * 60, `${n} min`);
    words = [];
  }
  if (words.length) return null;

  const typedTarget = !!target;
  if (!target) target = hereTarget(ctx);

  const noShape = shape as Shape | null;
  // Speed is only ever a mean; a length on it means nothing yet.
  if (metric === "speed") {
    if (length || noShape === "max") return null;
    return { metric, shape: "mean", length: null, target, sport };
  }
  if (noShape === "mean") {
    if (length) return null;
    return { metric, shape: "mean", length: null, target, sport };
  }
  if (length) {
    // Power and pace with no time named are the curve's own answers.
    if (!target && metric !== "hr") return null;
    return { metric, shape: "best", length, target, sport };
  }
  // Nothing typed but the word: "hr" and "potenza" keep what they've always answered, on any page.
  if (!typedTarget && !(noShape === "max" && target)) return null;
  if (noShape === "max" && metric === "hr")
    return { metric, shape: "max", length: null, target, sport };
  return { metric, shape: "marks", length: null, target, sport };
}
