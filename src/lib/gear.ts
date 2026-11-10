// Gear: bikes and shoes, the parts that wear on them, and what was done to them (washes, replacements, services,
// notes). Pure: the store is ./gear-store, the page routes/gear.tsx.
//
// An activity counts on a gear when it was set on it (an override), or else on the default gear of its slot: outdoor
// rides, indoor rides, runs. Without an indoor default, indoor rides count on nothing (a trainer wears a chain, not
// tyres, so they only go where someone said). A gear counts from its `since` day, plus the km it already had.
import { activityKind } from "./activity-kind";
import { format, num, t } from "./i18n";
import type { Activity } from "./intervals";
import { sportOfActivity } from "./sport";
import { parseISO } from "date-fns";

export type GearKind = "bike" | "shoes";
export type Frame = "road" | "gravel" | "mtb" | "tt";
export type Slot = "ride" | "indoor" | "run";

export type PartKind =
  | "chain"
  | "cassette"
  | "chainring"
  | "padsF"
  | "padsR"
  | "discF"
  | "discR"
  | "tyreF"
  | "tyreR"
  | "sealant"
  | "tape"
  | "cables"
  | "bb"
  | "other";

export type Component = {
  id: string;
  part: PartKind;
  /** Brand and model, if said. */
  name?: string;
  /** The day it went on: rides from that day count on it. */
  fitted: string;
  /** Km it already had when it started being followed. */
  fittedKm?: number;
  intervalKm?: number | null;
  /** The day it came off: rides from that day count on the next one. */
  removed?: string | null;
};

export type EventKind = "wash" | "replace" | "service" | "note";
export type GearEvent = {
  id: string;
  date: string;
  kind: EventKind;
  part?: PartKind;
  note?: string;
};

export type Gear = {
  id: string;
  name: string;
  kind: GearKind;
  frame?: Frame;
  slot: Slot;
  isDefault?: boolean;
  /** Km done before it was added. */
  startKm: number;
  since: string;
  retired?: string | null;
  /** Shoes: how long a pair lasts, km. */
  intervalKm?: number | null;
  components: Component[];
  events: GearEvent[];
  updatedAt: number;
};

/** Activity id → gear id; null means on no gear. Missing = the default. */
export type Overrides = Record<string, string | null>;

type Act = Pick<Activity, "id" | "type" | "start_date_local" | "distance"> & { trainer?: boolean };

export const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

// --- the parts ---

type PartInfo = { label: () => string; short: () => string; words: string[] };

export const PARTS: Record<PartKind, PartInfo> = {
  chain: {
    label: () => t("Chain", "Catena"),
    short: () => t("Chain", "Catena"),
    words: ["catena", "chain"],
  },
  cassette: {
    label: () => t("Cassette", "Cassetta"),
    short: () => t("Cassette", "Cassetta"),
    words: ["cassetta", "pignoni", "cassette", "pacco"],
  },
  chainring: {
    label: () => t("Chainrings", "Corona"),
    short: () => t("Chainrings", "Corona"),
    words: ["corona", "corone", "guarnitura", "chainring", "chainrings"],
  },
  padsF: {
    label: () => t("Front brake pads", "Pastiglie anteriori"),
    short: () => t("Front pads", "Pastiglie ant."),
    words: [],
  },
  padsR: {
    label: () => t("Rear brake pads", "Pastiglie posteriori"),
    short: () => t("Rear pads", "Pastiglie post."),
    words: [],
  },
  discF: {
    label: () => t("Front disc", "Disco anteriore"),
    short: () => t("Front disc", "Disco ant."),
    words: [],
  },
  discR: {
    label: () => t("Rear disc", "Disco posteriore"),
    short: () => t("Rear disc", "Disco post."),
    words: [],
  },
  tyreF: {
    label: () => t("Front tyre", "Copertone anteriore"),
    short: () => t("Front tyre", "Copertone ant."),
    words: [],
  },
  tyreR: {
    label: () => t("Rear tyre", "Copertone posteriore"),
    short: () => t("Rear tyre", "Copertone post."),
    words: [],
  },
  sealant: {
    label: () => t("Sealant", "Lattice"),
    short: () => t("Sealant", "Lattice"),
    words: ["lattice", "sealant"],
  },
  tape: {
    label: () => t("Bar tape", "Nastro manubrio"),
    short: () => t("Bar tape", "Nastro"),
    words: ["nastro", "tape"],
  },
  cables: {
    label: () => t("Cables", "Cavi"),
    short: () => t("Cables", "Cavi"),
    words: ["cavi", "guaine", "cables", "cavo"],
  },
  bb: {
    label: () => t("Bottom bracket", "Movimento centrale"),
    short: () => t("Bottom bracket", "Movimento centrale"),
    words: ["movimento", "bb"],
  },
  other: { label: () => t("Other", "Altro"), short: () => t("Other", "Altro"), words: [] },
};

