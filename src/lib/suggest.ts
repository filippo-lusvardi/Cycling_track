// Which workout fits a day, or a whole week: real ones, from your library and the starter set, chosen from how today
// reads, the block you're in, what's already planned and what the last days were. Nothing here writes or remembers:
// the same input always gives the same answer.
//
// The rules' reasons and sources are in Docs/workout-suggestions-evidence.md. Tags below: E evidence, I inference from
// evidence, C coaching convention. Conventions are welcome here, and free to change; they just aren't findings.
import { getDay, parseISO } from "date-fns";
import { format, t } from "./i18n";
import { isFreeRide, isPlanned, type Activity, type PlannedEvent } from "./intervals";
import { formatPace } from "./pace";
import { dayRole } from "./focus";
import { raceSport, type Focus, type Race } from "./races";
import { loadCheck, recommendation } from "./readiness";
import { isSport, sportOfActivity, type MainSport } from "./sport";
import { addDays } from "./training";
import { offEventOn } from "./tree";
import { estimateLoad, parseWorkout, type ParsedWorkout, type Thresholds } from "./workout";
import {
  kindLabel,
  workoutTemplates,
  workoutText,
  type WorkoutKind,
  type WorkoutTemplate,
} from "./workout-templates";

export type SuggestWorkout = {
  id: string;
  name: string;
  type: string;
  description: string;
  seconds: number;
  load: number;
  kind: WorkoutKind;
  focus?: Focus;
  /** From your own library. */
  mine: boolean;
};

/** What a day asks for, from lightest to hardest; "off", "race" and "rest" have no workout to offer of their own. */
export type DayAsk =
  | "off"
  | "race"
  | "rest"
  | "easy"
  | "steady"
  | "tempo"
  | "quality"
  | "long"
  /** A taper's short hard session: the volume goes, the intensity stays. */
  | "sharp"
  /** The day before a race. */
  | "opener";

export type SuggestInput = {
  today: string;
  sport: MainSport;
  focus: Focus;
  races: Race[];
  /** Everything on the calendar from today on. */
  events: PlannedEvent[];
  offEvents: PlannedEvent[];
  acts: Activity[];
  wellness: Parameters<typeof loadCheck>[0];
  /** Today's readiness and form, the crown's. */
  score: number | null;
  form: number | null;
  pool: SuggestWorkout[];
  th: Thresholds;
  /** This morning's parts of the crown, 0–100, separately from their average. */
  feel?: number | null | undefined;
  sleep?: number | null | undefined;
  /** Latest weight, kg. */
  weight?: number | null | undefined;
  /** When the current block began; null when you chose it yourself. */
  blockSince?: string | null | undefined;
  /** The focus is one you pinned, not one worked out. */
  focusPinned?: boolean | undefined;
};

export type SuggestPick = {
  workout: SuggestWorkout;
  why: string;
  /** "290–305 W", "4:10/km": the main set in your own numbers; null when the workout names none. */
  target: string | null;
  /** A run beyond your recent longest: asked for by name, so offered, but said. */
  overLongest?: boolean;
};

export type DaySuggestion = {
  date: string;
  ask: DayAsk;
  /** Already on the calendar that day. */
  planned: PlannedEvent[];
  /** You asked for something harder than the day does. */
  harderThanAsked: boolean;
  /** No readiness yet for this day, so a hard session depends on how you wake up. */
  conditional: boolean;
  picks: SuggestPick[];
};

export type SuggestFilter = { minutes?: number | undefined; kind?: WorkoutKind | undefined };

const LADDER: WorkoutKind[] = ["recovery", "endurance", "tempo", "threshold", "vo2", "anaerobic"];
const FOCUS_KINDS: Record<Focus, WorkoutKind[]> = {
  base: ["endurance", "tempo"],
  aerobic: ["threshold", "tempo"],
  vo2: ["vo2"],
  anaerobic: ["anaerobic"],
  sprint: ["anaerobic"],
};
/** E: after 5–6 weeks of one aerobic emphasis, the other comes first. */
const FOCUS_NEXT: Partial<Record<Focus, WorkoutKind[]>> = {
  aerobic: ["vo2", "threshold"],
  vo2: ["threshold", "vo2"],
};
const AEROBIC_HARD: WorkoutKind[] = ["vo2", "threshold"];
const HARD_KINDS = new Set<WorkoutKind>(["threshold", "vo2", "anaerobic", "extreme"]);
/** Intensity (% of threshold) from which an activity or a planned workout counts as a hard day. */
const HARD_INTENSITY = 85;
/** Hard sessions in any 7 days. I: two is the best-supported default, three adds little. */
const HARD_LIMIT = 2;
/** A long ride counts as a hard day from this much total work. I/C: where Durability looks too, adjustable. */
const HARD_KJ_PER_KG = 30;
/** Below these, this morning's feel and sleep say no to a hard session whatever the average says (E/I; values C). */
const FEEL_LOW = 45;
const SLEEP_LOW = 40;
/** How far under your usual HRV a week counts as low, in SDs. Unverified in the literature, so a parameter. */
const HRV_BAND = 0.5;
const HRV_MIN_SD = 0.03;
/** E, observational: a run over 10% beyond the longest of the last 30 days is where the injury signal starts. */
const RUN_CAP = 1.1;
/** C: a very short baseline shouldn't cap every run. */
const RUN_CAP_FLOOR_M = 5000;
/** E: gains flatten after 5–6 weeks of the same emphasis. */
const BLOCK_WEEKS = 6;
/** C: after this long off, numbers from before it are only approximate. */
const LONG_BREAK_DAYS = 21;
/** C: a break, and how long to go gently afterwards. */
const BREAK_DAYS = 14;
const BACK_DAYS = 14;
/** C: no study validates a CTL ramp limit; kept as a soft guard. */
const RAMP_SOFT = 8;
/** E: under this much hard work a session keeps what's there rather than building. */
const MAINTENANCE_SECS = 15 * 60;
/** The week's total, as a share of the last four weeks' average. */
const WEEK_ROOM = 1.1;
const DEEP_FORM = -25;
const LONG_SHARE = 0.4;
const DAY_SHARE = 0.25;

