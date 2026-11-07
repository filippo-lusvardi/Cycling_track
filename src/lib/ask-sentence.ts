// Sentences into the short phrases the bar reads: "quanti km ho fatto a settembre 2025" is "km settembre 2025". Only ever a
// second attempt, when what's typed means nothing as it stands, and never for what writes.

/**
 * As typed, but keeping what numbers need: "68.2", "12/11", "14%". A dot or comma at the very end is dropped: "peso 68." is
 * on its way to a decimal, and until it gets there it still means 68.
 */
export const command = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9'.,%/ ]/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/ ?[.,]$/, "");

/** One slip of the finger at most. */
export function near(a: string, b: string) {
  if (Math.abs(a.length - b.length) > 1 || a.length < 4) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else {
      i++;
      j++;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

const WRITING =
  /^(?:log|logga|registra|plan|pianifica|schedule|programma|togli|rimuovi|cancella|elimina|remove|delete|cancel|sposta|move|peso|weight|grasso|fat|sonno|sleep|dormito|hrv)\b/;

/** Questions with a whole meaning of their own: said once, they're a metric. */
const MEANINGS: [RegExp, string][] = [
  [/^quanto ho pedalato\b/, "ore bici"],
  [/^quanto ho corso\b/, "ore corsa"],
  [/^how (?:long|much) did i (?:ride|cycle)\b/, "hours ride"],
  [/^how (?:long|much) did i run\b/, "hours run"],
  [/^quanta strada\b/, "km"],
  [/^how far\b/, "km"],
];

const OPENINGS =
  /^(?:qual'e|qual e|qual|quale|quali|quando|dimmi|mi dici|mostrami|fammi vedere|voglio vedere|vorrei vedere|cerca|trova|apri|cosa ho fatto|com'e andata|what did i do|how did it go|what's|what is|what was|what were|what|which|when|show me|tell me|find|open)\b ?/;

/** Counts that are a command as they stand keep their word. */
const COUNTING =
  /^(?:quanti|quante|quanto|quanta|how many|how much) (?!volte|passaggi|tentativi|watt|times|mangiare)/;

const SPORT_VERBS: [RegExp, string][] = [
  [/\bho corso\b/, "corsa"],
  [/\bho pedalato\b/, "bici"],
  [/\bdid i run\b/, "run"],
  [/\bdid i (?:ride|cycle)\b/, "ride"],
];

const VERBS =
  /\b(?:ho fatto|ho percorso|ho scalato|ho|fatti|fatte|percorsi|percorse|did i do|did i|have i done|have i|i did|i rode|i have done|i've done)\b/g;

// "a" and "in" also say time ahead ("in 3 giorni"), and "di" is half of "di sempre".
const FILLER =
  /\b(?:il|la|lo|i|le|gli|un|una|uno|mio|mia|miei|mie|my|the|a|in(?! \d{1,3}(?: |$))|su|sul|sulla|sui|nel|nella|nei|durante|during|di(?! sempre)|del|della|dello|of|per|for|on|at)\b/g;

const METRIC_LAST =
  /^(.+) (km|chilometri|ore|hours|dislivello|climbing|carico|load|uscite|pedalate|corse|rides|runs|attivita|activities)$/;

const squeeze = (s: string) => s.trim().replace(/\s+/g, " ");

/** The words commands start with, for one slip on the first of them. */
const COMMAND_WORDS =
  "pianifica plan schedule programma registra togli rimuovi cancella elimina remove delete sposta move miglior migliore best record potenza power passo pace passaggi tentativi attempts confronta compare consiglia consigliami suggerisci suggest ultima ultimo ultime latest dislivello chilometri climbing attivita activities uscite pedalate carico load".split(
    " ",
  );

/** What's typed with its first word corrected, or null when it's no slip of a command. */
export function correctCommand(query: string): string | null {
  const words = query.trim().split(/\s+/);
  const first = command(words[0] ?? "");
  if (COMMAND_WORDS.includes(first)) return null;
  const hit = COMMAND_WORDS.find((w) => near(first, w));
  return hit ? [hit, ...words.slice(1)].join(" ") : null;
}

/** What a sentence comes down to; itself, as a command, when it's nothing to simplify. */
export function simplify(query: string): string {
  const typed = command(query);
  if (WRITING.test(typed)) return typed;
  let s = typed.replace(/\b(?:l|dell|nell|sull|all)'/g, "");
  s = s.replace(OPENINGS, "");
  for (const [re, said] of MEANINGS) s = s.replace(re, said);
  s = s.replace(COUNTING, "");
  for (const [re, said] of SPORT_VERBS) s = s.replace(re, said);
  // A range's own "da" and "a" are the range: only what comes before it is trimmed.
  const range =
    /\b(?:dalla|dal|da|from) .+ (?:fino al|fino a|alla|al|a|to|until) .+$|\bdall'.+$/.exec(s);
  const head = range ? s.slice(0, range.index) : s;
  const tail = range ? range[0] : "";
  s = squeeze(`${head.replace(VERBS, " ").replace(FILLER, " ")} ${tail}`);
  const last = METRIC_LAST.exec(s);
  return last ? `${last[2]} ${last[1]}` : s;
}
