// Routes by typing: "giro di 1h con salite corte e ripide da qui", "percorso di 60 km in piano da casa",
// "anello 2 ore 800 m di dislivello da Sardagna", "route 40 km cycle paths". A sentence that asks for a route opens
// three loops drawn from it; "percorsi" opens the list, "nuovo percorso" the planner, "percorso" + a saved route's name
// that route.
// "giro" alone stays a ride (logged, read, charted): it is a route only with a route's features (climbs, a start).
import type { Dest, Entry } from "./ask";
import type { ClimbWish } from "./course/generate";
import { DEFAULT_WISH, toSearch, type WishForm } from "./course/wish-form";
import { num, t } from "./i18n";

const route = (to: string, search?: Record<string, string>): Dest => ({
  kind: "route",
  to,
  ...(search ? { search } : {}),
});

// "pianifica", "plan" and "suggest" belong to the training planner, not here.
const ROUTE_WORD = /\b(?:percorso|anello|route|loop|course|proponimi|suggeriscimi)\b/;
const RIDE_WORD = /\b(?:giro|giretto|uscita|ride)\b/;
/** A day said: then it's about a ride done or planned, not a route. */
const DAY_WORD =
  /\b(?:ieri|oggi|domani|stamattina|stasera|fa|lunedi|martedi|mercoledi|giovedi|venerdi|sabato|domenica|yesterday|today|tomorrow|ago)\b/;

const CLIMB_WORDS: [RegExp, ClimbWish][] = [
  [/\b(?:cort[ei]|brev[ei]|short)\b/, "short"],
  [/\b(?:lungh[ei]|lunga|lungo|long)\b/, "long"],
  [/\b(?:ripid[ei]|ripida|dur[ei]|dura|cattiv[ei]|steep|hard)\b/, "steep"],
  [/\b(?:pedalabil[ei]|dolc[ei]|facil[ei]|gentle|easy)\b/, "gentle"],
  [/\b(?:piatto|pianura|in piano|senza salite|flat)\b/, "flat"],
];

const FEATURE =
  /\b(?:salit[ae]|climbs?|dislivello|elevation|piatto|pianura|in piano|flat|da qui|da casa|from here|from home|ciclabil[ei]|cycle ?paths?)\b/;

const n = (s: string) => Number(s.replace(",", "."));

