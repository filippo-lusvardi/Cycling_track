// A sentence being typed: reads the half word at the end, forgives one slip, and says what a line comes to, so that nothing
// disappears between one letter and the next. Only for what reads: nothing here ever leads to saving something. Pure.
import type { Alt } from "./ask";
import { command, correctCommand, near, simplify } from "./ask-sentence";

const PERIODS = "giorno settimana mese day week month".split(" ");

const OTHER_WORDS = // Time
  (
    "gennaio febbraio marzo aprile maggio giugno luglio agosto settembre ottobre novembre dicembre " +
    "january february march april may june july august september october november december " +
    "lunedi martedi mercoledi giovedi venerdi sabato domenica " +
    "monday tuesday wednesday thursday friday saturday sunday " +
    "oggi ieri today yesterday scorso scorsa scorsi scorse questo questa ultimo ultima ultimi ultime last this " +
    "settimana mese anno week month year " +
    // Lengths and joining words
    "min minuti minuto secondi ore per vs " +
    // Sports
    "bici bike uscita ride corsa run"
  ).split(" ");

const MEASURE_WORDS = (
  "grafico chart andamento trend " +
  "km chilometri distanza distance dislivello climbing elevation carico load " +
  "velocita speed peso weight grasso fat sonno sleep hrv fitness fatica fatigue forma form " +
  "potenza power watt fc battiti media mean massima max"
).split(" ");

const WORDS = [...OTHER_WORDS, ...MEASURE_WORDS];

/** Small words: already whole, whatever could start with them. */
const JOINS = /^(?:e|a|al|alla|di|del|della|in|per|by|and|vs|the|of|il|la|lo|le|i)$/;

export type Completed = { query: string; ghost: string };

/**
 * The half word at the end finished, when only one way of finishing it means anything. `key` says what a phrase reads as, so
 * that words meaning the same thing ("min", "minuti") aren't a choice; ambiguous letters ("m": marzo, maggio...) give nothing.
 */
export function completeWords(query: string, key: (q: string) => string | null): Completed | null {
  if (/\s$/.test(query)) return null;
  const words = command(query).split(" ").filter(Boolean);
  const last = words.at(-1);
  if (!last || /^\d/.test(last)) return null;
  // One word alone needs a few letters before it means something.
  if (words.length === 1 && last.length < 3) return null;
  const before = words.at(-2);
  if (before && JOINS.test(last)) return null;
  // After "per", a period. A second measure needs "e" or "vs" before it, so "power 5m p" isn't power and weight.
  const pool =
    before && /^(?:per|by|al|alla|a)$/.test(before)
      ? PERIODS
      : !before ||
          /^(?:e|and|vs|versus|contro|grafico|grafici|chart|charts|andamento|trend)$/.test(before)
        ? WORDS
        : OTHER_WORDS;
  const head = query.trimEnd().slice(0, query.trimEnd().length - last.length);
  const seen = new Map<string, string>();
  for (const word of pool) {
    if (word === last || !word.startsWith(last)) continue;
    const read = key(`${head}${word}`);
    if (read && !seen.has(read)) seen.set(read, word);
  }
  if (seen.size !== 1) return null;
  const word = [...seen.values()][0]!;
  return { query: `${head}${word}`, ghost: word.slice(last.length) };
}

/** Whether the last word could still become something: the start of a word it knows, or of a number. */
export function mayContinue(query: string): boolean {
  if (/\s$/.test(query)) return true;
  const last = command(query).split(" ").at(-1);
  if (!last) return false;
  return /^\d+$/.test(last) || WORDS.some((w) => w !== last && w.startsWith(last));
}

/** One slip in a word it knows, anywhere in the line: "grafico dislivelo". Only tried when nothing else reads. */
export function correctWords(query: string): string | null {
  const words = query.trim().split(/\s+/);
  for (let i = 0; i < words.length; i++) {
    const w = command(words[i]!);
    if (w.length < 4 || /\d/.test(w) || WORDS.includes(w)) continue;
    const hit = WORDS.find((known) => near(w, known));
    if (hit) return [...words.slice(0, i), hit, ...words.slice(i + 1)].join(" ");
  }
  return null;
}

const reads = (e: Alt) => e.dest.kind !== "write";

/** What a line comes to: as typed, with its half word finished, as a sentence, with a slip forgiven. */
export function typedRows(
  q: string,
  among: (text: string) => Alt[],
  completed: Completed | null,
): Alt[] {
  const literal = among(q);
  if (literal[0]?.exact) return literal;
  // A word alone is finished only when it means nothing as it stands: "fit" stays a search.
  if (completed && (q.trim().includes(" ") || !literal.length)) {
    const rows = among(completed.query).filter(reads);
    if (rows[0]?.exact) return rows.map((e, i) => ({ ...e, ghost: i ? null : completed.ghost }));
  }
  if (literal.length) return literal;
  // A sentence gets a second reading, for what it comes down to.
  const said = simplify(q);
  const reading =
    said && said !== q.trim().toLowerCase()
      ? among(said)
          // Only reading: nothing is ever saved from a sentence.
          .filter(reads)
          .map((e) => ({ ...e, ghost: null }))
      : literal;
  if (reading.length) return reading;
  // Then one slip on the command word; only here, so a word that means something else keeps its meaning.
  const fixed = correctCommand(q);
  if (fixed) {
    const rows = among(fixed).map((e) => ({ ...e, ghost: null }));
    if (rows.length) return rows;
  }
  const slip = correctWords(q);
  return slip
    ? among(slip)
        .filter(reads)
        .map((e) => ({ ...e, ghost: null }))
    : reading;
}
