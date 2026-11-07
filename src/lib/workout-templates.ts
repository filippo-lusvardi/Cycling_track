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
    extreme: t("Beasts", "Le Bestie"),
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
    name: () => t("Oak 90", "Quercia 90"),
    about: () =>
      t(
        "An oak does one thing, steadily, for a long time. A steady hour and a quarter in Z2. Talking pace all the way.",
        "La quercia fa una cosa sola, con calma, per molto tempo. Un'ora e un quarto regolare in Z2. Ritmo da chiacchiera per tutto il tempo.",
      ),
    focus: "base",
    text: () => "Warmup\n- 10m Ramp 45-65%\n\nMain set\n- 75m 65%\n\nCooldown\n- 5m 50%",
  },
  {
    id: "r-long",
    kind: "endurance",
    name: () => t("Oak 180", "Quercia 180"),
    about: () =>
      t(
        "An oak does one thing, steadily, for a long time. Over two and a half hours in Z2. Start easy, and eat and drink as you go.",
        "La quercia fa una cosa sola, con calma, per molto tempo. Più di due ore e mezza in Z2. Parti piano, mangia e bevi lungo la strada.",
      ),
    focus: "base",
    text: () => "Warmup\n- 15m Ramp 45-65%\n\nMain set\n- 155m 62-70%\n\nCooldown\n- 10m 50%",
  },
  {
    id: "r-tempo",
    kind: "tempo",
    name: () => t("Juniper 3 x 15", "Ginepro 3 x 15"),
    about: () =>
      t(
        "Juniper grows slowly and evenly. 3 x 15 min tempo (82% FTP) with 5 easy minutes between. Long, even blocks.",
        "Il ginepro cresce lento e regolare. 3 x 15 min di tempo (82% FTP) con 5 min facili in mezzo. Blocchi lunghi e regolari.",
      ),
    focus: "base",
    text: () =>
      "Warmup\n- 15m Ramp 50-70%\n\nMain set 3x\n- 15m 82%\n- 5m 55%\n\nCooldown\n- 10m 50%",
  },
  {
    id: "r-sweet-spot",
    kind: "tempo",
    name: () => t("Cirmolo 3 x 12", "Cirmolo 3 x 12"),
    about: () =>
      t(
        "The cirmolo grows slowly at the treeline and lasts for centuries. 3 x 12 min sweet spot (90% FTP) with 5 easy minutes between. The most for your time.",
        "Il cirmolo cresce piano al limite del bosco e vive per secoli. 3 x 12 min di sweet spot (90% FTP) con 5 min facili in mezzo. La resa migliore per il tempo che ci metti.",
      ),
    focus: "aerobic",
    text: () =>
      "Warmup\n- 15m Ramp 50-75%\n\nMain set 3x\n- 12m 90%\n- 5m 55%\n\nCooldown\n- 10m 50%",
  },
  {
    id: "r-threshold-2x20",
    kind: "threshold",
    name: () => t("Chamois 2 x 20", "Camoscio 2 x 20"),
    about: () =>
      t(
        "The chamois keeps going up a steep slope. 2 x 20 min just under FTP (97%) with 8 easy minutes between. It builds FTP.",
        "Il camoscio continua a salire sul pendio ripido. 2 x 20 min appena sotto FTP (97%) con 8 min facili in mezzo. Fa crescere l'FTP.",
      ),
    focus: "aerobic",
    text: () =>
      "Warmup\n- 15m Ramp 50-75%\n\nMain set 2x\n- 20m 97%\n- 8m 55%\n\nCooldown\n- 10m 50%",
  },
  {
    id: "r-over-under",
    kind: "threshold",
    name: () => t("Dipper 3 x 9", "Merlo acquaiolo 3 x 9"),
    about: () =>
      t(
        "The dipper goes under the stream and back out. 3 x 9 min over-under: 2 min just under FTP, 1 min over. Trains coping with surges above FTP.",
        "Il merlo acquaiolo si immerge nel torrente e torna fuori. 3 x 9 min di over-under: 2 min appena sotto FTP, 1 min sopra. Allena a reggere gli strappi sopra FTP.",
      ),
    focus: "aerobic",
    text: () =>
      "Warmup\n- 15m Ramp 50-75%\n\nFirst 3x\n- 2m 92%\n- 1m 106%\n\n- 6m 55%\n\nSecond 3x\n- 2m 92%\n- 1m 106%\n\n- 6m 55%\n\nThird 3x\n- 2m 92%\n- 1m 106%\n\nCooldown\n- 10m 50%",
  },
  {
    id: "r-vo2-5x4",
    kind: "vo2",
    name: () => t("Eagle 5 x 4", "Aquila 5 x 4"),
    about: () =>
      t(
        "The eagle beats hard, then glides. 5 x 4 min VO2max (115% FTP) with 4 easy minutes between. Pace them: the last should be as strong as the first.",
        "L'aquila batte forte le ali, poi plana. 5 x 4 min di VO2max (115% FTP) con 4 min facili in mezzo. Dosa lo sforzo: l'ultimo deve valere quanto il primo.",
      ),
    focus: "vo2",
    text: () =>
      "Warmup\n- 15m Ramp 50-75%\n- 3m 90%\n- 3m 55%\n\nMain set 5x\n- 4m 115%\n- 4m 50%\n\nCooldown\n- 10m 50%",
  },
  {
    id: "r-vo2-30-15",
    kind: "vo2",
    name: () => t("Swift 30/15", "Rondone 30/15"),
    about: () =>
      t(
        "A swift's wings barely stop. 3 sets of 13 x 30/15: 30 s at 125% FTP, 15 s easy. The rests are short, so the effort adds up.",
        "Le ali del rondone non si fermano quasi mai. 3 serie di 13 x 30/15: 30 s al 125% FTP, 15 s facili. I recuperi sono brevi, e lo sforzo si accumula.",
      ),
    focus: "vo2",
    text: () =>
      "Warmup\n- 15m Ramp 50-75%\n\nFirst 13x\n- 30s 125%\n- 15s 50%\n\n- 5m 50%\n\nSecond 13x\n- 30s 125%\n- 15s 50%\n\n- 5m 50%\n\nThird 13x\n- 30s 125%\n- 15s 50%\n\nCooldown\n- 10m 50%",
  },
  {
    id: "r-anaerobic",
    kind: "anaerobic",
    name: () => t("Stoat 6 x 1", "Ermellino 6 x 1"),
    about: () =>
      t(
        "The stoat hunts in frantic short chases. 6 x 1 min at 140% FTP with 4 easy minutes between. It should sting.",
        "L'ermellino caccia con brevi inseguimenti frenetici. 6 x 1 min al 140% FTP con 4 min facili in mezzo. Deve bruciare.",
      ),
    focus: "anaerobic",
    text: () =>
      "Warmup\n- 15m Ramp 50-75%\n- 3m 90%\n- 3m 55%\n\nMain set 6x\n- 1m 140%\n- 4m 50%\n\nCooldown\n- 10m 50%",
  },
  {
    id: "r-sprints",
    kind: "anaerobic",
    name: () => t("Peregrine 8 x 15 s", "Falco pellegrino 8 x 15 s"),
    about: () =>
      t(
        "Diving, the peregrine is the fastest animal there is. 8 x 15 s full sprint with almost 5 minutes' rest. Every sprint all out.",
        "In picchiata, il falco pellegrino è l'animale più veloce che ci sia. 8 x 15 s di sprint con quasi 5 min di recupero. Ogni sprint al massimo.",
      ),
    focus: "sprint",
    text: () =>
      "Warmup\n- 15m Ramp 50-70%\n\nMain set 8x\n- 15s 200%\n- 4m45s 50%\n\nCooldown\n- 10m 50%",
  },
];

