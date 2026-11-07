// The tree: training history as one growing organism. Pure data → shape model, drawn by components/tree.
import { bloomOn, type Bloom } from "./bloom";
import { recentFeel } from "./felt";
import { parseISO } from "date-fns";
import { format, t } from "./i18n";
import { activityKind, type Kind } from "./activity-kind";
import type { Activity, OffKind, PlannedEvent, Wellness } from "./intervals";
import {
  advice,
  capForLoad,
  formPercent,
  formScore,
  readinessFor,
  type Confidence,
  withoutAnswers,
  type LoadCheck,
} from "./readiness";
import { earlySignals, type Signal } from "./signals";
import { isSport, RIDE_KINDS, type MainSport } from "./sport";
import { addDays, computeForm, formZone } from "./training";

/** 1–4, 1 being the easiest / best, like the check-in scales. */
export type Level = 1 | 2 | 3 | 4;

/** Green, blue, gold, red: shared by intensity, feel and the seasons. */
export const LEVEL_COLOR = ["var(--pine)", "var(--fitness)", "var(--birch)", "var(--lingon)"];
export const INTENSITY_WORD = [
  t("easy", "facile"),
  t("steady", "regolare"),
  "tempo",
  t("hard", "dura"),
];
/** intervals.icu feel words for levels 1–4 (4 also covers "weak"). */
export const FEEL_WORD = [
  t("strong", "ottima"),
  t("good", "buona"),
  t("normal", "normale"),
  t("poor", "scarsa"),
];

/** One leaf per this many metres climbed. */
export const CLIMB_PER_LEAF = 100;
const MAX_LEAVES = 30;

/**
 * How a session of the main sport draws as a branch: a run is shorter, lighter on load and climbs less than a ride,
 * so a usual 50-minute run makes a branch like a usual 90-minute ride's. Length levels off with `minutes`, thickness
 * peaks at `load`.
 */
export const TREE_SCALE: Record<MainSport, { minutes: number; load: number; climbPerLeaf: number }> = {
  ride: { minutes: 120, load: 250, climbPerLeaf: CLIMB_PER_LEAF },
  run: { minutes: 60, load: 180, climbPerLeaf: 30 },
};

export type TreeBranch = {
  id: string;
  name: string;
  kind: Kind;
  /** -1 grows left, 1 grows right. */
  side: -1 | 1;
  /** 0–1 share of the available reach, from duration. */
  length: number;
  /** Stroke width in px, from load. */
  thickness: number;
  /** One per 100 m climbed. */
  leaves: number;
  /** Leaf colour: how hard it was against FTP; null without power. */
  intensity: Level | null;
  minutes: number;
  load: number;
  /** Metres. */
  distance: number;
  climb: number;
  /** Deterministic 0–1 value from the activity id, for the branch's own curve. */
  seed: number;
  /** Brioches eaten on the way: one bird each on the branch. */
  brioches: number;
  /** The longest ride of all time (by distance): a squirrel lives on its branch. */
  longest: boolean;
  /** The ride with the most climbing of all time: an owl keeps watch on its branch. */
  mostClimbing: boolean;
};

/** A non-cycling activity: no branch on the tree (it lives in the garden), a sprout on the bark instead. */
export type TreeSprout = { id: string; kind: Kind; name: string; minutes: number; load: number };

export type TreeDay = {
  date: string;
  ctl: number | null;
  /** Trunk width in px at the end of this day. */
  trunk: number;
  /** The day's rides: only cycling grows branches. */
  branches: TreeBranch[];
  /** The day's other activities (runs, gym, swims…), oldest first. */
  sprouts: TreeSprout[];
  /** Side of the rest-day bud (rest days have no branches). */
  budSide: -1 | 1;
  /** Ill or injured that day: a knot in the bark. */
  off: OffKind | null;
};

export type Chapter = "build" | "steady" | "rest";

