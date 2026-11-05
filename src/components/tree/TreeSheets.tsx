// What a tap on the tree opens: today (crown), one or more days (branches, buds of rest), or a planned workout.
import { useQueryClient } from "@tanstack/react-query";
import { parseISO } from "date-fns";
import { ChevronDown, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ActivityRow } from "@/components/ActivityRow";
import { CheckInForm, isCheckedIn, useCheckInState } from "@/components/CheckIn";
import { WorkoutPreview } from "@/components/WorkoutPreview";
import { ResponsiveDialog } from "@/components/ResponsiveDialog";
import type { FocusInfo } from "@/hooks/use-focus";
import { roleText } from "@/lib/focus";
import { FOCUS_LABEL, FOCUS_PURPOSE, focusesFor, raceSummary, type Focus } from "@/lib/races";
import { formatPace } from "@/lib/pace";
import { byMain, mainSport } from "@/lib/sport";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  isFreeRide,
  type Activity,
  type OffKind,
  type PlannedEvent,
  type Wellness,
} from "@/lib/intervals";
import { createOffEvent, deleteEvent, updateOffEvent } from "@/lib/source";
import { recentFeel } from "@/lib/felt";
import { briochesFor, intakeTarget } from "@/lib/fuel";
import { advice, formPercent, readinessFor, readinessRows, recommendation } from "@/lib/readiness";
import { checkInOn } from "@/lib/settings";
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
import type { Ceiling } from "@/lib/readiness";

export type Sheet =
  | { kind: "today" }
  | { kind: "days"; title: string; dates: string[] }
  | { kind: "plan"; event: PlannedEvent };

const LEVEL = [
  t("low", "bassa"),
  t("average", "media"),
  t("high", "alta"),
  t("extreme", "estrema"),
];

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
  limit: Ceiling | null;
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

const OFF_LABEL: Record<OffKind, string> = {
  SICK: t("Sick", "Malattia"),
  INJURED: t("Injured", "Infortunio"),
};

/** Writes a sick/injured change to the intervals.icu calendar; needs the network (events aren't queued offline). */
function useOffChange() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const run = async (kind: OffKind, c: OffChange) => {
    if (!navigator.onLine) {
      toast.error(
        t(
          "You're offline: try again when connected",
          "Sei offline: riprova appena torna la connessione",
        ),
      );
      return;
    }
    setBusy(true);
    try {
      if (c.op === "create") await createOffEvent(kind, c.start, c.last);
      else if (c.op === "update") await updateOffEvent(c.id, c.start, c.last);
      else await deleteEvent(c.id);
      await qc.invalidateQueries({ queryKey: ["events"] });
      toast.success(
        t("Saved to the calendar", "Salvato nel calendario"),
      );
    } catch {
      toast.error(t("Couldn't save. Try again", "Impossibile salvare. Riprova"));
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
  limit: Ceiling | null;
  focus: FocusInfo;
  onSaved: () => void;
}) {
  const [change, busy] = useOffChange();
  const offToday = offEventOn(offEvents, today)?.category as OffKind | undefined;
  const row = wellness.find((w) => w.id === today);
  const [, setState] = useCheckInState(today);
  // Same numbers as the crown: this morning's fitness and fatigue until today has an activity, and the
  // score estimated from HRV, sleep and form until the check-in is done.
  const checkIn = checkInOn();
  const crown = crownFor(wellness, acts, today, offEvents, checkIn);
  const r = readinessFor(
    morningWellness(readinessRows(wellness), acts, today),
    today,
    false,
    recentFeel(acts, today),
  );
  const rec = crown.score != null ? recommendation(crown.score, crown.form) : null;
  // A day ready for intensity, without a race nearby: today's session is the block's.
  const quality = !focus.role && rec?.zones === "Z4–Z5";
  const done = isCheckedIn(row);
  return (
    <div className="space-y-4 pb-1">
      {crown.score != null && crown.season && rec ? (
        <PlanCard crown={crown} rec={rec} limit={limit} focus={focus} quality={quality} />
      ) : (
        <p className="text-[15px] text-muted-foreground">
          {checkIn
            ? t(
                "Not enough data for today yet. Do the check-in to get advice.",
                "Dati ancora insufficienti per oggi. Fai il check-in per avere un consiglio.",
              )
            : t("Not enough data for today yet.", "Dati ancora insufficienti per oggi.")}
        </p>
      )}
      {crown.signals.length > 0 && <WatchCard crown={crown} />}
      {r.components.length > 0 && <ScoreDetails r={r} crown={crown} />}
      <FocusPanel focus={focus} quality={quality} />
      {checkIn && (
        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button variant="secondary" className="h-11 w-full text-[15px]">
              {done
                ? t("Edit today's check-in", "Modifica il check-in di oggi")
                : t("Do today's check-in", "Fai il check-in di oggi")}
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
      )}
      <section className="space-y-2">
        <h3 className="text-sm font-medium text-muted-foreground">
          {byMain(
            t("Not riding today because you're…", "Oggi non pedali per…"),
            t("Not running today because you're…", "Oggi non corri per…"),
          )}
        </h3>
        <div className="grid grid-cols-2 gap-2">
          {(["SICK", "INJURED"] as const).map((k) => (
            <Button
              key={k}
              variant="outline"
              disabled={busy}
              aria-pressed={offToday === k}
              className={cn("h-11 text-[15px]", offToday === k && "border-lingon text-lingon")}
              onClick={() => change(k, offToggle(offEvents, k, today))}
            >
              {offToday === k
                ? t(`${OFF_LABEL[k]} · undo`, `${OFF_LABEL[k]} · annulla`)
                : OFF_LABEL[k]}
            </Button>
          ))}
        </div>
      </section>
    </div>
  );
}

