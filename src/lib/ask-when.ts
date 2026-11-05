// Words into stretches of time, in Italian and English, on the device: domani, sabato scorso, ultimi 10 giorni, ottobre.
import { getDay, parseISO } from "date-fns";
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
const monthSpan = (y: number, m: number): Span => ({ from: iso(y, m, 1), to: iso(y, m + 1, 0) });
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
  return a >= 0 ? a : found(EN_MONTHS);
};

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
    /^(?:il |the )?(\d{1,2}) ([a-z]{3,})$/.exec(s) ??
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