export type TreeWeek = {
  /** Monday. */
  start: string;
  end: string;
  ctl: number | null;
  trunk: number;
  /** The week's rides: load, minutes, climbing and count. */
  load: number;
  minutes: number;
  /** Metres. */
  climb: number;
  count: number;
  /** Every activity's load, cycling or not: the build/rest chapters describe the whole athlete. */
  totalLoad: number;
  /** Minutes of non-cycling training (the garden's). */
  crossMinutes: number;
  /** The week's rides, oldest first: one twig each on the week's bough. */
  twigs: TreeBranch[];
  side: -1 | 1;
  chapter: Chapter;
  /** Days ill or injured in the week (injured when the week has both). */
  off: { days: number; kind: OffKind } | null;
};

export type TreeYear = {
  year: number;
  /** Every activity's load: the ring grows with the whole athlete. */
  load: number;
  /** Rides only: time, count, distance and climbing. */
  minutes: number;
  count: number;
  /** Metres. */
  distance: number;
  climb: number;
  /** Minutes of non-cycling training. */
  crossMinutes: number;
  /** Every activity's load per week of the year (the ring's width). */
  weekLoads: number[];
  /** Injured stretches inside the year: scars on its ring. */
  scars: Scar[];
};

/** An injured stretch on a year's ring: first and last day as dates and as day of the year (0-based). */
export type Scar = { start: string; end: string; from: number; to: number };

export type Season = "summer" | "spring" | "autumn" | "winter";
export type Weather = "sun" | "partly" | "clouds" | "rain";

export type Crown = {
  score: number | null;
  /** True until today's check-in is done (the score comes from HRV, sleep and form only), or with too little data. With the check-in off, only with too little data. */
  estimated: boolean;
  /** How much the score has behind it: inputs present and how well each knows your normal. */
  confidence: Confidence;
  season: Season | null;
  /** How far through its season the crown is, 0 → 1 from the worse neighbour to the better (see seasonPhase). */
  seasonPhase: number;
  /** "Early spring", "Late autumn"…: the season and where in it. */
  seasonLabel: string | null;
  /** The readiness advice title, e.g. "Ready for intensity". */
  advice: string | null;
  leaves: number;
  ctl: number | null;
  atl: number | null;
  form: number | null;
  /** Form as % of fitness, which the sky follows. */
  formPct: number | null;
  weather: Weather | null;
  /** How fair the weather is within its kind, 0 → 1 toward the next better sky (see weatherPhase). */
  weatherPhase: number;
  /** Trends worth watching before they show in readiness: wind in the crown. */
  signals: Signal[];
  /** How fast load is rising; above level 0 it caps the score. */
  load: LoadCheck;
  /** The crown is in flower (see lib/bloom). Missing on crowns published before the bloom. */
  bloom?: Bloom | null;
};

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Thinnest and thickest trunk in px. */
const TRUNK_MIN = 8;
const TRUNK_MAX = 54;

/**
 * Trunk width from where `ctl` ranks among all of your days (`sorted` ascending): the fitness you
 * spend most time at gets the most width, so ordinary good and bad weeks separate clearly. Your
 * bottom 1% is the thinnest, your top 1% the thickest.
 */
export function trunkWidth(ctl: number | null, sorted: number[]): number {
  if (ctl == null || !sorted.length) return TRUNK_MIN;
  const rank = (lowerBound(sorted, ctl) + upperBound(sorted, ctl)) / 2 / sorted.length;
  return TRUNK_MIN + clamp01((rank - 0.01) / 0.98) * (TRUNK_MAX - TRUNK_MIN);
}

function lowerBound(a: number[], v: number) {
  let [lo, hi] = [0, a.length];
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (a[m]! < v) lo = m + 1;
    else hi = m;
  }
  return lo;
}

function upperBound(a: number[], v: number) {
  let [lo, hi] = [0, a.length];
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (a[m]! <= v) lo = m + 1;
    else hi = m;
  }
  return lo;
}

/** intervals.icu feel (1 strong … 5 weak) → level 1–4. */
export function feelLevel(feel: number | null): Level | null {
  if (feel == null || feel < 1) return null;
  return Math.min(4, Math.round(feel)) as Level;
}

