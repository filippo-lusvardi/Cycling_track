// "power 20m oggi vs settimana scorsa", "hr 5m marzo vs aprile", "distribuzione marzo vs aprile": any question, side by side.
import type { Entry } from "./ask";
import { chartAsked, chartCurves, chartWordAlone } from "./ask-chart";
import { askedDistributionRows, distributionAsked } from "./ask-distribution";
import { askedIn, askedRows, effortNeeds, needsOfAsked, type EffortNeeds } from "./ask-efforts";
import {
  namesTime,
  sift,
  takeTarget,
  takeTime,
  type Asked,
  type AskedDistribution,
  type Target,
} from "./ask-read";
import { command, simplify } from "./ask-sentence";
import { askedTimeRows, timeAsked, timeNeeds, type AskedTime, type TimeData } from "./ask-time";
import type { DistMetric } from "./distribution";

type Question =
  | { kind: "effort"; a: Asked }
  | { kind: "distribution"; a: AskedDistribution }
  | { kind: "time"; a: AskedTime };

export type AskNeeds = EffortNeeds & { histIds: string[] };

function questionIn(text: string, d: TimeData): Question | null {
  const time = timeAsked(text, d);
  if (time) return { kind: "time", a: time };
  const dist = distributionAsked(command(text), d);
  if (dist) return { kind: "distribution", a: dist };
  const effort = askedIn(text, d);
  return effort ? { kind: "effort", a: effort } : null;
}

/** The same question about something else. */
const about = (q: Question, target: Target): Question =>
  ({ ...q, a: { ...q.a, target } }) as Question;

function targetIn(text: string, d: TimeData): Target | null {
  const where = takeTarget(command(text).split(" ").filter(Boolean), {
    today: d.today,
    sport: d.sport,
    acts: d.acts,
    climbs: d.climbs,
  });
  return where.target && !sift(where.rest).rest.length ? where.target : null;
}

function parts(s: string): [string, string] | null {
  const m =
    /^(?:confronta|compare) (.+?) (?:con|e|and|with) (.+)$/.exec(s) ??
    /^(.+?) (?:vs\.?|versus|contro|rispetto a|against) (.+)$/.exec(s);
  return m ? [m[1]!.trim(), m[2]!.trim()] : null;
}

function questions(s: string, d: TimeData): [Question, Question] | null {
  const split = parts(s);
  if (!split) return null;
  const [a, b] = split;
  const left = questionIn(a, d);
  const right = questionIn(b, d);
  // The other side need only name what's different: "power 20m oggi vs ieri".
  if (left) {
    const target = right ? null : targetIn(b, d);
    const other = right ?? (target ? about(left, target) : null);
    return other ? [left, other] : null;
  }
  if (right) {
    const target = targetIn(a, d);
    return target ? [about(right, target), right] : null;
  }
  return null;
}

function rowsOf(q: Question, d: TimeData): Entry[] {
  if (q.kind === "effort") return askedRows(q.a, d);
  if (q.kind === "time") return askedTimeRows(q.a, d);
  // Side by side is one reading each: the one that's yours unless another is named.
  const metric: DistMetric = q.a.metric ?? (d.sport === "run" ? "hr" : "power");
  return askedDistributionRows({ ...q.a, metric }, d);
}

const NUMBER = /^(-?[\d.,]+) (W|bpm|km\/h)$/;

/** The difference, when both sides are numbers in the same unit. */
function differenceOf(a: Entry, b: Entry): string | null {
  const x = NUMBER.exec(a.value ?? "");
  const y = NUMBER.exec(b.value ?? "");
  if (!x || !y || x[2] !== y[2]) return null;
  const diff = Number(x[1]) - Number(y[1]);
  const shown = x[2] === "km/h" ? diff.toFixed(1) : String(Math.round(diff));
  if (!Number(shown)) return null;
  return `${diff > 0 ? "+" : ""}${shown} ${x[2]}`;
}