const TYPE_OF: Record<MainSport, string> = { ride: "Ride", run: "Run" };
const dayOf = (a: Activity) => a.start_date_local.slice(0, 10);

const OPENER = /opener/;
const TRI_BIKE = /aero-builder/;

/** The kind of a workout that doesn't say: from its hardest real step, else from its time and load. */
function inferKind(parsed: ParsedWorkout, seconds: number, load: number): WorkoutKind {
  const steps = parsed.blocks.filter((b) => b.zone != null && b.seconds >= 30);
  const zone = steps.reduce((m, b) => Math.max(m, b.zone!), 0);
  if (zone) {
    if (zone <= 1) return "recovery";
    if (zone === 2) return "endurance";
    if (zone === 3) return "tempo";
    if (zone === 4) return "threshold";
    return zone === 5 ? "vo2" : "anaerobic";
  }
  const hours = seconds / 3600;
  const intensity = hours ? Math.sqrt(load / (hours * 100)) : 0;
  if (intensity < 0.6) return "recovery";
  if (intensity < 0.78) return "endurance";
  if (intensity < 0.88) return "tempo";
  return intensity < 0.98 ? "threshold" : "vo2";
}

function starterWorkout(
  w: WorkoutTemplate,
  sport: MainSport,
  th: Thresholds,
): SuggestWorkout | null {
  const description = workoutText(w);
  const parsed = parseWorkout(description, sport, th);
  if (!parsed.totalSeconds) return null;
  return {
    id: w.id,
    name: w.name(),
    type: TYPE_OF[sport],
    description,
    seconds: parsed.totalSeconds,
    load: estimateLoad(parsed.blocks),
    kind: w.kind,
    ...(w.focus ? { focus: w.focus } : {}),
    mine: false,
  };
}

/** Any starter workout by its id, also those never suggested: typing can ask for a warm-up by name. */
export function builtInWorkout(id: string, sport: MainSport, th: Thresholds) {
  const w = workoutTemplates(sport).find((x) => x.id === id);
  return w ? starterWorkout(w, sport, th) : null;
}

/** Everything that can be suggested: your own workouts for this sport, then the starter set. */
export function buildPool(
  library: {
    id: string;
    name: string;
    type: string | null;
    description: string | null;
    moving_time: number | null;
    icu_training_load: number | null;
  }[],
  sport: MainSport,
  th: Thresholds,
): SuggestWorkout[] {
  const mine = library.flatMap((w): SuggestWorkout[] => {
    if (/run/i.test(w.type ?? "") !== (sport === "run")) return [];
    const parsed = parseWorkout(w.description, sport, th);
    const seconds = w.moving_time || parsed.totalSeconds;
    const load = w.icu_training_load || estimateLoad(parsed.blocks);
    if (!seconds) return [];
    return [
      {
        id: `lib-${w.id}`,
        name: w.name,
        type: w.type ?? TYPE_OF[sport],
        description: w.description ?? "",
        seconds,
        load,
        kind: inferKind(parsed, seconds, load),
        mine: true,
      },
    ];
  });
  const starter = workoutTemplates(sport).flatMap((w): SuggestWorkout[] => {
    // Warm-ups aren't sessions, except the one a taper ends on.
    if (!LADDER.includes(w.kind) && !OPENER.test(w.id)) return [];
    // They ask for a tri bike, which most people don't have: there to choose, never suggested.
    if (TRI_BIKE.test(w.id)) return [];
    const made = starterWorkout(w, sport, th);
    return made ? [made] : [];
  });
  return [...mine, ...starter];
}

/** The main set in your own numbers: its hardest step of at least a minute, or the hardest at all (sprints). */
export function targetText(
  w: Pick<SuggestWorkout, "description">,
  sport: MainSport,
  th: Thresholds,
): string | null {
  const steps = parseWorkout(w.description, sport, th).blocks.filter((b) => b.zone != null);
  const long = steps.filter((b) => b.seconds >= 60);
  const main = (long.length ? long : steps).reduce<(typeof steps)[number] | null>(
    (m, b) => (!m || b.from + b.to > m.from + m.to ? b : m),
    null,
  );
  if (!main) return null;
  const [lo, hi] = main.from <= main.to ? [main.from, main.to] : [main.to, main.from];
  if (sport === "run") {
    if (!th.pace) return null;
    const fast = formatPace(th.pace * hi);
    return lo === hi ? `${fast}/km` : `${formatPace(th.pace * lo)}–${fast}/km`;
  }
  if (!th.ftp) {
    const [a, b] = [Math.round(lo * 100), Math.round(hi * 100)];
    return a === b ? `${a}% FTP` : `${a}–${b}% FTP`;
  }
  const [a, b] = [Math.round(lo * th.ftp), Math.round(hi * th.ftp)];
  return a === b ? `${a} W` : `${a}–${b} W`;
}