const RUN: WorkoutTemplate[] = [
  {
    id: "w-easy",
    kind: "endurance",
    name: () => t("Beech 45", "Faggio 45"),
    about: () =>
      t(
        "Beech is the backbone of the mountain forest. 45 minutes of easy running. You should be able to talk all the way.",
        "Il faggio è l'ossatura del bosco di montagna. 45 minuti di corsa lenta. Devi poter chiacchierare per tutto il tempo.",
      ),
    focus: "base",
    text: () => "Main set\n- 45m 75% Pace",
  },
  {
    id: "w-long",
    kind: "endurance",
    name: () => t("Oak 90", "Quercia 90"),
    about: () =>
      t(
        "An oak does one thing, steadily, for a long time. A long run of 90 minutes, easy and even.",
        "La quercia fa una cosa sola, con calma, per molto tempo. Un lungo di 90 minuti, lento e regolare.",
      ),
    focus: "base",
    text: () => "Warmup\n- 10m 70% Pace\n\nMain set\n- 75m 78% Pace\n\nCooldown\n- 5m 70% Pace",
  },
  {
    id: "w-strides",
    kind: "endurance",
    name: () => t("Aspen 6 x 20 s", "Pioppo tremolo 6 x 20 s"),
    about: () =>
      t(
        "An aspen's leaves quiver in the lightest breeze. Easy running, then 6 strides of 20 s, quick and relaxed.",
        "Le foglie del pioppo tremolo vibrano alla minima brezza. Corsa lenta, poi 6 allunghi da 20 s, veloci e sciolti.",
      ),
    focus: "base",
    text: () =>
      "Main set\n- 35m 75% Pace\n\nStrides 6x\n- 20s 110% Pace\n- 1m40s 65% Pace\n\nCooldown\n- 5m 70% Pace",
  },
  {
    id: "w-tempo",
    kind: "tempo",
    name: () => t("Juniper 20", "Ginepro 20"),
    about: () =>
      t(
        "Juniper grows slowly and evenly. 20 minutes of steady tempo (92% of threshold pace).",
        "Il ginepro cresce lento e regolare. 20 minuti di medio regolare (92% del passo soglia).",
      ),
    focus: "aerobic",
    text: () => "Warmup\n- 15m 75% Pace\n\nMain set\n- 20m 92% Pace\n\nCooldown\n- 10m 70% Pace",
  },
  {
    id: "w-threshold",
    kind: "threshold",
    name: () => t("Chamois 3 x 10", "Camoscio 3 x 10"),
    about: () =>
      t(
        "The chamois keeps going up a steep slope. 3 x 10 min at threshold pace with 2 easy minutes between.",
        "Il camoscio continua a salire sul pendio ripido. 3 x 10 min a passo soglia con 2 min facili in mezzo.",
      ),
    focus: "aerobic",
    text: () =>
      "Warmup\n- 15m 75% Pace\n\nMain set 3x\n- 10m 100% Pace\n- 2m 65% Pace\n\nCooldown\n- 10m 70% Pace",
  },
  {
    id: "w-cruise",
    kind: "threshold",
    name: () => t("Chamois 6 x 1 km", "Camoscio 6 x 1 km"),
    about: () =>
      t(
        "The chamois keeps going up a steep slope. 6 x 1 km just faster than threshold pace, with 1 easy minute between.",
        "Il camoscio continua a salire sul pendio ripido. 6 x 1 km appena più veloci del passo soglia, con 1 min facile in mezzo.",
      ),
    focus: "aerobic",
    text: () =>
      "Warmup\n- 15m 75% Pace\n\nMain set 6x\n- 1km 102% Pace\n- 1m 65% Pace\n\nCooldown\n- 10m 70% Pace",
  },
  {
    id: "w-vo2",
    kind: "vo2",
    name: () => t("Eagle 5 x 3", "Aquila 5 x 3"),
    about: () =>
      t(
        "The eagle beats hard, then glides. 5 x 3 min of VO2max (110% of threshold pace) with 3 easy minutes between.",
        "L'aquila batte forte le ali, poi plana. 5 x 3 min di VO2max (110% del passo soglia) con 3 min facili in mezzo.",
      ),
    focus: "vo2",
    text: () =>
      "Warmup\n- 15m 75% Pace\n\nMain set 5x\n- 3m 110% Pace\n- 3m 65% Pace\n\nCooldown\n- 10m 70% Pace",
  },
  {
    id: "w-hills",
    kind: "vo2",
    name: () => t("Skylark 8 x 90 s", "Allodola 8 x 90 s"),
    about: () =>
      t(
        "The skylark rises singing, higher and higher. 8 x 90 s uphill, hard, then back down slowly.",
        "L'allodola sale cantando, sempre più in alto. 8 x 90 s in salita, forte, poi giù piano.",
      ),
    focus: "vo2",
    text: () =>
      "Warmup\n- 15m 75% Pace\n\nUphill 8x\n- 1m30s Z5 Pace\n- 2m30s Z1 Pace\n\nCooldown\n- 10m 70% Pace",
  },
  {
    id: "w-speed",
    kind: "anaerobic",
    name: () => t("Stoat 10 x 200 m", "Ermellino 10 x 200 m"),
    about: () =>
      t(
        "The stoat hunts in frantic short chases. 10 x 200 m fast (125% of threshold pace) with 90 s easy between.",
        "L'ermellino caccia con brevi inseguimenti frenetici. 10 x 200 m veloci (125% del passo soglia) con 90 s facili in mezzo.",
      ),
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
