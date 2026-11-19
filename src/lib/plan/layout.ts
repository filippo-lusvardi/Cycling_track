// A week inside the time someone has: rest days first, then long rides, then hard sessions spaced apart, then easy rides up
// to the week's size. Pure and deterministic. The size and spacing numbers are conventions (C), kept here to be changed.
import { dayRole } from "../focus";
import type { Race } from "../races";
import type { SuggestWorkout } from "../suggest";
import { t } from "../i18n";
import { addDays } from "../training";
import { estimateLoad, parseWorkout, type Thresholds } from "../workout";
import type { Focus } from "../races";
import type { WeekShape } from "./phase";
import { ladderFor, pickRung } from "./ladder";
import type {
  DoseKind,
  Doses,
  Phase,
  PlanSettings,
  PlanState,
  PlannedDay,
  PlanWorkout,
} from "./types";

const RECOVERY_SIZE = 0.65;
const RECOVERY_DOSE = 0.7;
const TAPER_SIZE = 0.5;
const TAPER_DOSE = 0.6;
/** "Stay healthy" keeps the sessions and asks for less time around them. */
const HEALTHY_SIZE = 0.6;
const LONG_SHARE = 0.4;
const TWO_LONG_SHARE = 0.3;
/** A long ride grows from your own longest. */
const LONG_GROWTH = 1.15;
const LONG_WITH_NO_HISTORY = 90 * 60;
const SHORTEST_LONG = 60 * 60;
const SHORTEST_RIDE = 30 * 60;
/** Up to this long, an easy day after a hard one is a recovery ride. */
const RECOVERY_RIDE = 45 * 60;
const AFTER_RACE = 45 * 60;
const QUARTER = 15 * 60;
/** C: the shortest easy ride worth the trouble, outdoors and on the trainer. */
const MIN_OUTDOOR = 60 * 60;
const MIN_INDOOR = 45 * 60;
/** C: under this, a week keeps two days with nothing in them. */
const SHORT_WEEK = 4 * 3600;

const floorQuarter = (s: number) => Math.floor(s / QUARTER) * QUARTER;

export type TakenDay = {
  date: string;
  seconds: number;
  hard: boolean;
  /** A long ride already there: hard sessions keep away from it too. */
  long?: boolean | undefined;
};

export type LayoutInput = {
  today: string;
  shape: WeekShape;
  settings: PlanSettings;
  state: PlanState;
  focus: Focus;
  pool: SuggestWorkout[];
  races: Race[];
  /** Rides already done, and things on the calendar that aren't the plan's. They count, and the plan works around them. */
  taken: TakenDay[];
  /** Sick or injured. */
  off: ReadonlySet<string>;
  /** Hard days from the days before this week. */
  recentHard: string[];
  recentIds?: ReadonlySet<string>;
  longestSeconds: number;
  th?: Thresholds;
  /** A season's say in how much of the week the long ride takes. */
  longShare?: number | undefined;
  /** A season's race workouts are wanted even before a race has a date. */
  raceAhead?: boolean | undefined;
};

const hms = (s: number) => {
  const m = Math.round(s / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60}` : ""}`;
};

const typeOf = (indoor: boolean) => (indoor ? "VirtualRide" : "Ride");

function made(
  id: string,
  name: string,
  kind: PlanWorkout["kind"],
  description: string,
  indoor: boolean,
): PlanWorkout {
  const parsed = parseWorkout(description, "ride");
  return {
    id,
    name,
    kind,
    type: typeOf(indoor),
    description,
    seconds: parsed.totalSeconds,
    load: estimateLoad(parsed.blocks),
  };
}

/** Indoors time drags and steady power is easy to hold: rides there stay short and keep changing (Filippo's rule). */
export const INDOOR_MAX = 75 * 60;
/** Outdoors, hills, wind and traffic decide the power from one moment to the next: only the average can be aimed at. */
const OUTDOOR = {
  long: { low: 56, high: 75 },
  easy: { low: 56, high: 72 },
  mean: 65,
  climb: 85,
};

