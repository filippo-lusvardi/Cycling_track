// What a tap on the tree opens: today (crown), one or more days (branches, buds of rest), or a planned workout.
import { parseISO } from "date-fns";
import { ActivityRow } from "@/components/ActivityRow";
import { CheckInForm, isCheckedIn, useCheckInState } from "@/components/CheckIn";
import { ResponsiveDialog } from "@/components/ResponsiveDialog";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { Activity, PlannedEvent, Wellness } from "@/lib/intervals";
import { advice, readinessFor, recommendation } from "@/lib/readiness";
import { computeForm, formatDuration, formZoneLabel } from "@/lib/training";
import {
  crownFor,
  FEEL_WORD,
  feelLevel,
  INTENSITY_WORD,
  intensityLevel,
  LEVEL_COLOR,
  SEASON_COLOR,
} from "@/lib/tree";
import { format, t } from "@/lib/i18n";

export type Sheet =
  | { kind: "today" }
  | { kind: "days"; title: string; dates: string[] }
  | { kind: "plan"; event: PlannedEvent };

const LEVEL = [t("low", "bassa"), t("average", "media"), t("high", "alta"), t("extreme", "estrema")];

export function TreeSheet({
  sheet,
  onClose,
  today,
  wellness,
  acts,
}: {
  sheet: Sheet | null;
  onClose: () => void;
  today: string;
  wellness: Wellness[];
  acts: Activity[];
}) {
  const title = !sheet
    ? ""
    : sheet.kind === "today"
      ? t("Today", "Oggi")
      : sheet.kind === "days"
        ? sheet.title
        : (sheet.event.name ?? t("Planned", "Pianificato"));
  return (
    <ResponsiveDialog open={!!sheet} onOpenChange={(o) => !o && onClose()} title={title}>
      {sheet?.kind === "today" && <TodayBody today={today} wellness={wellness} onSaved={onClose} />}
      {sheet?.kind === "days" && <DaysBody dates={sheet.dates} wellness={wellness} acts={acts} />}
      {sheet?.kind === "plan" && <PlanBody e={sheet.event} />}
    </ResponsiveDialog>
  );
}

function TodayBody({
  today,
  wellness,
  onSaved,
}: {
  today: string;
  wellness: Wellness[];
  onSaved: () => void;
}) {
  const row = wellness.find((w) => w.id === today);
  const [, setState] = useCheckInState(today);
  const r = readinessFor(wellness, today);
  // Same score as the crown: estimated from HRV, sleep and form until the check-in is done.
  const crown = crownFor(wellness, today);
  const adv = crown.score != null ? advice(crown.score) : null;
  const rec = crown.score != null ? recommendation(crown.score, crown.form) : null;
  const done = isCheckedIn(row);
  return (
    <div className="space-y-5">
      {adv && crown.season && (
        <div className="space-y-2">
          <span
            className="inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold text-background"
            style={{ background: SEASON_COLOR[crown.season] }}
          >
            {adv.title} · {crown.score}
            {crown.estimated ? t(" · estimated", " · stimato") : ""}
          </span>
          <p className="text-sm text-muted-foreground">{adv.text}</p>
          {rec && (
            <p className="text-sm">
              <span className="stat-num font-semibold">{rec.zones}</span> ·{" "}
              <span className="stat-num">{rec.duration}</span>
              <span className="text-muted-foreground"> · {rec.text}</span>
            </p>
          )}
          {r.components.length > 0 && (
            <p className="text-sm text-muted-foreground">
              {r.components.map((c) => `${c.label} ${Math.round(c.score)}`).join(" · ")}
            </p>
          )}
        </div>
      )}
      <Collapsible>
        <CollapsibleTrigger asChild>
          <Button variant="secondary" className="w-full">
            {done ? t("Edit check-in", "Modifica check-in") : t("Check in", "Fai il check-in")}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-4">
          <CheckInForm
            key={row?.id ?? "none"}
            date={today}
            row={row}
            onSaved={() => {
              setState("done");
              onSaved();
            }}
          />
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

/** Plain-text reading of a day's wellness: the text equivalent of the trunk and buds. */
function dayLine(w: Wellness | undefined): string | null {
  if (!w) return null;
  const tsb = w.ctl != null && w.atl != null ? computeForm(w.ctl, w.atl) : null;
  return [
    w.ctl != null && `${t("Fitness", "Forma fisica")} ${Math.round(w.ctl)}`,
    tsb != null && `${t("form", "forma")} ${Math.round(tsb)} (${formZoneLabel(tsb).toLowerCase()})`,
    w.sleepSecs && `${t("slept", "dormito")} ${formatDuration(w.sleepSecs)}`,
    w.fatigue != null && `${t("fatigue", "fatica")} ${LEVEL[w.fatigue - 1]}`,
    w.stress != null && `stress ${LEVEL[w.stress - 1]}`,
  ]
    .filter(Boolean)
    .join(" · ");
}

function DaysBody({
  dates,
  wellness,
  acts,
}: {
  dates: string[];
  wellness: Wellness[];
  acts: Activity[];
}) {
  return (
    <div className="space-y-4 pb-2">
      {dates.map((d) => {
        const day = acts.filter((a) => a.start_date_local.startsWith(d));
        const line = dayLine(wellness.find((w) => w.id === d));
        if (dates.length > 1 && !day.length && !line) return null;
        return (
          <div key={d} className="space-y-1">
            {dates.length > 1 && (
              <div className="eyebrow">{format(parseISO(d), "EEEE d MMMM")}</div>
            )}
            {line && <p className="text-sm text-muted-foreground">{line}</p>}
            {day.length === 0 && <p className="text-sm">{t("Rest day.", "Giorno di riposo.")}</p>}
            <div className="-mx-3">
              {day.map((a) => {
                const feel = feelLevel(a.feel);
                const intensity = intensityLevel(a.icu_intensity);
                const climb = a.total_elevation_gain ?? 0;
                return (
                  <div key={a.id}>
                    <ActivityRow a={a} />
                    {(feel || intensity || climb >= 50) && (
                      <p className="px-3 pb-1 text-xs text-muted-foreground">
                        {intensity && (
                          <span style={{ color: LEVEL_COLOR[intensity - 1] }}>
                            {INTENSITY_WORD[intensity - 1]}
                          </span>
                        )}
                        {climb >= 50 && `${intensity ? " · " : ""}${Math.round(climb)} ${t("m climbed", "m di dislivello")}`}
                        {feel && (
                          <>
                            {intensity || climb >= 50 ? " · " : ""}
                            {t("felt", "sensazione")}{" "}
                            <span style={{ color: LEVEL_COLOR[feel - 1] }}>
                              {FEEL_WORD[feel - 1]}
                            </span>
                          </>
                        )}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PlanBody({ e }: { e: PlannedEvent }) {
  return (
    <div className="space-y-3 pb-2 text-sm">
      <p className="text-muted-foreground">
        {format(parseISO(e.date), "EEEE d MMMM")} ·{" "}
        {e.category === "WORKOUT"
          ? (e.type ?? t("Workout", "Allenamento"))
          : e.category.replace("_", " ").toLowerCase()}
        {e.moving_time ? ` · ${formatDuration(e.moving_time)}` : ""}
        {e.icu_training_load ? ` · ${t("load", "carico")} ${e.icu_training_load}` : ""}
      </p>
      {e.description && <p className="whitespace-pre-line">{e.description}</p>}
    </div>
  );
}
