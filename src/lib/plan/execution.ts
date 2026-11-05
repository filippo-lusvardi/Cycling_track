// How a ride compared with its workout, from power alone. For each work step it finds the ride's best stretch of that length,
// never using a second twice, so it works outdoors, where steps don't start on time. Thresholds are conventions (C). Pure.
import { estimateLoad, parseWorkout, type WorkoutBlock } from "../workout";

/** From this intensity, for at least this long, a step is work. Shorter surges and recoveries don't say much. */
const WORK_FROM = 0.76;
const SHORTEST_STEP = 30;
/** C: power meters and riding outdoors aren't exact, so targets get some room. */
const OVER = 1.05;
const UNDER = 0.92;
/** An easy ride has more room: a hill or a group lifts it with no intent, and going easier isn't falling short. */
const EASY_OVER = 1.15;
/** At this share of the target, a step counts as hit. */
const HIT = 0.9;
/** Within this much of the target is full marks, and this much further is none. */
const FULL_MARKS = 0.03;
const NO_MARKS = 0.25;

export type Execution = {
  verdict: "over" | "on" | "under";
  /** Ridden power over target power. */
  ratio: number;
  /** 0–100, how close to the workout: going over costs as much as falling short. */
  score: number;
  stepsHit: number;
  steps: number;
  /** Each work step and the stretch of the ride it was found in, in order along the ride. */
  matches: StepMatch[];
};

export type StepMatch = {
  /** Second of the ride where it starts; null when the ride had no stretch left for it. */
  start: number | null;
  seconds: number;
  target: number;
  ridden: number;
};

const closeness = (ratio: number) =>
  Math.min(1, Math.max(0, 1 - Math.max(0, Math.abs(ratio - 1) - FULL_MARKS) / NO_MARKS));

const target = (b: WorkoutBlock) => (b.from + b.to) / 2;

/** The best free stretch of this length: its mean power, then that stretch is used up. Null when none is left. */
function takeBest(watts: (number | null)[], taken: Uint8Array, seconds: number) {
  let sum = 0;
  let blocked = 0;
  let best = -1;
  let at = -1;
  for (let i = 0; i < watts.length; i++) {
    sum += watts[i] ?? 0;
    blocked += taken[i]!;
    if (i >= seconds) {
      sum -= watts[i - seconds] ?? 0;
      blocked -= taken[i - seconds]!;
    }
    if (i >= seconds - 1 && !blocked && sum > best) {
      best = sum;
      at = i - seconds + 1;
    }
  }
  if (at < 0) return null;
  taken.fill(1, at, at + seconds);
  return { start: at, mean: best / seconds };
}

function stepsExecution(steps: WorkoutBlock[], watts: (number | null)[], ftp: number): Execution {
  const taken = new Uint8Array(watts.length);
  let ridden = 0;
  let asked = 0;
  let marks = 0;
  let hit = 0;
  let time = 0;
  const matches: StepMatch[] = [];
  // Longest first: a long step is the hardest to fit once short ones have taken their place.
  for (const s of [...steps].sort((a, b) => b.seconds - a.seconds || target(b) - target(a))) {
    const seconds = Math.round(s.seconds);
    const found = takeBest(watts, taken, seconds);
    const mean = found?.mean ?? 0;
    const want = target(s) * ftp;
    matches.push({ start: found?.start ?? null, seconds, target: want, ridden: mean });
    ridden += mean * seconds;
    asked += want * seconds;
    marks += closeness(mean / want) * seconds;
    time += seconds;
    if (mean >= want * HIT) hit++;
  }
  const ratio = ridden / asked;
  return {
    verdict: ratio > OVER ? "over" : ratio < UNDER ? "under" : "on",
    ratio,
    score: Math.round((marks / time) * 100),
    stepsHit: hit,
    steps: steps.length,
    matches: matches.sort((a, b) => (a.start ?? Infinity) - (b.start ?? Infinity)),
  };
}

/**
 * How the ride compared with the workout: null when there's nothing to go by (no FTP, no power meter), so the rider's word
 * stands alone. Steps come from the power stream; an easy workout, or a ride with no stream, is compared as a whole.
 */
export function executionOf(input: {
  description: string;
  ftp: number | null | undefined;
  watts?: (number | null)[] | null | undefined;
  /** The ride's normalized power. */
  weightedWatts?: number | null | undefined;
}): Execution | null {
  const { ftp, watts } = input;
  if (!ftp) return null;
  const { blocks, totalSeconds } = parseWorkout(input.description, "ride", { ftp });
  if (!totalSeconds) return null;
  const steps = blocks.filter((b) => target(b) >= WORK_FROM && b.seconds >= SHORTEST_STEP);
  if (steps.length && watts?.some((w) => w)) return stepsExecution(steps, watts, ftp);
  if (!input.weightedWatts) return null;
  const intensity = Math.sqrt(estimateLoad(blocks) / ((totalSeconds / 3600) * 100));
  const ratio = input.weightedWatts / (intensity * ftp);
  const easy = !steps.length;
  return {
    verdict: ratio > (easy ? EASY_OVER : OVER) ? "over" : !easy && ratio < UNDER ? "under" : "on",
    ratio,
    score: Math.round(closeness(ratio) * 100),
    stepsHit: 0,
    steps: 0,
    matches: [],
  };
}
