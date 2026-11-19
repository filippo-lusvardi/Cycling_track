// A day of the plan opened: its workout, and changing it by hand. What fits the day comes first, then your library and the
// starter workouts. The plan never changes a day set this way, and proposes the rest of the week around it.
import { parseISO } from "date-fns";
import { ChevronDown } from "lucide-react";
import { useState, type ReactNode } from "react";
import { ResponsiveDialog } from "@/components/ResponsiveDialog";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { WorkoutRow } from "@/components/WorkoutLibrary";
import { WorkoutPreview } from "@/components/WorkoutPreview";
import { useOnline } from "@/hooks/use-online";
import { format, t } from "@/lib/i18n";
import { setDay } from "@/lib/plan/actions";
import { alternativesFor, type PlanContext } from "@/lib/plan/engine";
import type { StoredPlan } from "@/lib/plan/store";
import type { PlannedDay, PlanState, PlanWorkout } from "@/lib/plan/types";
import type { SuggestWorkout } from "@/lib/suggest";
import { formatDuration } from "@/lib/training";
import { kindLabel, WORKOUT_KINDS } from "@/lib/workout-templates";
import { INDOOR, OUTDOOR, usePlanAction } from "./parts";

const ROLE = {
  hard: () => t("hard", "dura"),
  easy: () => t("easy", "facile"),
  long: () => t("long", "lunga"),
};

function asPlanWorkout(w: SuggestWorkout, indoor: boolean): PlanWorkout {
  return {
    id: w.id,
    name: w.name,
    type: indoor ? "VirtualRide" : "Ride",
    description: w.description,
    seconds: w.seconds,
    load: w.load,
    kind: w.kind,
  };
}

/**
 * The sheet of one day: the workout with Change and Remove, or straight to choosing one for an empty day. `editable` is
 * false for a day that's gone or already ridden: then it only shows the workout.
 */
export function DaySheet({
  open,
  onOpenChange,
  date,
  role,
  workout,
  editable,
  stored,
  ctx,
  state,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date: string;
  role: PlannedDay["role"];
  workout: PlanWorkout | null;
  editable: boolean;
  stored: StoredPlan;
  ctx: PlanContext;
  state: PlanState;
}) {
  const [picking, setPicking] = useState(false);
  const online = useOnline();
  const { busy, act } = usePlanAction();
  const index = (parseISO(date).getDay() + 6) % 7;
  const day = stored.note.settings.week[index]!;
  const indoor = workout ? workout.type === "VirtualRide" : day.indoor;
  const choose = picking || !workout;
  const close = (o: boolean) => {
    onOpenChange(o);
    if (!o) setPicking(false);
  };
  const put = (to: PlanWorkout | null, r?: "hard" | "long" | "easy") =>
    void act(
      () => setDay(stored, ctx, { date, to, role: r }, ctx.input.today).then(() => close(false)),
      t("Couldn't change the plan", "Impossibile modificare il piano"),
    );
  const when = format(parseISO(date), "EEEE d MMMM");
  const room = day.minutes ? ` · ${t("up to", "fino a")} ${formatDuration(day.minutes * 60)}` : "";

  if (!choose)
    return (
      <ResponsiveDialog
        open={open}
        onOpenChange={close}
        title={workout.name}
        description={`${when} · ${indoor ? INDOOR() : OUTDOOR()}`}
      >
        {editable && (
          <div className="mb-3 grid grid-cols-2 gap-2">
            <Button disabled={busy || !online} onClick={() => setPicking(true)}>
              {t("Change", "Cambia")}
            </Button>
            <Button variant="outline" disabled={busy || !online} onClick={() => put(null)}>
              {t("Remove", "Togli")}
            </Button>
          </div>
        )}
        <WorkoutPreview text={workout.description} type={workout.type} stepsOpen />
      </ResponsiveDialog>
    );

  const fits = alternativesFor(ctx, date, state, role);
  const mine = ctx.input.pool.filter((w) => w.mine);
  const starters = ctx.input.pool.filter((w) => !w.mine);
  const row = (
    key: string,
    w: PlanWorkout | SuggestWorkout,
    about: string | undefined,
    onPick: () => void,
  ) => (
    <li key={key}>
      <WorkoutRow
        name={w.name}
        about={about}
        text={w.description}
        type={w.type}
        seconds={w.seconds}
        load={w.load}
        onClick={busy || !online ? () => {} : onPick}
      />
    </li>
  );
  const group = (title: string, count: number, body: ReactNode) => (
    <Collapsible key={title}>
      <CollapsibleTrigger className="group flex w-full items-center justify-between gap-3 rounded-md px-2 py-2.5 text-left text-sm transition-colors hover:bg-secondary/40">
        <span>{title}</span>
        <span className="stat-num flex items-center gap-1.5 text-xs text-muted-foreground">
          {count}
          <ChevronDown className="h-4 w-4 transition-transform group-data-[state=open]:rotate-180" />
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul className="divide-y divide-border pb-1">{body}</ul>
      </CollapsibleContent>
    </Collapsible>
  );
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={close}
      title={
        workout
          ? t("Change the workout", "Cambia l'allenamento")
          : t("Add a workout", "Aggiungi un allenamento")
      }
      description={`${when}${room}`}
    >
      <section>
        <h3 className="mb-1 text-sm font-medium text-muted-foreground">
          {t("Fits this day", "Adatti a questo giorno")}
        </h3>
        <ul className="-mx-2 divide-y divide-border">
          {fits.map((a) =>
            row(a.workout.id, a.workout, ROLE[a.role](), () => put(a.workout, a.role)),
          )}
        </ul>
      </section>
      <div className="-mx-2 mt-2 divide-y divide-border border-t border-border">
        {mine.length > 0 &&
          group(
            t("Your library", "La tua libreria"),
            mine.length,
            mine.map((w) => row(w.id, w, undefined, () => put(asPlanWorkout(w, indoor)))),
          )}
        {group(
          t("Starter workouts", "Allenamenti di base"),
          starters.length,
          WORKOUT_KINDS.flatMap((kind) => {
            const list = starters.filter((w) => w.kind === kind);
            if (!list.length) return [];
            return [
              <li key={kind} className="px-2 pb-1 pt-3 text-xs text-muted-foreground">
                {kindLabel(kind, "ride")}
              </li>,
              ...list.map((w) => row(w.id, w, undefined, () => put(asPlanWorkout(w, indoor)))),
            ];
          }),
        )}
      </div>
      {workout && (
        <div className="mt-1 border-t border-border pt-3">
          <Button
            variant="outline"
            className="w-full"
            disabled={busy || !online}
            onClick={() => put(null)}
          >
            {t("Rest on this day", "Riposo in questo giorno")}
          </Button>
        </div>
      )}
    </ResponsiveDialog>
  );
}