/** Intensity factor (intervals.icu sends it as a % of FTP) → easy, steady, tempo, hard. */
export function intensityLevel(icuIntensity: number | null): Level | null {
  if (!icuIntensity) return null;
  const f = icuIntensity > 3 ? icuIntensity / 100 : icuIntensity;
  return f < 0.65 ? 1 : f < 0.78 ? 2 : f < 0.92 ? 3 : 4;
}

/** Stable 0–1 hash of a string (FNV-1a), so a branch keeps its shape across renders and devices. */
export function seedOf(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 0xffffffff;
}

/** Small seeded generator for crowns and leaves (mulberry32). */
export function rng(seed: number) {
  let a = Math.floor(seed * 0xffffffff) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const dayOf = (a: Activity) => a.start_date_local.slice(0, 10);

export { RIDE_KINDS };

/**
 * The ids of the longest ride (distance) and of the ride with the most climbing among `acts`, up to `today`; the
 * earlier ride wins a tie, so a record moves only when it's beaten. Null when no ride has any.
 */
export function rideRecords(
  acts: Activity[],
  today: string,
  sport: MainSport = "ride",
): { longest: string | null; mostClimbing: string | null } {
  let longest: Activity | null = null;
  let climbing: Activity | null = null;
  const rides = acts
    .filter((a) => dayOf(a) <= today && isSport(a, sport))
    .sort((a, b) => a.start_date_local.localeCompare(b.start_date_local));
  for (const a of rides) {
    if ((a.distance ?? 0) > (longest?.distance ?? 0)) longest = a;
    if ((a.total_elevation_gain ?? 0) > (climbing?.total_elevation_gain ?? 0)) climbing = a;
  }
  return { longest: longest?.id ?? null, mostClimbing: climbing?.id ?? null };
}

/** One node per calendar day from `oldest` to `today`, newest first (the top of the tree). */
export function buildDays(
  acts: Activity[],
  wellness: Wellness[],
  oldest: string,
  today: string,
  off: Map<string, OffKind> = new Map(),
  sport: MainSport = "ride",
): TreeDay[] {
  const scale = TREE_SCALE[sport];
  const byDay = new Map<string, Activity[]>();
  for (const a of acts) {
    const d = dayOf(a);
    if (d < oldest || d > today) continue;
    byDay.set(d, [...(byDay.get(d) ?? []), a]);
  }
  const ctlByDay = new Map(wellness.filter((w) => w.ctl != null).map((w) => [w.id, w.ctl!]));
  const records = rideRecords(acts, today, sport);

  const days: TreeDay[] = [];
  let ctl: number | null = null;
  let turn = 0; // alternates branches left/right, counted from the roots so old branches never flip
  for (let d = oldest; d <= today; d = addDays(d, 1)) {
    ctl = ctlByDay.get(d) ?? ctl;
    const day = (byDay.get(d) ?? []).sort((a, b) =>
      a.start_date_local.localeCompare(b.start_date_local),
    );
    const sprouts = day
      .filter((a) => !isSport(a, sport))
      .map((a): TreeSprout => ({
        id: a.id,
        kind: activityKind(a),
        name: a.name ?? a.type ?? t("Activity", "Attività"),
        minutes: (a.moving_time ?? 0) / 60,
        load: a.icu_training_load ?? 0,
      }));
    const branches = day
      .filter((a) => isSport(a, sport))
      .map((a): TreeBranch => {
        const minutes = (a.moving_time ?? 0) / 60;
        const load = a.icu_training_load ?? 0;
        const climb = a.total_elevation_gain ?? 0;
        return {
          id: a.id,
          name: a.name ?? a.type ?? t("Activity", "Attività"),
          kind: activityKind(a),
          side: turn++ % 2 ? -1 : 1,
          length: 1 - Math.exp(-minutes / scale.minutes),
          thickness: 1.5 + clamp01(load / scale.load) * 6.5,
          leaves: Math.min(MAX_LEAVES, Math.floor(climb / scale.climbPerLeaf)),
          intensity: intensityLevel(a.icu_intensity),
          minutes,
          load,
          distance: a.distance ?? 0,
          climb,
          seed: seedOf(a.id),
          brioches: a.brioches ?? 0, // older cached rows have no count
          longest: a.id === records.longest,
          mostClimbing: a.id === records.mostClimbing,
        };
      });
    days.push({
      date: d,
      ctl,
      trunk: 0,
      branches,
      sprouts,
      budSide: turn % 2 ? -1 : 1,
      off: off.get(d) ?? null,
    });
  }
  // Widths need the whole history first: each day is ranked against every other day.
  const sorted = days.flatMap((d) => (d.ctl != null ? [d.ctl] : [])).sort((a, b) => a - b);
  for (const d of days) d.trunk = trunkWidth(d.ctl, sorted);
  return days.reverse();
}

/** The days with sprouts only for what grows in the garden (`keep`, activity ids): the rest don't count in weeks or rings either. */
export const onlySprouts = (days: TreeDay[], keep: Set<string>): TreeDay[] =>
  days.map((d) =>
    d.sprouts.some((x) => !keep.has(x.id))
      ? { ...d, sprouts: d.sprouts.filter((x) => keep.has(x.id)) }
      : d,
  );

const weekStart = (date: string) => {
  const [y, m, d] = date.split("-").map(Number);
  return addDays(date, -((new Date(y!, m! - 1, d!).getDay() + 6) % 7));
};

const offOf = (ds: TreeDay[]): TreeWeek["off"] => {
  const off = ds.flatMap((d) => (d.off ? [d.off] : []));
  return off.length
    ? { days: off.length, kind: off.includes("INJURED") ? "INJURED" : "SICK" }
    : null;
};

/** Days folded into Monday–Sunday weeks, newest first, with build/rest chapters from the load trend. */
export function buildWeeks(days: TreeDay[]): TreeWeek[] {
  const map = new Map<string, TreeDay[]>();
  for (const d of days) {
    const k = weekStart(d.date);
    map.set(k, [...(map.get(k) ?? []), d]);
  }
  const asc = [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  const weeks: TreeWeek[] = [];
  asc.forEach(([start, ds], i) => {
    const twigs = [...ds].sort((a, b) => a.date.localeCompare(b.date)).flatMap((d) => d.branches);
    const load = twigs.reduce((s, b) => s + b.load, 0);
    const cross = ds.flatMap((d) => d.sprouts);
    const totalLoad = load + cross.reduce((s, x) => s + x.load, 0);
    const prior = weeks.slice(Math.max(0, i - 4), i);
    const avg = prior.length ? prior.reduce((s, w) => s + w.totalLoad, 0) / prior.length : 0;
    const chapter: Chapter =
      avg === 0
        ? totalLoad > 0
          ? "build"
          : "rest"
        : totalLoad > avg * 1.15
          ? "build"
          : totalLoad < avg * 0.6
            ? "rest"
            : "steady";
    const newest = ds.reduce((a, b) => (a.date > b.date ? a : b));
    weeks.push({
      start,
      end: newest.date, // Sunday, or earlier when the week is cut short
      ctl: newest.ctl,
      trunk: newest.trunk,
      load,
      minutes: twigs.reduce((s, b) => s + b.minutes, 0),
      climb: twigs.reduce((s, b) => s + b.climb, 0),
      count: twigs.length,
      totalLoad,
      crossMinutes: cross.reduce((s, x) => s + x.minutes, 0),
      twigs,
      side: i % 2 ? -1 : 1,
      chapter,
      off: offOf(ds),
    });
  });
  return weeks.reverse();
}

/** One drawn piece of trunk: its height in px and its width at the top (newer) and bottom (older). */
export type TrunkPiece = { h: number; top: number; bottom: number };
/** A piece plus how fast the width changes (px of width per px down) where it meets its neighbours. */
export type TrunkEdge = TrunkPiece & { slopeTop: number; slopeBottom: number };

/**
 * Slopes at every join averaged from the pieces on both sides, so the trunk's outline is one smooth
 * curve instead of a kink or wave at each row. The very top meets the crown vertically.
 */
export function smoothTrunk(pieces: TrunkPiece[]): TrunkEdge[] {
  const s = pieces.map((p) => (p.bottom - p.top) / p.h);
  return pieces.map((p, i) => ({
    ...p,
    slopeTop: i === 0 ? 0 : (s[i - 1]! + s[i]!) / 2,
    slopeBottom: i === pieces.length - 1 ? s[i]! : (s[i]! + s[i + 1]!) / 2,
  }));
}

/** "5–11 Oct", or "28 Sep – 4 Oct" when the week spans two months. */
export function weekRange(start: string, end: string): string {
  const [a, b] = [parseISO(start), parseISO(end)];
  if (start === end) return format(a, "d MMM");
  return start.slice(0, 7) === end.slice(0, 7)
    ? `${format(a, "d")}–${format(b, "d MMM")}`
    : `${format(a, "d MMM")} – ${format(b, "d MMM")}`;
}

/** Yearly rings, oldest first (the centre of the cross-section). */
export function buildYears(days: TreeDay[]): TreeYear[] {
  const map = new Map<number, TreeYear>();
  for (const d of days) {
    const year = Number(d.date.slice(0, 4));
    const y = map.get(year) ?? {
      year,
      load: 0,
      minutes: 0,
      count: 0,
      distance: 0,
      climb: 0,
      crossMinutes: 0,
      weekLoads: Array<number>(53).fill(0),
      scars: [],
    };
    const doy = Math.round((Date.parse(d.date) - Date.parse(`${year}-01-01`)) / 86_400_000);
    if (d.off === "INJURED") {
      // Consecutive injured days grow one scar, in whichever order the days come.
      const s = y.scars.find((x) => x.from === doy + 1 || x.to === doy - 1);
      if (s && s.from === doy + 1) Object.assign(s, { from: doy, start: d.date });
      else if (s) Object.assign(s, { to: doy, end: d.date });
      else y.scars.push({ start: d.date, end: d.date, from: doy, to: doy });
    }
    for (const b of d.branches) {
      y.load += b.load;
      y.minutes += b.minutes;
      y.distance += b.distance;
      y.climb += b.climb;
      y.count++;
      y.weekLoads[Math.min(52, Math.floor(doy / 7))]! += b.load;
    }
    for (const x of d.sprouts) {
      y.load += x.load;
      y.crossMinutes += x.minutes;
      y.weekLoads[Math.min(52, Math.floor(doy / 7))]! += x.load;
    }
    map.set(year, y);
  }
  for (const y of map.values()) y.scars.sort((a, b) => a.from - b.from);
  return [...map.values()].sort((a, b) => a.year - b.year);
}

/** Readiness → season, on the same thresholds as the readiness advice. */
export function seasonOf(score: number): Season {
  return score >= 75 ? "summer" : score >= 55 ? "spring" : score >= 40 ? "autumn" : "winter";
}

/** Readiness span of each season (the ends of the scale stand in for winter's floor and summer's top). */
const SEASON_SPAN: Record<Season, [number, number]> = {
  winter: [0, 40],
  autumn: [40, 55],
  spring: [55, 75],
  summer: [75, 100],
};

/**
 * Where a score sits inside its season, 0 → 1 from the lower-readiness end to the higher: deep winter → first
 * snow, late autumn (nearly bare) → early autumn, early spring (buds) → late spring, early summer → high summer.
 */
export function seasonPhase(score: number): number {
  const [lo, hi] = SEASON_SPAN[seasonOf(score)];
  return clamp01((score - lo) / (hi - lo));
}

/** The season named for where in it you are: thirds of each season get their own word. */
export function seasonLabel(season: Season, phase: number): string {
  const third = phase < 1 / 3 ? 0 : phase < 2 / 3 ? 1 : 2;
  return {
    winter: [
      t("Deep winter", "Pieno inverno"),
      t("Winter", "Inverno"),
      t("Early winter", "Inizio inverno"),
    ],
    autumn: [
      t("Late autumn", "Tardo autunno"),
      t("Autumn", "Autunno"),
      t("Early autumn", "Inizio autunno"),
    ],
    spring: [
      t("Early spring", "Inizio primavera"),
      t("Spring", "Primavera"),
      t("Late spring", "Tarda primavera"),
    ],
    summer: [
      t("Early summer", "Inizio estate"),
      t("Summer", "Estate"),
      t("High summer", "Piena estate"),
    ],
  }[season][third]!;
}

export const SEASON_COLOR: Record<Season, string> = {
  summer: "var(--summer)",
  spring: "var(--spring)",
  autumn: "var(--autumn)",
  winter: "var(--snow)",
};
/** Canopy blobs [at the season's low end, high end]: a full crown in every season (autumn only thinner than summer), bare winter (the crown view loads it with snow). */
const SEASON_LEAVES: Record<Season, [number, number]> = {
  summer: [56, 72],
  spring: [46, 76],
  autumn: [64, 92],
  winter: [0, 0],
};
const leavesFor = (season: Season, phase: number) => {
  const [a, b] = SEASON_LEAVES[season];
  return Math.round(a + (b - a) * phase);
};

/** Form (% of fitness) → the sky above the crown, on intervals.icu's form zones. */
export function weatherOf(form: number): Weather {
  const zone = formZone(form);
  return zone === "High risk"
    ? "rain"
    : zone === "Optimal"
      ? "clouds"
      : zone === "Grey zone"
        ? "partly"
        : "sun";
}

/** Form span (% of fitness) of each sky, on intervals.icu's form zones (the open ends cut at a plausible extreme). */
const WEATHER_SPAN: Record<Weather, [number, number]> = {
  rain: [-50, -30],
  clouds: [-30, -10],
  partly: [-10, 5],
  sun: [5, 25],
};

/** How fair a form is within its sky, 0 → 1: heavy rain → a shower, dark clouds → breaking up, and so on. */
export function weatherPhase(form: number): number {
  const [lo, hi] = WEATHER_SPAN[weatherOf(form)];
  return clamp01((form - lo) / (hi - lo));
}

export const WEATHER_WORD: Record<Weather, string> = {
  sun: t("fresh", "fresco"),
  partly: t("neutral", "neutro"),
  clouds: t("training hard", "sotto carico"),
  rain: t("overreached", "overreaching"),
};

/**
 * Wellness with today's fitness and fatigue as they stood this morning. intervals.icu gives today's at the end
 * of the day, already decayed as if you won't train, which flatters form; so until today has an activity, today
 * takes yesterday's values, and everything computed from them (form, weather, readiness) follows.
 */
export function morningWellness(wellness: Wellness[], acts: Activity[], today: string): Wellness[] {
  if (acts.some((a) => dayOf(a) === today)) return wellness;
  const yesterday = wellness.find((w) => w.id === addDays(today, -1));
  if (yesterday?.ctl == null || yesterday.atl == null) return wellness;
  const live = { ctl: yesterday.ctl, atl: yesterday.atl };
  return wellness.some((w) => w.id === today)
    ? wellness.map((w) => (w.id === today ? { ...w, ...live } : w))
    : [...wellness, { id: today, ...EMPTY_DAY, ...live }];
}

/** A wellness day with nothing recorded, for filling in today. */
const EMPTY_DAY = {
  rampRate: null,
  weight: null,
  bodyFat: null,
  hrv: null,
  sleepSecs: null,
  sleepQuality: null,
  soreness: null,
  fatigue: null,
  stress: null,
  mood: null,
  motivation: null,
  eftp: null,
  wPrime: null,
  pMax: null,
  comments: null,
} satisfies Omit<Wellness, "id" | "ctl" | "atl">;

/**
 * Today's crown, from fitness and fatigue as of this morning until you've trained today (see morningWellness).
 * Without the check-in the score still comes from HRV, sleep and form; with none of those, from form alone.
 */
/** Days back that still count as coming back from a break, and the gap without training that counts as one. */
const RETURN_DAYS = 42;
const BREAK_DAYS = 14;

/**
 * Coming back from injury, illness or a long break: a sick/injured stretch that ended in the last six weeks, or two
 * weeks or more without training in the last eight. The load limits are stricter then.
 */
export function returningFromBreak(
  acts: Activity[],
  offEvents: PlannedEvent[],
  today: string,
): boolean {
  const since = addDays(today, -RETURN_DAYS);
  if (offEvents.some((e) => (e.end ?? e.date) >= since && e.date <= today)) return true;
  const days = new Set(acts.map(dayOf));
  let gap = 0;
  for (let d = addDays(today, -56); d < today; d = addDays(d, 1)) {
    gap = days.has(d) ? 0 : gap + 1;
    if (gap >= BREAK_DAYS) return true;
  }
  return false;
}

export function crownFor(
  allWellness: Wellness[],
  acts: Activity[],
  today: string,
  offEvents: PlannedEvent[] = [],
  /** False when the check-in is turned off: any answers on record are ignored, and no answer is awaited. */
  checkIn = true,
): Crown {
  const answered = checkIn ? allWellness : withoutAnswers(allWellness);
  const wellness = morningWellness(answered, acts, today);
  const row = wellness.find((w) => w.id === today);
  const form = row?.ctl != null && row.atl != null ? computeForm(row.ctl, row.atl) : null;
  const formPct = row?.ctl != null && row.atl != null ? formPercent(row.ctl, row.atl) : null;
  const checkedIn = !!row && (row.sleepQuality ?? row.fatigue ?? row.stress ?? row.mood) != null;
  const felt = recentFeel(acts, today);
  const r = readinessFor(wellness, today, returningFromBreak(acts, offEvents, today), felt);
  // The sky is your form, moved a little by how the last days felt; the numbers stay what they are.
  const skyForm = formPct != null ? formPct + (felt?.skyShift ?? 0) : null;
  // Without readiness inputs the score comes from form alone, still under the load cap.
  const score =
    r.score ?? (formPct != null ? capForLoad(Math.round(formScore(formPct)), r.load) : null);
  const season = score != null ? seasonOf(score) : null;
  const phase = score != null ? seasonPhase(score) : 0;
  return {
    score,
    estimated: (checkIn && !checkedIn) || r.confidence === "low",
    confidence: r.confidence,
    season,
    seasonPhase: phase,
    seasonLabel: season ? seasonLabel(season, phase) : null,
    advice: score != null ? advice(score).title : null,
    leaves: season ? leavesFor(season, phase) : 30,
    ctl: row?.ctl ?? null,
    atl: row?.atl ?? null,
    form,
    formPct,
    weather: skyForm != null ? weatherOf(skyForm) : null,
    weatherPhase: skyForm != null ? weatherPhase(skyForm) : 0,
    // Load first: it's the one that already holds readiness down.
    signals: [
      ...r.load.reasons.map((text) => ({ key: "load" as const, text })),
      ...earlySignals(answered, today),
    ],
    load: r.load,
    // Nothing flowers under snow.
    bloom: season === "winter" ? null : bloomOn(allWellness, today),
  };
}

/** Every day covered by a sick or injured event; injured wins when both cover a day. */
export function offDays(events: PlannedEvent[]): Map<string, OffKind> {
  const map = new Map<string, OffKind>();
  for (const e of events) {
    if (e.category !== "SICK" && e.category !== "INJURED") continue;
    for (let d = e.date; d <= (e.end ?? e.date); d = addDays(d, 1))
      if (map.get(d) !== "INJURED") map.set(d, e.category);
  }
  return map;
}

/** The event covering `date` (of `kind`, when given). */
export const offEventOn = (events: PlannedEvent[], date: string, kind?: OffKind) =>
  events.find(
    (e) =>
      (kind ? e.category === kind : e.category === "SICK" || e.category === "INJURED") &&
      e.date <= date &&
      date <= (e.end ?? e.date),
  );

export type OffChange =
  | { op: "create"; start: string; last: string }
  | { op: "update"; id: string; start: string; last: string }
  | { op: "delete"; id: string };

/**
 * What toggling `kind` for today does: undo it if today is already marked (shorten the stretch to yesterday,
 * or remove a one-day event), extend yesterday's stretch of the same kind, or start a new one.
 */
export function offToggle(events: PlannedEvent[], kind: OffKind, today: string): OffChange {
  const now = offEventOn(events, today, kind);
  if (now) {
    if (now.date >= today && (now.end ?? now.date) > today)
      return { op: "update", id: now.id, start: addDays(today, 1), last: now.end! };
    if (now.date >= today) return { op: "delete", id: now.id };
    return { op: "update", id: now.id, start: now.date, last: addDays(today, -1) };
  }
  const before = offEventOn(events, addDays(today, -1), kind);
  if (before) return { op: "update", id: before.id, start: before.date, last: today };
  return { op: "create", start: today, last: today };
}

/** "Sick 4–9 Oct", "Injured 12 Oct". */
export function offTitle(kind: OffKind, start: string, last: string): string {
  const word = kind === "SICK" ? t("Sick", "Malattia") : t("Injured", "Infortunio");
  return `${word} ${weekRange(start, last)}`;
}

/** Where each leaf sits along its branch (0 at the trunk, 1 at the tip), from `from` outward; even ones on top. */
export const leafSpots = (leaves: number, from: number) =>
  Array.from({ length: leaves }, (_, i) => from + ((1 - from) * (i + 1)) / leaves);

/**
 * Spots along a branch (0–1) for `n` perched birds of `bird` px on a branch `length` px long: as far as possible from
 * the leaves on top of the branch and from each other, never against the trunk or past the tip. Greedy max–min over
 * a fine grid, so a single bird on a flat ride lands on bare wood, and many birds spread out.
 */
export function perchSpots(...args: Parameters<typeof perchOrder>): number[] {
  return perchOrder(...args).sort((a, b) => a - b);
}

/**
 * The same spots in the order they're taken, so the first birds keep their places when another one arrives.
 */
export function perchOrder(
  n: number,
  leaves: number,
  from: number,
  length: number,
  bird: number,
  /**
   * `taken`: animals already sitting there (spot and width in px), kept clear like other birds. `upTo`: the
   * farthest spot allowed (0–1), e.g. to keep a tall animal on the low part of the branch.
   */
  { taken = [], upTo = 1 }: { taken?: { t: number; w: number }[]; upTo?: number } = {},
): number[] {
  if (n <= 0 || length <= 0) return [];
  const lo = Math.min(0.5, (bird * 0.8) / length);
  const hi = Math.max(lo, Math.min(upTo, 1 - (bird * 0.5) / length));
  // Leaves on top get in the way of a whole bird; those underneath only of its feet.
  // The trunk and the tip count too, so a lone bird sits mid-stretch instead of against either end.
  const blocks = [
    { t: 0, room: 0.6 * bird },
    { t: 1, room: 0.3 * bird },
    ...leafSpots(leaves, from).map((t, i) => ({ t, room: (i % 2 ? 0.2 : 0.9) * bird })),
  ];
  const spots: number[] = [];
  for (let k = 0; k < n; k++) {
    let best = { t: (lo + hi) / 2, score: -Infinity };
    for (let t = lo; t <= hi + 1e-9; t += 0.005) {
      const px = t * length;
      const fromLeaves = Math.min(
        Infinity,
        ...blocks.map((b) => Math.abs(b.t * length - px) - b.room),
      );
      const fromBirds = Math.min(
        Infinity,
        ...spots.map((s) => Math.abs(s * length - px) - bird),
        ...taken.map((o) => Math.abs(o.t * length - px) - (o.w + bird) / 2),
      );
      // Room from other birds comes first: when a branch is crowded a bird may half-cover a leaf, never a bird.
      // Ties go outward, where a bird reads as sitting on the branch rather than on the trunk.
      const score = Math.min(fromLeaves + 0.5 * bird, fromBirds) + t * 0.01;
      if (score > best.score) best = { t, score };
    }
    spots.push(best.t);
  }
  return spots;
}
