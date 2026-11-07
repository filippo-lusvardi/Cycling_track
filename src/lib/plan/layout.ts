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

export function longRide(seconds: number, indoor: boolean) {
  const main = Math.round((seconds - 25 * 60) / 60);
  return made(
    `plan-long-${seconds / 60}`,
    t(`Oak ${hms(seconds)}`, `Quercia ${hms(seconds)}`),
    "endurance",
    `${t("An oak does one thing, steadily, for a long time. A long, steady ride in Z2: eat and drink as you go.", "La quercia fa una cosa sola, con calma, per molto tempo. Uscita lunga e regolare in Z2: mangia e bevi lungo la strada.")}\n\nWarmup\n- 15m Ramp 45-65%\n\nMain set\n- ${main}m 65%\n\nCooldown\n- 10m Ramp 60-45%`,
    indoor,
  );
}

export function easyRide(seconds: number, indoor: boolean) {
  const main = Math.round((seconds - 15 * 60) / 60);
  return made(
    `plan-easy-${seconds / 60}`,
    t(`Hazel ${hms(seconds)}`, `Nocciolo ${hms(seconds)}`),
    "endurance",
    `${t("Hazel grows at the forest edge, modest and everyday. An easy ride in Z2, at talking pace.", "Il nocciolo cresce al margine del bosco, senza pretese. Uscita facile in Z2, a ritmo da chiacchiera.")}\n\nWarmup\n- 10m Ramp 45-60%\n\nMain set\n- ${main}m 65%\n\nCooldown\n- 5m Ramp 60-45%`,
    indoor,
  );
}

export function recoveryRide(seconds: number, indoor: boolean) {
  return made(
    `plan-recovery-${seconds / 60}`,
    t(`Fern ${hms(seconds)}`, `Felce ${hms(seconds)}`),
    "recovery",
    `${t("Ferns grow low, in the shade. True recovery at 50% FTP: it should feel too easy.", "La felce cresce bassa, all'ombra. Vero recupero al 50% FTP: deve sembrare fin troppo facile.")}\n\nMain set\n- ${Math.round(seconds / 60)}m 50%`,
    indoor,
  );
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

function hardSessions(phase: Phase, recovery: boolean, state: PlanState, availableDays: number) {
  if (recovery || phase === "base" || phase === "taper" || availableDays < 3) return 1;
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

export function layoutWeek(input: LayoutInput): PlannedDay[] {
  const { today, shape, settings, state, taken, off, races, pool, focus } = input;
  const dates = Array.from({ length: 7 }, (_, i) => addDays(shape.monday, i));
  const out = new Map<string, PlannedDay>(
    dates.map((date) => [date, { date, role: "rest", workout: null }]),
  );
  const at = (date: string) => settings.week[dates.indexOf(date)]!;
  const set = (date: string, role: PlannedDay["role"], workout: PlanWorkout | null = null) =>
    out.set(date, { date, role, workout });
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
      if (seconds >= SHORTEST_RIDE) set(date, "easy", recoveryRide(seconds, at(date).indoor));
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
    const seconds = floorQuarter(Math.min(at(date).minutes * 60, target * share, longest));
    if (seconds < SHORTEST_LONG) continue;
    set(date, "long", longRide(seconds, at(date).indoor));
    used += seconds;
    longPlaced.push(date);
  }

  // Hard sessions: as far as possible from each other and from the long rides.
  const weekIndex = Math.floor(daysApart(state.cycleStart, shape.monday) / 7);
  const kinds = kindsFor(shape.phase, focus, weekIndex);
  const wantHard =
    hardSessions(shape.phase, shape.recovery, state, open.length) -
    taken.filter((d) => d.hard && dates.includes(d.date)).length;
  const doses = dosesFor(shape, state.doses);
  const hardPlaced: string[] = [];
  const free = () => open.filter((d) => out.get(d)!.role === "rest");
  // With so few days there's no room to keep a hard session away from the long ride.
  const longMayTouch = open.length <= 2;
  for (let i = 0; i < Math.max(0, wantHard); i++) {
    const kind = kinds[i % kinds.length]!;
    const ladder = ladderFor(pool, kind, raceAhead, input.th ?? {});
    const spaced = free().filter(
      (d) =>
        [...hardDays, ...hardPlaced].every((h) => daysApart(h, d) >= state.hardGap) &&
        (longMayTouch || longPlaced.every((l) => daysApart(l, d) >= 2)),
    );
    const score = (d: string) => {
      const others = [...hardPlaced, ...longPlaced];
      const room = others.length ? Math.min(...others.map((o) => daysApart(o, d))) : 3;
      return Math.min(room, 3) + (at(d).indoor ? 0.5 : 0) - dates.indexOf(d) * 0.01;
    };
    const best = [...spaced]
      .filter((d) => pickRung(ladder, doses[kind], at(d).minutes * 60))
      .sort((a, b) => score(b) - score(a))[0];
    if (!best) continue;
    const rung = pickRung(ladder, doses[kind], at(best).minutes * 60, input.recentIds)!;
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
  }

  // Easy rides with the time that's left. C: a week always has a day with nothing in it.
  let easy = free();
  const noRestDay = dates.every((d) => out.get(d)!.role !== "rest" || open.includes(d));
  if (noRestDay && easy.length) {
    const shortest = [...easy].sort((a, b) => at(a).minutes - at(b).minutes)[0]!;
    easy = easy.filter((d) => d !== shortest);
  }
  easy.forEach((date, i) => {
    const left = target - used;
    const each = left / (easy.length - i);
    const seconds = floorQuarter(Math.min(at(date).minutes * 60, Math.max(each, SHORTEST_RIDE)));
    if (seconds < SHORTEST_RIDE || left < SHORTEST_RIDE) return;
    const afterHard = hardPlaced.includes(addDays(date, -1));
    const indoor = at(date).indoor;
    const w =
      afterHard && seconds <= RECOVERY_RIDE
        ? recoveryRide(seconds, indoor)
        : easyRide(seconds, indoor);
    set(date, "easy", w);
    used += seconds;
  });
  return dates.map((d) => out.get(d)!);
}
