// A workout written in intervals.icu's builder syntax, read into blocks to draw: "- 10m 60%", "3x", "Ramp 60-80%",
// zones, watts, pace, heart rate. Accounts without intervals.icu use the same text, so there's one way to read it. Pure.
import type { MainSport } from "./sport";

/** What absolute targets are measured against: FTP in watts, threshold pace as speed in m/s. */
export type Thresholds = { ftp?: number | null; pace?: number | null };

export type WorkoutBlock = {
  seconds: number;
  /** Intensity as a fraction of threshold at the block's start and end (they differ on a ramp). */
  from: number;
  to: number;
  /** 1–7, from the average intensity; null when the step names no target we can read. */
  zone: number | null;
  label: string | null;
  /** As a fraction of FTP, when the step is written in power; null for heart rate, pace or no target. */
  power: [number, number] | null;
  ramp: boolean;
};

/** Steps as they were written: "4x" stays one set, where `blocks` has them laid out in full. */
export type WorkoutSet = { reps: number; steps: WorkoutBlock[] };

export type ParsedWorkout = {
  blocks: WorkoutBlock[];
  sets: WorkoutSet[];
  totalSeconds: number;
  /** Lines written as steps that couldn't be read: the editor flags them. */
  unread: string[];
  /** Everything else (headings, comments). */
  notes: string[];
};

/** Power zone (1–7) from % of FTP, Coggan-style like intervals.icu. */
export function powerZone(watts: number, ftp: number): number {
  const p = watts / ftp;
  if (p < 0.55) return 1;
  if (p < 0.75) return 2;
  if (p < 0.9) return 3;
  if (p < 1.05) return 4;
  if (p < 1.2) return 5;
  if (p < 1.5) return 6;
  return 7;
}

/** The middle of each zone, for a target given as "Z2". */
const ZONE_MID = [0.45, 0.65, 0.82, 0.97, 1.12, 1.35, 1.6];
/** Where each zone ends, as `powerZone` has it: what a target given as "Z2" means in watts. */
const ZONE_TOP = [0.55, 0.75, 0.9, 1.05, 1.2, 1.5, Infinity];
/** A step with no target we can read draws low, and counts as easy. */
const FREE = 0.5;
/** Threshold heart rate is about this share of maximum. */
const LTHR_OF_MAX = 0.92;

/**
 * Heart rate as % of threshold → intensity. Heart rate moves far less than power (90% of threshold heart rate is about
 * 75% of FTP), so this is a drawing's approximation, not a conversion.
 */
const fromLthr = (pct: number) => Math.max(0.3, 1 + ((pct - 100) / 100) * 2.5);

