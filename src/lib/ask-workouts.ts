// Finding a workout by typing: by its name, in either language, or by what people call the work ("sweet spot", "soglia"). It
// opens ready to look at and put on the calendar; nothing here saves anything. Pure.
import type { Entry } from "./ask";
import { norm } from "./ask";
import { t } from "./i18n";
import type { MainSport } from "./sport";
import type { SuggestWorkout } from "./suggest";
import { formatDuration } from "./training";
import { parseWorkout } from "./workout";
import { SPECIES, speciesOf } from "./workout-species";
import { kindLabel, workoutTemplates } from "./workout-templates";

export type FoundWorkout = { id: string; name: string; seconds: number; label: string };

type Named = FoundWorkout & { speciesNames: string[]; words: string; plain?: boolean };

/** The plain form of each kind of work: "soglia" should first bring threshold itself, not one of its variations. */
const PLAIN = new Set<string>([
  "Moss",
  "Beech",
  "Cirmolo",
  "Juniper",
  "Chamois",
  "Eagle",
  "Stoat",
  "Peregrine",
]);

/** The built-in workouts of this sport, then your own. */
function named(sport: MainSport, pool: SuggestWorkout[] | undefined): Named[] {
  const own = (pool ?? []).filter((w) => w.mine);
  return [
    ...workoutTemplates(sport).map((w) => {
      const key = speciesOf(w.name());
      const s = key ? SPECIES[key] : null;
      return {
        id: w.id,
        name: w.name(),
        seconds: parseWorkout(w.text(), sport).totalSeconds,
        label: kindLabel(w.kind, sport),
        speciesNames: s ? [s.en, s.it] : [],
        words: s ? `${s.en} ${s.it} ${s.words}` : "",
        plain: !!key && PLAIN.has(key),
      };
    }),
    ...own.map((w) => ({
      id: w.id,
      name: w.name,
      seconds: w.seconds,
      label: t("Your library", "La tua libreria"),
      speciesNames: [],
      words: "",
    })),
  ];
}

/** Every workout as something that can be typed. Each opens on `today`. */
export function workoutEntries(
  sport: MainSport,
  today: string,
  pool: SuggestWorkout[] | undefined,
): Entry[] {
  const shortestFirst = named(sport, pool).sort((a, b) => a.seconds - b.seconds);
  return shortestFirst.map((w) => ({
    id: `workout-${w.id}`,
    q: w.name,
    page: "workouts",
    kind: "plan",
    boost: w.plain ? -6 : -10,
    ...(w.words ? { also: w.words } : {}),
    answer: w.label,
    ...(w.seconds ? { value: formatDuration(w.seconds) } : {}),
    dest: { kind: "route", to: "/suggest", search: { date: today, id: w.id } },
  }));
}

/** The workouts a line starts with, and what's left of it: one by its full name, or all of a species by its name alone. */
export function workoutsNamed(
  said: string,
  sport: MainSport,
  pool: SuggestWorkout[] | undefined,
): { workouts: FoundWorkout[]; rest: string } | null {
  const all = named(sport, pool);
  const after = (name: string) => {
    const n = norm(name).trim().replace(/\s+/g, " ");
    return said.startsWith(`${n} `) ? said.slice(n.length + 1).trim() : null;
  };
  // In the app's language or the other: the species is said either way, and the dose stays the same.
  const fullNames = (w: Named) => {
    const shown = w.speciesNames.find((n) => w.name.startsWith(n));
    return shown ? w.speciesNames.map((n) => n + w.name.slice(shown.length)) : [w.name];
  };
  let best: { w: Named; rest: string; length: number } | null = null;
  for (const w of all)
    for (const name of fullNames(w)) {
      const rest = after(name);
      if (rest != null && (!best || name.length > best.length))
        best = { w, rest, length: name.length };
    }
  if (best) return { workouts: [best.w], rest: best.rest };
  for (const w of all)
    for (const name of w.speciesNames) {
      const rest = after(name);
      if (rest == null) continue;
      const same = all
        .filter((o) => o.speciesNames.includes(name))
        .sort((a, b) => a.seconds - b.seconds);
      return { workouts: same, rest };
    }
  return null;
}