/** Minutes said: "1h", "1h30", "1 ora e mezza", "un'ora", "mezz'ora", "90 min", "2 ore", "1.5 h". */
export function minutesIn(s: string): number | null {
  let m =
    /\b(\d+(?:[.,]\d+)?) ?(?:h|ore|ora|hours?|hrs?)(?: ?e)? ?(?:(\d{1,2}) ?(?:min|minuti|m)?\b|(mezza|mezzo|half))?/.exec(
      s,
    );
  if (m) {
    const h = n(m[1]!);
    return Math.round(h * 60 + (m[2] ? Number(m[2]) : m[3] ? 30 : 0));
  }
  m = /\b(?:un ?'? ?ora|un'ora|an hour|one hour)(?: e (mezza|mezzo)| and a half)?\b/.exec(s);
  if (m) return m[1] || /and a half/.test(m[0]) ? 90 : 60;
  if (/\bmezz ?'? ?ora|half an hour\b/.test(s)) return 30;
  m = /\b(\d{2,3}) ?(?:min|minuti|minutes)\b/.exec(s);
  if (m) return Number(m[1]);
  return null;
}

/** "60 km". */
export function kmIn(s: string): number | null {
  const m = /\b(\d+(?:[.,]\d+)?) ?km\b/.exec(s);
  return m ? Math.round(n(m[1]!)) : null;
}

/** "800 m di dislivello", "dislivello 800", "1000 m d+", "800 m of climbing". */
export function gainIn(s: string): number | null {
  const m =
    /\b(\d{2,4}) ?(?:m|metri|meters)? ?(?:di |of )?(?:dislivello|d\+|climbing|elevation|gain)\b/.exec(
      s,
    ) ?? /\b(?:dislivello|elevation|climbing) (?:di |of )?(\d{2,4})\b/.exec(s);
  return m ? Number(m[1]) : null;
}

/** Where from: here, home, or a place named after "da"/"from" (up to the next feature). */
export function fromIn(s: string): Pick<WishForm, "from" | "place"> {
  if (/\b(?:da qui|from here|qui vicino)\b/.test(s)) return { from: "here", place: "" };
  if (/\b(?:da casa|from home)\b/.test(s)) return { from: "home", place: "" };
  const m =
    /\b(?:da|dal|dalla|dallo|from|partendo da|starting at) ([a-z' ]+?)(?= con | di | e | with | in | per | \d|$)/.exec(
      s,
    );
  const place = m?.[1]?.trim();
  if (place && !/^(?:qui|casa|here|home)$/.test(place)) return { from: "place", place };
  return { from: "here", place: "" };
}

export function wishIn(s: string): WishForm {
  const km = kmIn(s);
  const minutes = km ? null : minutesIn(s);
  const climbs: ClimbWish[] = [];
  for (const [re, c] of CLIMB_WORDS) if (re.test(s)) climbs.push(c);
  const flat = climbs.includes("flat");
  return {
    ...DEFAULT_WISH,
    minutes: km ? null : (minutes ?? DEFAULT_WISH.minutes),
    km,
    climbs: flat ? ["flat"] : climbs,
    gain: gainIn(s),
    ...fromIn(s),
    myRoads: !/\b(?:strade nuove|nuove strade|new roads|esplora|explore)\b/.test(s),
    cyclepaths: /\b(?:ciclabil[ei]|cycle ?paths?|bike paths?)\b/.test(s),
  };
}

/** Is this sentence asking for a route? */
export function asksRoute(s: string): boolean {
  // "percorso sardagna" names a saved route; a route is asked with what it should be like, or by asking outright.
  if (ROUTE_WORD.test(s))
    return FEATURE.test(s) || /\d/.test(s) || /\b(?:proponimi|suggeriscimi)\b/.test(s);
  return RIDE_WORD.test(s) && FEATURE.test(s) && !DAY_WORD.test(s);
}

const CLIMB_TEXT: Record<ClimbWish, () => string> = {
  short: () => t("short", "corte"),
  long: () => t("long", "lunghe"),
  steep: () => t("steep", "ripide"),
  gentle: () => t("gentle", "pedalabili"),
  flat: () => t("flat", "in piano"),
};

export function wishText(w: WishForm): string {
  const how = w.km
    ? `${w.km} km`
    : w.minutes! < 60
      ? `${w.minutes} min`
      : w.minutes! % 60
        ? `${Math.floor(w.minutes! / 60)} h ${w.minutes! % 60}`
        : `${w.minutes! / 60} h`;
  const climbs = w.climbs.includes("flat")
    ? CLIMB_TEXT.flat()
    : w.climbs.length
      ? t(
          `${w.climbs.map((c) => CLIMB_TEXT[c]()).join(" and ")} climbs`,
          `salite ${w.climbs.map((c) => CLIMB_TEXT[c]()).join(" e ")}`,
        )
      : "";
  const from =
    w.from === "here"
      ? t("from here", "da qui")
      : w.from === "home"
        ? t("from home", "da casa")
        : t(`from ${w.place}`, `da ${w.place}`);
  return [
    how,
    climbs,
    w.gain ? t(`${num(w.gain)} m climbing`, `${num(w.gain)} m di dislivello`) : "",
    from,
    w.cyclepaths ? t("cycle paths", "ciclabili") : "",
    w.myRoads ? "" : t("new roads too", "anche strade nuove"),
  ]
    .filter(Boolean)
    .join(" · ");
}

export type CourseData = { courses?: { id: string; name: string }[] | undefined };

const plain = (x: string) =>
  x
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9' ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export function courseRows(d: CourseData, s: string): Entry[] {
  if (/^(?:percorsi|i miei percorsi|routes|my routes)$/.test(s))
    return [
      {
        id: "courses-open",
        q: t("My routes", "I miei percorsi"),
        page: "courses",
        kind: "plan",
        exact: true,
        dest: route("/courses"),
      },
    ];
  if (/^(?:nuovo percorso|percorso nuovo|new route|traccia un percorso|traccia percorso)$/.test(s))
    return [
      {
        id: "courses-new",
        q: t("New route", "Nuovo percorso"),
        answer: t("Tap the map to draw it", "Tocca la mappa per tracciarlo"),
        page: "courses",
        kind: "plan",
        exact: true,
        dest: route("/courses", { plan: "new" }),
      },
    ];
  // A saved route by its name, after "percorso": "percorso sardagna".
  const said = /^(?:percorso|route) (.+)$/.exec(s)?.[1] ?? "";
  const words = said.split(" ").filter(Boolean);
  const named = (d.courses ?? []).filter((c) => {
    const name = plain(c.name);
    return words.length > 0 && words.every((w) => w.length >= 3 && name.includes(w));
  });
  const opened = named.slice(0, 3).map((c): Entry => ({
    id: `course-${c.id}`,
    q: c.name,
    answer: t("Saved route", "Percorso salvato"),
    page: "courses",
    kind: "plan",
    exact: true,
    dest: route("/courses", { id: c.id }),
  }));
  if (!asksRoute(s)) return opened;
  const w = wishIn(s);
  return [
    {
      id: "course-ask",
      q: t("Suggest three rides", "Proponimi tre giri"),
      answer: wishText(w),
      page: "courses",
      kind: "plan",
      exact: true,
      dest: route("/courses", toSearch(w)),
    },
    ...opened,
  ];
}