const secsOf = (a: Activity) => new Date(a.start_date_local).getTime() / 1000;

/** Runs as sessions: two under 15 minutes apart are one run (E: how the injury data counted them). */
function runSessions(input: SuggestInput, from: string, to: string) {
  const runs = input.acts
    .filter((a) => isSport(a, "run") && dayOf(a) >= from && dayOf(a) < to)
    .sort((x, y) => x.start_date_local.localeCompare(y.start_date_local));
  const out: { metres: number; end: number }[] = [];
  for (const r of runs) {
    const start = secsOf(r);
    const last = out[out.length - 1];
    if (last && start - last.end < 15 * 60) {
      last.metres += r.distance ?? 0;
      last.end = start + (r.moving_time ?? 0);
    } else out.push({ metres: r.distance ?? 0, end: start + (r.moving_time ?? 0) });
  }
  return out;
}

/** Your longest run of the 30 days before a date, metres. Rides don't count: this is tissue, not fitness. */
function longestRun(input: SuggestInput, date: string) {
  return runSessions(input, addDays(date, -30), date).reduce((m, r) => Math.max(m, r.metres), 0);
}

/** What a run may reach before it's beyond your recent longest. */
const runLimit = (input: SuggestInput) =>
  Math.max(longestRun(input, input.today) * RUN_CAP, RUN_CAP_FLOOR_M);

/** Your usual speed lately, m/s; null without runs to tell. */
function runSpeed(input: SuggestInput) {
  const since = addDays(input.today, -42);
  const runs = input.acts.filter(
    (a) => isSport(a, "run") && dayOf(a) >= since && a.distance && a.moving_time,
  );
  const secs = runs.reduce((n, a) => n + (a.moving_time ?? 0), 0);
  return secs ? runs.reduce((n, a) => n + (a.distance ?? 0), 0) / secs : null;
}

/** A workout that would take you beyond your recent longest run. Time is all it says, so distance is estimated (I). */
function overLongest(input: SuggestInput, w: SuggestWorkout) {
  if (input.sport !== "run") return false;
  const speed = runSpeed(input);
  return speed != null && w.seconds * speed > runLimit(input);
}

/** I/C: work and distance count as well as intensity, and for either sport: legs don't know which one tired them. */
export function hardActivity(input: SuggestInput, a: Activity) {
  if (!sportOfActivity(a)) return false;
  if ((a.icu_intensity ?? 0) >= HARD_INTENSITY) return true;
  if (isSport(a, "ride"))
    return !!a.joules && !!input.weight && a.joules / 1000 / input.weight >= HARD_KJ_PER_KG;
  const near = longestRun(input, dayOf(a));
  return (a.moving_time ?? 0) >= 75 * 60 && near > 0 && (a.distance ?? 0) >= near * 0.9;
}

export function hardEvent(e: PlannedEvent, pool: SuggestWorkout[]) {
  if (e.category.startsWith("RACE") || isFreeRide(e)) return true;
  if (e.category !== "WORKOUT") return false;
  const known = pool.find((w) => w.name === e.name);
  if (known) return HARD_KINDS.has(known.kind);
  const hours = (e.moving_time ?? 0) / 3600;
  return hours > 0 && Math.sqrt((e.icu_training_load ?? 0) / (hours * 100)) * 100 >= HARD_INTENSITY;
}

const plannedOn = (input: SuggestInput, date: string) =>
  input.events.filter((e) => e.date === date && isPlanned(e));

/** Something hard on this day: done, or on the calendar. */
function hardOn(input: SuggestInput, date: string) {
  return (
    input.acts.some((a) => dayOf(a) === date && hardActivity(input, a)) ||
    plannedOn(input, date).some((e) => hardEvent(e, input.pool))
  );
}

/** The most hard days in any 7 days holding this date, not counting it. */
function hardAround(input: SuggestInput, date: string, extra: Set<string> = new Set()) {
  const hard = new Map<string, boolean>();
  const isHard = (d: string) => {
    if (d === date) return false;
    if (!hard.has(d)) hard.set(d, extra.has(d) || hardOn(input, d));
    return hard.get(d)!;
  };
  let most = 0;
  for (let start = -6; start <= 0; start++) {
    let n = 0;
    for (let i = 0; i < 7; i++) if (isHard(addDays(date, start + i))) n++;
    most = Math.max(most, n);
  }
  return most;
}

const racesOf = (input: SuggestInput) => input.races.filter((r) => raceSport(r) === input.sport);

/** C: only the form and the ramp. E: the load ratio stays out, having no causal support as a gate. */
export function strained(input: SuggestInput) {
  const ramp = loadCheck(input.wellness, input.today).ramp ?? 0;
  return ramp >= RAMP_SOFT || (input.form != null && input.form < DEEP_FORM);
}