/** In the order they are listed and offered. */
export const PART_ORDER: PartKind[] = [
  "chain",
  "cassette",
  "chainring",
  "padsF",
  "padsR",
  "discF",
  "discR",
  "tyreF",
  "tyreR",
  "sealant",
  "tape",
  "cables",
  "bb",
  "other",
];

/** Words for a pair, front and rear: "pastiglie" means both unless a side is said. */
const PAIRS: { words: RegExp; parts: [PartKind, PartKind] }[] = [
  {
    words: /^(?:pastiglie|pastiglia|freni|freno|pads|pad|brakes|brake|pattini)$/,
    parts: ["padsF", "padsR"],
  },
  { words: /^(?:dischi|disco|rotori|rotore|discs|disc|rotors|rotor)$/, parts: ["discF", "discR"] },
  {
    words:
      /^(?:copertone|copertoni|gomma|gomme|pneumatico|pneumatici|tubeless|tyre|tyres|tire|tires)$/,
    parts: ["tyreF", "tyreR"],
  },
];
const FRONT = /^(?:anteriore|anteriori|ant|davanti|front)$/;
const REAR = /^(?:posteriore|posteriori|post|dietro|rear|back)$/;

/** The parts some words name, and which words were used for it. */
export function partsIn(words: string[]): { parts: PartKind[]; used: Set<number> } {
  const used = new Set<number>();
  const front = words.findIndex((w) => FRONT.test(w));
  const rear = words.findIndex((w) => REAR.test(w));
  for (let i = 0; i < words.length; i++) {
    const w = words[i]!;
    const pair = PAIRS.find((p) => p.words.test(w));
    if (pair) {
      // "pastiglie freni", "gomme copertoni": every word for the same pair goes with it.
      words.forEach((x, j) => pair.words.test(x) && used.add(j));
      if (front >= 0) used.add(front);
      if (rear >= 0) used.add(rear);
      const parts =
        front >= 0 && rear < 0
          ? [pair.parts[0]]
          : rear >= 0 && front < 0
            ? [pair.parts[1]]
            : pair.parts;
      return { parts, used };
    }
    const one = PART_ORDER.find((p) => PARTS[p].words.includes(w));
    if (one) {
      used.add(i);
      // "movimento centrale", "pacco pignoni", "nastro manubrio": the second word goes with it.
      if (/^(?:centrale|pignoni|manubrio)$/.test(words[i + 1] ?? "")) used.add(i + 1);
      return { parts: [one], used };
    }
  }
  return { parts: [], used };
}

// --- which activities count where ---

export const dayOf = (a: Pick<Activity, "start_date_local">) => a.start_date_local.slice(0, 10);

export function slotOf(a: Act): Slot | null {
  if (activityKind(a) === "indoor") return "indoor";
  return sportOfActivity(a);
}

