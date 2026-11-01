// What a tap on the tree opens: today (crown), one or more days (branches, buds of rest), or a planned workout.
import { useQueryClient } from "@tanstack/react-query";
import { parseISO } from "date-fns";
import { useState } from "react";
import { toast } from "sonner";
import { ActivityRow } from "@/components/ActivityRow";
import { CheckInForm, isCheckedIn, useCheckInState } from "@/components/CheckIn";
import { ResponsiveDialog } from "@/components/ResponsiveDialog";
import type { FocusInfo } from "@/hooks/use-focus";
import { roleText } from "@/lib/focus";
import { FOCUS_LABEL, FOCUSES, raceSummary, type Focus } from "@/lib/races";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  createOffEvent,
  deleteEvent,
  updateOffEvent,
  type Activity,
  type OffKind,
  type PlannedEvent,
  type Wellness,
} from "@/lib/intervals";
import { advice, ceilingText, readinessFor, recommendation } from "@/lib/readiness";
import { computeForm, formatDuration, formZoneLabel, isoDate } from "@/lib/training";
import {
  crownFor,
  morningWellness,
  FEEL_WORD,
  feelLevel,
  INTENSITY_WORD,
  intensityLevel,
  LEVEL_COLOR,
  offEventOn,
  offTitle,
  offToggle,
  SEASON_COLOR,
  type OffChange,
} from "@/lib/tree";
import { cn } from "@/lib/utils";
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
  offEvents,
  limit,
  focus,
}: {
  sheet: Sheet | null;
  onClose: () => void;
  today: string;
  wellness: Wellness[];
  acts: Activity[];
  offEvents: PlannedEvent[];
  limit: { watts: number | null; bpm: number | null } | null;
  focus: FocusInfo;
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
      {sheet?.kind === "today" && (
        <TodayBody
          today={today}
          wellness={wellness}
          acts={acts}
          offEvents={offEvents}
          limit={limit}
          focus={focus}
          onSaved={onClose}
        />
      )}
      {sheet?.kind === "days" && (
        <DaysBody dates={sheet.dates} wellness={wellness} acts={acts} offEvents={offEvents} />
      )}
      {sheet?.kind === "plan" && <PlanBody e={sheet.event} />}
    </ResponsiveDialog>
  );
}

const OFF_LABEL: Record<OffKind, string> = { SICK: t("Sick", "Malato"), INJURED: t("Injured", "Infortunato") };

/** Writes a sick/injured change to the intervals.icu calendar; needs the network (events aren't queued offline). */
function useOffChange() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const run = async (kind: OffKind, c: OffChange) => {
    if (!navigator.onLine) {
      toast.error(t("You're offline: try again when connected", "Sei offline: riprova quando sei connesso"));
      return;
    }
    setBusy(true);
    try {
      if (c.op === "create") await createOffEvent(kind, c.start, c.last);
      else if (c.op === "update") await updateOffEvent(c.id, c.start, c.last);
      else await deleteEvent(c.id);
      await qc.invalidateQueries({ queryKey: ["events"] });
      toast.success(t("Saved to the intervals.icu calendar", "Salvato nel calendario di intervals.icu"));
    } catch {
      toast.error(t("Couldn't save. Try again", "Salvataggio non riuscito. Riprova"));
    } finally {
      setBusy(false);
    }
  };
  return [run, busy] as const;
}

