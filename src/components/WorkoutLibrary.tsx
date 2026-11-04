// The workout library's pieces: the editor (text with live blocks), and the picker that puts a workout on a day.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  useThresholds,
  WorkoutBars,
  WorkoutPreview,
  workoutSport,
} from "@/components/WorkoutPreview";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { t } from "@/lib/i18n";
import type { LibraryWorkout, WorkoutEntry } from "@/lib/intervals";
import { workoutsQuery } from "@/lib/queries";
import { createWorkout, hasSource, scheduleWorkout, updateWorkout } from "@/lib/source";
import { mainSport, sportWords, type MainSport } from "@/lib/sport";
import { formatDuration } from "@/lib/training";
import { cn } from "@/lib/utils";
import { estimateLoad, hasBlocks, parseWorkout, type Thresholds } from "@/lib/workout";
import {
  kindLabel,
  WORKOUT_KINDS,
  workoutTemplates,
  workoutText,
  type WorkoutTemplate,
} from "@/lib/workout-templates";

/** What to save for a workout. The time and load from its text are for Cirmolo's own store: intervals.icu works out its own. */
export function workoutEntry(
  w: { name: string; type: string; description: string },
  th: Thresholds,
): WorkoutEntry {
  const parsed = parseWorkout(w.description, workoutSport(w.type), th);
  return {
    name: w.name,
    type: w.type,
    description: w.description,
    moving_time: Math.round(parsed.totalSeconds),
    icu_training_load: estimateLoad(parsed.blocks),
  };
}

const TYPE_OF: Record<MainSport, string> = { ride: "Ride", run: "Run" };

/** Cycling or running, as a segmented choice. */
export function SportToggle({
  sport,
  onChange,
}: {
  sport: MainSport;
  onChange: (s: MainSport) => void;
}) {
  return (
    <div className="flex gap-1 rounded-lg bg-secondary p-1">
      {(["ride", "run"] as const).map((s) => (
        <button
          key={s}
          type="button"
          aria-pressed={sport === s}
          onClick={() => onChange(s)}
          className={cn(
            "flex-1 rounded-md px-3 py-1.5 text-xs",
            sport === s ? "bg-background text-foreground" : "text-muted-foreground",
          )}
        >
          {sportWords(s).name}
        </button>
      ))}
    </div>
  );
}