/** The latest stretch without activities, up to today, if there's been any activity at all. */
function lastBreak(input: SuggestInput) {
  const days = [...new Set(input.acts.map(dayOf))].filter((d) => d <= input.today).sort();
  if (!days.length) return null;
  const dates = [...days, input.today];
  let found: { days: number; ended: string } | null = null;
  for (let i = 1; i < dates.length; i++) {
    const gap = Math.round(
      (parseISO(dates[i]!).getTime() - parseISO(dates[i - 1]!).getTime()) / 864e5,
    );
    if (gap >= BREAK_DAYS) found = { days: gap, ended: dates[i]! };
  }
  return found;
}

/** C: just back from a break or time off: gently, whatever the numbers say. */
export function comingBack(input: SuggestInput) {
  const since = addDays(input.today, -BACK_DAYS);
  if (input.offEvents.some((e) => (e.end ?? e.date) >= since && e.date <= input.today)) return true;
  const back = lastBreak(input);
  return !!back && back.ended >= since;
}

const hardLimit = (input: SuggestInput) => (comingBack(input) || strained(input) ? 1 : HARD_LIMIT);

/** E/I: a week under your usual HRV. A high one is never a bonus: it can also mean overreaching. */
export function hrvLowWeek(input: SuggestInput) {
  const logs = (from: string, to: string) =>
    input.wellness.flatMap((w) => (w.hrv && w.id >= from && w.id <= to ? [Math.log(w.hrv)] : []));
  const week = logs(addDays(input.today, -6), input.today);
  const usual = logs(addDays(input.today, -34), addDays(input.today, -7));
  if (week.length < 3 || usual.length < 10) return false;
  const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
  const m = mean(usual);
  const sd = Math.sqrt(usual.reduce((n, x) => n + (x - m) ** 2, 0) / (usual.length - 1));
  return (mean(week) - m) / Math.max(sd, HRV_MIN_SD) < -HRV_BAND;
}

const STEP_DOWN: Partial<Record<DayAsk, DayAsk>> = {
  quality: "steady",
  tempo: "steady",
  sharp: "easy",
  steady: "easy",
};

/** E/I: how you feel and how you slept get their own say, since an average can hide them. */
export function morningGate(input: SuggestInput, ask: DayAsk): DayAsk {
  const hardAsk = ask === "quality" || ask === "tempo" || ask === "sharp";
  const lowFeel = input.feel != null && input.feel < FEEL_LOW;
  const shortSleep = input.sleep != null && input.sleep < SLEEP_LOW;
  let out = ask;
  if (hardAsk && (lowFeel || shortSleep)) out = STEP_DOWN[out] ?? out;
  if (lowFeel && hrvLowWeek(input)) out = STEP_DOWN[out] ?? out;
  return out;
}

/** What this day asks for, before anything is picked. */
export function dayAsk(input: SuggestInput, date: string): DayAsk {
  if (offEventOn(input.offEvents, date)) return "off";
  const role = dayRole(racesOf(input), date);
  if (role?.role === "race") return "race";
  const isToday = date === input.today && input.score != null;
  if (isToday && input.acts.some((a) => dayOf(a) === date && isSport(a, input.sport)))
    return "easy";
  if (isToday && input.score! < 40) return "rest";
  if (role) {
    // E: a taper cuts volume and keeps intensity, in short sessions at the usual frequency.
    const ask: DayAsk =
      role.role === "sharpen"
        ? role.days === 1
          ? "opener"
          : role.days % 3 === 0
            ? "sharp"
            : "easy"
        : "easy";
    return isToday ? morningGate(input, ask) : ask;
  }
  const beside = hardOn(input, addDays(date, -1)) || hardOn(input, addDays(date, 1));
  const full = hardAround(input, date) >= hardLimit(input);
  if (isToday) {
    const rec = recommendation(input.score!, input.form);
    const ask: DayAsk =
      rec.zones === "Z4–Z5"
        ? beside || full
          ? "steady"
          : "quality"
        : rec.zones === "Z3–Z4"
          ? beside || full
            ? "steady"
            : "tempo"
          : input.score! >= 55
            ? "steady"
            : "easy";
    return morningGate(input, ask);
  }
  // Fatigue says something about the next days, not about the week after.
  const soon = date <= addDays(input.today, 3) && strained(input);
  return beside || full || soon ? "steady" : "quality";
}

