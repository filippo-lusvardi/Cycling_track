// The garden: where the sports you do grow. Every activity of those sports in the last 8 weeks is a plant in its
// sport's bed, full size the day it's done, its fruit ripening over the week after, as the training is absorbed.
// It starts empty, and the first activity of a new sport gives that sport a bed with a vegetable picked at random
// among those not in use (see growNewSports); the user can change it, or remove the sport. What a session bears (fruit per km, per minute, per metre climbed) belongs to its
// sport. Older crops are harvested into the pantry: a jar per month. Like the tree, every mark means something. Pure.
import { activityKind } from "./activity-kind";
import { t } from "./i18n";
import type { Activity } from "./intervals";
import { isSport, sportOfActivity, type MainSport } from "./sport";
import { addDays } from "./training";
import { intensityLevel, seedOf, type Level } from "./tree";

/** The sports the garden always knows. */
export type BuiltinSport =
  "run" | "bike" | "strength" | "mobility" | "walk" | "swim" | "ski" | "paddle" | "climb" | "other";
/** A sport the user added in Settings (see CustomSport). */
export type CustomId = `custom:${string}`;
/** The sports the garden grows: everything but the main sport. */
export type Sport = BuiltinSport | CustomId;

/** Beds from the back of the garden to the front. */
export const SPORTS: readonly Exclude<BuiltinSport, "bike">[] = [
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

export const SPORT_NAME: Record<BuiltinSport, () => string> = {
  run: () => t("Running", "Corsa"),
  bike: () => t("Cycling", "Ciclismo"),
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
  | "aubergine"
  | "corn"
  | "artichoke"
  | "onion"
  | "radicchio"
  | "pepper"
  | "lavender"
  | "poppy"
  | "cornflower";

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
  "corn",
  "artichoke",
  "onion",
  "radicchio",
  "pepper",
  "lavender",
  "poppy",
  "cornflower",
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
  corn: () => t("Corn", "Mais"),
  artichoke: () => t("Artichokes", "Carciofi"),
  onion: () => t("Onions", "Cipolle"),
  radicchio: () => "Radicchio",
  pepper: () => t("Peppers", "Peperoni"),
  lavender: () => t("Lavender", "Lavanda"),
  poppy: () => t("Poppies", "Papaveri"),
  cornflower: () => t("Cornflowers", "Fiordalisi"),
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
  corn: "color-mix(in oklab, var(--birch) 80%, var(--spring))",
  artichoke: "oklch(0.7 0.05 165)",
  onion: "color-mix(in oklab, var(--autumn) 62%, var(--bark))",
  radicchio: "oklch(0.45 0.13 12)",
  pepper: "oklch(0.62 0.2 35)",
  lavender: "oklch(0.68 0.12 295)",
  poppy: "oklch(0.6 0.22 25)",
  cornflower: "oklch(0.64 0.17 255)",
};

/**
 * A sport of the user's own, with its own bed: an activity of exactly this type (whatever sport it would be), or one
 * that would land in "Other sports" with these words in its title, grows here.
 */
export type CustomSport = { id: CustomId; name: string; crop: Crop };

/** The sports with a bed, each with the crop that grows for it (a usual sport that's missing has none). */
export type CropMap = Partial<Record<Exclude<BuiltinSport, "bike">, Crop>> & {
  custom?: CustomSport[];
  /** Sports removed by hand: their activities grow nowhere and don't bring them back. */
  skipped?: string[];
  /** Set once the beds saved before they came from activities have been cleared of sports never done. */
  v?: 2;
};

/**
 * The bike's bed is the run's bed under another name: a garden only ever has one of them, since the other is the main
 * sport. So they share one crop (and "bike" never appears in a stored map).
 */
const cropKey = (s: BuiltinSport) => (s === "bike" ? "run" : s);

/** Every usual sport with a bed: how an activity is sorted when no choice is involved, and each sport's fallback crop. */
export const DEFAULT_CROPS = {
  run: "tomato",
  strength: "pumpkin",
  mobility: "flowers",
  walk: "herbs",
  swim: "lily",
  ski: "kale",
  paddle: "reeds",
  climb: "beans",
  other: "sunflower",
} satisfies CropMap;

/** The map from a saved choice: nothing yet means an empty garden. */
export const cropMap = (chosen?: CropMap | null): CropMap => ({ ...chosen });

/** Has this usual sport been added? */
const hasBed = (map: CropMap, s: BuiltinSport) => map[cropKey(s)] != null;

export const isCustom = (s: Sport): s is CustomId => s.startsWith("custom:");

/** The user's own sports in `map` (what's stored is checked: it may come from an older version). */
export const customSports = (map: CropMap): CustomSport[] =>
  Array.isArray(map.custom) ? map.custom.filter((c) => CROPS.includes(c.crop)) : [];

/** The usual sports a garden can grow, in bed order: all but the main sport. */
const usualSports = (main: MainSport): BuiltinSport[] =>
  main === "run" ? SPORTS.map((s) => (s === "run" ? "bike" : s)) : [...SPORTS];

/**
 * Every sport with a bed to its name: the usual ones added, then the user's. The main sport is required: without it a
 * runner's rides would have no bed, and whatever walks this list would silently leave them out.
 */
export const allSports = (map: CropMap, main: MainSport): Sport[] => [
  ...usualSports(main).filter((s) => hasBed(map, s)),
  ...customSports(map).map((c) => c.id),
];

/** The usual sports not added yet: what Settings offers. */
export const sportsToAdd = (map: CropMap, main: MainSport): BuiltinSport[] =>
  usualSports(main).filter((s) => !hasBed(map, s));

/** What grows for a sport. */
export const cropFor = (map: CropMap, sport: Sport): Crop =>
  isCustom(sport)
    ? (customSports(map).find((c) => c.id === sport)?.crop ?? DEFAULT_CROPS.other)
    : (map[cropKey(sport)] ?? DEFAULT_CROPS[cropKey(sport)]);

/** A sport's name in this language; the user's own as they wrote it. */
/** The few words on a bed's sign, where the full name would crowd out the plants. */
const SPORT_SIGN: Record<BuiltinSport, () => string> = {
  run: () => t("Running", "Corsa"),
  bike: () => t("Cycling", "Ciclismo"),
  strength: () => t("Strength", "Forza"),
  mobility: () => t("Yoga", "Yoga"),
  walk: () => t("Walks", "Camminate"),
  swim: () => t("Swimming", "Nuoto"),
  ski: () => t("Skiing", "Sci"),
  paddle: () => t("Rowing", "Pagaia"),
  climb: () => t("Climbing", "Arrampicata"),
  other: () => t("Other", "Altri"),
};

/** What a bed's sign says: its sport, shortened to fit (a sport of the user's own can run to 30 letters). */
export const sportSign = (map: CropMap, sport: Sport): string => {
  if (!isCustom(sport)) return SPORT_SIGN[sport]();
  const name = sportName(map, sport);
  return name.length > 14 ? `${name.slice(0, 13).trimEnd()}…` : name;
};

export const sportName = (map: CropMap, sport: Sport): string =>
  isCustom(sport)
    ? (customSports(map).find((c) => c.id === sport)?.name ?? SPORT_NAME.other())
    : SPORT_NAME[sport]();

/** The crops no sport grows yet: what a new sport can take, so no two beds look alike. */
export const freeCrops = (map: CropMap): Crop[] => {
  // Run and bike share a crop, so either sport lists the same crops as taken.
  const used = new Set(allSports(map, "ride").map((s) => cropFor(map, s)));
  return CROPS.filter((c) => !used.has(c));
};

const withCrop = (map: CropMap, sport: Sport, crop: Crop): CropMap =>
  isCustom(sport)
    ? {
        ...map,
        custom: customSports(map).map((c) => (c.id === sport ? { ...c, crop } : c)),
      }
    : { ...map, [cropKey(sport)]: crop };

/**
 * Give `sport` the crop `crop`; a sport already growing it takes the first one's old crop instead, so no two beds
 * look alike.
 */
export function assignCrop(map: CropMap, sport: Sport, crop: Crop): CropMap {
  if (sport === "bike") sport = "run";
  const holder = allSports(map, "ride").find((s) => s !== sport && cropFor(map, s) === crop);
  const old = cropFor(map, sport);
  return withCrop(holder ? withCrop(map, holder, old) : map, sport, crop);
}

/** Letters and digits only, lower case: "Table tennis" and "TableTennis" are one sport. */
const squeeze = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
/** Space-separated words with a space at each end, to look for whole words in a title. */
const words = (s: string) =>
  ` ${s
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .join(" ")} `;

/** The id a sport of this name has; null when the name has nothing to match by. */
export const customSportId = (name: string): CustomId | null => {
  const key = squeeze(name);
  return key ? `custom:${key}` : null;
};

/** `map` no longer holding a sport's removal against it. */
const unskip = (map: CropMap, key: string): CropMap =>
  map.skipped?.includes(key) ? { ...map, skipped: map.skipped.filter((k) => k !== key) } : map;

/** `map` with a usual sport growing `crop`; unchanged if it's already there or the crop isn't free. */
export function addSport(map: CropMap, sport: BuiltinSport, crop: Crop): CropMap {
  if (hasBed(map, sport) || !freeCrops(map).includes(crop)) return map;
  return unskip({ ...map, [cropKey(sport)]: crop }, cropKey(sport));
}

/** `map` with a new sport growing `crop`; unchanged if the name is empty or already there, or the crop isn't free. */
export function addCustomSport(map: CropMap, name: string, crop: Crop): CropMap {
  const id = customSportId(name);
  if (!id || customSports(map).some((c) => c.id === id) || !freeCrops(map).includes(crop)) {
    return map;
  }
  return unskip({ ...map, custom: [...customSports(map), { id, name: name.trim(), crop }] }, id);
}

/**
 * `map` without a sport, and staying without it: its crop is free, and its activities grow nowhere (new ones don't
 * bring it back) until it's added again.
 */
export function removeSport(map: CropMap, sport: Sport): CropMap {
  const key = isCustom(sport) ? sport : cropKey(sport);
  const skipped = [...(map.skipped ?? []).filter((k) => k !== key), key];
  if (isCustom(sport))
    return { ...map, skipped, custom: customSports(map).filter((c) => c.id !== sport) };
  const { [cropKey(sport)]: _, ...rest } = map;
  return { ...rest, skipped };
}

/**
 * The sports these activities call for, oldest first: a usual one, one named after an activity type no usual sport
 * covers ("Tennis"), or "Other sports" for activities with no type to go by.
 */
function sportsDone(acts: Activity[], map: CropMap, main: MainSport) {
  const every: CropMap = { ...DEFAULT_CROPS, custom: customSports(map) };
  const usual = new Set<BuiltinSport>();
  const named = new Map<CustomId, string>();
  const sorted = [...acts].sort((a, b) => a.start_date_local.localeCompare(b.start_date_local));
  for (const a of sorted) {
    const sport = sportOf(a, every, main);
    if (!sport || isCustom(sport)) continue;
    const id = sport === "other" && a.type && a.type !== "Other" ? customSportId(a.type) : null;
    if (id) named.set(id, typeName(a.type!));
    else usual.add(sport);
  }
  return { usual, named };
}

/**
 * `map` with a bed for every new sport in `acts`, each growing a crop picked at random among those no other bed grows.
 * A sport removed by hand stays out; with every crop taken, a new sport waits for one to come free. The same `map` when
 * nothing changes. The first time, beds saved earlier for sports never done are cleared.
 */
export function growNewSports(
  map: CropMap,
  acts: Activity[],
  main: MainSport,
  random: () => number = Math.random,
): CropMap {
  if (!acts.length) return map;
  const { usual, named } = sportsDone(acts, map, main);
  let next = map;
  if (map.v !== 2) {
    next = { ...map, v: 2 };
    for (const s of usualSports(main))
      if (hasBed(next, s) && !usual.has(s)) {
        const { [cropKey(s)]: _gone, ...rest } = next;
        next = rest;
      }
  }
  const pick = () => {
    const free = freeCrops(next);
    return free.length ? free[Math.floor(random() * free.length)]! : null;
  };
  for (const s of usual) {
    if (hasBed(next, s) || next.skipped?.includes(cropKey(s))) continue;
    const crop = pick();
    if (crop) next = addSport(next, s, crop);
  }
  for (const [id, name] of named) {
    if (customSports(next).some((c) => c.id === id) || next.skipped?.includes(id)) continue;
    const crop = pick();
    if (crop) next = addCustomSport(next, name, crop);
  }
  return next;
}

/**
 * The garden's sport for an activity, the user's own sports in `map` included. Null when it grows nowhere: the main
 * sport (it grows the tree), or a sport with no bed.
 */
export function sportOf(
  a: { type: string | null; trainer?: boolean; name?: string | null },
  map: CropMap = DEFAULT_CROPS,
  main: MainSport = "ride",
): Sport | null {
  if (isSport(a, main)) return null;
  const custom = customSports(map);
  const type = a.type ?? "";
  const exact = custom.find((c) => c.id === `custom:${squeeze(type)}`);
  if (exact) return exact.id;
  if (map.skipped?.includes(`custom:${squeeze(type)}`)) return null;
  const usual = sportOfActivity(a) === "ride" ? "bike" : usualSport(type);
  if (usual !== "other") return hasBed(map, usual) ? usual : null;
  // By title only among what's otherwise unsorted: a run "to tennis" stays a run.
  const title = words(a.name ?? "");
  const named = custom.find((c) => title.includes(words(c.name)));
  return named?.id ?? (hasBed(map, "other") ? "other" : null);
}

/** How many of `acts` each usual sport would grow, were it added: what Settings shows beside each. */
export function sportCounts(
  acts: Activity[],
  map: CropMap,
  main: MainSport,
): Partial<Record<Sport, number>> {
  const every: CropMap = { ...DEFAULT_CROPS, custom: customSports(map) };
  const counts: Partial<Record<Sport, number>> = {};
  for (const a of acts) {
    const sport = sportOf(a, every, main);
    if (sport) counts[sport] = (counts[sport] ?? 0) + 1;
  }
  return counts;
}

/** The usual sport for an intervals.icu activity type. */
function usualSport(type: string): BuiltinSport {
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
  a: { type: string | null; trainer?: boolean; name?: string | null },
  map: CropMap = DEFAULT_CROPS,
) {
  const sport = sportOf(a, map);
  return sport ? cropFor(map, sport) : null;
}

/** "TableTennis" → "Table tennis". */
const typeName = (type: string) => {
  const s = type.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
};

/** The activity types the user has done that no usual sport covers: what they might name a sport after, most done first. */
export function suggestedSports(acts: Activity[], map: CropMap): { name: string; count: number }[] {
  const every: CropMap = { ...DEFAULT_CROPS, custom: customSports(map) };
  const counts = new Map<string, number>();
  for (const a of acts) {
    if (!a.type || a.type === "Other" || sportOf(a, every) !== "other") continue;
    counts.set(a.type, (counts.get(a.type) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([a, x], [b, y]) => y - x || a.localeCompare(b))
    .map(([type, count]) => ({ name: typeName(type), count }));
}

/** How many of `acts` a sport of this name would grow, were it added to `map`. */
export function customSportCount(acts: Activity[], map: CropMap, name: string): number {
  const id = customSportId(name);
  if (!id) return 0;
  const next: CropMap = {
    ...map,
    custom: [
      ...customSports(map).filter((c) => c.id !== id),
      { id, name, crop: DEFAULT_CROPS.other },
    ],
  };
  return acts.filter((a) => sportOf(a, next) === id).length;
}

/** The record animals: the longest run, swim and walk or hike of all time. */
export type Critter = "hedgehog" | "frog" | "snail";
const RECORD_SPORT: Partial<Record<BuiltinSport, Critter>> = {
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

export type Bed = { sport: Sport; name: string; crop: Crop; plants: Plant[] };

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
  BuiltinSport,
  (p: { minutes: number; load: number; km: number; climb: number }) => number
> = {
  run: (p) => Math.max(1, Math.round(p.km / 5)), // one per 5 km
  bike: (p) => Math.max(1, Math.round(p.km / 20)), // one per 20 km
  strength: () => 1, // one fruit, its size is the load
  mobility: (p) => Math.max(1, Math.round(p.minutes / 10)), // one per 10 minutes
  walk: (p) => Math.round(p.climb / 100), // one per 100 m climbed, as the tree's leaves
  swim: (p) => Math.max(1, Math.round((p.km * 1000) / 500)), // one per 500 m
  ski: () => 0, // the plant itself is the crop
  paddle: (p) => Math.max(1, Math.round(p.km / 3)), // one per 3 km
  climb: (p) => Math.max(1, Math.round(p.load / 15)), // by load
  other: () => 1,
};
/** A sport of the user's own: one per quarter of an hour, whatever it is. */
const customFruit = (minutes: number) => Math.max(1, Math.round(minutes / 15));
const MAX_FRUIT = 8;

/** The longest session (by distance, else time) of each record sport, all time up to today: its id. */
export function gardenRecords(
  acts: Activity[],
  today: string,
  map: CropMap = DEFAULT_CROPS,
  main: MainSport = "ride",
): Partial<Record<Sport, string>> {
  const best: Partial<Record<BuiltinSport, Activity>> = {};
  const score = (a: Activity) => (a.distance ?? 0) * 1e6 + (a.moving_time ?? 0);
  const sorted = [...acts].sort((a, b) => a.start_date_local.localeCompare(b.start_date_local));
  for (const a of sorted) {
    if (a.start_date_local.slice(0, 10) > today) continue;
    const sport = sportOf(a, map, main);
    if (!sport || isCustom(sport) || !RECORD_SPORT[sport]) continue;
    const b = best[sport];
    if (score(a) > (b ? score(b) : 0)) best[sport] = a;
  }
  return Object.fromEntries(Object.entries(best).map(([s, a]) => [s, a!.id]));
}

/** The garden as it stands today: the last GROWING_DAYS of training off the bike, each sport as `map` grows it. */
export function buildGarden(
  acts: Activity[],
  today: string,
  map: CropMap = DEFAULT_CROPS,
  main: MainSport = "ride",
): Garden {
  const from = addDays(today, -(GROWING_DAYS - 1));
  const records = gardenRecords(acts, today, map, main);
  const beds = new Map<Sport, Plant[]>();
  for (const a of acts) {
    const date = a.start_date_local.slice(0, 10);
    if (date < from || date > today) continue;
    const sport = sportOf(a, map, main);
    if (!sport) continue;
    const minutes = (a.moving_time ?? 0) / 60;
    const load = a.icu_training_load ?? 0;
    const km = (a.distance ?? 0) / 1000;
    const climb = a.total_elevation_gain ?? 0;
    const age = daysBetween(date, today);
    const plant: Plant = {
      id: a.id,
      sport,
      crop: cropFor(map, sport),
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
      fruit: Math.min(
        MAX_FRUIT,
        isCustom(sport) ? customFruit(minutes) : FRUIT[sport]({ minutes, load, km, climb }),
      ),
      intensity: intensityLevel(a.icu_intensity),
      seed: seedOf(a.id),
      critter: !isCustom(sport) && records[sport] === a.id ? (RECORD_SPORT[sport] ?? null) : null,
    };
    beds.set(sport, [...(beds.get(sport) ?? []), plant]);
  }
  const ordered = allSports(map, main).flatMap((sport) => {
    const plants = beds.get(sport);
    if (!plants) return [];
    plants.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    return [{ sport, name: sportName(map, sport), crop: cropFor(map, sport), plants }];
  });
  return {
    beds: ordered,
    soil: soilOf(acts, today, main, map),
    count: ordered.reduce((s, b) => s + b.plants.length, 0),
  };
}

/** 0 → 1: days trained at the garden's sports in the last 4 weeks, 8 or more (about twice a week) being fully watered. */
export function soilOf(
  acts: Activity[],
  today: string,
  main: MainSport = "ride",
  map: CropMap = DEFAULT_CROPS,
): number {
  const from = addDays(today, -27);
  const days = new Set(
    acts
      .filter((a) => sportOf(a, map, main) && a.start_date_local.slice(0, 10) >= from)
      .map((a) => a.start_date_local.slice(0, 10))
      .filter((d) => d <= today),
  );
  return clamp01(days.size / 8);
}

/** One month's harvest: minutes per sport. */
export type Jar = { month: string; minutes: number; bySport: Partial<Record<Sport, number>> };
export type Shelf = { year: number; jars: Jar[] };

/** One session in a jar: what the pantry opens when a month is tapped. */
export type JarSession = {
  id: string;
  sport: Sport;
  date: string;
  name: string;
  minutes: number;
  km: number;
};

/** The sessions of a month (YYYY-MM) that fill its jar, newest first. */
export function jarSessions(
  acts: Activity[],
  month: string,
  map: CropMap = DEFAULT_CROPS,
  main: MainSport = "ride",
): JarSession[] {
  return acts
    .flatMap((a) => {
      const sport = a.start_date_local.startsWith(month) ? sportOf(a, map, main) : null;
      if (!sport) return [];
      return [
        {
          id: a.id,
          sport,
          date: a.start_date_local.slice(0, 10),
          name: a.name ?? a.type ?? t("Activity", "Attività"),
          minutes: (a.moving_time ?? 0) / 60,
          km: (a.distance ?? 0) / 1000,
        },
      ];
    })
    .sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
}

/** Every month with training off the bike, as jars on yearly shelves (newest year first, months in order). */
export function buildPantry(
  acts: Activity[],
  map: CropMap = DEFAULT_CROPS,
  main: MainSport = "ride",
): Shelf[] {
  const jars = new Map<string, Jar>();
  for (const a of acts) {
    const sport = sportOf(a, map, main);
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
