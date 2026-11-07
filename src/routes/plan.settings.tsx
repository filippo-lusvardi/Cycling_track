import { createFileRoute, Link, Navigate, useSearch } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { DayEditor, GoalPicker, PlanGate, usePlanAction } from "@/components/plan/parts";
import { SeasonEditor } from "@/components/plan/season";
import { Button } from "@/components/ui/button";
import { useOnline } from "@/hooks/use-online";
import { mondayOf } from "@/lib/focus";
import { t } from "@/lib/i18n";
import { deletePlan } from "@/lib/plan/actions";
import type { PlanContext } from "@/lib/plan/engine";
import { goalRace } from "@/lib/plan/phase";
import { editedMonths } from "@/lib/plan/season";
import { savePlan, type StoredPlan } from "@/lib/plan/store";
import type { DayPlan, PlanSeason } from "@/lib/plan/types";
import { suggestVolume } from "@/lib/plan/volume";

export const Route = createFileRoute("/plan/settings")({
  component: PlanSettingsRoute,
  validateSearch: (s: Record<string, unknown>): { goal?: "season" | undefined } => ({
    goal: s["goal"] === "season" ? "season" : undefined,
  }),
});

function Settings({ stored, ctx }: { stored: StoredPlan; ctx: PlanContext }) {
  const online = useOnline();
  const { busy, act } = usePlanAction();
  const [deleting, setDeleting] = useState(false);
  const { note } = stored;
  const { input } = ctx;
  const { today } = input;
  const monday = mondayOf(today);
  const current =
    note.weekOverride?.monday === monday ? note.weekOverride.week : note.settings.week;
  const [draft, setDraft] = useState(current);
  const changed = JSON.stringify(draft) !== JSON.stringify(current);
  // Choosing a season asks for its months first: the goal changes only once they're saved.
  const asked = useSearch({ strict: false })["goal"] === "season";
  const onSeason = note.settings.goal === "season";
  const [choosing, setChoosing] = useState(asked && !onSeason);
  const seasonRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (asked) seasonRef.current?.scrollIntoView?.({ block: "center" });
  }, [asked]);
  const thisMonth = today.slice(0, 7);
  const saved = note.settings.season;
  const shownMonths = (saved?.months ?? []).filter((m) => m >= thisMonth);
  const [months, setMonths] = useState(shownMonths);
  const [kinds, setKinds] = useState<PlanSeason["kinds"]>(saved?.kinds ?? []);
  const seasonChanged =
    choosing ||
    [...months].sort().join() !== [...shownMonths].sort().join() ||
    [...kinds].sort().join() !== [...(saved?.kinds ?? [])].sort().join();
  function saveSeason() {
    const picked = { months: editedMonths(saved?.months ?? [], months, thisMonth), kinds };
    const settings = { ...note.settings, goal: "season" as const, season: picked };
    // The climb is automatic and starts from where the plan is: only its top is worked out, and only once.
    const peakSeconds =
      saved?.peakSeconds ??
      suggestVolume({
        acts: input.acts,
        today,
        settings,
        races: input.races,
        state: ctx.note.state,
        fallbackSeconds: ctx.note.state.weeklySeconds,
      }).peakSeconds;
    return act(
      async () => {
        await savePlan(
          {
            ...note,
            settings: { ...settings, season: { ...picked, peakSeconds } },
            replan: true,
            lastFill: null,
          },
          today,
          stored,
        );
        setChoosing(false);
      },
      t("Couldn't save", "Impossibile salvare"),
    );
  }
  const saveDays = (week: DayPlan[], always: boolean) =>
    act(
      () =>
        savePlan(
          {
            ...note,
            ...(always
              ? { settings: { ...note.settings, week }, weekOverride: null }
              : { weekOverride: { monday, week } }),
            replan: true,
            lastFill: null,
          },
          today,
          stored,
        ),
      t("Couldn't save", "Impossibile salvare"),
    );
  return (
    <div className="space-y-3">
      <Link
        to="/plan"
        className="on-sky inline-flex items-center gap-1 text-sm text-foreground/85 hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" /> {t("Plan", "Piano")}
      </Link>
      <h1 className="on-sky text-3xl font-bold tracking-tight">{t("Settings", "Impostazioni")}</h1>
      <section className="space-y-2">
        <div className="eyebrow on-sky">{t("When you can ride", "Quando puoi pedalare")}</div>
        <DayEditor week={draft} onChange={setDraft} />
        <div className="grid grid-cols-2 gap-2">
          <Button disabled={busy || !changed} onClick={() => void saveDays(draft, true)}>
            {t("From now on", "Da ora in poi")}
          </Button>
          <Button
            variant="outline"
            disabled={busy || !changed}
            onClick={() => void saveDays(draft, false)}
          >
            {t("Just this week", "Solo questa settimana")}
          </Button>
        </div>
      </section>
      <GoalPicker
        goal={choosing ? "season" : note.settings.goal}
        race={goalRace(input.races, today)}
        busy={busy || !online}
        onChange={(goal) => {
          if (goal === "season") return setChoosing(true);
          setChoosing(false);
          if (goal === note.settings.goal) return;
          void act(
            () =>
              savePlan(
                { ...note, settings: { ...note.settings, goal }, replan: true, lastFill: null },
                today,
                stored,
              ),
            t("Couldn't save", "Impossibile salvare"),
          );
        }}
      />
      {(choosing || onSeason) && (
        <div ref={seasonRef} className="space-y-3">
          <SeasonEditor
            first={thisMonth}
            months={months}
            kinds={kinds}
            onMonths={setMonths}
            onKinds={setKinds}
          />
          <Button
            className="w-full"
            disabled={busy || !online || !months.length || !seasonChanged}
            onClick={() => void saveSeason()}
          >
            {t("Save the season", "Salva la stagione")}
          </Button>
        </div>
      )}
      {deleting ? (
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="font-medium leading-snug">
            {t(
              "Delete the plan and the sessions still to come?",
              "Eliminare il piano e le sedute ancora da fare?",
            )}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t(
              "Your rides stay, and so do workouts you rewrote yourself.",
              "Le tue uscite restano, e così gli allenamenti che hai riscritto tu.",
            )}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button
              variant="destructive"
              disabled={busy || !online}
              onClick={() =>
                void act(
                  () => deletePlan(stored, ctx, today),
                  t("Couldn't delete the plan", "Impossibile eliminare il piano"),
                )
              }
            >
              {t("Delete", "Elimina")}
            </Button>
            <Button variant="outline" disabled={busy} onClick={() => setDeleting(false)}>
              {t("Cancel", "Annulla")}
            </Button>
          </div>
        </div>
      ) : (
        <Button
          className="w-full text-muted-foreground"
          variant="ghost"
          onClick={() => setDeleting(true)}
        >
          {t("Delete the plan", "Elimina il piano")}
        </Button>
      )}
    </div>
  );
}

function PlanSettingsRoute() {
  const search =
    useSearch({ strict: false })["goal"] === "season" ? { goal: "season" as const } : {};
  return (
    <PlanGate none={() => <Navigate to="/plan" search={search} />}>
      {(stored, ctx) => <Settings stored={stored} ctx={ctx} />}
    </PlanGate>
  );
}
