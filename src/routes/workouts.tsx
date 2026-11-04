import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  SportToggle,
  StarterWorkouts,
  WorkoutEditor,
  workoutEntry,
  WorkoutRow,
} from "@/components/WorkoutLibrary";
import { useThresholds, WorkoutPreview, workoutSport } from "@/components/WorkoutPreview";
import { ResponsiveDialog } from "@/components/ResponsiveDialog";
import { Panel } from "@/components/StatCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { t } from "@/lib/i18n";
import type { LibraryWorkout } from "@/lib/intervals";
import { workoutsQuery } from "@/lib/queries";
import { deleteWorkout, hasSource, scheduleWorkout, sourceKind } from "@/lib/source";
import { mainSport, type MainSport } from "@/lib/sport";
import { isoDate } from "@/lib/training";
import { workoutText, type WorkoutTemplate } from "@/lib/workout-templates";

export const Route = createFileRoute("/workouts")({
  head: () => ({ meta: [{ title: t("Workouts — Cirmolo", "Allenamenti — Cirmolo") }] }),
  component: WorkoutsPage,
});

type Draft = { id?: string; name: string; type: string; description: string };
const TYPE_OF: Record<MainSport, string> = { ride: "Ride", run: "Run" };

function WorkoutsPage() {
  const [sport, setSport] = useState<MainSport>(mainSport);
  const { data: workouts, isError } = useQuery({ ...workoutsQuery(), enabled: hasSource() });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [opened, setOpened] = useState<LibraryWorkout | null>(null);
  const shown = (workouts ?? []).filter((w) => workoutSport(w.type) === sport);
  // By folder on intervals.icu, those without one first.
  const groups = [...new Set(shown.map((w) => w.folder))].sort((a, b) =>
    (a ?? "").localeCompare(b ?? ""),
  );
  const copy = (w: WorkoutTemplate) =>
    setDraft({ name: w.name(), type: TYPE_OF[sport], description: workoutText(w) });
  return (
    <div className="space-y-5">
      <div>
        <div className="eyebrow text-foreground/75">
          {sourceKind() === "native"
            ? t("Your library", "La tua libreria")
            : t("Your intervals.icu library", "La tua libreria di intervals.icu")}
        </div>
        <h1 className="on-sky text-3xl font-bold tracking-tight">{t("Workouts", "Allenamenti")}</h1>
      </div>
      <div className="glass rounded-lg">
        <SportToggle sport={sport} onChange={setSport} />
      </div>
      <Panel
        title={t("Your library", "La tua libreria")}
        action={
          <Button
            size="sm"
            variant="outline"
            onClick={() => setDraft({ name: "", type: TYPE_OF[sport], description: "" })}
          >
            <Plus /> {t("New workout", "Nuovo allenamento")}
          </Button>
        }
      >
        {isError ? (
          <p className="text-sm text-muted-foreground">
            {t(
              "Couldn't load the library. Check the connection and open this page again.",
              "Impossibile caricare la libreria. Controlla la connessione e riapri questa pagina.",
            )}
          </p>
        ) : shown.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {workouts
              ? t(
                  "Nothing here yet. Write a workout, or copy one of the starter workouts below.",
                  "Ancora niente. Scrivi un allenamento, o copia uno di quelli di base qui sotto.",
                )
              : t("Loading…", "Caricamento…")}
          </p>
        ) : (
          groups.map((g) => (
            <section key={g ?? ""} className="mt-3 first:mt-0">
              {g && <h3 className="mb-1 text-xs font-medium text-muted-foreground">{g}</h3>}
              <ul className="-mx-2 divide-y divide-border">
                {shown
                  .filter((w) => w.folder === g)
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((w) => (
                    <li key={w.id}>
                      <WorkoutRow
                        name={w.name}
                        text={w.description}
                        type={w.type}
                        seconds={w.moving_time}
                        load={w.icu_training_load}
                        onClick={() => setOpened(w)}
                      />
                    </li>
                  ))}
              </ul>
            </section>
          ))
        )}
      </Panel>
      <Panel title={t("Starter workouts", "Allenamenti di base")}>
        <p className="mb-2 text-sm text-muted-foreground">
          {t(
            "Tap one to copy it into your library, changing whatever you like first.",
            "Toccane uno per copiarlo nella tua libreria, cambiando prima quello che vuoi.",
          )}
        </p>
        <StarterWorkouts sport={sport} onPick={copy} />
      </Panel>
      <ResponsiveDialog
        open={draft != null}
        onOpenChange={(o) => !o && setDraft(null)}
        title={
          draft?.id
            ? t("Edit workout", "Modifica allenamento")
            : t("New workout", "Nuovo allenamento")
        }
      >
        {draft && (
          <WorkoutEditor
            key={draft.id ?? draft.name}
            initial={draft}
            onDone={() => setDraft(null)}
          />
        )}
      </ResponsiveDialog>
      <ResponsiveDialog
        open={opened != null}
        onOpenChange={(o) => !o && setOpened(null)}
        title={opened?.name ?? ""}
      >
        {opened && (
          <WorkoutDetail
            key={opened.id}
            w={opened}
            onClose={() => setOpened(null)}
            onEdit={(d) => {
              setOpened(null);
              setDraft(d);
            }}
          />
        )}
      </ResponsiveDialog>
    </div>
  );
}