const watts = (pct: number, ftp: number | null | undefined) =>
  ftp ? ` (≈ ${Math.round((ftp * pct) / 100)} W)` : "";

/** The line that goes with a range step outdoors: the average to aim for, and where not to go on a climb. */
function outdoorGoal(range: { low: number; high: number }, ftp: number | null | undefined) {
  return t(
    `Ride by feel and keep the average around ${OUTDOOR.mean}% FTP${watts(OUTDOOR.mean, ftp)}: anywhere in ${range.low}-${range.high}% is fine. On climbs stay under ${OUTDOOR.climb}%${watts(OUTDOOR.climb, ftp)}. Downhills and stops don't matter.`,
    `Vai a sensazione e tieni la media intorno al ${OUTDOOR.mean}% FTP${watts(OUTDOOR.mean, ftp)}: va bene tutto tra ${range.low} e ${range.high}%. In salita resta sotto l'${OUTDOOR.climb}%${watts(OUTDOOR.climb, ftp)}. Discese e soste non contano.`,
  );
}

/** Z2 in small waves, so a trainer in ERG never sits on one number for long. */
function waves(minutes: number) {
  const cycles = Math.floor(minutes / 12);
  const rest = minutes - cycles * 12;
  const set = cycles
    ? `Main set${cycles > 1 ? ` ${cycles}x` : ""}\n- 3m 62%\n- 3m 68%\n- 3m 71%\n- 3m 65%`
    : "Main set";
  return rest ? `${set}\n\n- ${rest}m 66%` : set;
}

export function longRide(seconds: number, indoor: boolean, ftp?: number | null) {
  const intro = t(
    "An oak does one thing, steadily, for a long time. A long ride in Z2: eat and drink as you go.",
    "La quercia fa una cosa sola, con calma, per molto tempo. Uscita lunga in Z2: mangia e bevi lungo la strada.",
  );
  const { low, high } = OUTDOOR.long;
  return made(
    `plan-long-${seconds / 60}`,
    t(`Oak ${hms(seconds)}`, `Quercia ${hms(seconds)}`),
    "endurance",
    indoor
      ? `${intro}\n\nWarmup\n- 10m Ramp 45-62%\n\n${waves(Math.round(seconds / 60) - 15)}\n\nCooldown\n- 5m Ramp 60-45%`
      : `${intro} ${outdoorGoal(OUTDOOR.long, ftp)}\n\nMain set\n- ${Math.round(seconds / 60)}m ${low}-${high}%`,
    indoor,
  );
}

/** What an outdoor easy ride pays attention to, in turn through the week: the power range stays the same. */
export const EASY_FOCUS = ["", "cadence", "seated"] as const;
export type EasyFocus = (typeof EASY_FOCUS)[number];

const focusLine = (focus: EasyFocus) =>
  focus === "cadence"
    ? t(
        " On the flats spin a little quicker than usual, around 95 rpm, without raising the power.",
        " In pianura gira un po' più agile del solito, intorno a 95 rpm, senza alzare la potenza.",
      )
    : focus === "seated"
      ? t(
          " Ride the climbs seated, with a lower cadence you can still turn smoothly.",
          " Fai le salite da seduto, con una cadenza più bassa ma ancora rotonda.",
        )
      : "";

/** The focus in the name too, so days next to each other read differently on the calendar and the device. */
const focusName = (focus: EasyFocus) =>
  focus === "cadence"
    ? t(" · spin", " · agile")
    : focus === "seated"
      ? t(" · seated", " · seduto")
      : "";

