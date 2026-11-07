// What intervals.icu's builder can read, checked on every built-in workout: it turns this text into what Garmin and
// Zwift receive, and our own parser is more forgiving than its guide. The rules follow the guide
// (forum.intervals.icu/t/workout-builder-syntax-quick-guide/123701).
import { describe, expect, it } from "vitest";
import { WORKOUT_LIBRARY } from "./workout-library-data";
import { workoutTemplates, workoutText } from "./workout-templates";
import { estimateLoad, parseWorkout } from "./workout";

const REPEAT = /(?:^|\s)\d+\s*x$/i;
const DURATION = /^(?:\d+h(?:\d+m)?|\d+m(?:\d+s)?|\d+s)$/;

/** Everything wrong with a workout's steps, for the error to name. */
function formatProblems(text: string, sport: "ride" | "run") {
  const problems: string[] = [];
  const lines = text.split("\n").map((l) => l.trim());
  lines.forEach((line, i) => {
    const before = lines[i - 1];
    const after = lines[i + 1];
    if (REPEAT.test(line)) {
      if (i > 0 && before !== "") problems.push(`no blank line before "${line}"`);
      if (!after?.startsWith("- ")) problems.push(`"${line}" repeats nothing`);
    }
    if (!line.startsWith("- ")) return;
    if (/^[-•]\s*\d+\s*x\b/i.test(line)) problems.push(`nested repeat "${line}"`);
    const words = line.slice(2).split(/\s+/);
    const time = words.findIndex((w) => /^\d/.test(w));
    if (time < 0) {
      problems.push(`no duration in "${line}"`);
      return;
    }
    const isDistance = sport === "run" && /^\d+(?:\.\d+)?(?:km|mtr)$/.test(words[time]!);
    if (!isDistance && !DURATION.test(words[time]!)) problems.push(`duration in "${line}"`);
    const target = words.slice(time + 1).join(" ");
    if (sport === "ride" && !/^(?:[Rr]amp )?\d+(?:-\d+)?%(?: \d+(?:-\d+)?rpm)?$/.test(target))
      problems.push(`target in "${line}"`);
    if (sport === "run" && !/\bPace\b/.test(target)) problems.push(`target in "${line}"`);
  });
  return problems;
}

/** Prose goes ahead of the steps, so no line of it may read as a step or a repeat. */
function proseProblems(about: string) {
  const problems: string[] = [];
  for (const line of about.split("\n").map((l) => l.trim())) {
    if (/^[-•]/.test(line)) problems.push(`reads as a step: "${line}"`);
    if (REPEAT.test(line)) problems.push(`reads as a repeat: "${line}"`);
  }
  return problems;
}

describe("the format every workout is sent in", () => {
  for (const sport of ["ride", "run"] as const)
    for (const w of workoutTemplates(sport))
      it(`${sport} ${w.id}`, () => {
        expect(formatProblems(w.text(), sport)).toEqual([]);
        // Prose and steps together read exactly as the steps alone.
        const whole = parseWorkout(workoutText(w), sport, { ftp: 250, pace: 4 });
        const steps = parseWorkout(w.text(), sport, { ftp: 250, pace: 4 });
        expect(whole.unread).toEqual([]);
        expect(whole.totalSeconds).toBe(steps.totalSeconds);
        expect(estimateLoad(whole.blocks)).toBe(estimateLoad(steps.blocks));
      });

  it("keeps prose from reading as steps, in both languages", () => {
    for (const w of WORKOUT_LIBRARY)
      for (const about of w.about) expect(proseProblems(about), w.id).toEqual([]);
  });

  it("never names a source or a study in what riders read", () => {
    const words = /zwift|cyclingintervals|cody|hamilton|seiler|r(ø|o)nnestad|nuuttila/i;
    for (const w of WORKOUT_LIBRARY) expect(JSON.stringify(w), w.id).not.toMatch(words);
  });

  it("gives every workout its own id and name, in both languages", () => {
    const ride = WORKOUT_LIBRARY;
    expect(new Set(ride.map((w) => w.id)).size).toBe(ride.length);
    for (const lang of [0, 1]) {
      const names = ride.map((w) => w.name[lang]);
      expect(new Set(names).size).toBe(names.length);
    }
  });

  // Suggestions tell what's on the calendar by its exact name, so a name can't be shared within a sport.
  it("gives every workout of a sport its own name, with the starters", () => {
    for (const sport of ["ride", "run"] as const) {
      const names = workoutTemplates(sport).map((w) => w.name());
      expect(new Set(names).size).toBe(names.length);
    }
  });
});
