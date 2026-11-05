// What the plan's two pages share: their words, the days and the goal, and the wait for the plan to load.
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { parseISO } from "date-fns";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Stepper } from "@/components/ui/stepper";
import { usePlan } from "@/hooks/use-plan";
import { format, t } from "@/lib/i18n";
import type { PlanContext } from "@/lib/plan/engine";
import type { StoredPlan } from "@/lib/plan/store";
import type { DayPlan, Phase, PlanGoal } from "@/lib/plan/types";
import type { Race } from "@/lib/races";
import { mainSport } from "@/lib/sport";
import { formatDuration } from "@/lib/training";
import { cn } from "@/lib/utils";

export const PHASE: Record<Phase, () => string> = {
  base: () => t("Base", "Base"),
  build: () => t("Build", "Costruzione"),
  specific: () => t("Specific", "Specifica"),
  taper: () => t("Towards the race", "Verso la gara"),
  maintain: () => t("Maintenance", "Mantenimento"),
};

const dayNames = () => [
  t("Mon", "Lun"),
  t("Tue", "Mar"),
  t("Wed", "Mer"),
  t("Thu", "Gio"),
  t("Fri", "Ven"),
  t("Sat", "Sab"),
  t("Sun", "Dom"),
];
export const INDOOR = () => t("Indoor", "Rulli");
export const OUTDOOR = () => t("Outdoor", "Fuori");
export const REST = () => t("Rest", "Riposo");

const STEP = 15;
/** The shortest session worth planning: below it, a day is rest. */
const SHORTEST = 30;
const LONGEST = 480;

/** The next length up or down: rest is one tap from the shortest session. */
export function stepMinutes(minutes: number, dir: 1 | -1) {
  if (dir > 0) return minutes < SHORTEST ? SHORTEST : Math.min(LONGEST, minutes + STEP);
  return minutes <= SHORTEST ? 0 : minutes - STEP;
}

export function DayEditor({
  week,
  onChange,
}: {
  week: DayPlan[];
  onChange: (w: DayPlan[]) => void;
}) {
  const set = (i: number, patch: Partial<DayPlan>) =>
    onChange(week.map((d, n) => (n === i ? { ...d, ...patch } : d)));
  return (
    <div className="rounded-xl border border-border bg-card p-1">
      {week.map((d, i) => {
        const day = dayNames()[i]!;
        return (
          <div key={i} className="flex min-h-12 flex-wrap items-center gap-2 rounded-lg px-2 py-1">
            <span className="eyebrow w-8 shrink-0">{day}</span>
            <Stepper
              compact
              less={t(`${day}: less time`, `${day}: meno tempo`)}
              more={t(`${day}: more time`, `${day}: più tempo`)}
              canLess={d.minutes > 0}
              canMore={d.minutes < LONGEST}
              onLess={() => set(i, { minutes: stepMinutes(d.minutes, -1) })}
              onMore={() => set(i, { minutes: stepMinutes(d.minutes, 1) })}
            >
              <span
                aria-live="polite"
                className={cn(
                  "stat-num w-[4.25rem] text-center text-sm font-semibold",
                  !d.minutes && "font-normal text-muted-foreground",
                )}
              >
                {d.minutes ? formatDuration(d.minutes * 60) : REST()}
              </span>
            </Stepper>
            {d.minutes > 0 && (
              <span className="ml-auto flex gap-1">
                <button
                  type="button"
                  onClick={() => set(i, { indoor: !d.indoor })}
                  className="min-h-10 rounded-full border border-border px-2.5 text-xs text-muted-foreground"
                >
                  {d.indoor ? INDOOR() : OUTDOOR()}
                </button>
                <button
                  type="button"
                  aria-pressed={d.long}
                  onClick={() => set(i, { long: !d.long })}
                  className={cn(
                    "min-h-10 rounded-full border px-2.5 text-xs",
                    d.long
                      ? "border-transparent bg-secondary text-foreground"
                      : "border-border text-muted-foreground",
                  )}
                >
                  {t("Long", "Lungo")}
                </button>
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

const goalRows = (race: Race | null): [PlanGoal, string, string][] => [
  [
    "race",
    t("A race", "Una gara"),
    race
      ? `${race.name}, ${format(parseISO(race.date), "d MMMM")}`
      : t("Add one in the calendar first", "Prima aggiungine una in calendario"),
  ],
  ["fitter", t("Get better", "Migliorare"), t("With no date", "Senza una data")],
  [
    "healthy",
    t("Stay well", "Stare bene"),
    t("Little time, keeping what's there", "Poco tempo, tenere quello che c'è"),
  ],
];

export function GoalPicker({
  goal,
  race,
  busy,
  onChange,
}: {
  goal: PlanGoal;
  race: Race | null;
  busy: boolean;
  onChange: (g: PlanGoal) => void;
}) {
  return (
    <section>
      <div className="eyebrow on-sky mb-1">{t("Goal", "Obiettivo")}</div>
      <div className="rounded-xl border border-border bg-card p-1">
        {goalRows(race).map(([id, a, b]) => (
          <button
            key={id}
            type="button"
            aria-pressed={goal === id}
            disabled={busy || goal === id || (id === "race" && !race)}
            onClick={() => onChange(id)}
            className={cn(
              "block w-full rounded-lg px-3 py-2 text-left disabled:cursor-default",
              goal === id && "bg-secondary",
              id === "race" && !race && "opacity-60",
            )}
          >
            <span className="block font-medium leading-snug">{a}</span>
            <span className="text-xs text-muted-foreground">{b}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

/** Saving something and showing the result, whichever way it went. */
export function usePlanAction() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: ["events"] });
  async function act(run: () => Promise<unknown>, failed: string) {
    setBusy(true);
    try {
      await run();
      await refresh();
    } catch (err) {
      console.warn(failed, err);
      toast.error(failed);
      await refresh();
    } finally {
      setBusy(false);
    }
  }
  return { busy, act, refresh };
}

/** The plan's page once there's a plan to show; `none` when there isn't one. */
export function PlanGate({
  none,
  children,
}: {
  none: () => ReactNode;
  children: (stored: StoredPlan, ctx: PlanContext) => ReactNode;
}) {
  const { stored, ctx, loading, failed } = usePlan();
  if (mainSport() === "run")
    return (
      <p className="text-sm text-muted-foreground">
        {t("The plan is for cycling for now.", "Per ora il piano è per il ciclismo.")}{" "}
        <Link to="/calendar" className="underline">
          {t("Calendar", "Calendario")}
        </Link>
      </p>
    );
  if (failed)
    return (
      <p className="text-sm text-muted-foreground">
        {t("Couldn't load the plan", "Impossibile caricare il piano")}
      </p>
    );
  if (loading)
    return <p className="text-sm text-muted-foreground">{t("Loading", "Caricamento")}</p>;
  if (!stored) return none();
  return ctx ? children(stored, ctx) : null;
}