export const SLOT_LABEL: Record<Slot, () => string> = {
  ride: () => t("used for rides", "usata per le uscite"),
  indoor: () => t("used for indoor rides", "usata per le uscite al chiuso"),
  run: () => t("used for runs", "usate per le corse"),
};

/** The default gear of a slot, if any. */
export const defaultFor = (gears: Gear[], slot: Slot) =>
  gears.find((g) => g.slot === slot && g.isDefault && !g.retired) ?? null;

/** The gear an activity counts on, or null. */
export function gearOf(a: Act, gears: Gear[], ov: Overrides): Gear | null {
  if (a.id in ov) {
    const id = ov[a.id];
    return id ? (gears.find((g) => g.id === id) ?? null) : null;
  }
  const slot = slotOf(a);
  if (!slot) return null;
  const day = dayOf(a);
  const g = gears.find(
    (x) => x.slot === slot && x.isDefault && day >= x.since && (!x.retired || day <= x.retired),
  );
  return g ?? null;
}

/** Every gear's activities, by gear id. */
export function ridesByGear(acts: Act[], gears: Gear[], ov: Overrides): Map<string, Act[]> {
  const out = new Map<string, Act[]>(gears.map((g) => [g.id, []]));
  for (const a of acts) {
    const g = gearOf(a, gears, ov);
    if (g) out.get(g.id)!.push(a);
  }
  return out;
}

const kmOf = (rides: Act[]) => rides.reduce((s, a) => s + (a.distance ?? 0), 0) / 1000;

export const gearKm = (g: Gear, rides: Act[]) => g.startKm + kmOf(rides);

/** The gear's km up to and including a day: what a log entry says it had. */
export const kmAt = (g: Gear, rides: Act[], day: string) =>
  g.startKm + kmOf(rides.filter((a) => dayOf(a) <= day));

export const componentKm = (c: Component, rides: Act[]) =>
  (c.fittedKm ?? 0) +
  kmOf(rides.filter((a) => dayOf(a) >= c.fitted && (!c.removed || dayOf(a) < c.removed)));

/** The one on the bike now. */
export const current = (g: Gear, part: PartKind) =>
  g.components.find((c) => c.part === part && !c.removed) ?? null;

export const lastWash = (g: Gear) =>
  g.events
    .filter((e) => e.kind === "wash")
    .map((e) => e.date)
    .sort()
    .at(-1) ?? null;

/** Km since the last wash (rides after its day); null if never washed. */
export function kmSinceWash(g: Gear, rides: Act[]) {
  const w = lastWash(g);
  return w == null ? null : kmOf(rides.filter((a) => dayOf(a) > w));
}

/** Within 10% of the interval: nearly due. */
export const DUE = 0.9;
export const wearRatio = (km: number, interval?: number | null) =>
  interval ? km / interval : null;

export type Due = { label: string; km: number; interval: number; part: PartKind | null };

/** What is nearly due or past, worst first. */
export function dueOn(g: Gear, rides: Act[]): Due[] {
  if (g.kind === "shoes") {
    const km = gearKm(g, rides);
    return g.intervalKm && km / g.intervalKm >= DUE
      ? [{ label: g.name, km, interval: g.intervalKm, part: null }]
      : [];
  }
  return g.components
    .filter((c) => !c.removed && c.intervalKm)
    .map((c) => ({
      label: PARTS[c.part].label(),
      km: componentKm(c, rides),
      interval: c.intervalKm!,
      part: c.part,
    }))
    .filter((d) => d.km / d.interval >= DUE)
    .sort((a, b) => b.km / b.interval - a.km / a.interval);
}

export type Life = {
  part: PartKind;
  label: string;
  current: { km: number; interval: number | null; component: Component } | null;
  /** The ones before, newest first. */
  past: { km: number; component: Component }[];
  /** The mean of the past ones, from two on. */
  usual: number | null;
};