export function easyRide(
  seconds: number,
  indoor: boolean,
  ftp?: number | null,
  focus: EasyFocus = "",
) {
  const intro = t(
    "Hazel grows at the forest edge, modest and everyday. An easy ride in Z2, at talking pace.",
    "Il nocciolo cresce al margine del bosco, senza pretese. Uscita facile in Z2, a ritmo da chiacchiera.",
  );
  const { low, high } = OUTDOOR.easy;
  const outdoorFocus = indoor ? "" : focus;
  return made(
    `plan-easy-${seconds / 60}${outdoorFocus ? `-${outdoorFocus}` : ""}`,
    t(`Hazel ${hms(seconds)}`, `Nocciolo ${hms(seconds)}`) + focusName(outdoorFocus),
    "endurance",
    indoor
      ? `${intro}\n\nWarmup\n- 10m Ramp 45-62%\n\n${waves(Math.round(seconds / 60) - 15)}\n\nCooldown\n- 5m Ramp 60-45%`
      : `${intro} ${outdoorGoal(OUTDOOR.easy, ftp)}${focusLine(outdoorFocus)}\n\nMain set\n- ${Math.round(seconds / 60)}m ${low}-${high}%`,
    indoor,
  );
}

export function recoveryRide(seconds: number, indoor: boolean) {
  const minutes = Math.round(seconds / 60);
  const intro = t(
    "Ferns grow low, in the shade. True recovery around 50% FTP: it should feel too easy.",
    "La felce cresce bassa, all'ombra. Vero recupero intorno al 50% FTP: deve sembrare fin troppo facile.",
  );
  const cycles = Math.floor(minutes / 6);
  const rest = minutes - cycles * 6;
  const main = indoor
    ? `Main set ${cycles}x\n- 3m 48%\n- 3m 54%${rest ? `\n\n- ${rest}m 50%` : ""}`
    : `Main set\n- ${minutes}m 45-58%`;
  return made(
    `plan-recovery-${minutes}`,
    t(`Fern ${hms(seconds)}`, `Felce ${hms(seconds)}`),
    "recovery",
    `${intro}\n\n${main}`,
    indoor,
  );
}

/** Workouts made for the trainer: they change every few minutes. The tri-bike and specialist ones aren't for every week. */
const INDOOR_ENDURANCE = /^d-(endurance-surges|cadence-drills|endurance-tempo|endurance-flow)-/;
const INDOOR_RECOVERY = /^d-recovery-spin-/;

/**
 * The longest library workout of this kind that fits, turning away from what this week already has, then from what was
 * ridden lately. Null when none fits, or when all of them are already in the week: the plan's own ride, in waves, takes
 * its turn before anything repeats (C: a week with the same workout day after day is monotonous, Foster 1998).
 */
export function indoorPick(
  pool: SuggestWorkout[],
  seconds: number,
  kind: "endurance" | "recovery",
  recentIds: ReadonlySet<string> = new Set(),
  used: readonly string[] = [],
): PlanWorkout | null {
  const like = kind === "recovery" ? INDOOR_RECOVERY : INDOOR_ENDURANCE;
  const fits = pool.filter(
    (w) => !w.mine && like.test(w.id) && w.seconds <= Math.min(seconds, INDOOR_MAX),
  );
  if (!fits.length) return null;
  const longest = Math.max(...fits.map((w) => w.seconds));
  // The longest first; one up to a quarter of an hour shorter takes its turn when the longest is in the week or was ridden lately.
  const near = fits
    .filter((w) => w.seconds >= longest - QUARTER)
    .sort((a, b) => b.seconds - a.seconds || a.id.localeCompare(b.id));
  const fresh = near.filter((x) => !used.includes(x.id));
  const w = fresh.find((x) => !recentIds.has(x.id)) ?? fresh[0];
  if (!w) return null;
  return {
    id: w.id,
    name: w.name,
    type: "VirtualRide",
    description: w.description,
    seconds: w.seconds,
    load: w.load,
    kind: w.kind,
  };
}

/** What the hard sessions work on, in order. I: formats rotate, since none clearly wins. */
function kindsFor(phase: Phase, focus: Focus, weekNumber: number): DoseKind[] {
  const swap = <T>(pair: [T, T]) => (weekNumber % 2 ? ([pair[1], pair[0]] as [T, T]) : pair);
  if (phase === "base") return ["tempo", "threshold"];
  if (phase === "maintain") return swap(["threshold", "vo2"]);
  if (phase === "specific" && focus === "aerobic") return ["threshold", "vo2"];
  if (focus === "vo2") return ["vo2", "threshold"];
  // E: anaerobic work costs some aerobic gain, so it takes one session at most.
  if (focus === "anaerobic" || focus === "sprint") return ["anaerobic", "vo2"];
  return swap(["threshold", "vo2"]);
}

