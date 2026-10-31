// The tree: training history as one growing organism. Pure data → shape model, drawn by components/tree.
import { format, parseISO } from "date-fns";
import { activityKind, type Kind } from "./activity-kind";
import type { Activity, Wellness } from "./intervals";
import { advice, formScore, readinessFor } from "./readiness";
import { addDays, computeForm, formZone } from "./training";

/** 1–4, 1 being the easiest / best, like the check-in scales. */
export type Level = 1 | 2 | 3 | 4;

/** Green, blue, gold, red: shared by intensity, feel and the seasons. */
export const LEVEL_COLOR = ["var(--pine)", "var(--fitness)", "var(--birch)", "var(--lingon)"];
export const INTENSITY_WORD = ["easy", "steady", "tempo", "hard"];
/** intervals.icu feel words for levels 1–4 (4 also covers "weak"). */
export const FEEL_WORD = ["strong", "good", "normal", "poor"];

/** One leaf per this many metres climbed. */
export const CLIMB_PER_LEAF = 100;
const MAX_LEAVES = 30;

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
};

export type TreeDay = {
  date: string;
  ctl: number | null;
  /** Trunk width in px at the end of this day. */
  trunk: number;
  branches: TreeBranch[];
  /** Side of the rest-day bud (rest days have no branches). */
  budSide: -1 | 1;
};

export type Chapter = "build" | "steady" | "rest";

export type TreeWeek = {
  /** Monday. */
  start: string;
  end: string;
  ctl: number | null;
  trunk: number;
  load: number;
  minutes: number;
  /** Metres. */
  climb: number;
  count: number;
  /** The week's activities, oldest first: one twig each on the week's bough. */
  twigs: TreeBranch[];
  side: -1 | 1;
  chapter: Chapter;
};

export type TreeYear = {
  year: number;
  load: number;
  minutes: number;
  count: number;
  /** Metres. */
  distance: number;
  climb: number;
  weekLoads: number[];
};

export type Season = "summer" | "spring" | "autumn" | "winter";
export type Weather = "sun" | "partly" | "clouds" | "rain";

export type Crown = {
  score: number | null;
  /** True until today's check-in is done: the score comes from HRV, sleep and form only. */
  estimated: boolean;
  season: Season | null;
  /** The readiness advice title, e.g. "Ready for intensity". */
  advice: string | null;
  leaves: number;
  ctl: number | null;
  atl: number | null;
  form: number | null;
  weather: Weather | null;
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

/** One node per calendar day from `oldest` to `today`, newest first (the top of the tree). */
export function buildDays(
  acts: Activity[],
  wellness: Wellness[],
  oldest: string,
  today: string,
): TreeDay[] {
  const byDay = new Map<string, Activity[]>();
  for (const a of acts) {
    const d = dayOf(a);
    if (d < oldest || d > today) continue;
    byDay.set(d, [...(byDay.get(d) ?? []), a]);
  }
  const ctlByDay = new Map(wellness.filter((w) => w.ctl != null).map((w) => [w.id, w.ctl!]));

  const days: TreeDay[] = [];
  let ctl: number | null = null;
  let turn = 0; // alternates branches left/right, counted from the roots so old branches never flip
  for (let d = oldest; d <= today; d = addDays(d, 1)) {
    ctl = ctlByDay.get(d) ?? ctl;
    const day = (byDay.get(d) ?? []).sort((a, b) =>
      a.start_date_local.localeCompare(b.start_date_local),
    );
    const branches = day.map((a): TreeBranch => {
      const minutes = (a.moving_time ?? 0) / 60;
      const load = a.icu_training_load ?? 0;
      const climb = a.total_elevation_gain ?? 0;
      return {
        id: a.id,
        name: a.name ?? a.type ?? "Activity",
        kind: activityKind(a),
        side: turn++ % 2 ? -1 : 1,
        length: 1 - Math.exp(-minutes / 120),
        thickness: 1.5 + clamp01(load / 250) * 6.5,
        leaves: Math.min(MAX_LEAVES, Math.floor(climb / CLIMB_PER_LEAF)),
        intensity: intensityLevel(a.icu_intensity),
        minutes,
        load,
        distance: a.distance ?? 0,
        climb,
        seed: seedOf(a.id),
      };
    });
    days.push({ date: d, ctl, trunk: 0, branches, budSide: turn % 2 ? -1 : 1 });
  }
  // Widths need the whole history first: each day is ranked against every other day.
  const sorted = days.flatMap((d) => (d.ctl != null ? [d.ctl] : [])).sort((a, b) => a - b);
  for (const d of days) d.trunk = trunkWidth(d.ctl, sorted);
  return days.reverse();
}

const weekStart = (date: string) => {
  const [y, m, d] = date.split("-").map(Number);
  return addDays(date, -((new Date(y!, m! - 1, d!).getDay() + 6) % 7));
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
    const prior = weeks.slice(Math.max(0, i - 4), i);
    const avg = prior.length ? prior.reduce((s, w) => s + w.load, 0) / prior.length : 0;
    const chapter: Chapter =
      avg === 0
        ? load > 0
          ? "build"
          : "rest"
        : load > avg * 1.15
          ? "build"
          : load < avg * 0.6
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
      twigs,
      side: i % 2 ? -1 : 1,
      chapter,
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
      weekLoads: Array<number>(53).fill(0),
    };
    const doy = Math.round((Date.parse(d.date) - Date.parse(`${year}-01-01`)) / 86_400_000);
    for (const b of d.branches) {
      y.load += b.load;
      y.minutes += b.minutes;
      y.distance += b.distance;
      y.climb += b.climb;
      y.count++;
      y.weekLoads[Math.min(52, Math.floor(doy / 7))]! += b.load;
    }
    map.set(year, y);
  }
  return [...map.values()].sort((a, b) => a.year - b.year);
}

/** Readiness → season, on the same thresholds as the readiness advice. */
export function seasonOf(score: number): Season {
  return score >= 75 ? "summer" : score >= 55 ? "spring" : score >= 40 ? "autumn" : "winter";
}

export const SEASON_COLOR: Record<Season, string> = {
  summer: "var(--summer)",
  spring: "var(--spring)",
  autumn: "var(--autumn)",
  winter: "var(--snow)",
};
/** Canopy blobs: a full summer crown, thinner autumn, bare winter. */
const SEASON_LEAVES: Record<Season, number> = { summer: 62, spring: 42, autumn: 30, winter: 0 };

/** Form → the sky above the crown, on intervals.icu's form zones. */
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

export const WEATHER_WORD: Record<Weather, string> = {
  sun: "fresh",
  partly: "neutral",
  clouds: "training hard",
  rain: "overreached",
};

/**
 * Today's crown. Without the check-in the score still comes from HRV, sleep and form; with none of
 * those, from form alone.
 */
export function crownFor(wellness: Wellness[], today: string): Crown {
  const row = wellness.find((w) => w.id === today);
  const form = row?.ctl != null && row.atl != null ? computeForm(row.ctl, row.atl) : null;
  const checkedIn = !!row && (row.sleepQuality ?? row.fatigue ?? row.stress ?? row.mood) != null;
  const r = readinessFor(wellness, today);
  const score = r.score ?? (form != null ? Math.round(formScore(form)) : null);
  const season = score != null ? seasonOf(score) : null;
  return {
    score,
    estimated: !checkedIn,
    season,
    advice: score != null ? advice(score).title : null,
    leaves: season ? SEASON_LEAVES[season] : 30,
    ctl: row?.ctl ?? null,
    atl: row?.atl ?? null,
    form,
    weather: form != null ? weatherOf(form) : null,
  };
}