/** Writing or changing a workout: name, sport, and its steps as text with the blocks drawn as you type. */
export function WorkoutEditor({
  initial,
  onDone,
}: {
  /** With an id it's changed in place; without one it's saved as new. */
  initial: { id?: string; name: string; type: string; description: string };
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const th = useThresholds();
  const [name, setName] = useState(initial.name);
  const [type, setType] = useState(initial.type);
  const [text, setText] = useState(initial.description);
  const [busy, setBusy] = useState(false);
  const sport = workoutSport(type);
  const parsed = parseWorkout(text, sport, th);
  // A workout of another kind (a swim on intervals.icu, an indoor ride) keeps its type unless the sport is changed.
  const onSport = (s: MainSport) => s !== sport && setType(TYPE_OF[s]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const entry = workoutEntry({ name: name.trim(), type, description: text }, th);
      if (initial.id) await updateWorkout(initial.id, entry);
      else await createWorkout(entry);
      await qc.invalidateQueries({ queryKey: ["workouts"] });
      toast.success(t("Workout saved", "Allenamento salvato"));
      onDone();
    } catch (err) {
      console.warn("Workout not saved", err);
      toast.error(t("Couldn't save the workout", "Impossibile salvare l'allenamento"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-3 pb-2">
      <div className="space-y-1">
        <Label htmlFor="workout-name">{t("Name", "Nome")}</Label>
        <Input
          id="workout-name"
          maxLength={120}
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <SportToggle sport={sport} onChange={onSport} />
      <div className="space-y-1">
        <Label htmlFor="workout-text">{t("Steps", "Blocchi")}</Label>
        <Textarea
          id="workout-text"
          rows={8}
          spellCheck={false}
          className="font-mono text-xs"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={
            sport === "run"
              ? "Warmup\n- 15m 75% Pace\n\nMain set 5x\n- 3m 110% Pace\n- 3m 65% Pace\n\nCooldown\n- 10m 70% Pace"
              : "Warmup\n- 15m Ramp 50-75%\n\nMain set 5x\n- 4m 115%\n- 4m 50%\n\nCooldown\n- 10m 50%"
          }
        />
        <p className="text-xs text-muted-foreground">
          {t(
            `One step per line, starting with "-": time, then target (60%, 80-90%, Ramp 50-75%, Z2, 200w, 90% LTHR, 95% Pace, 4:30/km). "5x" on the line above repeats the steps below it, up to the next blank line.`,
            'Un blocco per riga, che inizia con "-": tempo, poi obiettivo (60%, 80-90%, Ramp 50-75%, Z2, 200w, 90% LTHR, 95% Pace, 4:30/km). "5x" nella riga sopra ripete i blocchi sotto, fino alla riga vuota successiva.',
          )}
        </p>
      </div>
      <WorkoutPreview text={text} type={type} />
      {parsed.unread.length > 0 && (
        <p className="text-xs text-birch" role="status">
          {t("Not understood:", "Non riconosciuto:")} {parsed.unread.join(" · ")}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={busy || !name.trim()}>
        {t("Save", "Salva")}
      </Button>
    </form>
  );
}

/** One workout in a list: name, time and load, its blocks. */
export function WorkoutRow({
  name,
  about,
  text,
  type,
  seconds,
  load,
  onClick,
}: {
  name: string;
  about?: string | undefined;
  text: string | null;
  type: string | null;
  seconds?: number | null;
  load?: number | null;
  onClick: () => void;
}) {
  const th = useThresholds();
  const parsed = parseWorkout(text, workoutSport(type), th);
  const secs = seconds || parsed.totalSeconds;
  const stats = [
    secs ? formatDuration(secs) : null,
    (load ?? (hasBlocks(parsed) ? estimateLoad(parsed.blocks) : null)) != null
      ? `${t("load", "carico")} ${load ?? estimateLoad(parsed.blocks)}`
      : null,
  ].filter(Boolean);
  return (
    <button
      type="button"
      onClick={onClick}
      className="block w-full rounded-md px-2 py-2 text-left transition-colors hover:bg-secondary/40"
    >
      <span className="block truncate text-sm">{name}</span>
      <span className="stat-num block text-xs text-muted-foreground">{stats.join(" · ")}</span>
      {about && (
        <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">{about}</span>
      )}
      {hasBlocks(parsed) && <WorkoutBars blocks={parsed.blocks} compact className="mt-1" />}
    </button>
  );
}

/** The starter workouts by kind, each kind folded until opened: there are too many to scroll through. */
export function StarterWorkouts({
  sport,
  onPick,
}: {
  sport: MainSport;
  onPick: (w: WorkoutTemplate) => void;
}) {
  const all = workoutTemplates(sport);
  return (
    <div className="-mx-2 divide-y divide-border">
      {WORKOUT_KINDS.map((kind) => {
        const list = all.filter((w) => w.kind === kind);
        if (!list.length) return null;
        return (
          <Collapsible key={kind}>
            <CollapsibleTrigger className="group flex w-full items-center justify-between gap-3 rounded-md px-2 py-2.5 text-left text-sm transition-colors hover:bg-secondary/40">
              <span>{kindLabel(kind, sport)}</span>
              <span className="stat-num flex items-center gap-1.5 text-xs text-muted-foreground">
                {list.length}
                <ChevronDown className="h-4 w-4 transition-transform group-data-[state=open]:rotate-180" />
              </span>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <ul className="divide-y divide-border pb-1">
                {list.map((w) => (
                  <li key={w.id}>
                    <WorkoutRow
                      name={w.name()}
                      about={w.about?.()}
                      text={w.text()}
                      type={TYPE_OF[sport]}
                      onClick={() => onPick(w)}
                    />
                  </li>
                ))}
              </ul>
            </CollapsibleContent>
          </Collapsible>
        );
      })}
    </div>
  );
}

/** Choosing a workout for a day, from the library or the starter set. */
export function WorkoutPicker({ date, onDone }: { date: string; onDone: () => void }) {
  const qc = useQueryClient();
  const th = useThresholds();
  const [sport, setSport] = useState(mainSport);
  const [busy, setBusy] = useState(false);
  const { data: workouts = [] } = useQuery({ ...workoutsQuery(), enabled: hasSource() });
  const mine = workouts.filter((w: LibraryWorkout) => workoutSport(w.type) === sport);
  async function plan(w: { name: string; type: string; description: string }) {
    if (busy) return;
    setBusy(true);
    try {
      await scheduleWorkout(workoutEntry(w, th), date);
      await qc.invalidateQueries({ queryKey: ["events"] });
      toast.success(t("Workout planned", "Allenamento pianificato"));
      onDone();
    } catch (err) {
      console.warn("Workout not planned", err);
      toast.error(t("Couldn't plan the workout", "Impossibile pianificare l'allenamento"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-3">
      <SportToggle sport={sport} onChange={setSport} />
      {mine.length > 0 && (
        <section>
          <h3 className="mb-1 text-sm font-medium text-muted-foreground">
            {t("Your library", "La tua libreria")}
          </h3>
          <ul className="-mx-2 divide-y divide-border">
            {mine.map((w) => (
              <li key={w.id}>
                <WorkoutRow
                  name={w.name}
                  text={w.description}
                  type={w.type}
                  seconds={w.moving_time}
                  load={w.icu_training_load}
                  onClick={() =>
                    void plan({
                      name: w.name,
                      type: w.type ?? TYPE_OF[sport],
                      description: w.description ?? "",
                    })
                  }
                />
              </li>
            ))}
          </ul>
        </section>
      )}
      <section>
        <h3 className="mb-1 text-sm font-medium text-muted-foreground">
          {t("Starter workouts", "Allenamenti di base")}
        </h3>
        <StarterWorkouts
          sport={sport}
          onPick={(w) =>
            void plan({ name: w.name(), type: TYPE_OF[sport], description: workoutText(w) })
          }
        />
      </section>
    </div>
  );
}