/** E: a taper keeps how often the hard work comes and only shortens it (Bosquet et al. 2007). */
function hardSessions(
  phase: Phase,
  recovery: boolean,
  state: PlanState,
  availableDays: number,
  raceWeek: boolean,
) {
  if (recovery || phase === "base" || availableDays < 3 || raceWeek) return 1;
  return state.hardCap;
}

function dosesFor(shape: WeekShape, doses: Doses): Doses {
  const k = shape.phase === "taper" ? TAPER_DOSE : shape.recovery ? RECOVERY_DOSE : 1;
  return Object.fromEntries(Object.entries(doses).map(([n, v]) => [n, v * k])) as Doses;
}

export function weekSeconds(shape: WeekShape, state: PlanState, settings: PlanSettings) {
  const free = settings.week.reduce((n, d) => n + d.minutes * 60, 0);
  const size =
    shape.phase === "taper"
      ? TAPER_SIZE
      : shape.recovery
        ? RECOVERY_SIZE
        : shape.phase === "maintain"
          ? HEALTHY_SIZE
          : 1;
  return Math.min(state.weeklySeconds * size, free);
}

const daysApart = (a: string, b: string) =>
  Math.abs(new Date(`${a}T12:00:00`).getTime() - new Date(`${b}T12:00:00`).getTime()) / 864e5;

/**
 * The easy time shared out by weight, never past a day's room, in quarters of an hour: what one day can't hold goes to
 * the others.
 */
export function splitEasy(
  days: string[],
  seconds: number,
  room: (d: string) => number,
  weight: (d: string) => number,
) {
  const out = new Map<string, number>();
  let open = [...days];
  let left = seconds;
  while (open.length && left > 0) {
    const sum = open.reduce((n, d) => n + weight(d), 0);
    const full = open.filter((d) => (left * weight(d)) / sum >= room(d));
    if (!full.length) {
      for (const d of open) out.set(d, (left * weight(d)) / sum);
      break;
    }
    for (const d of full) {
      out.set(d, room(d));
      left -= room(d);
    }
    open = open.filter((d) => !full.includes(d));
  }
  // Down to quarters, then the quarters that rounding lost go back where most was cut, as room allows.
  const exact = new Map(out);
  for (const [d, s] of out) out.set(d, floorQuarter(s));
  let spare = floorQuarter(seconds - [...out.values()].reduce((n, s) => n + s, 0));
  const byCut = [...days].sort(
    (a, b) => (exact.get(b) ?? 0) - (out.get(b) ?? 0) - ((exact.get(a) ?? 0) - (out.get(a) ?? 0)),
  );
  for (const d of byCut) {
    if (spare < QUARTER) break;
    if ((out.get(d) ?? 0) + QUARTER > room(d)) continue;
    out.set(d, (out.get(d) ?? 0) + QUARTER);
    spare -= QUARTER;
  }
  return out;
}

