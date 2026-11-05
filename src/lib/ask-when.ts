// Words into stretches of time, in Italian and English, on the device: domani, sabato scorso, ultimi 10 giorni, ottobre.
import { getDay, parseISO } from "date-fns";
import { near } from "./ask-sentence";
import { format, t } from "./i18n";
import { addDays } from "./training";

export type Span = { from: string; to: string };
export type WhenCandidate = Span & {
  id: string;
  q: string;
  also?: string;
  words?: string[];
  /** Read from what was typed rather than matched against it. */
  exact?: boolean;
};

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => {
  const dt = new Date(y, m, d);
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
};
const parts = (date: string) => {
  const d = parseISO(date);
  return { y: d.getFullYear(), m: d.getMonth(), d: d.getDate() };
};
export const monthSpan = (y: number, m: number): Span => ({
  from: iso(y, m, 1),
  to: iso(y, m + 1, 0),
});
const mondayOf = (date: string) => addDays(date, -((getDay(parseISO(date)) + 6) % 7));
export const daysIn = ({ from, to }: Span) =>
  Math.round((parseISO(to).getTime() - parseISO(from).getTime()) / 864e5) + 1;

const IT_DAYS = ["domenica", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato"];
const EN_DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const IT_MONTHS = [
  "gennaio",
  "febbraio",
  "marzo",
  "aprile",
  "maggio",
  "giugno",
  "luglio",
  "agosto",
  "settembre",
  "ottobre",
  "novembre",
  "dicembre",
];
const EN_MONTHS = [
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

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** The next such weekday after today. */
function nextDay(today: string, dow: number) {
  const gap = (dow - getDay(parseISO(today)) + 7) % 7 || 7;
  return addDays(today, gap);
}

/** The phrases that always exist, to match against what's typed. */
function fixed(today: string): WhenCandidate[] {
  const { y, m } = parts(today);
  const mon = mondayOf(today);
  const one = (id: string, en: string, it: string, date: string): WhenCandidate => ({
    id,
    q: t(en, it),
    also: `${en} ${it}`,
    from: date,
    to: date,
  });
  const span = (id: string, en: string, it: string, s: Span, words?: string[]): WhenCandidate => ({
    id,
    q: t(en, it),
    also: `${en} ${it}`,
    ...s,
    ...(words ? { words } : {}),
  });
  const out: WhenCandidate[] = [
    one("today", "Today", "Oggi", today),
    one("yesterday", "Yesterday", "Ieri", addDays(today, -1)),
    one("tomorrow", "Tomorrow", "Domani", addDays(today, 1)),
    one("after-tomorrow", "The day after tomorrow", "Dopodomani", addDays(today, 2)),
    span("last-7", "Last week", "Ultima settimana", { from: addDays(today, -6), to: today }, [
      "7",
      "recap",
      "riepilogo",
      "summary",
    ]),
    span("this-week", "This week", "Questa settimana", { from: mon, to: addDays(mon, 6) }, [
      "recap",
      "riepilogo",
    ]),
    span(
      "prev-week",
      "The week before",
      "Settimana scorsa",
      { from: addDays(mon, -7), to: addDays(mon, -1) },
      ["past"],
    ),
    span(
      "next-week",
      "Next week",
      "Prossima settimana",
      { from: addDays(mon, 7), to: addDays(mon, 13) },
      ["programma", "plan"],
    ),
    span("last-30", "Last month", "Ultimo mese", { from: addDays(today, -29), to: today }, [
      "30",
      "recap",
      "riepilogo",
    ]),
    span("this-month", "This month", "Questo mese", monthSpan(y, m)),
    span("prev-month", "The month before", "Mese scorso", monthSpan(y, m - 1)),
    span("next-month", "Next month", "Prossimo mese", monthSpan(y, m + 1)),
    span("last-90", "Last 3 months", "Ultimi 3 mesi", { from: addDays(today, -89), to: today }, [
      "90",
    ]),
    span("this-year", "This year", "Quest'anno", { from: iso(y, 0, 1), to: iso(y, 11, 31) }, [
      String(y),
    ]),
    span(
      "prev-year",
      "Last year",
      "Anno scorso",
      { from: iso(y - 1, 0, 1), to: iso(y - 1, 11, 31) },
      [String(y - 1)],
    ),
  ];
  IT_DAYS.forEach((it, dow) => {
    const en = EN_DAYS[dow]!;
    const next = nextDay(today, dow);
    out.push(one(`day-${dow}`, cap(en), cap(it), next));
    const last = addDays(next, -7);
    out.push(
      one(
        `last-day-${dow}`,
        `Last ${en}`,
        `${cap(it)} ${dow === 0 ? "scorsa" : "scorso"}`,
        last === today ? addDays(today, -7) : last,
      ),
    );
  });
  return out;
}

/** The latest month of that name that has begun, else this coming one. */
function namedMonth(today: string, m: number): Span {
  const { y, m: now } = parts(today);
  return monthSpan(m <= now ? y : y - 1, m);
}

const monthIndex = (word: string) => {
  const w = fold(word);
  if (w.length < 3) return -1;
  const found = (list: string[]) => list.findIndex((n) => n.startsWith(w));
  const a = found(IT_MONTHS);
  const b = a >= 0 ? a : found(EN_MONTHS);
  if (b >= 0 || w.length < 6) return b;
  // One slip, on a word long enough to mean it: "setembre". Shorter ones could be a name: "marco".
  const slip = (list: string[]) => list.findIndex((n) => near(w, n));
  const c = slip(IT_MONTHS);
  return c >= 0 ? c : slip(EN_MONTHS);
};

const SEASONS: { words: RegExp; first: number; en: string; it: string }[] = [
  { words: /^(?:primavera|spring)$/, first: 2, en: "Spring", it: "Primavera" },
  { words: /^(?:estate|summer)$/, first: 5, en: "Summer", it: "Estate" },
  { words: /^(?:autunno|autumn|fall)$/, first: 8, en: "Autumn", it: "Autunno" },
  { words: /^(?:inverno|winter)$/, first: -1, en: "Winter", it: "Inverno" },
];
const seasonSpan = (first: number, y: number): Span => ({
  from: iso(y, first, 1),
  to: iso(y, first + 3, 0),
});

/** "estate 2025", "autunno scorso": always with a year or "scorso", since a season alone is the tree's. */
function readSeason(s: string, today: string): WhenCandidate | null {
  const m =
    /^([a-z]+) (20\d\d|scors[oa])$/.exec(s) ??
    (/^last [a-z]+$/.test(s) ? ["", s.split(" ")[1]!, "last"] : null);
  const season = m && SEASONS.find((x) => x.words.test(m[1]!));
  if (!m || !season) return null;
  let y = /^20/.test(m[2]!) ? Number(m[2]) : parts(today).y;
  // "Last": the latest one that's over.
  if (!/^20/.test(m[2]!)) while (seasonSpan(season.first, y).to >= today) y--;
  const span = seasonSpan(season.first, y);
  return { id: `season-${span.from}`, q: `${t(season.en, season.it)} ${y}`, ...span, exact: true };
}

/** "3 giorni fa": that day; "2 settimane fa": that week; "2 mesi fa": that month. */
function readAgo(s: string, today: string): WhenCandidate | null {
  const m = /^(un|una|a|an|\d{1,3}) ([a-z]+) (?:fa|ago)$/.exec(s);
  if (!m) return null;
  const n = /^\d/.test(m[1]!) ? Number(m[1]) : 1;
  const unit = m[2]!;
  const named = (span: Span, en: string, it: string): WhenCandidate => ({
    id: `ago-${span.from}-${span.to}`,
    q: t(`${en} ago`, `${it} fa`),
    ...span,
    exact: true,
  });
  if (/^(?:giorn[oi]|days?)$/.test(unit)) {
    const date = addDays(today, -n);
    return named(
      { from: date, to: date },
      n === 1 ? "A day" : `${n} days`,
      n === 1 ? "Un giorno" : `${n} giorni`,
    );
  }
  if (/^(?:settiman[ae]|weeks?)$/.test(unit)) {
    const mon = addDays(mondayOf(today), -7 * n);
    return named(
      { from: mon, to: addDays(mon, 6) },
      n === 1 ? "A week" : `${n} weeks`,
      n === 1 ? "Una settimana" : `${n} settimane`,
    );
  }
  const { y, m: now } = parts(today);
  if (/^(?:mes[ei]|months?)$/.test(unit))
    return named(
      monthSpan(y, now - n),
      n === 1 ? "A month" : `${n} months`,
      n === 1 ? "Un mese" : `${n} mesi`,
    );
  if (/^(?:anno|anni|years?)$/.test(unit))
    return named(
      { from: iso(y - n, 0, 1), to: iso(y - n, 11, 31) },
      n === 1 ? "A year" : `${n} years`,
      n === 1 ? "Un anno" : `${n} anni`,
    );
  return null;
}

/** Saturday and Sunday: this week's, the last or the next. */
function readWeekend(s: string, today: string): WhenCandidate | null {
  const m =
    /^(?:(questo|this|prossimo|next|scorso|last) )?(?:weekend|fine settimana)(?: (scorso|prossimo))?$/.exec(
      s,
    );
  if (!m) return null;
  const said = m[1] ?? m[2] ?? "";
  const weeks = /^(?:scorso|last)$/.test(said) ? -1 : /^(?:prossimo|next)$/.test(said) ? 1 : 0;
  const sat = addDays(mondayOf(today), 5 + 7 * weeks);
  return {
    id: `weekend-${sat}`,
    q:
      weeks < 0
        ? t("Last weekend", "Weekend scorso")
        : weeks > 0
          ? t("Next weekend", "Prossimo weekend")
          : t("This weekend", "Questo weekend"),
    from: sat,
    to: addDays(sat, 1),
    exact: true,
  };
}

type End = { y?: number; m?: number; d?: number };

/** One end of a range: a year, a month or a day, with or without its year. */
function rangeEnd(phrase: string): End | null {
  const p = phrase.replace(/^(?:il |the )/, "").trim();
  if (/^20\d\d$/.test(p)) return { y: Number(p) };
  const m =
    /^(?:(\d{1,2}) )?([a-z]{3,})(?: (20\d\d))?$/.exec(p) ??
    (/^[a-z]{3,} \d{1,2}(?: 20\d\d)?$/.test(p)
      ? (() => {
          const [name, day, year] = p.split(" ");
          return ["", day, name, year] as const;
        })()
      : null);
  if (!m) return null;
  const mi = monthIndex(m[2]!);
  if (mi < 0) return null;
  const d = m[1] ? Number(m[1]) : undefined;
  // February 31st isn't a day, whichever year it's in; a leap year is allowed for here.
  if (d != null && (d < 1 || iso(2024, mi, d).slice(5, 7) !== pad(mi + 1))) return null;
  return { m: mi, ...(d != null ? { d } : {}), ...(m[3] ? { y: Number(m[3]) } : {}) };
}

/** "da marzo a giugno 2025", "dal 3 marzo al 12 aprile": a year said once counts for both ends. */
function readRange(s: string, today: string): WhenCandidate | null {
  const m =
    /^(?:(?:dalla|dal|da|from) |dall')(.+?) (?:(?:fino al|fino a|alla|al|a|to|until) |all')(.+)$/.exec(
      s,
    );
  if (!m) return null;
  const a = rangeEnd(m[1]!);
  const b = rangeEnd(m[2]!);
  if (!a || !b) return null;
  const now = parts(today);
  // Without any year, the latest stretch that has ended, or is ending, by this month.
  let toYear = b.y ?? a.y ?? (b.m != null && b.m > now.m ? now.y - 1 : now.y);
  let fromYear = a.y ?? toYear;
  const first = (y: number, e: End) => iso(y, e.m ?? 0, e.d ?? 1);
  const last = (y: number, e: End) =>
    e.m == null ? iso(y, 11, 31) : e.d != null ? iso(y, e.m, e.d) : iso(y, e.m + 1, 0);
  if (first(fromYear, a) > last(toYear, b)) {
    if (a.y == null) fromYear--;
    else if (b.y == null) toYear++;
    else return null;
  }
  const span = { from: first(fromYear, a), to: last(toYear, b) };
  return { id: `range-${span.from}-${span.to}`, q: spanDates(span), ...span, exact: true };
}

/** What can only be read from the words themselves: numbers and dates. */
function read(query: string, today: string): WhenCandidate[] {
  const s = fold(query).trim().replace(/\s+/g, " ");
  const { y, m } = parts(today);
  const out: WhenCandidate[] = [];
  const ago = (n: number) => addDays(today, 1 - n);
  const lastN = (n: number, unit: "d" | "w" | "m"): WhenCandidate => {
    const days = unit === "d" ? n : unit === "w" ? n * 7 : Math.round(n * 30.44);
    const q =
      unit === "d"
        ? t(`Last ${n} days`, `Ultimi ${n} giorni`)
        : unit === "w"
          ? t(`Last ${n} weeks`, `Ultime ${n} settimane`)
          : t(`Last ${n} months`, `Ultimi ${n} mesi`);
    return { id: `last-${n}${unit}`, q, from: ago(days), to: today, exact: true };
  };
  const unit = (word: string | undefined): "d" | "w" | "m" | null => {
    if (!word) return null;
    if (/^(g|gi|gio|gior|giorn|giorni|giorno|d|da|day|days)$/.test(word)) return "d";
    if (
      /^(s|se|set|sett|setti|settim|settima|settiman|settimana|settimane|w|we|wee|week|weeks)$/.test(
        word,
      )
    )
      return "w";
    if (/^(m|me|mes|mese|mesi|mo|mon|mont|month|months)$/.test(word)) return "m";
    return null;
  };

  const last = /^(?:ultim[aeio]?|last|past)?\s*(\d{1,3})(?:\s+([a-z]+))?$/.exec(s);
  if (last) {
    const n = Number(last[1]);
    const u = unit(last[2]);
    if (n > 0 && (u || !last[2])) {
      // A bare number is most likely days; the other units are offered once it's clearly a count.
      if (u) out.push(lastN(n, u));
      else {
        out.push(lastN(n, "d"));
        if (/^ultim|^last|^past/.test(s) && n <= 52) out.push(lastN(n, "w"));
      }
    }
  }
  const ahead = /^(?:tra|fra|in)\s+(\d{1,3})(?:\s+([a-z]+))?$/.exec(s);
  if (ahead) {
    const n = Number(ahead[1]);
    const u = unit(ahead[2]) ?? "d";
    const date = addDays(today, n * (u === "d" ? 1 : u === "w" ? 7 : 30));
    out.push({
      id: "ahead",
      q:
        u === "d"
          ? t(`In ${n} days`, `Tra ${n} giorni`)
          : u === "w"
            ? t(`In ${n} weeks`, `Tra ${n} settimane`)
            : t(`In ${n} months`, `Tra ${n} mesi`),
      from: date,
      to: date,
      exact: true,
    });
  }
  const year = /^(20\d\d)$/.exec(s);
  if (year) {
    const yy = Number(year[1]);
    out.length = 0;
    out.push({
      id: `year-${yy}`,
      q: String(yy),
      from: iso(yy, 0, 1),
      to: iso(yy, 11, 31),
      exact: true,
    });
  }
  for (const said of [readAgo(s, today), readWeekend(s, today), readSeason(s, today)])
    if (said) out.push(said);
  if (/^(?:l'altro ieri|l'altroieri|altroieri|altro ieri|(?:the )?day before yesterday)$/.test(s)) {
    const date = addDays(today, -2);
    out.push({
      id: "before-yesterday",
      q: t("The day before yesterday", "L'altro ieri"),
      from: date,
      to: date,
      exact: true,
    });
  }
  const monthYear =
    /^([a-z]{3,}) (20\d\d)$/.exec(s) ??
    (/^20\d\d [a-z]{3,}$/.test(s) ? ["", s.split(" ")[1]!, s.split(" ")[0]!] : null);
  if (monthYear) {
    const mi = monthIndex(monthYear[1]!);
    if (mi >= 0) {
      const span = monthSpan(Number(monthYear[2]), mi);
      out.push({
        id: `recap-${span.from.slice(0, 7)}`,
        q: cap(format(parseISO(span.from), "MMMM yyyy")),
        ...span,
        exact: true,
      });
    }
  }
  const whole = rangeEnd(s);
  if (whole?.y != null && whole.m != null && whole.d != null) {
    const date = iso(whole.y, whole.m, whole.d);
    // February 29th only where it exists.
    if (date.slice(5, 7) === pad(whole.m + 1))
      out.push({
        id: `date-${date}`,
        q: format(parseISO(date), "EEEE d MMMM yyyy"),
        from: date,
        to: date,
        exact: true,
      });
  }
  const numeric = /^(\d{1,2})[/.-](\d{1,2})[/.-](20\d\d)$/.exec(s);
  if (numeric) {
    const date = iso(Number(numeric[3]), Number(numeric[2]) - 1, Number(numeric[1]));
    if (Number(numeric[2]) <= 12 && date.slice(5, 7) === pad(Number(numeric[2])))
      out.push({
        id: `date-${date}`,
        q: format(parseISO(date), "EEEE d MMMM yyyy"),
        from: date,
        to: date,
        exact: true,
      });
  }
  const range = readRange(s, today);
  if (range) out.push(range);
  // il 12, 12, 12 novembre, 12 nov, november 12, 12/11
  const dayOnly = /^(?:il |the )?(\d{1,2})$/.exec(s);
  if (dayOnly) {
    const d = Number(dayOnly[1]);
    if (d >= 1 && d <= 31 && iso(y, m, d).slice(5, 7) === pad(m + 1)) {
      const date = iso(y, m, d);
      out.push({
        id: `date-${date}`,
        q: format(parseISO(date), "EEEE d MMMM"),
        from: date,
        to: date,
        exact: true,
      });
    }
  }
  const dayMonth =
    /^(?:il |the )?(\d{1,2})(?:st|nd|rd|th)?(?: (?:of|di|del))? ([a-z]{3,})$/.exec(s) ??
    (/^([a-z]{3,}) (\d{1,2})$/.test(s) ? ["", s.split(" ")[1]!, s.split(" ")[0]!] : null);
  if (dayMonth) {
    const d = Number(dayMonth[1]);
    const mi = monthIndex(dayMonth[2]!);
    if (mi >= 0 && d >= 1 && d <= 31 && iso(y, mi, d).slice(5, 7) === pad(mi + 1)) {
      // The nearest such date: within the last eleven months, or the coming ones.
      let date = iso(y, mi, d);
      if (date < addDays(today, -300)) date = iso(y + 1, mi, d);
      if (date > addDays(today, 60)) date = iso(y - 1, mi, d);
      out.push({
        id: `date-${date}`,
        q: format(parseISO(date), "EEEE d MMMM yyyy"),
        from: date,
        to: date,
        exact: true,
      });
    }
  }
  const slash = /^(\d{1,2})[/ -](\d{1,2})$/.exec(query.trim());
  if (slash) {
    const d = Number(slash[1]);
    const mi = Number(slash[2]) - 1;
    if (mi >= 0 && mi < 12 && iso(y, mi, d).slice(5, 7) === pad(mi + 1)) {
      const date = iso(y, mi, d);
      out.push({
        id: `date-${date}`,
        q: format(parseISO(date), "EEEE d MMMM yyyy"),
        from: date,
        to: date,
        exact: true,
      });
    }
  }
  return out;
}

/** Each month of the last year as a stretch to recap. */
function months(today: string): WhenCandidate[] {
  return Array.from({ length: 12 }, (_, m) => {
    const s = namedMonth(today, m);
    return {
      id: `recap-${s.from.slice(0, 7)}`,
      q: cap(format(parseISO(s.from), "MMMM yyyy")),
      also: `${IT_MONTHS[m]} ${EN_MONTHS[m]}`,
      ...s,
    };
  });
}

export const whenCandidates = (query: string, today: string): WhenCandidate[] => [
  ...read(query, today),
  ...fixed(today),
  ...months(today),
];

/** A stretch's name on its page. */
export function spanTitle({ from, to }: Span, today: string): string {
  if (from === to) {
    if (from === today) return t("Today", "Oggi");
    if (from === addDays(today, -1)) return t("Yesterday", "Ieri");
    if (from === addDays(today, 1)) return t("Tomorrow", "Domani");
    if (from === addDays(today, 2)) return t("The day after tomorrow", "Dopodomani");
    return format(parseISO(from), "EEEE d MMMM");
  }
  const { y, m } = parts(from);
  const days = daysIn({ from, to });
  if (to === today) {
    if (days === 7) return t("Last week", "Ultima settimana");
    if (days === 30) return t("Last month", "Ultimo mese");
    return t(`Last ${days} days`, `Ultimi ${days} giorni`);
  }
  const whole = monthSpan(y, m);
  if (whole.from === from && whole.to === to)
    return cap(format(parseISO(from), y === parts(today).y ? "MMMM" : "MMMM yyyy"));
  if (from === iso(y, 0, 1) && to === iso(y, 11, 31)) return String(y);
  const mon = mondayOf(today);
  if (from === mon && to === addDays(mon, 6)) return t("This week", "Questa settimana");
  if (from === addDays(mon, 7) && to === addDays(mon, 13))
    return t("Next week", "Prossima settimana");
  if (from === addDays(mon, -7) && to === addDays(mon, -1))
    return t("The week before", "Settimana scorsa");
  return spanDates({ from, to });
}

/** A stretch's dates, for the line above its name. */
export function spanDates({ from, to }: Span): string {
  const a = parseISO(from);
  const b = parseISO(to);
  if (from === to) return format(a, "EEEE d MMMM yyyy");
  return a.getFullYear() === b.getFullYear()
    ? `${format(a, "d MMM")} – ${format(b, "d MMM yyyy")}`
    : `${format(a, "d MMM yyyy")} – ${format(b, "d MMM yyyy")}`;
}

/** The stretch before or after: whole months and years stay whole, anything else moves by its own length. */
export function shiftSpan(span: Span, dir: 1 | -1): Span {
  const { y, m } = parts(span.from);
  const whole = monthSpan(y, m);
  if (whole.from === span.from && whole.to === span.to) return monthSpan(y, m + dir);
  if (span.from === iso(y, 0, 1) && span.to === iso(y, 11, 31))
    return { from: iso(y + dir, 0, 1), to: iso(y + dir, 11, 31) };
  const n = daysIn(span) * dir;
  return { from: addDays(span.from, n), to: addDays(span.to, n) };
}