export function compareQuestions(s: string, d: TimeData): Entry[] {
  const both = questions(s, d);
  if (!both) return [];
  const [first, second] = both.map((q) => rowsOf(q, d)[0]);
  if (!first || !second) return [];
  // Two answers side by side are the answer: each goes straight to its own page.
  const { detail: _a, ...a } = first;
  const { detail: _b, ...b } = second;
  const diff = differenceOf(a, b);
  return [
    {
      ...a,
      id: `${a.id}-left`,
      boost: 1,
      ...(diff ? { answer: [diff, a.answer].filter(Boolean).join(" · ") } : {}),
    },
    { ...b, id: `${b.id}-right`, boost: 0 },
  ];
}

const merge = (all: AskNeeds[]): AskNeeds => ({
  rideIds: [...new Set(all.flatMap((n) => n.rideIds))],
  curves: all.flatMap((n) => n.curves),
  hrCurves: all.find((n) => n.hrCurves)?.hrCurves ?? null,
  histIds: [...new Set(all.flatMap((n) => n.histIds))],
});

const NO_NEEDS: AskNeeds = { rideIds: [], curves: [], hrCurves: null, histIds: [] };

function needsOfQuestion(q: Question, d: TimeData): AskNeeds {
  if (q.kind === "effort") return { ...needsOfAsked(q.a, d), histIds: [] };
  if (q.kind === "time") return { ...NO_NEEDS, ...timeNeeds(q.a, d) };
  return NO_NEEDS;
}

const MANY = /\s*,\s+|\s+(?:e|and)\s+/;

/** What's typed, keeping a "+" between questions: reading words drops it. */
export const manyCommand = (query: string) => command(query.replace(/\s\+\s/g, " e "));

/**
 * "power 5m e hr 5m oggi", "km e dislivello marzo": several questions in one line, up to three, the time said once at
 * the end or at the start shared by all. Null when it isn't that shape.
 */
export function manyParts(s: string, today: string): string[] | null {
  if (/^(?:confronta|compare)\b|\b(?:vs|versus|contro)\b/.test(s)) return null;
  const parts = s.split(MANY).map((p) => p.trim());
  if (parts.length < 2 || parts.length > 3 || parts.some((p) => !p)) return null;
  const words = (p: string) => p.split(" ").filter(Boolean);
  const hasTime = (p: string) => !!takeTime(words(p), today);
  const edge = (p: string, atEnd: boolean) => {
    const w = words(p);
    for (let n = w.length - 1; n >= 1; n--) {
      const phrase = (atEnd ? w.slice(w.length - n) : w.slice(0, n)).join(" ");
      if (!/^\d{1,3}$/.test(phrase) && namesTime(phrase, today)) return phrase;
    }
    return null;
  };
  const shared = edge(parts.at(-1)!, true) ?? edge(parts[0]!, false);
  return parts.map((p) => (shared && !hasTime(p) ? `${p} ${shared}` : p));
}

export const mergeNeeds = merge;

/** What these words read as, whatever the data says: two phrases with one key ask the same thing. Null when they ask nothing. */
export function askKey(query: string, d: TimeData): string | null {
  if (chartWordAlone(query)) return "chart-of-what";
  const chart = chartAsked(query, d);
  if (chart) return `chart:${JSON.stringify(chart)}`;
  const read = questionIn(query, d);
  return read ? JSON.stringify(read) : null;
}

/** What a question needs read before it can answer, so nothing is read until it's asked. */
export function askNeeds(query: string, d: TimeData): AskNeeds {
  const chart = chartAsked(query, d);
  if (chart) return { ...NO_NEEDS, curves: chartCurves(chart, d) };
  const many = manyParts(manyCommand(query), d.today);
  if (many) return merge(many.map((p) => askNeeds(p, d)));
  for (const s of [command(query), simplify(query)]) {
    const both = s ? questions(s, d) : null;
    if (both) return merge(both.map((q) => needsOfQuestion(q, d)));
  }
  const time = timeAsked(query, d);
  if (time) return { ...NO_NEEDS, ...timeNeeds(time, d) };
  return { ...effortNeeds(query, d), histIds: [] };
}
