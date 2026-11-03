// The garden: where training off the bike grows. Every non-cycling activity of the last 8 weeks is a plant in its
// sport's bed, full size the day it's done, its fruit ripening over the week after, as the training is absorbed.
// Which vegetable grows for which sport is the user's choice (a tomato for a run, a pumpkin for the gym, flowers for
// yoga and stretching… by default); what a session bears (fruit per km, per minute, per metre climbed) belongs to its
// sport. Older crops are harvested into the pantry: a jar per month. Like the tree, every mark means something. Pure.
import { activityKind } from "./activity-kind";
import { t } from "./i18n";
import type { Activity } from "./intervals";
import { addDays } from "./training";
import { intensityLevel, RIDE_KINDS, seedOf, type Level } from "./tree";

/** The sports the garden grows: everything but cycling. */
export type Sport =
  "run" | "strength" | "mobility" | "walk" | "swim" | "ski" | "paddle" | "climb" | "other";

/** Beds from the back of the garden to the front. */
export const SPORTS: readonly Sport[] = [
  "climb",
  "other",
  "strength",
  "run",
  "ski",
  "walk",
  "mobility",
  "paddle",
  "swim",
];

export const SPORT_NAME: Record<Sport, () => string> = {
  run: () => t("Running", "Corsa"),
  strength: () => t("Strength", "Forza"),
  mobility: () => t("Yoga & stretching", "Yoga e stretching"),
  walk: () => t("Walks & hikes", "Camminate ed escursioni"),
  swim: () => t("Swimming", "Nuoto"),
  ski: () => t("Skiing", "Sci"),
  paddle: () => t("Rowing & paddling", "Canottaggio e pagaia"),
  climb: () => t("Climbing", "Arrampicata"),
  other: () => t("Other sports", "Altri sport"),
};

/** The plants a sport can grow as. The last four aren't any sport's by default: they're there to choose. */
export type Crop =
  | "tomato"
  | "pumpkin"
  | "flowers"
  | "herbs"
  | "lily"
  | "kale"
  | "reeds"
  | "beans"
  | "sunflower"
  | "carrot"
  | "lettuce"
  | "strawberry"
  | "aubergine";

export const CROPS: readonly Crop[] = [
  "tomato",
  "pumpkin",
  "flowers",
  "herbs",
  "lily",
  "kale",
  "reeds",
  "beans",
  "sunflower",
  "carrot",
  "lettuce",
  "strawberry",
  "aubergine",
];

export const CROP_NAME: Record<Crop, () => string> = {
  tomato: () => t("Tomatoes", "Pomodori"),
  pumpkin: () => t("Pumpkins", "Zucche"),
  flowers: () => t("Flowers", "Fiori"),
  herbs: () => t("Herbs", "Erbe"),
  lily: () => t("Water lilies", "Ninfee"),
  kale: () => t("Winter kale", "Cavolo nero"),
  reeds: () => t("Reeds", "Canne"),
  beans: () => t("Beans", "Fagioli"),
  sunflower: () => t("Sunflowers", "Girasoli"),
  carrot: () => t("Carrots", "Carote"),
  lettuce: () => t("Lettuce", "Lattuga"),
  strawberry: () => t("Strawberries", "Fragole"),
  aubergine: () => t("Aubergines", "Melanzane"),
};

/** Each crop's colour in the pantry's jars and its legend: the colour of its fruit or flower. */
export const CROP_COLOR: Record<Crop, string> = {
  tomato: "var(--lingon)",
  pumpkin: "var(--autumn)",
  flowers: "var(--blossom)",
  herbs: "color-mix(in oklab, var(--primary) 55%, var(--blossom))",
  lily: "color-mix(in oklab, var(--snow) 70%, var(--primary))",
  kale: "color-mix(in oklab, var(--pine) 60%, var(--primary))",
  reeds: "color-mix(in oklab, var(--bark) 60%, var(--birch))",
  beans: "var(--summer)",
  sunflower: "var(--birch)",
  carrot: "color-mix(in oklab, var(--autumn) 80%, var(--birch))",
  lettuce: "var(--spring)",
  strawberry: "color-mix(in oklab, var(--lingon) 80%, var(--blossom))",
  aubergine: "oklch(0.55 0.13 310)",
};

/** Which crop grows for which sport, chosen in Settings (missing sports keep their default). */
export type CropMap = Record<Sport, Crop>;

export const DEFAULT_CROPS: CropMap = {
  run: "tomato",
  strength: "pumpkin",
  mobility: "flowers",
  walk: "herbs",
  swim: "lily",
  ski: "kale",
  paddle: "reeds",
  climb: "beans",
  other: "sunflower",
};

/** The full map from a saved choice (partial, or nothing yet). */
export const cropMap = (chosen?: Partial<CropMap> | null): CropMap => ({
  ...DEFAULT_CROPS,
  ...chosen,
});

