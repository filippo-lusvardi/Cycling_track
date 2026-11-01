// Races and what they demand: discipline, kind, estimated time and sprint finish, stored as readable lines in the
// intervals.icu event description. Pure.
import { t } from "./i18n";
import type { PlannedEvent } from "./intervals";

/** The five things a complete cyclist trains, from the longest effort to the shortest. */
export type Focus = "base" | "aerobic" | "vo2" | "anaerobic" | "sprint";
export const FOCUSES: Focus[] = ["base", "aerobic", "vo2", "anaerobic", "sprint"];
export const FOCUS_LABEL: Record<Focus, string> = {
  base: t("Base", "Base"),
  aerobic: t("High aerobic", "Aerobico alto"),
  vo2: "VO2max",
  anaerobic: t("Anaerobic", "Anaerobico"),
  sprint: "Sprint",
};

/** What each focus trains, in one line. */
export const FOCUS_PURPOSE: Record<Focus, string> = {
  base: t(
    "Long steady rides that build the aerobic engine and durability.",
    "Uscite lunghe e regolari che costruiscono il motore aerobico e la resistenza.",
  ),
  aerobic: t(
    "Sustained efforts near threshold: the power you hold for 20–60 minutes.",
    "Sforzi prolungati vicino alla soglia: la potenza che tieni per 20–60 minuti.",
  ),
  vo2: t(
    "Hard 3–8 minute efforts that raise your aerobic ceiling.",
    "Sforzi duri di 3–8 minuti che alzano il tuo tetto aerobico.",
  ),
  anaerobic: t(
    "Very hard efforts of 30 s–2 min, for attacks and repeated surges.",
    "Sforzi molto duri da 30 s a 2 min, per scatti e accelerazioni ripetute.",
  ),
  sprint: t("All-out efforts of 5–15 s, for finishes and jumps.", "Sforzi massimali di 5–15 s, per volate e scatti secchi."),
};

/** Share of a race's demand per focus, summing to 100. */
export type Profile = Record<Focus, number>;
const p = (
  base: number,
  aerobic: number,
  vo2: number,
  anaerobic: number,
  sprint: number,
): Profile => ({
  base,
  aerobic,
  vo2,
  anaerobic,
  sprint,
});

/** No race at all: train everything. */
export const COMPLETE: Profile = p(20, 20, 20, 20, 20);

export type Discipline = "road" | "mtb";
export type RaceKind =
  | "road"
  | "crit"
  | "tt"
  | "climb"
  | "granfondo"
  | "stage"
  | "xco"
  | "xcc"
  | "marathon"
  | "mtbclimb";

type KindDef = {
  discipline: Discipline;
  /** Written in the event description; never translated, so every device reads it back. */
  code: string;
  label: string;
  /** Timed efforts ask for an estimated time, which sets the profile, and have no sprint finish. */
  timed: boolean;
  profile: Profile | null;
  /** Estimated time in minutes used until one is entered. */
  minutes?: number;
};

export const KINDS: Record<RaceKind, KindDef> = {
  road: {
    discipline: "road",
    code: "Road race",
    label: t("Road race", "Gara in linea"),
    timed: false,
    profile: p(20, 20, 25, 20, 15),
  },
  crit: {
    discipline: "road",
    code: "Criterium",
    label: t("Criterium", "Criterium"),
    timed: false,
    profile: p(5, 10, 25, 35, 25),
  },
  tt: {
    discipline: "road",
    code: "Time trial",
    label: t("Time trial", "Cronometro"),
    timed: true,
    profile: null,
    minutes: 30,
  },
  climb: {
    discipline: "road",
    code: "Hill climb",
    label: t("Hill climb", "Cronoscalata"),
    timed: true,
    profile: null,
    minutes: 20,
  },
  granfondo: {
    discipline: "road",
    code: "Granfondo",
    label: t("Granfondo", "Granfondo"),
    timed: false,
    profile: p(40, 35, 15, 10, 0),
  },
  stage: {
    discipline: "road",
    code: "Stage race",
    label: t("Stage race", "Corsa a tappe"),
    timed: false,
    profile: p(35, 30, 20, 10, 5),
  },
  xco: {
    discipline: "mtb",
    code: "XCO",
    label: "XCO",
    timed: false,
    profile: p(10, 20, 30, 30, 10),
  },
  xcc: {
    discipline: "mtb",
    code: "XCC",
    label: "XCC",
    timed: false,
    profile: p(5, 10, 30, 35, 20),
  },
  marathon: {
    discipline: "mtb",
    code: "Marathon",
    label: t("Marathon", "Marathon"),
    timed: false,
    profile: p(45, 35, 10, 10, 0),
  },
  mtbclimb: {
    discipline: "mtb",
    code: "Hill climb",
    label: t("Hill climb", "Cronoscalata"),
    timed: true,
    profile: null,
    minutes: 20,
  },
};

export const DISCIPLINE_LABEL: Record<Discipline, string> = {
  road: t("Road", "Strada"),
  mtb: "MTB",
};
const DISCIPLINE_CODE: Record<Discipline, string> = { road: "Road", mtb: "MTB" };

export type RaceInfo = {
  discipline: Discipline;
  kind: RaceKind;
  /** Estimated time in minutes, timed kinds only. */
  minutes: number | null;
  /** Decided in a sprint (mass-start kinds only). */
  sprint: boolean;
};

export type Priority = "A" | "B" | "C";
export type Race = {
  id: string;
  date: string;
  name: string;
  priority: Priority;
  /** Null until the kind is set (races added in intervals.icu). */
  info: RaceInfo | null;
  /** The description without Cirmolo's lines. */
  notes: string;
};

/**
 * Demand of a timed effort by its length, at the middle of each band (minutes, log scale between them):
 * under 2 min, 2–8, 8–20, 20–60, over 60.
 */