function TodayBody({
  today,
  wellness,
  acts,
  offEvents,
  limit,
  focus,
  onSaved,
}: {
  today: string;
  wellness: Wellness[];
  acts: Activity[];
  offEvents: PlannedEvent[];
  limit: { watts: number | null; bpm: number | null } | null;
  focus: FocusInfo;
  onSaved: () => void;
}) {
  const [change, busy] = useOffChange();
  const offToday = offEventOn(offEvents, today)?.category as OffKind | undefined;
  const row = wellness.find((w) => w.id === today);
  const [, setState] = useCheckInState(today);
  // Same numbers as the crown: this morning's fitness and fatigue until today has an activity, and the
  // score estimated from HRV, sleep and form until the check-in is done.
  const r = readinessFor(morningWellness(wellness, acts, today), today);
  const crown = crownFor(wellness, acts, today);
  const adv = crown.score != null ? advice(crown.score) : null;
  const rec = crown.score != null ? recommendation(crown.score, crown.form) : null;
  const done = isCheckedIn(row);
  return (
    <div className="space-y-5">
      {crown.signals.length > 0 && (
        <div className="space-y-1 rounded-md border border-border p-3">
          <div className="eyebrow">{t("Worth watching", "Da tenere d'occhio")}</div>
          {crown.signals.map((s) => (
            <p key={s.key} className="text-sm">
              {s.text}
            </p>
          ))}
          <p className="text-xs text-muted-foreground">
            {t(
              "A trend over several days, before it shows in readiness. An easier day or two now protects the weeks ahead.",
              "Una tendenza di più giorni, prima che si veda nella prontezza. Un giorno o due più leggeri ora proteggono le settimane a venire.",
            )}
          </p>
        </div>
      )}
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
          {limit && (
            <p className="stat-num text-lg font-semibold" style={{ color: SEASON_COLOR[crown.season] }}>
              {ceilingText(limit)}
            </p>
          )}
          {focus.role ? (
            // Race days, the day after and the taper come before the block and the season.
            <p className="text-sm font-medium text-birch">{roleText(focus.role)}</p>
          ) : (
            rec && (
              <p className="text-sm">
                <span className="stat-num font-semibold">{rec.zones}</span> ·{" "}
                <span className="stat-num">{rec.duration}</span>
                <span className="text-muted-foreground">
                  {" "}
                  · {rec.zones === "Z4–Z5" ? focus.session : rec.text}
                </span>
              </p>
            )
          )}
          {r.components.length > 0 && (
            <p className="text-sm text-muted-foreground">
              {r.components.map((c) => `${c.label} ${Math.round(c.score)}`).join(" · ")}
            </p>
          )}
        </div>
      )}
      <FocusPanel focus={focus} />
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
      <div className="space-y-2">
        <div className="eyebrow">{t("Off the bike today?", "Fermo oggi?")}</div>
        <div className="grid grid-cols-2 gap-2">
          {(["SICK", "INJURED"] as const).map((k) => (
            <Button
              key={k}
              variant="outline"
              disabled={busy}
              aria-pressed={offToday === k}
              className={cn(offToday === k && "border-lingon text-lingon")}
              onClick={() => change(k, offToggle(offEvents, k, today))}
            >
              {offToday === k ? t(`${OFF_LABEL[k]} · undo`, `${OFF_LABEL[k]} · annulla`) : OFF_LABEL[k]}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** The training block: what it is, why, the races ahead, and a pin to choose it by hand. */
function FocusPanel({ focus }: { focus: FocusInfo }) {
  const next = focus.races.filter((r) => r.date >= isoDate(new Date())).slice(0, 3);
  return (
    <div className="space-y-2 rounded-md border border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="eyebrow">{t("Training focus", "Focus di allenamento")}</div>
        <select
          aria-label={t("Choose the focus", "Scegli il focus")}
          value={focus.pinned ?? ""}
          onChange={(e) => focus.setPin((e.target.value || null) as Focus | null)}
          className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
        >
          <option value="" className="bg-popover">
            {t("Automatic", "Automatico")}
          </option>
          {FOCUSES.map((f) => (
            <option key={f} value={f} className="bg-popover">
              {FOCUS_LABEL[f]}
            </option>
          ))}
        </select>
      </div>
      <div className="font-semibold">
        {t(`${FOCUS_LABEL[focus.focus]} block`, `Blocco ${FOCUS_LABEL[focus.focus]}`)}
        <span className="font-normal text-muted-foreground">
          {focus.pinned
            ? t(" · chosen by you", " · scelto da te")
            : focus.since
              ? t(` · since ${format(parseISO(focus.since), "d MMM")}`, ` · dal ${format(parseISO(focus.since), "d MMM")}`)
              : ""}
        </span>
      </div>
      <p className="text-sm">
        <span className="text-muted-foreground">{t("On a summer day: ", "In un giorno d'estate: ")}</span>
        {focus.session}
      </p>
      {!focus.pinned && (
        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button size="sm" variant="ghost" className="-ml-3">
              {t("Why", "Perché")}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-1">
            {focus.why.map((l) => (
              <p key={l} className="text-sm text-muted-foreground">
                {l}
              </p>
            ))}
          </CollapsibleContent>
        </Collapsible>
      )}
      {next.length > 0 && (
        <div className="space-y-0.5 pt-1">
          <div className="eyebrow">{t("Next races", "Prossime gare")}</div>
          {next.map((r) => (
            <p key={r.id} className="text-sm">
              <span className="stat-num">{format(parseISO(r.date), "d MMM")}</span> · {r.name}{" "}
              <span className={r.info ? "text-muted-foreground" : "text-birch"}>· {raceSummary(r)}</span>
            </p>
          ))}
        </div>
      )}
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

/** A sick or injured stretch: when, and what it did to fitness. */
function OffLine({ e, wellness }: { e: PlannedEvent; wellness: Wellness[] }) {
  const kind = e.category as OffKind;
  const last = e.end ?? e.date;
  const ctl = (d: string) => wellness.find((w) => w.id === d)?.ctl;
  const [from, to] = [ctl(e.date), ctl(last)];
  return (
    <p className="text-sm">
      <span className="font-medium">{offTitle(kind, e.date, last)}.</span>{" "}
      {from != null && to != null && (
        <span className="stat-num">
          {t("Fitness", "Forma fisica")} {Math.round(from)} → {Math.round(to)}.{" "}
        </span>
      )}
      <span className="text-muted-foreground">
        {kind === "SICK"
          ? t(
              "A dip after illness is normal; come back with a few easy days.",
              "Un calo dopo una malattia è normale; riparti con qualche giorno facile.",
            )
          : t(
              "Fitness waits for you; let the injury heal before it asks for load.",
              "La forma ti aspetta; lascia guarire l'infortunio prima di caricarlo.",
            )}
      </span>
    </p>
  );
}

function DaysBody({
  dates,
  wellness,
  acts,
  offEvents,
}: {
  dates: string[];
  wellness: Wellness[];
  acts: Activity[];
  offEvents: PlannedEvent[];
}) {
  const [change, busy] = useOffChange();
  const stretches = offEvents.filter((e) => dates.some((d) => e.date <= d && d <= (e.end ?? e.date)));
  // Only a run of rest days can be marked; days with rides are left as they are.
  const markable =
    !stretches.length && dates.every((d) => !acts.some((a) => a.start_date_local.startsWith(d)));
  const [first, last] = [dates[dates.length - 1]!, dates[0]!];
  return (
    <div className="space-y-4 pb-2">
      {stretches.map((e) => (
        <div key={e.id} className="space-y-2">
          <OffLine e={e} wellness={wellness} />
          <Button
            size="sm"
            variant="ghost"
            className="-ml-3"
            disabled={busy}
            onClick={() => change(e.category as OffKind, { op: "delete", id: e.id })}
          >
            {t("Unmark", "Rimuovi")}
          </Button>
        </div>
      ))}
      {markable && (
        <div className="grid grid-cols-2 gap-2">
          {(["SICK", "INJURED"] as const).map((k) => (
            <Button
              key={k}
              variant="outline"
              disabled={busy}
              onClick={() => change(k, { op: "create", start: first, last })}
            >
              {k === "SICK"
                ? t("Mark as sick", "Segna come malato")
                : t("Mark as injured", "Segna come infortunato")}
            </Button>
          ))}
        </div>
      )}
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