/** For each part followed on a bike, the one on it now and the ones before. */
export function lifetimes(g: Gear, rides: Act[]): Life[] {
  return PART_ORDER.flatMap((part) => {
    const all = g.components.filter((c) => c.part === part);
    if (!all.length) return [];
    const now = all.find((c) => !c.removed) ?? null;
    const past = all
      .filter((c) => c.removed)
      .sort((a, b) => b.fitted.localeCompare(a.fitted))
      .map((c) => ({ km: componentKm(c, rides), component: c }));
    return [
      {
        part,
        label: PARTS[part].label(),
        current: now
          ? { km: componentKm(now, rides), interval: now.intervalKm ?? null, component: now }
          : null,
        past,
        usual: past.length >= 2 ? past.reduce((s, p) => s + p.km, 0) / past.length : null,
      },
    ];
  });
}

/** Shoes: the retired pairs, newest first, for how long a pair lasts. */
export function shoeHistory(gears: Gear[], byGear: Map<string, Act[]>, except: string) {
  return gears
    .filter((g) => g.kind === "shoes" && g.retired && g.id !== except)
    .sort((a, b) => (b.retired ?? "").localeCompare(a.retired ?? ""))
    .map((g) => ({ name: g.name, km: gearKm(g, byGear.get(g.id) ?? []) }));
}

// --- changes (each returns the gear as it is after) ---

const touch = (g: Gear, now: number): Gear => ({ ...g, updatedAt: now });

export function addEvent(g: Gear, e: Omit<GearEvent, "id">, now = Date.now()): Gear {
  const ev: GearEvent = { id: newId(), ...e };
  if (!ev.note) delete ev.note;
  if (!ev.part) delete ev.part;
  return touch({ ...g, events: [...g.events, ev] }, now);
}

/**
 * The part on now comes off that day and a new one goes on; it keeps the old interval unless given one. With nothing on
 * yet, it simply starts being followed. Always logged.
 */
export function replacePart(
  g: Gear,
  part: PartKind,
  date: string,
  opts: { name?: string; intervalKm?: number | null; note?: string } = {},
  now = Date.now(),
): Gear {
  const old = current(g, part);
  const comps = g.components.map((c) => (c === old ? { ...c, removed: date } : c));
  const fresh: Component = { id: newId(), part, fitted: date };
  if (opts.name) fresh.name = opts.name;
  const interval = opts.intervalKm !== undefined ? opts.intervalKm : (old?.intervalKm ?? null);
  if (interval) fresh.intervalKm = interval;
  const note = opts.note ?? opts.name;
  return addEvent(
    { ...g, components: [...comps, fresh] },
    { date, kind: "replace", part, ...(note ? { note } : {}) },
    now,
  );
}

/**
 * A log entry out. A replacement takes its part back with it: the one fitted that day goes, the one it replaced is on
 * again. Only while it's still the latest of its part; otherwise the entry just goes.
 */
export function removeEvent(g: Gear, id: string, now = Date.now()): Gear {
  const e = g.events.find((x) => x.id === id);
  if (!e) return g;
  let components = g.components;
  if (e.kind === "replace" && e.part) {
    const on = current(g, e.part);
    if (on && on.fitted === e.date) {
      components = components
        .filter((c) => c !== on)
        .map((c) => (c.part === e.part && c.removed === e.date ? { ...c, removed: null } : c));
    }
  }
  return touch({ ...g, components, events: g.events.filter((x) => x !== e) }, now);
}

/** Start following a part already on the bike, which has done some km. */
export function trackPart(
  g: Gear,
  part: PartKind,
  fitted: string,
  fittedKm: number,
  intervalKm: number | null,
  now = Date.now(),
): Gear {
  const c: Component = { id: newId(), part, fitted };
  if (fittedKm) c.fittedKm = fittedKm;
  if (intervalKm) c.intervalKm = intervalKm;
  return touch({ ...g, components: [...g.components, c] }, now);
}