/** One workout: its blocks and steps, onto the calendar, and changing or deleting it. */
function WorkoutDetail({
  w,
  onClose,
  onEdit,
}: {
  w: LibraryWorkout;
  onClose: () => void;
  onEdit: (d: Draft) => void;
}) {
  const qc = useQueryClient();
  const th = useThresholds();
  const [date, setDate] = useState(() => isoDate(new Date()));
  const [busy, setBusy] = useState(false);
  const [sure, setSure] = useState(false);
  const type = w.type ?? "Ride";
  const fields = { name: w.name, type, description: w.description ?? "" };
  async function act(run: () => Promise<unknown>, key: string, done: string, failed: string) {
    setBusy(true);
    try {
      await run();
      await qc.invalidateQueries({ queryKey: [key] });
      toast.success(done);
      onClose();
    } catch (err) {
      console.warn(failed, err);
      toast.error(failed);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-4 pb-2">
      <WorkoutPreview text={w.description} type={w.type} />
      {w.description && (
        <p className="whitespace-pre-line font-mono text-xs text-muted-foreground">
          {w.description}
        </p>
      )}
      <div className="flex items-end gap-2">
        <div className="flex-1 space-y-1">
          <Label htmlFor="workout-date">{t("Add to the calendar", "Aggiungi al calendario")}</Label>
          <Input
            id="workout-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <Button
          disabled={busy || !date}
          onClick={() =>
            void act(
              () => scheduleWorkout(workoutEntry(fields, th), date),
              "events",
              t("Workout planned", "Allenamento pianificato"),
              t("Couldn't plan the workout", "Impossibile pianificare l'allenamento"),
            )
          }
        >
          {t("Add", "Aggiungi")}
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={() => onEdit({ id: w.id, ...fields })}>
          {t("Edit", "Modifica")}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onEdit({ ...fields, name: t(`${w.name} (copy)`, `${w.name} (copia)`) })}
        >
          {t("Duplicate", "Duplica")}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive"
          disabled={busy}
          onClick={() =>
            sure
              ? void act(
                  () => deleteWorkout(w.id),
                  "workouts",
                  t("Workout deleted", "Allenamento eliminato"),
                  t("Couldn't delete the workout", "Impossibile eliminare l'allenamento"),
                )
              : setSure(true)
          }
        >
          {sure ? t("Delete for good?", "Eliminare davvero?") : t("Delete", "Elimina")}
        </Button>
      </div>
    </div>
  );
}