/** How long a typical session of yours has been lately, in seconds. */
function usualSeconds(input: SuggestInput) {
  const since = addDays(input.today, -28);
  const recent = input.acts.filter(
    (a) => dayOf(a) >= since && dayOf(a) <= input.today && isSport(a, input.sport),
  );
  if (!recent.length) return 3600;
  return recent.reduce((s, a) => s + (a.moving_time ?? 0), 0) / recent.length;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Your longest session of the last six weeks, in seconds. */
function longestSeconds(input: SuggestInput) {
  const since = addDays(input.today, -42);
  return input.acts
    .filter((a) => dayOf(a) >= since && dayOf(a) <= input.today && isSport(a, input.sport))
    .reduce((m, a) => Math.max(m, a.moving_time ?? 0), 0);
}

/** E: how much of the usual volume a day before a race keeps. Marathons taper from three weeks, strictly downward. */
function taperScale(input: SuggestInput, date: string) {
  const ahead = racesOf(input).filter((r) => r.date > date);
  const within = (r: { date: string }, days: number) => r.date <= addDays(date, days);
  if (ahead.some((r) => r.priority === "A" && within(r, 10))) return 0.5;
  const marathons = ahead.filter((r) => r.info?.kind === "runMarathon");
  if (marathons.some((r) => within(r, 14))) return 0.65;
  return marathons.some((r) => within(r, 21)) ? 0.8 : 1;
}

/** The length this ask wants, in seconds, scaled to what you've been doing. */
function askSeconds(input: SuggestInput, ask: DayAsk, date = input.today) {
  const usual = usualSeconds(input);
  const scale = taperScale(input, date);
  if (ask === "opener") return 35 * 60;
  if (ask === "sharp") return clamp(usual * 0.5, 35 * 60, 60 * 60);
  if (ask === "easy" || ask === "rest") return 45 * 60;
  // I/C: a long day grows from your own longest; no study sets a minimum.
  if (ask === "long") return (longestSeconds(input) || usual * 1.5) * 1.05 * scale;
  if (ask === "quality" || ask === "tempo") return clamp(usual * 0.85, 45 * 60, 100 * 60) * scale;
  return clamp(usual, 60 * 60, 150 * 60) * scale;
}

/** Past six weeks, the block's emphasis gives way first to the other aerobic one. */
function blockKinds(input: SuggestInput): WorkoutKind[] {
  const old = input.blockSince && input.blockSince <= addDays(input.today, -BLOCK_WEEKS * 7);
  return (old && FOCUS_NEXT[input.focus]) || FOCUS_KINDS[input.focus];
}

/** A hard anaerobic session among these days' neighbours. */
function anaerobicNear(input: SuggestInput, date: string) {
  const known = new Set(input.pool.filter((w) => w.kind === "anaerobic").map((w) => w.name));
  const near = (d: string) => d >= addDays(date, -6) && d <= addDays(date, 6) && d !== date;
  return (
    input.events.some((e) => near(e.date) && known.has(e.name ?? "")) ||
    input.acts.some((a) => near(dayOf(a)) && known.has(a.name ?? ""))
  );
}

function askKinds(input: SuggestInput, ask: DayAsk, date = input.today): WorkoutKind[] {
  // E/I: at most one anaerobic session a week; no trial shows that training a curve's weak spot beats aerobic work.
  if (ask === "quality")
    return blockKinds(input).includes("anaerobic") && anaerobicNear(input, date)
      ? AEROBIC_HARD
      : blockKinds(input);
  if (ask === "sharp") return AEROBIC_HARD;
  if (ask === "opener") return input.sport === "run" ? ["endurance", "recovery"] : ["warmup"];
  if (ask === "tempo") return ["tempo"];
  if (ask === "easy" || ask === "rest") return ["recovery", "endurance"];
  return ["endurance"];
}

/** Made for one kind of race: only worth suggesting with a race ahead. */
const RACE_WORKOUT = /race|ironman|70-3/;
/** E, mixed and weak: low cadence is variety, never the main idea. */
const LOW_CADENCE = /big-gear|torque|low-cadence/;
/** C: no controlled trial found, so it doesn't lead where threshold fits. */
const SWEET_SPOT = /sweet-spot/;

type RankBy = {
  focus?: Focus | undefined;
  /** The kinds wanted, the likeliest first. */
  kinds?: WorkoutKind[] | undefined;
  /** Already in this proposal. */
  used?: Set<string> | undefined;
};

/** I: a hard session with time for more builds more, so one that only keeps what's there gives way when another fits. */
const KEEPS_ONLY_COST = 0.3;

/** Lower is better. Your own workouts win close calls; a name planned lately gives way to another. */
function rank(input: SuggestInput, list: SuggestWorkout[], seconds: number, by: RankBy = {}) {
  // E: aerobic formats are interchangeable, so what you did lately decides among them.
  const since = addDays(input.today, -14);
  const lately = new Set([
    ...input.events.map((e) => e.name),
    ...input.acts.filter((a) => dayOf(a) >= since).map((a) => a.name),
  ]);
  const raceAhead = racesOf(input).some((r) => r.date >= input.today);
  const cost = (w: SuggestWorkout) =>
    Math.abs(w.seconds - seconds) / seconds +
    (w.mine ? -0.1 : 0) +
    (lately.has(w.name) ? 0.5 : 0) +
    (by.used?.has(w.id) ? 1 : 0) +
    (!raceAhead && RACE_WORKOUT.test(w.id) ? 1 : 0) +
    (LOW_CADENCE.test(w.id) ? 1 : 0) +
    (by.kinds?.includes("threshold") && SWEET_SPOT.test(w.id) ? 0.6 : 0) +
    (by.focus && w.focus && w.focus !== by.focus ? 0.3 : 0) +
    (keepsOnly(input, w) ? KEEPS_ONLY_COST : 0) +
    Math.max(0, by.kinds?.indexOf(w.kind) ?? 0) * 0.25;
  return [...list].sort((a, b) => cost(a) - cost(b) || a.id.localeCompare(b.id));
}

const lighterKind = (k: WorkoutKind): WorkoutKind => {
  const i = LADDER.indexOf(k);
  return i <= 1 ? "recovery" : i === 2 ? "endurance" : k === "threshold" ? "tempo" : "endurance";
};

/** E/I: under 15 minutes of hard work a session is worth doing, and keeps what's there rather than building. */
function keepsOnly(input: SuggestInput, w: SuggestWorkout) {
  if (w.kind !== "threshold" && w.kind !== "vo2") return false;
  const hard = parseWorkout(w.description, input.sport, input.th).blocks.filter(
    (b) => (b.from + b.to) / 2 >= 0.9,
  );
  return hard.reduce((n, b) => n + b.seconds, 0) < MAINTENANCE_SECS;
}

function pickOf(input: SuggestInput, workout: SuggestWorkout, why: string): SuggestPick {
  const target = targetText(workout, input.sport, input.th);
  const stale = (lastBreak(input)?.days ?? 0) >= LONG_BREAK_DAYS && comingBack(input);
  const over = overLongest(input, workout);
  return {
    workout,
    why: keepsOnly(input, workout) ? `${why} · ${t("keeps what's there", "per mantenere")}` : why,
    target: target && stale ? `~${target}` : target,
    ...(over ? { overLongest: true } : {}),
  };
}

const WHY_SHARP = () => t("Short and sharp", "Breve e intensa");
const WHY_OPENER = () => t("To open the legs", "Per aprire le gambe");

/** Up to three workouts for what a day asks: what fits best, one easier, one shorter. */
function picksFor(
  input: SuggestInput,
  date: string,
  ask: DayAsk,
  filter: SuggestFilter = {},
  week?: { seconds: number; used: Set<string>; kinds?: WorkoutKind[] },
): DaySuggestion {
  const out: DaySuggestion = {
    date,
    ask,
    planned: plannedOn(input, date),
    harderThanAsked: false,
    conditional: date !== input.today || input.score == null,
    picks: [],
  };
  if (ask === "off" || ask === "race") return out;
  const { pool } = input;
  const fits = (w: SuggestWorkout) =>
    !filter.minutes ||
    (w.seconds <= filter.minutes * 60 * 1.15 && w.seconds >= filter.minutes * 60 * 0.5);
  const goal = filter.minutes
    ? filter.minutes * 60
    : (week?.seconds ?? askSeconds(input, ask, date));
  const kinds = week?.kinds ?? askKinds(input, ask, date);
  // E: a run beyond your recent longest is never the suggestion; asked for directly, the row says so instead.
  const safe = (w: SuggestWorkout) => !!filter.minutes || !overLongest(input, w);
  const picks: SuggestPick[] = [];
  const add = (w: SuggestWorkout | undefined, why: string) => {
    if (w && !picks.some((p) => p.workout.id === w.id)) picks.push(pickOf(input, w, why));
  };
  if (filter.kind) {
    const kind = filter.kind;
    const why = kindLabel(kind, input.sport);
    rank(
      input,
      pool.filter((w) => w.kind === kind && fits(w)),
      goal,
      { focus: input.focus },
    )
      .slice(0, 3)
      .forEach((w) => add(w, why));
    const most = Math.max(...kinds.map((k) => LADDER.indexOf(k)));
    return { ...out, picks, harderThanAsked: LADDER.indexOf(kind) > most };
  }
  const list = pool.filter((w) => kinds.includes(w.kind) && fits(w) && safe(w));
  // Moving on from a block, its own workouts no longer have the edge.
  const focus =
    ask === "quality" && blockKinds(input) === FOCUS_KINDS[input.focus] ? input.focus : undefined;
  const best = rank(input, list, goal, { focus, kinds, used: week?.used })[0];
  if (!best) {
    // C: nothing fits under a very short longest run: the shortest easy one, and the row says so.
    if (input.sport !== "run" || filter.minutes) return out;
    const shortest = pool
      .filter((w) => w.kind === "endurance" || w.kind === "recovery")
      .sort((a, b) => a.seconds - b.seconds || a.id.localeCompare(b.id))[0];
    return shortest
      ? { ...out, picks: [pickOf(input, shortest, kindLabel(shortest.kind, input.sport))] }
      : out;
  }
  add(
    best,
    ask === "quality"
      ? blockKinds(input) === FOCUS_KINDS[input.focus] || best.kind === FOCUS_KINDS[input.focus][0]
        ? t("Your block", "Il tuo blocco")
        : t("For a change", "Per variare")
      : ask === "sharp"
        ? WHY_SHARP()
        : ask === "opener"
          ? WHY_OPENER()
          : date === input.today
            ? ask === "rest"
              ? t("If you feel like moving", "Se hai voglia di muoverti")
              : t("Fits today", "Adatta a oggi")
            : ask === "long" && best.seconds > usualSeconds(input) * 1.1
              ? t("Long", "Lungo")
              : kindLabel(best.kind, input.sport),
  );
  if (ask !== "easy" && ask !== "rest" && ask !== "opener") {
    const lighter = lighterKind(best.kind);
    add(
      rank(
        input,
        pool.filter((w) => w.kind === lighter && w.load < best.load && fits(w) && safe(w)),
        askSeconds(input, "steady"),
      )[0],
      t("Easier", "Più tranquilla"),
    );
  }
  add(
    rank(
      input,
      list.filter((w) => w.seconds < best.seconds * 0.75),
      best.seconds * 0.6,
      { focus, kinds },
    )[0],
    t("Shorter", "Più breve"),
  );
  return { ...out, picks: picks.slice(0, 3) };
}

export const suggestDay = (input: SuggestInput, date: string, filter: SuggestFilter = {}) =>
  picksFor(input, date, dayAsk(input, date), filter);

/** Hours of your recent week, from the four full weeks before today. */
function usualWeekSeconds(input: SuggestInput) {
  const since = addDays(input.today, -28);
  const total = input.acts
    .filter((a) => dayOf(a) >= since && dayOf(a) < input.today && isSport(a, input.sport))
    .reduce((s, a) => s + (a.moving_time ?? 0), 0);
  return total / 4;
}

export type WeekDay = DaySuggestion & {
  /** What the day gets in the proposal: a free day is a day with no pick. */
  rest: boolean;
};
export type WeekSuggestion = {
  from: string;
  to: string;
  days: WeekDay[];
  sessions: number;
  seconds: number;
  load: number;
  hard: number;
  /** Why a week asked for is smaller than asked, when it's the body's doing and not the workouts'. */
  heldBack: "coming-back" | "taper" | null;
};

/** What a week was asked to come to, by typing. */
export type WeekTarget = { seconds?: number | undefined; load?: number | undefined };

/** C: a steady hour's load and a hard one's, when there are no workouts to read them from. */
const STEADY_LOAD_HOUR = 50;
const HARD_LOAD_HOUR = 85;
/** C: a day shorter than this isn't worth adding just to reach a week's hours. */
const SHORTEST_ADDED_DAY = 45 * 60;
/** C: about how long a hard day's hard part lasts. */
const HARD_SESSION_HOURS = 1.2;

/** Your own load per hour lately, to turn a load into time. */
function loadPerHour(input: SuggestInput) {
  const since = addDays(input.today, -28);
  const recent = input.acts.filter(
    (a) => dayOf(a) >= since && dayOf(a) < input.today && isSport(a, input.sport),
  );
  const secs = recent.reduce((s, a) => s + (a.moving_time ?? 0), 0);
  const load = recent.reduce((s, a) => s + (a.icu_training_load ?? 0), 0);
  return secs >= 3600 && load > 0 ? load / (secs / 3600) : STEADY_LOAD_HOUR;
}

/** A kind of workouts' load per hour, as this pool has them. */
function poolLoadPerHour(pool: SuggestWorkout[], hard: boolean, fallback: number) {
  const some = pool.filter((w) => HARD_KINDS.has(w.kind) === hard && w.seconds > 0);
  const secs = some.reduce((s, w) => s + w.seconds, 0);
  return secs ? some.reduce((s, w) => s + w.load, 0) / (secs / 3600) : fallback;
}

/** How many hard days hours and a load together ask for: what steady hours leave of the load. */
function hardDaysAsked(pool: SuggestWorkout[], seconds: number, load: number) {
  const steady = poolLoadPerHour(pool, false, STEADY_LOAD_HOUR);
  const hard = poolLoadPerHour(pool, true, HARD_LOAD_HOUR);
  if (hard <= steady) return 0;
  return Math.max(
    0,
    Math.round((load - (steady * seconds) / 3600) / (hard - steady) / HARD_SESSION_HOURS),
  );
}

/** A week from `from` to `to`: what's planned stays, the rest is spread out. A guide: nothing here is kept up to date. */
export function suggestWeek(
  input: SuggestInput,
  from: string,
  to: string,
  target: WeekTarget = {},
): WeekSuggestion {
  const start = from < input.today ? input.today : from;
  const dates: string[] = [];
  for (let d = start; d <= to; d = addDays(d, 1)) dates.push(d);
  const asks = new Map(dates.map((d) => [d, dayAsk(input, d)]));
  const taken = (d: string) => plannedOn(input, d).length > 0;
  const open = (d: string) => {
    const a = asks.get(d);
    return (
      !!a &&
      a !== "off" &&
      a !== "race" &&
      a !== "rest" &&
      a !== "easy" &&
      a !== "sharp" &&
      a !== "opener" &&
      !taken(d)
    );
  };
  const chosen = new Map<string, DayAsk>();
  // E: a taper takes the week's volume down; C: coming back, it doesn't climb past what you've been doing.
  const scale = Math.min(...dates.map((d) => taperScale(input, d)));
  const usualRoom = Math.max(usualWeekSeconds(input), 3 * 3600);
  const longestSteady = Math.max(
    0,
    ...input.pool.filter((w) => !HARD_KINDS.has(w.kind)).map((w) => w.seconds),
  );
  const askedSeconds =
    target.seconds ?? (target.load ? (target.load / loadPerHour(input)) * 3600 : null);
  // A week you ask for sets its own size. Coming back it still doesn't climb past what you've been doing.
  const room =
    askedSeconds == null
      ? usualRoom * (comingBack(input) ? 1 : WEEK_ROOM) * scale
      : (comingBack(input) ? Math.min(askedSeconds, usualRoom) : askedSeconds) * scale;
  // No one day takes more than its share of a week that size.
  const sized = (a: DayAsk) => {
    if (a === "sharp" || a === "opener") return askSeconds(input, a);
    const share = room * (a === "long" ? LONG_SHARE : DAY_SHARE);
    // The long and steady days grow with a week asked for, as far as there are workouts that long;
    // a hard day and an easy one stay what they are.
    if (askedSeconds != null && (a === "long" || a === "steady"))
      return Math.min(share, longestSteady || share);
    return Math.min(askSeconds(input, a), share);
  };

  // A taper's sessions are the point of its days, and stay.
  for (const d of dates) {
    const a = asks.get(d);
    if ((a === "sharp" || a === "opener") && !taken(d)) chosen.set(d, a);
  }

  // One long day at the weekend, unless something's already planned there.
  const weekend = dates.filter((d) => [0, 6].includes(getDay(parseISO(d))));
  const weekendBusy = weekend.some(taken);
  const longDay = weekendBusy
    ? undefined
    : [...weekend].sort((a, b) => getDay(parseISO(a)) - getDay(parseISO(b))).find(open);
  if (longDay) chosen.set(longDay, "long");

  // Hard days, never side by side, nor next to the long day.
  const ownLimit = input.focus === "base" ? 1 : hardLimit(input);
  // Hours and a load together say how hard the week is, never past what your own limit allows.
  const limit =
    target.seconds && target.load
      ? Math.min(ownLimit, hardDaysAsked(input.pool, target.seconds, target.load))
      : ownLimit;
  const picked = new Set<string>();
  for (const d of dates) {
    if (asks.get(d) !== "quality" || chosen.has(d) || taken(d)) continue;
    if (hardAround(input, d, picked) >= limit) continue;
    const near = (x: string) => chosen.get(x) === "quality" || chosen.get(x) === "long";
    if (near(addDays(d, -1)) || near(addDays(d, 1))) continue;
    chosen.set(d, "quality");
    picked.add(d);
  }

  const fitted = new Map<string, number>();
  // Then steady days while there's room, leaving at least one day free.
  const plannedSecs = dates
    .flatMap((d) => plannedOn(input, d))
    .reduce((s, e) => s + (e.moving_time ?? 0), 0);
  let used = plannedSecs;
  for (const a of chosen.values()) used += sized(a);
  const free = () =>
    dates.filter((d) => !chosen.has(d) && !taken(d) && asks.get(d) !== "race").length;
  for (const d of dates) {
    if (chosen.has(d) || taken(d)) continue;
    const a = asks.get(d)!;
    if (a === "off" || a === "race" || a === "rest") continue;
    const next = a === "easy" ? "easy" : "steady";
    // A week asked for is filled to its hours: the last day added takes what's left.
    const left = room - used;
    const cost =
      askedSeconds != null && left >= SHORTEST_ADDED_DAY
        ? Math.min(sized(next), left)
        : sized(next);
    if (used + cost > room || free() <= 1) continue;
    if (cost !== sized(next)) fitted.set(d, cost);
    chosen.set(d, next);
    used += cost;
  }
  // Too much for the week's room: the steady days go first, then the second hard one.
  for (const a of ["steady", "easy", "quality", "long"] as const) {
    for (const [d, x] of [...chosen].reverse()) {
      if (used <= room) break;
      if (x !== a) continue;
      // The week keeps its one main session.
      const main = [...chosen.values()].filter((v) => v === "quality" || v === "long").length;
      if (main <= 1 && (a === "quality" || a === "long")) continue;
      // E: two sessions a week hold what you have, so a short week still keeps them.
      const planned = dates.filter(taken).length;
      if (chosen.size + planned <= 2) continue;
      chosen.delete(d);
      used -= fitted.get(d) ?? sized(a);
    }
  }

  const seen = new Set<string>();
  // E/I: an anaerobic block still gets only one such session a week.
  let anaerobic = dates.some((d) => anaerobicNear(input, d));
  const days = dates.map((date): WeekDay => {
    const a = chosen.get(date);
    if (!a) {
      const own = asks.get(date)!;
      const none = picksFor(input, date, "off");
      return { ...none, ask: own === "off" || own === "race" ? own : "rest", rest: !taken(date) };
    }
    const day = picksFor(
      input,
      date,
      a,
      {},
      {
        seconds:
          (fitted.get(date) ?? sized(a)) *
          (a === "sharp" || a === "opener" ? 1 : taperScale(input, date) / scale),
        used: seen,
        ...(a === "quality" && anaerobic ? { kinds: AEROBIC_HARD } : {}),
      },
    );
    day.picks.forEach((p) => seen.add(p.workout.id));
    if (a === "quality" && day.picks[0]?.workout.kind === "anaerobic") anaerobic = true;
    return { ...day, rest: false };
  });
  const withPick = days.filter((d) => d.picks.length);
  const seconds =
    plannedSecs + withPick.reduce((s, d) => s + (d.picks[0]?.workout.seconds ?? 0), 0);
  return {
    from: start,
    to,
    days,
    sessions: withPick.length + days.filter((d) => d.planned.length).length,
    seconds,
    heldBack:
      askedSeconds == null
        ? null
        : comingBack(input) && askedSeconds > usualRoom
          ? "coming-back"
          : scale < 1
            ? "taper"
            : null,
    load:
      dates
        .flatMap((d) => plannedOn(input, d))
        .reduce((s, e) => s + (e.icu_training_load ?? 0), 0) +
      withPick.reduce((s, d) => s + (d.picks[0]?.workout.load ?? 0), 0),
    hard:
      withPick.filter((d) => d.ask === "quality" || d.ask === "sharp").length +
      days.filter((d) => d.planned.some((e) => hardEvent(e, input.pool))).length,
  };
}

/** A day's name for its row. */
export const dayName = (date: string, today: string) =>
  date === today
    ? t("Today", "Oggi")
    : date === addDays(today, 1)
      ? t("Tomorrow", "Domani")
      : format(parseISO(date), "EEEE d MMMM");