export function updateComponent(
  g: Gear,
  id: string,
  patch: Partial<Component>,
  now = Date.now(),
): Gear {
  return touch(
    { ...g, components: g.components.map((c) => (c.id === id ? { ...c, ...patch } : c)) },
    now,
  );
}

/** The gear that changes when one becomes the default of its slot: it, and the one that was. */
export function makeDefault(gears: Gear[], id: string, now = Date.now()): Gear[] {
  const g = gears.find((x) => x.id === id);
  if (!g) return [];
  return gears
    .filter((x) => x.slot === g.slot && (x.id === id ? !x.isDefault : x.isDefault))
    .map((x) => touch({ ...x, isDefault: x.id === id }, now));
}

export function newGear(
  p: Pick<Gear, "name" | "kind" | "slot"> &
    Partial<Pick<Gear, "frame" | "startKm" | "since" | "intervalKm">>,
  gears: Gear[],
  today: string,
  now = Date.now(),
): Gear {
  const g: Gear = {
    id: newId(),
    name: p.name.trim(),
    kind: p.kind,
    slot: p.slot,
    // The first of its slot is its default: what most people mean by "my bike".
    isDefault: !defaultFor(gears, p.slot),
    startKm: p.startKm ?? 0,
    since: p.since ?? today,
    components: [],
    events: [],
    updatedAt: now,
  };
  if (p.kind === "bike") g.frame = p.frame ?? "road";
  if (p.intervalKm) g.intervalKm = p.intervalKm;
  return g;
}

// --- words ---

export const kmText = (km: number) => `${num(Math.round(km))} km`;
export const dayText = (day: string) => format(parseISO(day), "d MMM yyyy");

export const GEAR_KIND_LABEL: Record<GearKind, () => string> = {
  bike: () => t("Bikes", "Bici"),
  shoes: () => t("Shoes", "Scarpe"),
};

export const FRAME_LABEL: Record<Frame, () => string> = {
  road: () => t("Road", "Strada"),
  gravel: () => "Gravel",
  mtb: () => "MTB",
  tt: () => t("TT / triathlon", "Crono / triathlon"),
};

export const EVENT_LABEL: Record<EventKind, () => string> = {
  wash: () => t("Wash", "Lavaggio"),
  replace: () => t("Replacement", "Sostituzione"),
  service: () => t("Service", "Tagliando"),
  note: () => t("Note", "Nota"),
};

/** A log entry's title: "Sostituzione · Catena", "Lavaggio". */
export function eventTitle(e: GearEvent) {
  if ((e.kind === "replace" || e.kind === "service") && e.part)
    return `${EVENT_LABEL[e.kind]()} · ${PARTS[e.part].label()}`;
  return EVENT_LABEL[e.kind]();
}

/** Words too common to name a gear by, even when they're in its name ("Bici dei rulli"). */
const NAME_STOP = new Set(
  "bici bike bikes scarpe scarpa shoes shoe la il le lo dei di del della con sulla sulle the my mia mie".split(
    " ",
  ),
);

/** Matching a typed gear name: every typed word is in the name, or the name's first word was typed. */
export function gearNamed(
  gears: Gear[],
  words: string[],
): { gear: Gear; used: Set<number> } | null {
  const fold = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .split(/[^a-z0-9]+/)
      .filter(Boolean);
  let best: { gear: Gear; used: Set<number> } | null = null;
  for (const g of gears) {
    const name = fold(g.name);
    const used = new Set<number>();
    words.forEach((w, i) => {
      if (NAME_STOP.has(w)) return;
      if (w.length >= 3 && name.some((n) => n === w || (w.length >= 4 && n.startsWith(w))))
        used.add(i);
      else if (/^\d+$/.test(w) && name.includes(w)) used.add(i);
    });
    if (used.size && (!best || used.size > best.used.size)) best = { gear: g, used };
  }
  return best;
}
