// Ready-made workouts to copy into the library, as intervals.icu builder text. Never written anywhere until asked.
import type { Focus } from "./races";
import { t } from "./i18n";
import type { MainSport } from "./sport";
import { WORKOUT_LIBRARY } from "./workout-library-data";

/** What a workout is, for finding one: the starter workouts are listed by this. */
export type WorkoutKind =
  "recovery" | "endurance" | "tempo" | "threshold" | "vo2" | "anaerobic" | "extreme" | "warmup";

export const WORKOUT_KINDS: WorkoutKind[] = [
  "recovery",
  "endurance",
  "tempo",
  "threshold",
  "vo2",
  "anaerobic",
  "extreme",
  "warmup",
];

export const kindLabel = (kind: WorkoutKind, sport: MainSport): string =>
  ({
    recovery: t("Recovery", "Recupero"),
    endurance: t("Endurance", "Fondo"),
    tempo: sport === "run" ? t("Tempo", "Medio") : t("Tempo & sweet spot", "Tempo e sweet spot"),
    threshold: t("Threshold", "Soglia"),
    vo2: sport === "run" ? "VO2max" : t("VO2max & race", "VO2max e gara"),
    anaerobic:
      sport === "run" ? t("Speed", "Velocità") : t("Sprint & anaerobic", "Sprint e anaerobico"),
    extreme: t("Psycho", "Psycho"),
    warmup: t("Warm-ups & openers", "Riscaldamenti e attivazioni"),
  })[kind];

export type WorkoutTemplate = {
  id: string;
  kind: WorkoutKind;
  name: () => string;
  /** What it's for, in a line or two. */
  about?: () => string;
  /** The training focus it fits (see lib/focus). */
  focus?: Focus;
  /** Its steps, as builder text. */
  text: () => string;
};

const RIDE: WorkoutTemplate[] = [
  {
    id: "r-endurance",
    kind: "endurance",
    name: () => t("Endurance 90 minutes", "Fondo 90 minuti"),
    focus: "base",
    text: () => "Warmup\n- 10m Ramp 45-65%\n\nMain set\n- 75m 65%\n\nCooldown\n- 5m 50%",
  },
  {
    id: "r-long",
    kind: "endurance",
    name: () => t("Long endurance 3 hours", "Fondo lungo 3 ore"),
    focus: "base",
    text: () => "Warmup\n- 15m Ramp 45-65%\n\nMain set\n- 155m 62-70%\n\nCooldown\n- 10m 50%",
  },
  {
    id: "r-tempo",
    kind: "tempo",
    name: () => t("Tempo 3 x 15", "Tempo 3 x 15"),
    focus: "base",
    text: () =>
      "Warmup\n- 15m Ramp 50-70%\n\nMain set 3x\n- 15m 82%\n- 5m 55%\n\nCooldown\n- 10m 50%",
  },
  {
    id: "r-sweet-spot",
    kind: "tempo",
    name: () => t("Sweet spot 3 x 12", "Sweet spot 3 x 12"),
    focus: "aerobic",
    text: () =>
      "Warmup\n- 15m Ramp 50-75%\n\nMain set 3x\n- 12m 90%\n- 5m 55%\n\nCooldown\n- 10m 50%",
  },
  {
    id: "r-threshold-2x20",
    kind: "threshold",
    name: () => t("Threshold 2 x 20", "Soglia 2 x 20"),
    focus: "aerobic",
    text: () =>
      "Warmup\n- 15m Ramp 50-75%\n\nMain set 2x\n- 20m 97%\n- 8m 55%\n\nCooldown\n- 10m 50%",
  },
  {
    id: "r-over-under",
    kind: "threshold",
    name: () => t("Over-unders 3 x 9", "Over-under 3 x 9"),
    focus: "aerobic",
    text: () =>
      "Warmup\n- 15m Ramp 50-75%\n\nFirst 3x\n- 2m 92%\n- 1m 106%\n\n- 6m 55%\n\nSecond 3x\n- 2m 92%\n- 1m 106%\n\n- 6m 55%\n\nThird 3x\n- 2m 92%\n- 1m 106%\n\nCooldown\n- 10m 50%",
  },
  {
    id: "r-vo2-5x4",
    kind: "vo2",
    name: () => t("VO2max 5 x 4", "VO2max 5 x 4"),
    focus: "vo2",
    text: () =>
      "Warmup\n- 15m Ramp 50-75%\n- 3m 90%\n- 3m 55%\n\nMain set 5x\n- 4m 115%\n- 4m 50%\n\nCooldown\n- 10m 50%",
  },
  {
    id: "r-vo2-30-15",
    kind: "vo2",
    name: () => t("VO2max 30/15", "VO2max 30/15"),
    focus: "vo2",
    text: () =>
      "Warmup\n- 15m Ramp 50-75%\n\nFirst 13x\n- 30s 125%\n- 15s 50%\n\n- 5m 50%\n\nSecond 13x\n- 30s 125%\n- 15s 50%\n\n- 5m 50%\n\nThird 13x\n- 30s 125%\n- 15s 50%\n\nCooldown\n- 10m 50%",
  },
  {
    id: "r-anaerobic",
    kind: "anaerobic",
    name: () => t("Anaerobic 6 x 1", "Anaerobico 6 x 1"),
    focus: "anaerobic",
    text: () =>
      "Warmup\n- 15m Ramp 50-75%\n- 3m 90%\n- 3m 55%\n\nMain set 6x\n- 1m 140%\n- 4m 50%\n\nCooldown\n- 10m 50%",
  },
  {
    id: "r-sprints",
    kind: "anaerobic",
    name: () => t("Sprints 8 x 15 s", "Sprint 8 x 15 s"),
    focus: "sprint",
    text: () =>
      "Warmup\n- 15m Ramp 50-70%\n\nMain set 8x\n- 15s 200%\n- 4m45s 50%\n\nCooldown\n- 10m 50%",
  },
];

