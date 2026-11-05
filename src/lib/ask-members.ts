// People in your forests, by name. The name alone goes to their tree; with a word it answers what their tree shows,
// and nothing their pages keep back (no fitness, no form, no load).
import { parseISO } from "date-fns";
import type { Entry } from "./ask";
import { namesTime } from "./ask-intents";
import { command } from "./ask-sentence";
import { format, num, t } from "./i18n";
import type { SharedRide, TreeHeader, TreeYearDoc } from "./forest/types";
import { addDays, formatDuration } from "./training";
import { WEATHER_WORD } from "./tree";

export type AskMember = { fid: string; forest: string; uid: string; name: string };
export type MemberTree = { header: TreeHeader; years: Record<string, TreeYearDoc> };
/** undefined: still on its way. null: nothing shared. */
export type MemberTrees = Record<string, MemberTree | null | undefined>;

export const treeKey = (m: Pick<AskMember, "fid" | "uid">) => `${m.fid}/${m.uid}`;

type What = "last" | "km" | "time" | "climb" | "count" | "season";

const WORDS: [What, RegExp][] = [
  [
    "last",
    /^(?:ultim[oa]|last|latest)(?: (?:uscita|pedalata|corsa|giro|attivita|ride|run|activity))?$/,
  ],
  ["km", /^(?:km|distanza|distance|chilometri)(?: (.+))?$/],
  ["time", /^(?:tempo|ore|time|hours)(?: (.+))?$/],
  ["climb", /^(?:dislivello|climbing|elevation)(?: (.+))?$/],
  ["count", /^(?:uscite|corse|attivita|rides|runs|activities)(?: (.+))?$/],
  ["season", /^(?:stagione|season|chioma|crown|albero|tree)$/],
];

const nameParts = (name: string) => command(name).split(" ").filter(Boolean);
const LINKED = /(?:^| )(?:di|of|da)$/;

/** A name or one of its words, at either end of what's typed, and what's left. */
function withName(s: string, m: AskMember): string | null {
  const full = command(m.name);
  for (const form of [full, ...nameParts(m.name)]) {
    if (form.length < 3) continue;
    if (s === form) return "";
    if (s.startsWith(`${form} `)) return s.slice(form.length + 1);
    if (s.endsWith(` ${form}`))
      return s
        .slice(0, -form.length - 1)
        .replace(LINKED, "")
        .trim();
  }
  return null;
}

type Ask = { what: What; period?: string | undefined };

function askOf(rest: string): Ask | null {
  for (const [what, re] of WORDS) {
    const m = re.exec(rest);
    if (m) return { what, period: m[1] };
  }
  return null;
}

/** "come sta marco", "how is marco" are about the tree itself. */
const howIs = (s: string) => s.replace(/^(?:come sta|come va|how is) /, "stagione ");

/** Whose trees are needed to answer: only once a name and a word for what's wanted are both there. */
export function membersAsked(query: string, members: AskMember[]): AskMember[] {
  const s = howIs(command(query));
  if (s.length < 3) return [];
  return members
    .filter((m) => {
      const rest = withName(s, m);
      return !!rest && !!askOf(rest);
    })
    .slice(0, 3);
}

const ridesOf = (tree: MemberTree): SharedRide[] =>
  Object.values(tree.years)
    .flatMap((y) => y.rides)
    .sort((a, b) => b.start_date_local.localeCompare(a.start_date_local));

const place = (m: AskMember) => ({ fid: m.fid, uid: m.uid });
const toTree = (m: AskMember): Entry["dest"] => ({
  kind: "route",
  to: "/forest/$fid/$uid",
  params: place(m),
});
/** How far back a shared ride keeps its page (see forest/rides.ts). */
const RIDE_PAGE_DAYS = 365;