/**
 * Give `sport` the crop `crop`; a sport already growing it takes the first one's old crop instead, so no two beds
 * look alike.
 */
export function assignCrop(map: CropMap, sport: Sport, crop: Crop): CropMap {
  const next = { ...map };
  const holder = SPORTS.find((s) => s !== sport && map[s] === crop);
  if (holder) next[holder] = map[sport];
  next[sport] = crop;
  return next;
}

/** A bed's full name: its crop and its sport, e.g. "Tomatoes · running". */
export const bedName = (sport: Sport, crop: Crop) =>
  `${CROP_NAME[crop]()} · ${SPORT_NAME[sport]().toLowerCase()}`;

/** The garden's sport for an intervals.icu activity type; null for rides (they grow the tree). */
export function sportOf(a: { type: string | null; trainer?: boolean }): Sport | null {
  if (RIDE_KINDS.has(activityKind(a))) return null;
  const type = a.type ?? "";
  if (/Yoga|Pilates|Stretch|Mobility|Breath|Meditation/.test(type)) return "mobility";
  if (/Run/.test(type)) return "run";
  if (/WeightTraining|Crossfit|Workout|HighIntensity|Strength/.test(type)) return "strength";
  if (/Walk|Hike|Snowshoe/.test(type)) return "walk";
  if (/Swim/.test(type)) return "swim";
  if (/Ski|Snowboard/.test(type)) return "ski";
  if (/Row|Kayak|Canoe|Paddl|Surf/.test(type)) return "paddle";
  if (/Climb/.test(type)) return "climb";
  return "other";
}

/** The crop an activity grows as, with `map` (the defaults unless given); null for rides. */
export function cropOf(
  a: { type: string | null; trainer?: boolean },
  map: CropMap = DEFAULT_CROPS,
) {
  const sport = sportOf(a);
  return sport ? map[sport] : null;
}

/** The record animals: the longest run, swim and walk or hike of all time. */
export type Critter = "hedgehog" | "frog" | "snail";
const RECORD_SPORT: Partial<Record<Sport, Critter>> = {
  run: "hedgehog",
  swim: "frog",
  walk: "snail",
};

export type Plant = {
  id: string;
  sport: Sport;
  /** What it's drawn as (the user's choice for its sport). */
  crop: Crop;
  date: string;
  name: string;
  minutes: number;
  load: number;
  /** Kilometres. */
  km: number;
  /** Metres climbed. */
  climb: number;
  /** Days since it was done (0 today). */
  age: number;
  /** 0 → 1 over the week after: green fruit turning ripe as the training is absorbed. */
  ripeness: number;
  /** 0 → 1 from duration: the plant's height. */
  size: number;
  /** 0 → 1 from load: how lush it is (stem, leaves, a pumpkin's girth). */
  vigor: number;
  /** Tomatoes, flowers, pods…: how many to draw (see FRUIT). */
  fruit: number;
  /** Leaf tint from intensity, as the tree's leaves; null without it. */
  intensity: Level | null;
  /** Stable 0–1 from the id: shape and, for flowers, colour. */
  seed: number;
  /** An animal lives here: this is the sport's longest session of all time. */
  critter: Critter | null;
};

export type Bed = { sport: Sport; crop: Crop; plants: Plant[] };

export type Garden = {
  /** Beds with something growing, back to front (SPORTS order), plants oldest first. */
  beds: Bed[];
  /** 0 → 1: how regularly you've trained off the bike in the last 4 weeks (moist dark soil vs resting soil). */
  soil: number;
  /** Plants growing in all. */
  count: number;
};

/** How long plants stay in the garden before they're harvested into the pantry. */
export const GROWING_DAYS = 56;
/** Days a plant's fruit takes to ripen. */
export const RIPEN_DAYS = 7;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const DAY = 86_400_000;
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / DAY);

/** How many fruits a session of each sport bears, whatever it grows as. */
const FRUIT: Record<
  Sport,
  (p: { minutes: number; load: number; km: number; climb: number }) => number
> = {
  run: (p) => Math.max(1, Math.round(p.km / 5)), // one per 5 km
  strength: () => 1, // one fruit, its size is the load
  mobility: (p) => Math.max(1, Math.round(p.minutes / 10)), // one per 10 minutes
  walk: (p) => Math.round(p.climb / 100), // one per 100 m climbed, as the tree's leaves
  swim: (p) => Math.max(1, Math.round((p.km * 1000) / 500)), // one per 500 m
  ski: () => 0, // the plant itself is the crop
  paddle: (p) => Math.max(1, Math.round(p.km / 3)), // one per 3 km
  climb: (p) => Math.max(1, Math.round(p.load / 15)), // by load
  other: () => 1,
};
const MAX_FRUIT = 8;