const DURATION =
  /(?:^|\s)(?:(\d+)\s*h(?:\s*(\d+)\s*m?)?|(\d+)\s*m(?:\s*(\d+)\s*s?)?(?![a-z])|(\d+)\s*s|(\d+)'(?:(\d+)")?|(\d+)")(?=\s|$)/i;
const DISTANCE = /(?:^|\s)(\d+(?:[.,]\d+)?)\s*(km|mtr|mi)(?=\s|$)/i;

const paceSpeed = (m: string, s: string, unit: string) =>
  (unit === "mi" ? 1609.34 : 1000) / (Number(m) * 60 + Number(s));

type Target = { from: number; to: number; power: [number, number] | null };

/** The target in a step's text (from and to differ only on a ramp); null when it names none we can read. */
function readTarget(text: string, ramp: boolean, th: Thresholds): Target | null {
  const span = (a: number, b: number): Target => {
    const mid = (a + b) / 2;
    return ramp ? { from: a, to: b, power: null } : { from: mid, to: mid, power: null };
  };
  const inPower = (a: number, b: number): Target => ({ ...span(a, b), power: [a, b] });
  const hr = /(\d+)(?:\s*-\s*(\d+))?\s*%\s*(LTHR|HR)\b/i.exec(text);
  if (hr) {
    const k = hr[3]!.toUpperCase() === "HR" ? 1 / LTHR_OF_MAX : 1;
    return span(fromLthr(Number(hr[1]) * k), fromLthr(Number(hr[2] ?? hr[1]) * k));
  }
  const pacePct = /(\d+)(?:\s*-\s*(\d+))?\s*%\s*pace\b/i.exec(text);
  if (pacePct) return span(Number(pacePct[1]) / 100, Number(pacePct[2] ?? pacePct[1]) / 100);
  const pace = /(\d+):(\d\d)(?:\s*-\s*(\d+):(\d\d))?\s*(?:\/\s*(km|mi)|pace\b)/i.exec(text);
  if (pace) {
    if (!th.pace) return null;
    const unit = (pace[5] ?? "km").toLowerCase();
    const a = paceSpeed(pace[1]!, pace[2]!, unit) / th.pace;
    const b =
      (pace[3] ? paceSpeed(pace[3], pace[4]!, unit) : paceSpeed(pace[1]!, pace[2]!, unit)) /
      th.pace;
    return span(a, b);
  }
  const watts = /(\d+)(?:\s*-\s*(\d+))?\s*w\b/i.exec(text);
  if (watts) {
    if (!th.ftp) return null;
    return inPower(Number(watts[1]) / th.ftp, Number(watts[2] ?? watts[1]) / th.ftp);
  }
  const zone = /\bZ([1-7])(?:\s*-\s*Z?([1-7]))?\b/i.exec(text);
  if (zone) {
    const low = Number(zone[1]) - 1;
    const high = Number(zone[2] ?? zone[1]) - 1;
    const drawn = span(ZONE_MID[low]!, ZONE_MID[high]!);
    return {
      ...drawn,
      power: ramp ? [drawn.from, drawn.to] : [ZONE_TOP[low - 1] ?? 0, ZONE_TOP[high]!],
    };
  }
  const pct = /(\d+(?:\.\d+)?)(?:\s*-\s*(\d+(?:\.\d+)?))?\s*%/.exec(text);
  if (pct) return inPower(Number(pct[1]) / 100, Number(pct[2] ?? pct[1]) / 100);
  return null;
}

/** One "- …" line as a block; null when it has no duration or distance to go by. */
function readStep(line: string, sport: MainSport, th: Thresholds): WorkoutBlock | null {
  const text = line.replace(/^[-•]\s*/, "");
  const ramp = /\bramp\b/i.test(text);
  const time = DURATION.exec(text);
  const dist = time ? null : DISTANCE.exec(text);
  const match = time ?? dist;
  if (!match) return null;
  const rest = text.slice(match.index + match[0].length);
  const target = readTarget(rest, ramp, th);
  const { from, to } = target ?? { from: FREE, to: FREE };
  let seconds: number;
  if (time) {
    const n = (i: number) => Number(time[i] ?? 0);
    seconds = n(1) * 3600 + n(2) * 60 + n(3) * 60 + n(4) + n(5) + n(6) * 60 + n(7) + n(8);
  } else {
    // A distance takes as long as its pace says, so it needs a threshold pace (a ride has none to go by).
    if (sport !== "run" || !th.pace) return null;
    const unit = dist![2]!.toLowerCase();
    const metres =
      Number(dist![1]!.replace(",", ".")) * (unit === "km" ? 1000 : unit === "mi" ? 1609.34 : 1);
    seconds = metres / (th.pace * ((from + to) / 2));
  }
  if (!(seconds > 0)) return null;
  const label = text
    .slice(0, match.index)
    .replace(/\bramp\b/i, "")
    .trim();
  return {
    seconds,
    from,
    to,
    zone: target ? powerZone((from + to) / 2, 1) : null,
    label: label || null,
    power: target?.power ?? null,
    ramp,
  };
}

const isStep = (line: string) => /^[-•]\s*\S/.test(line);
/** "6x", "Main set 6x" on its own line: the steps right below it repeat. */
const repeatOf = (line: string) => {
  const m = /(?:^|\s)(\d+)\s*x$/i.exec(line);
  return m ? Number(m[1]) : null;
};

export function parseWorkout(
  text: string | null | undefined,
  sport: MainSport,
  th: Thresholds = {},
): ParsedWorkout {
  const blocks: WorkoutBlock[] = [];
  const sets: WorkoutSet[] = [];
  const unread: string[] = [];
  const notes: string[] = [];
  let reps = 1;
  let set: WorkoutBlock[] = [];
  const close = () => {
    if (set.length) sets.push({ reps, steps: set });
    for (let i = 0; i < reps; i++) blocks.push(...set);
    set = [];
    reps = 1;
  };
  for (const raw of (text ?? "").split("\n")) {
    const line = raw.trim();
    if (isStep(line)) {
      const step = readStep(line, sport, th);
      if (step) set.push(step);
      else unread.push(line);
      continue;
    }
    close();
    if (!line) continue;
    const n = repeatOf(line);
    if (n && n <= 100) reps = n;
    else notes.push(line);
  }
  close();
  return { blocks, sets, totalSeconds: blocks.reduce((s, b) => s + b.seconds, 0), unread, notes };
}

/** A step's power in watts: "263W", a range, or a ramp's start and end. Null when it isn't written in power. */
export function stepWatts(step: WorkoutBlock, ftp: number): string | null {
  if (!step.power) return null;
  const [a, b] = step.power;
  const w = (f: number) => Math.round(f * ftp);
  if (w(a) === w(b)) return `${w(a)}W`;
  if (step.ramp) return `${w(a)} → ${w(b)}W`;
  if (!a) return `≤${w(b)}W`;
  if (b === Infinity) return `≥${w(a)}W`;
  return `${w(a)}–${w(b)}W`;
}

/** Whether there's anything worth drawing: at least one step with a target, not just a line that happens to read as one. */
export const hasBlocks = (w: ParsedWorkout) => w.blocks.some((b) => b.zone != null);

/** Training load the way TSS counts it (time × intensity², 100 for an hour at threshold), a ramp by its own average. */
export function estimateLoad(blocks: WorkoutBlock[]): number {
  const load = blocks.reduce(
    (s, b) => s + (b.seconds / 3600) * ((b.from ** 2 + b.from * b.to + b.to ** 2) / 3) * 100,
    0,
  );
  return Math.round(load);
}