const TIME_BANDS: [number, Profile][] = [
  [1, p(0, 10, 25, 50, 15)],
  [4, p(10, 15, 50, 25, 0)],
  [13, p(10, 45, 35, 10, 0)],
  [35, p(25, 55, 20, 0, 0)],
  [90, p(45, 45, 10, 0, 0)],
];

/** Profile of a timed effort, blended between bands so 7 and 9 minutes come out almost the same. */
export function timeProfile(minutes: number): Profile {
  const m = Math.max(TIME_BANDS[0]![0], Math.min(TIME_BANDS[TIME_BANDS.length - 1]![0], minutes));
  const i = Math.max(0, TIME_BANDS.findIndex(([c]) => c >= m) - 1);
  const [[c0, a], [c1, b]] = [TIME_BANDS[i]!, TIME_BANDS[Math.min(i + 1, TIME_BANDS.length - 1)]!];
  const k = c1 === c0 ? 0 : (Math.log(m) - Math.log(c0)) / (Math.log(c1) - Math.log(c0));
  return mapProfile((f) => a[f] + (b[f] - a[f]) * k);
}

const mapProfile = (fn: (f: Focus) => number): Profile =>
  Object.fromEntries(FOCUSES.map((f) => [f, fn(f)])) as Profile;

/** A sprint finish moves 15 points to it (sprint +10, anaerobic +5), taken proportionally from the rest. */
export function withSprint(profile: Profile): Profile {
  const scaled = mapProfile((f) => profile[f] * 0.85);
  return { ...scaled, sprint: scaled.sprint + 10, anaerobic: scaled.anaerobic + 5 };
}

export function profileFor(info: RaceInfo): Profile {
  const def = KINDS[info.kind];
  if (def.timed) return timeProfile(info.minutes ?? def.minutes!);
  return info.sprint ? withSprint(def.profile!) : def.profile!;
}

/** "45 min", "1h30". */
export function formatMinutes(m: number): string {
  if (m < 60) return `${Math.round(m)} min`;
  const h = Math.floor(m / 60);
  const rest = Math.round(m - h * 60);
  return rest ? `${h}h${String(rest).padStart(2, "0")}` : `${h}h`;
}

/** "12", "12 min", "1h30", "1:30", "1 h" → minutes; null when unreadable. */
export function parseMinutes(s: string): number | null {
  const v = s.trim().toLowerCase();
  const hm = /^(\d+)\s*(?:h|:)\s*(\d{1,2})?\s*(?:min|m)?$/.exec(v);
  if (hm) return Number(hm[1]) * 60 + Number(hm[2] ?? 0) || null;
  const m = /^(\d+(?:[.,]\d+)?)\s*(?:min|m|')?$/.exec(v);
  return m ? Number(m[1]!.replace(",", ".")) || null : null;
}

const LINE = /^(discipline|kind|estimated time|sprint finish):\s*(.*)$/i;

/** Reads Cirmolo's lines from an event description; the rest is kept as notes. */
export function parseRace(description: string | null): { info: RaceInfo | null; notes: string } {
  const fields: Record<string, string> = {};
  const notes: string[] = [];
  for (const line of (description ?? "").split("\n")) {
    const m = LINE.exec(line.trim());
    if (m) fields[m[1]!.toLowerCase()] = m[2]!.trim();
    else notes.push(line);
  }
  const discipline: Discipline = /^mtb$/i.test(fields["discipline"] ?? "") ? "mtb" : "road";
  const kind = (Object.keys(KINDS) as RaceKind[]).find(
    (k) =>
      KINDS[k].discipline === discipline &&
      KINDS[k].code.toLowerCase() === (fields["kind"] ?? "").toLowerCase(),
  );
  const text = notes.join("\n").trim();
  if (!kind) return { info: null, notes: text };
  const timed = KINDS[kind].timed;
  return {
    info: {
      discipline,
      kind,
      minutes: timed && fields["estimated time"] ? parseMinutes(fields["estimated time"]) : null,
      sprint: !timed && /^(yes|sì|si|true)$/i.test(fields["sprint finish"] ?? ""),
    },
    notes: text,
  };
}

/** The description to save: Cirmolo's lines first, then the notes. */
export function raceDescription(info: RaceInfo, notes: string): string {
  const def = KINDS[info.kind];
  const lines = [`Discipline: ${DISCIPLINE_CODE[info.discipline]}`, `Kind: ${def.code}`];
  if (def.timed && info.minutes) lines.push(`Estimated time: ${formatMinutes(info.minutes)}`);
  if (!def.timed && info.sprint) lines.push("Sprint finish: yes");
  return [lines.join("\n"), notes.trim()].filter(Boolean).join("\n\n");
}

export const isRace = (e: PlannedEvent) => /^RACE_[ABC]$/.test(e.category);

export function raceFrom(e: PlannedEvent): Race {
  const { info, notes } = parseRace(e.description);
  return {
    id: e.id,
    date: e.date,
    name: e.name ?? t("Race", "Gara"),
    priority: e.category.slice(5) as Priority,
    info,
    notes,
  };
}

/** "Hill climb · 12 min · B", "Criterium · sprint finish · A". */
export function raceSummary(r: Race): string {
  if (!r.info) return `${t("kind not set", "tipo non impostato")} · ${r.priority}`;
  const def = KINDS[r.info.kind];
  return [
    r.info.discipline === "mtb" ? `MTB ${def.label}` : def.label,
    def.timed && r.info.minutes ? formatMinutes(r.info.minutes) : null,
    r.info.sprint ? t("sprint finish", "arrivo in volata") : null,
    r.priority,
  ]
    .filter(Boolean)
    .join(" · ");
}