/** The longest session (by distance, else time) of each record sport, all time up to today: its id. */
export function gardenRecords(acts: Activity[], today: string): Partial<Record<Sport, string>> {
  const best: Partial<Record<Sport, Activity>> = {};
  const score = (a: Activity) => (a.distance ?? 0) * 1e6 + (a.moving_time ?? 0);
  const sorted = [...acts].sort((a, b) => a.start_date_local.localeCompare(b.start_date_local));
  for (const a of sorted) {
    if (a.start_date_local.slice(0, 10) > today) continue;
    const sport = sportOf(a);
    if (!sport || !RECORD_SPORT[sport]) continue;
    const b = best[sport];
    if (score(a) > (b ? score(b) : 0)) best[sport] = a;
  }
  return Object.fromEntries(Object.entries(best).map(([s, a]) => [s, a!.id]));
}

/** The garden as it stands today: the last GROWING_DAYS of training off the bike, each sport as `map` grows it. */
export function buildGarden(acts: Activity[], today: string, map: CropMap = DEFAULT_CROPS): Garden {
  const from = addDays(today, -(GROWING_DAYS - 1));
  const records = gardenRecords(acts, today);
  const beds = new Map<Sport, Plant[]>();
  for (const a of acts) {
    const date = a.start_date_local.slice(0, 10);
    if (date < from || date > today) continue;
    const sport = sportOf(a);
    if (!sport) continue;
    const minutes = (a.moving_time ?? 0) / 60;
    const load = a.icu_training_load ?? 0;
    const km = (a.distance ?? 0) / 1000;
    const climb = a.total_elevation_gain ?? 0;
    const age = daysBetween(date, today);
    const plant: Plant = {
      id: a.id,
      sport,
      crop: map[sport],
      date,
      name: a.name ?? a.type ?? t("Activity", "Attività"),
      minutes,
      load,
      km,
      climb,
      age,
      ripeness: clamp01(age / RIPEN_DAYS),
      size: 1 - Math.exp(-minutes / 60),
      vigor: clamp01(load / 100),
      fruit: Math.min(MAX_FRUIT, FRUIT[sport]({ minutes, load, km, climb })),
      intensity: intensityLevel(a.icu_intensity),
      seed: seedOf(a.id),
      critter: records[sport] === a.id ? (RECORD_SPORT[sport] ?? null) : null,
    };
    beds.set(sport, [...(beds.get(sport) ?? []), plant]);
  }
  const ordered = SPORTS.flatMap((sport) => {
    const plants = beds.get(sport);
    if (!plants) return [];
    plants.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    return [{ sport, crop: map[sport], plants }];
  });
  return {
    beds: ordered,
    soil: soilOf(acts, today),
    count: ordered.reduce((s, b) => s + b.plants.length, 0),
  };
}

/** 0 → 1: days trained off the bike in the last 4 weeks, 8 or more (about twice a week) being fully watered. */
export function soilOf(acts: Activity[], today: string): number {
  const from = addDays(today, -27);
  const days = new Set(
    acts
      .filter((a) => sportOf(a) && a.start_date_local.slice(0, 10) >= from)
      .map((a) => a.start_date_local.slice(0, 10))
      .filter((d) => d <= today),
  );
  return clamp01(days.size / 8);
}

/** One month's harvest: minutes per sport. */
export type Jar = { month: string; minutes: number; bySport: Partial<Record<Sport, number>> };
export type Shelf = { year: number; jars: Jar[] };

/** Every month with training off the bike, as jars on yearly shelves (newest year first, months in order). */
export function buildPantry(acts: Activity[]): Shelf[] {
  const jars = new Map<string, Jar>();
  for (const a of acts) {
    const sport = sportOf(a);
    if (!sport) continue;
    const month = a.start_date_local.slice(0, 7);
    const minutes = (a.moving_time ?? 0) / 60;
    const jar = jars.get(month) ?? { month, minutes: 0, bySport: {} };
    jar.minutes += minutes;
    jar.bySport[sport] = (jar.bySport[sport] ?? 0) + minutes;
    jars.set(month, jar);
  }
  const years = new Map<number, Jar[]>();
  for (const jar of [...jars.values()].sort((a, b) => a.month.localeCompare(b.month))) {
    const y = Number(jar.month.slice(0, 4));
    years.set(y, [...(years.get(y) ?? []), jar]);
  }
  return [...years.entries()].sort(([a], [b]) => b - a).map(([year, j]) => ({ year, jars: j }));
}

/** Training off the bike since Monday: for the Home's caption. */
export function weekSummary(acts: Activity[], today: string) {
  const [y, m, d] = today.split("-").map(Number);
  const monday = addDays(today, -((new Date(y!, m! - 1, d!).getDay() + 6) % 7));
  const week = acts.filter((a) => {
    const date = a.start_date_local.slice(0, 10);
    return sportOf(a) && date >= monday && date <= today;
  });
  return {
    minutes: week.reduce((s, a) => s + (a.moving_time ?? 0) / 60, 0),
    count: week.length,
  };
}