export function layoutWeek(input: LayoutInput): PlannedDay[] {
  const { today, shape, settings, state, taken, off, races, pool, focus } = input;
  const dates = Array.from({ length: 7 }, (_, i) => addDays(shape.monday, i));
  const out = new Map<string, PlannedDay>(
    dates.map((date) => [date, { date, role: "rest", workout: null }]),
  );
  const at = (date: string) => settings.week[dates.indexOf(date)]!;
  const ftp = input.th?.ftp;
  /** The time a day can hold: indoors, never more than the trainer's limit. */
  const room = (date: string) =>
    at(date).indoor ? Math.min(at(date).minutes * 60, INDOOR_MAX) : at(date).minutes * 60;
  const minRide = (date: string) => (at(date).indoor ? MIN_INDOOR : MIN_OUTDOOR);
  /** The workouts this layout has placed, so the week doesn't repeat itself. */
  const placedIds: string[] = [];
  let easyFocus = Math.floor(daysApart(state.cycleStart, shape.monday) / 7);
  const recovery = (date: string, seconds: number) =>
    (at(date).indoor && indoorPick(pool, seconds, "recovery", input.recentIds, placedIds)) ||
    recoveryRide(seconds, at(date).indoor);
  const endurance = (date: string, seconds: number, long: boolean) => {
    const picked =
      at(date).indoor && indoorPick(pool, seconds, "endurance", input.recentIds, placedIds);
    if (picked) return picked;
    if (long) return longRide(seconds, at(date).indoor, ftp);
    const focus = at(date).indoor ? "" : EASY_FOCUS[easyFocus++ % EASY_FOCUS.length]!;
    return easyRide(seconds, at(date).indoor, ftp, focus);
  };
  const set = (date: string, role: PlannedDay["role"], workout: PlanWorkout | null = null) => {
    if (workout) placedIds.push(workout.id);
    out.set(date, { date, role, workout });
  };
  const takenOn = new Map(taken.map((d) => [d.date, d]));
  const hardDays = [
    ...input.recentHard,
    ...taken.filter((d) => d.hard && d.date >= shape.monday).map((d) => d.date),
  ];
  let used = taken.filter((d) => dates.includes(d.date)).reduce((n, d) => n + d.seconds, 0);

  // What's settled: the past, races, what's already there. Anything else with time free is open.
  const open: string[] = [];
  const raceAhead = !!input.raceAhead || races.some((r) => r.date >= today);
  for (const date of dates) {
    const role = dayRole(races, date);
    if (date < today) set(date, "past");
    else if (role?.role === "race") set(date, "race");
    else if (takenOn.has(date)) set(date, "taken");
    else if (off.has(date) || at(date).minutes === 0) set(date, "rest");
    else if (role?.role === "recovery" || role?.role === "ease") {
      const seconds = Math.min(AFTER_RACE, at(date).minutes * 60);
      if (seconds >= SHORTEST_RIDE) set(date, "easy", recovery(date, seconds));
      used += seconds >= SHORTEST_RIDE ? seconds : 0;
    } else if (role?.role === "sharpen" && role.days === 1) {
      const opener = pool.find((w) => !w.mine && /opener/.test(w.id));
      const fits = opener && opener.seconds <= at(date).minutes * 60;
      if (fits) set(date, "easy", { ...opener, type: typeOf(at(date).indoor) });
    } else open.push(date);
  }

  const target = weekSeconds(shape, state, settings);

  // Long rides, on the days chosen for them.
  const longs = open.filter((d) => at(d).long);
  const longest = input.longestSeconds ? input.longestSeconds * LONG_GROWTH : LONG_WITH_NO_HISTORY;
  const share = longs.length > 1 ? TWO_LONG_SHARE : (input.longShare ?? LONG_SHARE);
  const longPlaced: string[] = taken.filter((d) => d.long).map((d) => d.date);
  for (const date of longs) {
    const seconds = floorQuarter(Math.min(room(date), target * share, longest));
    if (seconds < SHORTEST_LONG) continue;
    const w = endurance(date, seconds, true);
    set(date, "long", w);
    used += w.seconds;
    longPlaced.push(date);
  }

  // Hard sessions: as far as possible from each other and from the long rides.
  const weekIndex = Math.floor(daysApart(state.cycleStart, shape.monday) / 7);
  const kinds = kindsFor(shape.phase, focus, weekIndex);
  const raceWeek = races.some((r) => dates.includes(r.date));
  const wantHard =
    hardSessions(shape.phase, shape.recovery, state, open.length, raceWeek) -
    taken.filter((d) => d.hard && dates.includes(d.date)).length;
  const doses = dosesFor(shape, state.doses);
  const hardPlaced: string[] = [];
  const anaerobicOn: string[] = [];
  const free = () => open.filter((d) => out.get(d)!.role === "rest");
  // With so few days there's no room to keep a hard session away from the long ride.
  const longMayTouch = open.length <= 2;
  for (let i = 0; i < Math.max(0, wantHard); i++) {
    const kind = kinds[i % kinds.length]!;
    const ladder = ladderFor(pool, kind, raceAhead, input.th ?? {});
    // I: sprint-type work can leave power down for up to 72 h, so it keeps a day more from other hard work.
    const gapFrom = (h: string) =>
      kind === "anaerobic" || anaerobicOn.includes(h) ? Math.max(3, state.hardGap) : state.hardGap;
    const spaced = free().filter(
      (d) =>
        [...hardDays, ...hardPlaced].every((h) => daysApart(h, d) >= gapFrom(h)) &&
        (longMayTouch || longPlaced.every((l) => daysApart(l, d) >= 2)),
    );
    const score = (d: string) => {
      const others = [...hardPlaced, ...longPlaced];
      const room = others.length ? Math.min(...others.map((o) => daysApart(o, d))) : 3;
      return Math.min(room, 3) + (at(d).indoor ? 0.5 : 0) - dates.indexOf(d) * 0.01;
    };
    const best = [...spaced]
      .filter((d) => pickRung(ladder, doses[kind], room(d)))
      .sort((a, b) => score(b) - score(a))[0];
    if (!best) continue;
    const rung = pickRung(ladder, doses[kind], room(best), input.recentIds)!;
    const w = rung.workout;
    set(best, "hard", {
      id: w.id,
      name: w.name,
      type: typeOf(at(best).indoor),
      description: w.description,
      seconds: w.seconds,
      load: w.load,
      kind: w.kind,
    });
    used += w.seconds;
    hardPlaced.push(best);
    if (kind === "anaerobic") anaerobicOn.push(best);
  }

  // Easy rides with the time that's left. The time someone has is the most they can ride, not a quota: the easy time goes
  // into the fewest rides that hold it, and the other free days stay rest (I: with the load matched, how many days it's
  // spread over matters little, Sylta et al. 2016). C: a week always has a day with nothing in it, two when it's short.
  const free0 = free();
  const restDays = dates.filter((d) => out.get(d)!.role === "rest" && !free0.includes(d)).length;
  const restWanted = target < SHORT_WEEK ? 2 : 1;
  const mayUse = Math.max(0, free0.length - Math.max(0, restWanted - restDays));
  // An easy ride is never longer than a long ride could be: it grows from your own longest too.
  const easyRoom = (d: string) => Math.min(room(d), floorQuarter(longest));
  const afterHard = (d: string) =>
    [...hardDays, ...hardPlaced].includes(addDays(d, -1)) || longPlaced.includes(addDays(d, -1));
  const ranked = [...free0].sort(
    (a, b) =>
      Number(afterHard(a)) - Number(afterHard(b)) ||
      easyRoom(b) - easyRoom(a) ||
      a.localeCompare(b),
  );
  const left = target - used;
  // E: a taper keeps how often you ride, so it rides on as many days as a full week would (Bosquet et al. 2007).
  const countFor =
    shape.phase === "taper" ? Math.max(left, state.weeklySeconds - (target - left)) : left;
  let count = 0;
  for (let held = 0; count < Math.min(ranked.length, mayUse) && held < countFor; count++)
    held += easyRoom(ranked[count]!);
  // No ride shorter than is worth getting changed for: fewer, longer rides instead.
  while (count > 1 && left / count < minRide(ranked[count - 1]!)) count--;
  const chosen = ranked.slice(0, count);
  const lengths = splitEasy(chosen, left, easyRoom, (d) =>
    afterHard(d) ? 0.6 : d === chosen[0] ? 1 : 0.8,
  );
  for (const date of [...chosen].sort()) {
    const seconds = lengths.get(date) ?? 0;
    if (seconds < SHORTEST_RIDE) continue;
    const w =
      afterHard(date) && seconds <= RECOVERY_RIDE
        ? recovery(date, seconds)
        : endurance(date, seconds, false);
    set(date, "easy", w);
    used += w.seconds;
  }
  return dates.map((d) => out.get(d)!);
}