const RUN: WorkoutTemplate[] = [
  {
    id: "w-easy",
    kind: "endurance",
    name: () => t("Easy 45 minutes", "Lento 45 minuti"),
    focus: "base",
    text: () => "Main set\n- 45m 75% Pace",
  },
  {
    id: "w-long",
    kind: "endurance",
    name: () => t("Long run 90 minutes", "Lungo 90 minuti"),
    focus: "base",
    text: () => "Warmup\n- 10m 70% Pace\n\nMain set\n- 75m 78% Pace\n\nCooldown\n- 5m 70% Pace",
  },
  {
    id: "w-strides",
    kind: "endurance",
    name: () => t("Easy with strides", "Lento con allunghi"),
    focus: "base",
    text: () =>
      "Main set\n- 35m 75% Pace\n\nStrides 6x\n- 20s 110% Pace\n- 1m40s 65% Pace\n\nCooldown\n- 5m 70% Pace",
  },
  {
    id: "w-tempo",
    kind: "tempo",
    name: () => t("Tempo 20 minutes", "Medio 20 minuti"),
    focus: "aerobic",
    text: () => "Warmup\n- 15m 75% Pace\n\nMain set\n- 20m 92% Pace\n\nCooldown\n- 10m 70% Pace",
  },
  {
    id: "w-threshold",
    kind: "threshold",
    name: () => t("Threshold 3 x 10", "Soglia 3 x 10"),
    focus: "aerobic",
    text: () =>
      "Warmup\n- 15m 75% Pace\n\nMain set 3x\n- 10m 100% Pace\n- 2m 65% Pace\n\nCooldown\n- 10m 70% Pace",
  },
  {
    id: "w-cruise",
    kind: "threshold",
    name: () => t("Cruise 6 x 1 km", "Ripetute 6 x 1 km"),
    focus: "aerobic",
    text: () =>
      "Warmup\n- 15m 75% Pace\n\nMain set 6x\n- 1km 102% Pace\n- 1m 65% Pace\n\nCooldown\n- 10m 70% Pace",
  },
  {
    id: "w-vo2",
    kind: "vo2",
    name: () => t("VO2max 5 x 3", "VO2max 5 x 3"),
    focus: "vo2",
    text: () =>
      "Warmup\n- 15m 75% Pace\n\nMain set 5x\n- 3m 110% Pace\n- 3m 65% Pace\n\nCooldown\n- 10m 70% Pace",
  },
  {
    id: "w-hills",
    kind: "vo2",
    name: () => t("Hills 8 x 90 s", "Ripetute in salita 8 x 90 s"),
    focus: "vo2",
    text: () =>
      "Warmup\n- 15m 75% Pace\n\nUphill 8x\n- 1m30s Z5 Pace\n- 2m30s Z1 Pace\n\nCooldown\n- 10m 70% Pace",
  },
  {
    id: "w-speed",
    kind: "anaerobic",
    name: () => t("Speed 10 x 200 m", "Velocità 10 x 200 m"),
    focus: "anaerobic",
    text: () =>
      "Warmup\n- 15m 75% Pace\n\nMain set 10x\n- 200mtr 125% Pace\n- 1m30s 60% Pace\n\nCooldown\n- 10m 70% Pace",
  },
];

/** The step labels the library's workouts carry, in the reader's language. */
const stepsIn = (steps: string) =>
  steps
    .replaceAll("{aero}", "Aero")
    .replaceAll("{up}", t("Sit up", "Busto alto"))
    .replaceAll("{cadence}", t("High cadence", "Agilità"));

const LIBRARY: WorkoutTemplate[] = WORKOUT_LIBRARY.map((w) => ({
  id: w.id,
  kind: w.kind,
  ...(w.focus ? { focus: w.focus } : {}),
  name: () => t(...w.name),
  about: () => t(...w.about),
  text: () => stepsIn(w.steps),
}));

export const workoutTemplates = (sport: MainSport) =>
  sport === "run" ? RUN : [...RIDE, ...LIBRARY];

/** What a starter workout puts in the library or on the calendar: what it's for, then its steps. */
export const workoutText = (w: WorkoutTemplate) =>
  w.about ? `${w.about()}\n\n${w.text()}` : w.text();