/** One labelled fact: a small label above a clear value. */
function Fact({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={cn("min-w-0", wide && "col-span-2 sm:col-span-1")}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="stat-num whitespace-nowrap text-base font-semibold">{value}</dd>
    </div>
  );
}

/** What to bring for the longest suggested session: brioches for the carbs the guidelines ask for. */
function fuelText(minutes: number, intensity: number) {
  const g = intakeTarget(minutes * 60, intensity).grams;
  if (!g) return t("Nothing needed", "Non serve niente");
  const n = Math.max(1, briochesFor(g));
  return t(
    `${n} brioche${n > 1 ? "s" : ""} (~${Math.round(g)} g)`,
    `${n} brioche (~${Math.round(g)} g)`,
  );
}

/** What to do today: the season's advice, the facts to ride by, and the block's session on a quality day. */

function PlanCard({
  crown,
  rec,
  limit,
  focus,
  quality,
}: {
  crown: ReturnType<typeof crownFor>;
  rec: ReturnType<typeof recommendation>;
  limit: Ceiling | null;
  focus: FocusInfo;
  quality: boolean;
}) {
  const color = SEASON_COLOR[crown.season!];
  const under =
    limit &&
    [
      limit.pace != null && `${formatPace(limit.pace)}/km`,
      limit.watts != null && `${limit.watts} W`,
      limit.bpm != null && `${limit.bpm} bpm`,
    ]
      .filter(Boolean)
      .join(" · ");
  return (
    <section
      className="space-y-4 rounded-xl border p-4"
      style={{ borderColor: `color-mix(in oklab, ${color} 45%, var(--border))` }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium" style={{ color }}>
            {crown.seasonLabel}
          </div>
          <h3 className="text-2xl font-semibold leading-tight">{advice(crown.score!).title}</h3>
        </div>
        <div className="shrink-0 text-right">
          <div className="stat-num text-2xl font-semibold leading-none" style={{ color }}>
            {crown.score}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {crown.estimated
              ? t("readiness, estimated", "readiness, stimata")
              : t("readiness", "readiness")}
          </div>
        </div>
      </div>
      <p className="text-[15px] leading-relaxed">
        {focus.role
          ? roleText(focus.role, mainSport())
          : quality
            ? t(
                "It's a day for intensity: do this block's session.",
                "Giornata da intensità: fai la seduta del blocco.",
              )
            : rec.text}
      </p>
      {!focus.role && (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-[auto_auto_1fr] sm:gap-x-8">
          <Fact label={t("Zones", "Zone")} value={rec.zones} />
          <Fact label={t("Duration", "Durata")} value={rec.duration} />
          {rec.minutes > 0 && (
            <Fact label={t("Fuel", "Rifornimento")} value={fuelText(rec.minutes, rec.intensity)} />
          )}
          {under && <Fact
              label={limit?.pace != null ? t("Limit", "Limite") : t("Stay under", "Resta sotto")}
              value={under}
              wide
            />}
        </dl>
      )}
      {quality && (
        <div className="rounded-lg bg-secondary/60 p-3">
          <div className="text-xs text-muted-foreground">
            {t(
              `Session · ${FOCUS_LABEL[focus.focus]} block`,
              `Seduta · blocco ${FOCUS_LABEL[focus.focus]}`,
            )}
          </div>
          <p className="mt-1 text-[15px] leading-relaxed">{focus.session}</p>
        </div>
      )}
    </section>
  );
}

/** Trends worth acting on: load rising too fast (which already caps the score), or body signals. */
function WatchCard({ crown }: { crown: ReturnType<typeof crownFor> }) {
  const load = crown.signals.some((s) => s.key === "load");
  return (
    <section className="space-y-2 rounded-xl border border-birch/40 bg-birch/5 p-4">
      <h3 className="flex items-center gap-2 text-base font-semibold text-birch">
        <TriangleAlert className="size-4 shrink-0" aria-hidden />
        {load
          ? t("Load is rising too fast", "Il carico sale troppo in fretta")
          : t("Worth watching", "Da tenere d'occhio")}
      </h3>
      <ul className="list-disc space-y-1 pl-5 text-[15px] leading-relaxed">
        {crown.signals.map((s) => (
          <li key={s.key}>{s.text}</li>
        ))}
      </ul>
      <p className="text-sm leading-relaxed text-muted-foreground">
        {load
          ? [
              t(
                byMain("Easy rides", "Easy runs") +
                  " count too: fatigue builds with volume, not only intensity. Today's advice stays capped until it settles.",
                `Contano anche ${byMain("le uscite facili", "le corse lente")}: la fatica cresce col volume, non solo con l'intensità. Il consiglio di oggi resta limitato finché non si assesta.`,
              ),
              crown.load.returning
                ? t(
                    " You're coming back from a break, so the limits are stricter.",
                    " Stai rientrando da uno stop, quindi i limiti sono più severi.",
                  )
                : "",
            ].join("")
          : t(
              "These show up before readiness drops. An easier day or two now protects the weeks ahead.",
              "Si vedono prima che la readiness cali. Un giorno o due più leggeri ora proteggono le settimane a venire.",
            )}
      </p>
    </section>
  );
}

const scoreWord = (v: number) =>
  v >= 75
    ? t("good", "buono")
    : v >= 55
      ? t("fair", "discreto")
      : v >= 40
        ? t("low", "basso")
        : t("poor", "scarso");
const scoreColor = (v: number) => LEVEL_COLOR[v >= 75 ? 0 : v >= 55 ? 1 : v >= 40 ? 2 : 3]!;

/** What the score is made of, one row per part. */
function ScoreDetails({
  r,
  crown,
}: {
  r: ReturnType<typeof readinessFor>;
  crown: ReturnType<typeof crownFor>;
}) {
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-medium text-muted-foreground">
        {t("What's in the score", "Da cosa dipende il punteggio")}
      </h3>
      {r.components.map((c) => (
        <div
          key={c.key}
          className="grid grid-cols-[7.5rem_1fr] items-center gap-x-3 gap-y-1 sm:grid-cols-[9rem_1fr]"
        >
          <div className="text-sm font-medium">{c.label}</div>
          <div className="flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full"
                style={{ width: `${Math.round(c.score)}%`, background: scoreColor(c.score) }}
              />
            </div>
            <span className="w-16 text-right text-sm" style={{ color: scoreColor(c.score) }}>
              {scoreWord(c.score)}
            </span>
          </div>
          <div className="stat-num col-start-2 text-xs text-muted-foreground">{c.detail}</div>
        </div>
      ))}
      <p className="text-sm text-muted-foreground">
        {crown.confidence === "high"
          ? checkInOn()
            ? t(
                "Each part is compared with your own normal: HRV with your 60-day range, sleep with your usual, answers with how you usually answer.",
                "Ogni parte è confrontata con il tuo normale: HRV con il suo intervallo di 60 giorni, sonno con il tuo solito, risposte con come rispondi di solito.",
              )
            : t(
                "Each part is compared with your own normal: HRV with your 60-day range, sleep with your usual.",
                "Ogni parte è confrontata con il tuo normale: HRV con il suo intervallo di 60 giorni, sonno con il tuo solito.",
              )
          : crown.confidence === "medium"
            ? t(
                "Fair confidence: some parts are still learning your normal (HRV needs 14 readings in 60 days, sleep 10 nights).",
                "Affidabilità discreta: alcune parti stanno ancora imparando il tuo normale (per l'HRV servono 14 letture in 60 giorni, per il sonno 10 notti).",
              )
            : checkInOn()
              ? t(
                  "Low confidence: too few inputs today. Wear the HRV sensor at night and do the check-in.",
                  "Affidabilità bassa: pochi dati oggi. Misura l'HRV di notte e fai il check-in.",
                )
              : t(
                  "Low confidence: too few inputs today. Wear the HRV sensor at night.",
                  "Affidabilità bassa: pochi dati oggi. Misura l'HRV di notte.",
                )}
      </p>
      {crown.load.level > 0 && r.uncapped != null && (
        <p className="text-sm text-muted-foreground">
          {t(
            `Together they make ${r.uncapped}; the load cap brings it to ${crown.score}.`,
            `Insieme fanno ${r.uncapped}; il limite di carico lo porta a ${crown.score}.`,
          )}
        </p>
      )}
    </section>
  );
}