function dataRow(m: AskMember, ask: Ask, tree: MemberTree | null | undefined, today: string) {
  const base = {
    id: `member-${ask.what}-${treeKey(m)}`,
    page: "forest" as const,
    kind: "value" as const,
    exact: true,
    dest: toTree(m),
  };
  const labels: Record<What, string> = {
    last: t("last ride", "ultima uscita"),
    km: "km",
    time: t("time", "tempo"),
    climb: t("climbing", "dislivello"),
    count: tree?.header.sport === "run" ? t("runs", "corse") : t("rides", "uscite"),
    season: t("season", "stagione"),
  };
  const titled = `${m.name} · ${labels[ask.what]}`;
  if (tree === undefined) return { ...base, q: titled, value: "…", answer: m.forest };
  if (tree === null)
    return {
      ...base,
      q: titled,
      answer: `${t("Nothing shared yet", "Ancora niente di condiviso")} · ${m.forest}`,
    };
  if (ask.what === "season") {
    const c = tree.header.crown;
    return {
      ...base,
      q: titled,
      answer: c
        ? [c.seasonLabel, c.weather ? WEATHER_WORD[c.weather] : null, m.forest]
            .filter(Boolean)
            .join(" · ")
        : `${t("Nothing shared yet", "Ancora niente di condiviso")} · ${m.forest}`,
    };
  }
  const rides = ridesOf(tree);
  if (ask.what === "last") {
    const r = rides[0];
    if (!r)
      return {
        ...base,
        q: titled,
        answer: `${t("Nothing shared yet", "Ancora niente di condiviso")} · ${m.forest}`,
      };
    const day = r.start_date_local.slice(0, 10);
    return {
      ...base,
      q: `${m.name} · ${r.name ?? r.type ?? labels.last}`,
      answer: [
        format(parseISO(day), "d MMM yyyy"),
        r.distance ? `${(r.distance / 1000).toFixed(1)} km` : null,
        formatDuration(r.moving_time ?? 0),
        m.forest,
      ]
        .filter(Boolean)
        .join(" · "),
      // Older rides keep no page of their own: their place is on the tree.
      dest:
        day >= addDays(today, -RIDE_PAGE_DAYS)
          ? ({
              kind: "route",
              to: "/forest/$fid/$uid/ride/$rid",
              params: { ...place(m), rid: r.id },
            } as const)
          : toTree(m),
    };
  }
  const span = ask.period ? namesTime(ask.period, today) : null;
  if (ask.period && (!span || span.from > today)) return null;
  const inside = span
    ? rides.filter((r) => {
        const day = r.start_date_local.slice(0, 10);
        return day >= span.from && day <= span.to;
      })
    : rides;
  const sum = (read: (r: SharedRide) => number | null | undefined) =>
    inside.reduce((n, r) => n + (read(r) ?? 0), 0);
  const value =
    ask.what === "km"
      ? // Their total counts every ride; a stretch can only count what they share.
        `${num(Math.round(!span && tree.header.km != null ? tree.header.km : sum((r) => r.distance) / 1000))} km`
      : ask.what === "time"
        ? formatDuration(sum((r) => r.moving_time))
        : ask.what === "climb"
          ? `${num(Math.round(sum((r) => r.total_elevation_gain)))} m`
          : String(inside.length);
  return {
    ...base,
    q: span ? `${titled} · ${ask.period}` : titled,
    value,
    answer: m.forest,
  };
}

/** The rows for what's typed. A name being typed is only ever the way to their tree. */
export function memberRows(
  query: string,
  members: AskMember[],
  trees: MemberTrees,
  today: string,
): Entry[] {
  const s = howIs(command(query));
  if (s.length < 3) return [];
  return members.flatMap((m): Entry[] => {
    const rest = withName(s, m);
    if (rest) {
      const ask = askOf(rest);
      const row = ask && dataRow(m, ask, trees[treeKey(m)], today);
      return row ? [row] : [];
    }
    const whole = rest === "";
    const starts =
      whole || command(m.name).startsWith(s) || nameParts(m.name).some((p) => p.startsWith(s));
    if (!starts) return [];
    return [
      {
        id: `member-${treeKey(m)}`,
        q: m.name,
        answer: m.forest,
        page: "forest",
        kind: "far",
        // The whole name means the person; a few letters of it mustn't push aside your own climbs.
        ...(whole ? { exact: true } : {}),
        dest: toTree(m),
      },
    ];
  });
}