/**
 * The training block, folded to its name until tapped: what it trains, its session, why it was chosen, the races
 * ahead, and a hand override.
 */
function FocusPanel({ focus, quality }: { focus: FocusInfo; quality: boolean }) {
  const next = focus.races.filter((r) => r.date >= isoDate(new Date())).slice(0, 3);
  return (
    <Collapsible className="rounded-xl border border-border">
      <CollapsibleTrigger className="group flex w-full items-center justify-between gap-3 rounded-xl p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <div className="min-w-0">
          <div className="text-sm text-muted-foreground">
            {t("Training block", "Blocco di allenamento")}
          </div>
          <h3 className="text-lg font-semibold leading-tight">{FOCUS_LABEL[focus.focus]}</h3>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-sm text-muted-foreground">
          {focus.pinned
            ? t("chosen by you", "scelto da te")
            : focus.since
              ? t(
                  `since ${format(parseISO(focus.since), "d MMM")}`,
                  `dal ${format(parseISO(focus.since), "d MMM")}`,
                )
              : ""}
          <ChevronDown
            className="size-4 transition-transform group-data-[state=open]:rotate-180"
            aria-hidden
          />
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-3 px-4 pb-4">
        <p className="text-[15px] leading-relaxed">{FOCUS_PURPOSE[focus.focus]}</p>
        {!quality && (
          <div className="rounded-lg bg-secondary/60 p-3">
            <div className="text-xs text-muted-foreground">
              {t("Its session, on days for intensity", "La sua seduta, nei giorni da intensità")}
            </div>
            <p className="mt-1 text-[15px] leading-relaxed">{focus.session}</p>
          </div>
        )}
        {!focus.pinned && focus.why.length > 0 && (
          <Collapsible>
            <CollapsibleTrigger asChild>
              <Button size="sm" variant="ghost" className="group -ml-3 text-sm">
                {t("Why this block", "Perché questo blocco")}
                <ChevronDown className="transition-transform group-data-[state=open]:rotate-180" />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed text-muted-foreground">
                {focus.why.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            </CollapsibleContent>
          </Collapsible>
        )}
        {next.length > 0 && (
          <div className="space-y-2 border-t border-border pt-3">
            <h4 className="text-sm text-muted-foreground">{t("Next races", "Prossime gare")}</h4>
            <ul className="space-y-2">
              {next.map((r) => (
                <li key={r.id} className="grid grid-cols-[3.75rem_1fr] gap-x-3">
                  <span className="stat-num text-sm font-semibold">
                    {format(parseISO(r.date), "d MMM")}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[15px]">{r.name}</span>
                    <span
                      className={cn(
                        "block text-sm",
                        r.info ? "text-muted-foreground" : "text-birch",
                      )}
                    >
                      {r.info
                        ? raceSummary(r)
                        : t(
                            "Kind not set: set it in Calendar",
                            "Tipo non impostato: impostalo nel Calendario",
                          )}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <label className="flex items-center justify-between gap-3 border-t border-border pt-3 text-sm text-muted-foreground">
          {t("Choose the block yourself", "Scegli tu il blocco")}
          <select
            value={focus.pinned ?? ""}
            onChange={(e) => focus.setPin((e.target.value || null) as Focus | null)}
            className="h-10 rounded-md border border-input bg-transparent px-2 text-sm text-foreground"
          >
            <option value="" className="bg-popover">
              {t("Automatic", "Automatico")}
            </option>
            {focusesFor(mainSport()).map((f) => (
              <option key={f} value={f} className="bg-popover">
                {FOCUS_LABEL[f]}
              </option>
            ))}
          </select>
        </label>
      </CollapsibleContent>
    </Collapsible>
  );
}

/** A day's wellness as labelled facts: the text equivalent of the trunk and buds. */
function dayFacts(w: Wellness | undefined): [string, string][] {
  if (!w) return [];
  const tsb = w.ctl != null && w.atl != null ? computeForm(w.ctl, w.atl) : null;
  const tsbPct = w.ctl != null && w.atl != null ? formPercent(w.ctl, w.atl) : null;
  const facts: [string, string | false | null][] = [
    [t("Fitness", "Fitness"), w.ctl != null && String(Math.round(w.ctl))],
    [
      t("Form", "Forma"),
      tsb != null &&
        `${tsb > 0 ? "+" : ""}${Math.round(tsb)} (${Math.round(tsbPct!)}%) · ${formZoneLabel(tsbPct!).toLowerCase()}`,
    ],
    [t("Sleep", "Sonno"), !!w.sleepSecs && formatDuration(w.sleepSecs)],
    [t("Fatigue", "Fatica"), w.fatigue != null && LEVEL[w.fatigue - 1]!],
    ["Stress", w.stress != null && LEVEL[w.stress - 1]!],
  ];
  return facts.filter((f): f is [string, string] => !!f[1]);
}

/** A sick or injured stretch: when, and what it did to fitness. */
function OffLine({ e, wellness }: { e: PlannedEvent; wellness: Wellness[] }) {
  const kind = e.category as OffKind;
  const last = e.end ?? e.date;
  const ctl = (d: string) => wellness.find((w) => w.id === d)?.ctl;
  const [from, to] = [ctl(e.date), ctl(last)];
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="text-base font-semibold">{offTitle(kind, e.date, last)}</span>
        {from != null && to != null && (
          <span className="stat-num text-sm text-muted-foreground">
            {t("Fitness", "Fitness")} {Math.round(from)} → {Math.round(to)}
          </span>
        )}
      </div>
      <p className="text-[15px] leading-relaxed text-muted-foreground">
        {kind === "SICK"
          ? t(
              "A dip after illness is normal; come back with a few easy days.",
              "Un calo dopo una malattia è normale; riparti con qualche giorno facile.",
            )
          : t(
              "Fitness waits for you; let the injury heal before adding load.",
              "Il fitness ti aspetta; prima lascia guarire l'infortunio.",
            )}
      </p>
    </div>
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
  const stretches = offEvents.filter((e) =>
    dates.some((d) => e.date <= d && d <= (e.end ?? e.date)),
  );
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
                ? t("Mark as sick", "Segna malattia")
                : t("Mark as injured", "Segna infortunio")}
            </Button>
          ))}
        </div>
      )}
      {dates.map((d) => {
        const day = acts.filter((a) => a.start_date_local.startsWith(d));
        const facts = dayFacts(wellness.find((w) => w.id === d));
        if (dates.length > 1 && !day.length && !facts.length) return null;
        return (
          <div key={d} className="space-y-1">
            {dates.length > 1 && (
              <div className="eyebrow">{format(parseISO(d), "EEEE d MMMM")}</div>
            )}
            {facts.length > 0 && (
              <dl className="flex flex-wrap gap-x-5 gap-y-1">
                {facts.map(([label, value]) => (
                  <div key={label} className="flex items-baseline gap-1.5">
                    <dt className="text-xs text-muted-foreground">{label}</dt>
                    <dd className="text-sm font-medium">{value}</dd>
                  </div>
                ))}
              </dl>
            )}
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
                        {climb >= 50 &&
                          `${intensity ? " · " : ""}${Math.round(climb)} ${t("m climbed", "m di dislivello")}`}
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
        {isFreeRide(e)
          ? e.type === "Run"
            ? t("Run", "Corsa")
            : t("Ride", "Uscita")
          : e.category === "WORKOUT"
            ? (e.type ?? t("Workout", "Allenamento"))
            : e.category.replace("_", " ").toLowerCase()}
        {e.moving_time ? ` · ${formatDuration(e.moving_time)}` : ""}
        {e.icu_training_load ? ` · ${t("load", "carico")} ${e.icu_training_load}` : ""}
      </p>
      {e.category === "WORKOUT" && <WorkoutPreview text={e.description} type={e.type} />}
      {e.description && <p className="whitespace-pre-line">{e.description}</p>}
    </div>
  );
}
