import { createFileRoute, Link } from "@tanstack/react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { ActivityRow } from "@/components/ActivityRow";
import { CheckInForm } from "@/components/CheckIn";
import { LogWorkoutForm } from "@/components/LogWorkout";
import { RaceForm } from "@/components/RaceForm";
import { ResponsiveDialog } from "@/components/ResponsiveDialog";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { useLocalStore } from "@/hooks/use-local-store";
import { weeklyTotals, type WeekRow } from "@/lib/analysis";
import type { Activity, PlannedEvent, Wellness } from "@/lib/intervals";
import { sourceKind } from "@/lib/source";
import { UploadRides } from "@/components/UploadRides";
import { activitiesRangeQuery, eventsQuery, wellnessRangeQuery } from "@/lib/queries";
import { activityKind, KINDS } from "@/lib/activity-kind";
import { isRace, raceFrom, raceSummary, type Race } from "@/lib/races";
import { advice, readinessFor } from "@/lib/readiness";
import { addDays, formatDuration, isoDate } from "@/lib/training";
import { cn } from "@/lib/utils";
import { format, t } from "@/lib/i18n";

export const Route = createFileRoute("/calendar")({
  head: () => ({ meta: [{ title: t("Calendar — Cirmolo", "Calendario — Cirmolo") }] }),
  validateSearch: (
    s: Record<string, unknown>,
  ): { month?: string | undefined; week?: string | undefined } => ({
    month:
      typeof s["month"] === "string" && /^\d{4}-\d{2}$/.test(s["month"]) ? s["month"] : undefined,
    week:
      typeof s["week"] === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s["week"])
        ? s["week"]
        : undefined,
  }),
  component: CalendarPage,
});

const TONE = {
  pine: "var(--pine)",
  fitness: "var(--fitness)",
  birch: "var(--birch)",
  lingon: "var(--lingon)",
} as const;
const STRESS_TONE = ["var(--pine)", "var(--fitness)", "var(--birch)", "var(--lingon)"];
const DOW = t("Mon Tue Wed Thu Fri Sat Sun", "Lun Mar Mer Gio Ven Sab Dom").split(" ");

type DayData = {
  date: string;
  inMonth: boolean;
  acts: Activity[];
  planned: PlannedEvent[];
  well: Wellness | undefined;
  score: number | null;
  load: number;
};

// Daily training load on a continuous scale: easy → hard runs green → cyan → gold → orange → red, all at the same
// soft strength. Each colour sits at a load; loads in between blend the two neighbours.
const LOAD_STOPS: [number, string][] = [
  [20, "var(--pine)"],
  [60, "var(--z3)"],
  [100, "var(--birch)"],
  [140, "var(--z5)"],
  [180, "var(--lingon)"],
];
const LOAD_TICKS = [0, 60, 120, "180+"];
// Blended colours go muddy on the dark background, so the band shows as a vivid stripe over a faint wash.
const tint = (color: string) => `color-mix(in oklab, ${color} 10%, transparent)`;
function loadColor(load: number): string | undefined {
  if (load <= 0) return undefined;
  const i = LOAD_STOPS.findIndex(([at]) => at >= load);
  if (i === 0) return LOAD_STOPS[0]![1];
  if (i < 0) return LOAD_STOPS[LOAD_STOPS.length - 1]![1];
  const [[a, ca], [b, cb]] = [LOAD_STOPS[i - 1]!, LOAD_STOPS[i]!];
  return `color-mix(in oklab, ${cb} ${Math.round(((load - a) / (b - a)) * 100)}%, ${ca})`;
}
/** Day cell style for its total load: a stripe on `edge` plus a faint wash; nothing on rest days. */
function loadStyle(load: number, edge: "top" | "left"): React.CSSProperties | undefined {
  const c = loadColor(load);
  if (!c) return undefined;
  return {
    background: tint(c),
    boxShadow: edge === "top" ? `inset 0 4px 0 ${c}` : `inset 4px 0 0 ${c}`,
  };
}

type View = "week" | "month";

function CalendarPage() {
  const { month, week } = Route.useSearch();
  const today = isoDate(new Date());
  const anchor = useMemo(
    () => (month ? parseISO(`${month}-01`) : startOfMonth(parseISO(week ?? today))),
    [month, week, today],
  );
  // Phone: the month grid by default (today highlighted), or one week at a time.
  const mobile = useIsMobile();
  const [view, setView] = useLocalStore<View>("cadence_calendar_view", "month");
  const weekView = mobile && view === "week";
  const weekStart = isoDate(
    startOfWeek(week ? parseISO(week) : month ? anchor : parseISO(today), { weekStartsOn: 1 }),
  );
  const first = weekView
    ? weekStart
    : isoDate(startOfWeek(startOfMonth(anchor), { weekStartsOn: 1 }));
  const last = weekView
    ? addDays(weekStart, 6)
    : isoDate(endOfWeek(endOfMonth(anchor), { weekStartsOn: 1 }));
  const range = { oldest: first, newest: last };
  const keep = { placeholderData: keepPreviousData };
  const { data: acts } = useQuery({ ...activitiesRangeQuery(range), ...keep });
  const { data: events } = useQuery({ ...eventsQuery(range), ...keep });
  const { data: wellness } = useQuery({
    ...wellnessRangeQuery({ oldest: addDays(first, -8), newest: last }),
    ...keep,
  });
  const [open, setOpen] = useState<string | null>(null);
  const [logging, setLogging] = useState(false);

  const weeks = useMemo(() => {
    const days: DayData[] = eachDayOfInterval({ start: parseISO(first), end: parseISO(last) }).map(
      (d) => {
        const date = isoDate(d);
        return {
          date,
          inMonth: weekView || d.getMonth() === anchor.getMonth(),
          acts: (acts ?? []).filter((a) => a.start_date_local.startsWith(date)).reverse(),
          planned: (events ?? []).filter(
            (e) => e.date === date && (e.category === "WORKOUT" || e.category.startsWith("RACE")),
          ),
          well: wellness?.find((w) => w.id === date),
          score: wellness && date <= today ? readinessFor(wellness, date).score : null,
          load: (acts ?? [])
            .filter((a) => a.start_date_local.startsWith(date))
            .reduce((t, a) => t + (a.icu_training_load ?? 0), 0),
        };
      },
    );
    const out: { days: DayData[]; totals: WeekRow | undefined }[] = [];
    for (let i = 0; i < days.length; i += 7) {
      const wk = days.slice(i, i + 7);
      out.push({ days: wk, totals: weeklyTotals(wk.flatMap((d) => d.acts))[0] });
    }
    return out;
  }, [acts, events, wellness, first, last, today, anchor, weekView]);

  const monthKey = (offset: number) => format(addMonths(anchor, offset), "yyyy-MM");
  const selected = weeks.flatMap((w) => w.days).find((d) => d.date === open);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="eyebrow">{t("Training & wellness", "Allenamento e benessere")}</div>
          <h1 className="text-3xl font-bold tracking-tight">
            {weekView
              ? `${format(parseISO(first), "d MMM")} – ${format(parseISO(last), "d MMM")}`
              : format(anchor, "MMMM yyyy")}
          </h1>
        </div>
        <div className="flex w-full items-center gap-1 md:w-auto">
          <div className="mr-auto flex gap-1 rounded-lg bg-secondary p-1 md:hidden">
            {(["week", "month"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(() => v)}
                className={cn(
                  "min-h-8 rounded-md px-3 text-xs",
                  view === v ? "bg-background text-foreground" : "text-muted-foreground",
                )}
              >
                {v === "week" ? t("Week", "Settimana") : t("Month", "Mese")}
              </button>
            ))}
          </div>
          <Button
            variant="ghost"
            size="icon"
            asChild
            aria-label={
              weekView
                ? t("Previous week", "Settimana precedente")
                : t("Previous month", "Mese precedente")
            }
          >
            <Link
              to="/calendar"
              search={weekView ? { week: addDays(weekStart, -7) } : { month: monthKey(-1) }}
            >
              <ChevronLeft />
            </Link>
          </Button>
          <Button variant="secondary" size="sm" asChild>
            <Link to="/calendar" search={{}}>
              {t("Today", "Oggi")}
            </Link>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            asChild
            aria-label={
              weekView ? t("Next week", "Settimana successiva") : t("Next month", "Mese successivo")
            }
          >
            <Link
              to="/calendar"
              search={weekView ? { week: addDays(weekStart, 7) } : { month: monthKey(1) }}
            >
              <ChevronRight />
            </Link>
          </Button>
          <Button size="sm" className="ml-2" onClick={() => setLogging(true)}>
            <Plus />
            <span className="hidden sm:inline">{t("Log workout", "Registra allenamento")}</span>
            <span className="sm:hidden">{t("Log", "Registra")}</span>
          </Button>
        </div>
      </div>

      {/* Desktop: month grid with a weekly summary column. */}
      <div className="hidden overflow-hidden rounded-xl border border-border bg-card md:block">
        <div className="grid grid-cols-[repeat(7,minmax(0,1fr))_9rem] border-b border-border">
          {[...DOW, t("Week", "Settimana")].map((d) => (
            <div key={d} className="eyebrow px-2 py-2">
              {d}
            </div>
          ))}
        </div>
        {weeks.map((w) => (
          <div
            key={w.days[0]!.date}
            className="grid grid-cols-[repeat(7,minmax(0,1fr))_9rem] border-b border-border last:border-b-0"
          >
            {w.days.map((d) => (
              <button
                key={d.date}
                onClick={() => setOpen(d.date)}
                className={cn(
                  "min-h-28 space-y-1 border-r border-border p-1.5 text-left align-top transition-colors hover:brightness-125",
                  !d.inMonth && "opacity-40",
                )}
                style={loadStyle(d.load, "top")}
                title={d.load ? `${t("Load", "Carico")} ${Math.round(d.load)}` : undefined}
              >
                <DayHeader d={d} today={today} />
                {d.acts.map((a) => (
                  <ActChip key={a.id} a={a} />
                ))}
                {d.planned.map((e) => (
                  <PlannedChip key={e.id} e={e} />
                ))}
              </button>
            ))}
            <WeekSummary totals={w.totals} />
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        <span>{t("Daily load:", "Carico giornaliero:")}</span>
        <span className="flex w-40 flex-col gap-0.5">
          <span
            className="h-1.5 rounded-full"
            style={{
              // Stops placed at their loads on a 0–180 bar, matching loadColor.
              background: `linear-gradient(to right in oklab, ${LOAD_STOPS.map(([at, c]) => `${c} ${(at / 180) * 100}%`).join(", ")})`,
            }}
          />
          <span className="stat-num flex justify-between">
            {LOAD_TICKS.map((v) => (
              <span key={v}>{v}</span>
            ))}
          </span>
        </span>
      </div>

      {/* Phone, week view: the week's totals, then one row per day. */}
      {weekView && (
        <div className="space-y-3 md:hidden">
          {weeks.map((w) => (
            <div
              key={w.days[0]!.date}
              className="overflow-hidden rounded-xl border border-border bg-card"
            >
              <div className="stat-num flex flex-wrap justify-between gap-x-3 bg-secondary/50 px-3 py-2 text-xs text-muted-foreground">
                <span className="font-sans">{t("Week", "Settimana")}</span>
                <span>
                  {w.totals
                    ? `${Math.round(w.totals.load)} TSS · ${w.totals.hours.toFixed(1)} h · ${Math.round(w.totals.km)} km · ${Math.round(w.totals.elevation)} m`
                    : t("rest week", "settimana di riposo")}
                </span>
              </div>
              <div className="divide-y divide-border">
                {w.days.map((d) => (
                  <button
                    key={d.date}
                    onClick={() => setOpen(d.date)}
                    className="flex min-h-14 w-full items-start gap-3 px-3 py-2.5 text-left"
                    style={loadStyle(d.load, "left")}
                  >
                    <div className="w-20 shrink-0">
                      <DayHeader d={d} today={today} />
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      {d.acts.map((a) => (
                        <ActChip key={a.id} a={a} />
                      ))}
                      {d.planned.map((e) => (
                        <PlannedChip key={e.id} e={e} />
                      ))}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Phone, month view: a compact grid, one dot per activity. */}
      {mobile && view === "month" && <MonthGrid weeks={weeks} today={today} onOpen={setOpen} />}

      <ResponsiveDialog
        open={!!selected}
        onOpenChange={(o) => !o && setOpen(null)}
        title={selected ? format(parseISO(selected.date), "EEEE d MMMM") : ""}
      >
        {selected && <DayDetail d={selected} />}
      </ResponsiveDialog>
      <ResponsiveDialog
        open={logging}
        onOpenChange={setLogging}
        title={t("Log a workout", "Registra un allenamento")}
        description={t(
          "For sessions the watch didn't record.",
          "Per le sessioni che l'orologio non ha registrato.",
        )}
      >
        {sourceKind() === "native" && (
          <div className="mb-4">
            <UploadRides onDone={() => setLogging(false)} />
          </div>
        )}
        <LogWorkoutForm date={today} onSaved={() => setLogging(false)} />
      </ResponsiveDialog>
    </div>
  );
}

function MonthGrid({
  weeks,
  today,
  onOpen,
}: {
  weeks: { days: DayData[] }[];
  today: string;
  onOpen: (date: string) => void;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card md:hidden">
      <div className="grid grid-cols-7 border-b border-border">
        {DOW.map((d) => (
          <div key={d} className="eyebrow py-2 text-center">
            {d.slice(0, 1)}
          </div>
        ))}
      </div>
      {weeks.map((w) => (
        <div
          key={w.days[0]!.date}
          className="grid grid-cols-7 border-b border-border last:border-b-0"
        >
          {w.days.map((d) => (
            <button
              key={d.date}
              onClick={() => onOpen(d.date)}
              className={cn(
                "flex h-16 flex-col items-center gap-1 border-r border-border pt-1.5 last:border-r-0",
                !d.inMonth && "opacity-35",
              )}
              style={loadStyle(d.load, "top")}
              aria-label={`${format(parseISO(d.date), "EEEE d MMMM")}: ${d.acts.length} ${t("activities", "attività")}`}
            >
              <span
                className={cn(
                  "stat-num flex h-6 w-6 items-center justify-center rounded-full text-xs",
                  d.date === today ? "bg-primary text-primary-foreground" : "text-foreground",
                )}
              >
                {Number(d.date.slice(8))}
              </span>
              <span className="flex flex-wrap justify-center gap-0.5 px-0.5">
                {d.acts.slice(0, 3).map((a) => (
                  <span
                    key={a.id}
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: KINDS[activityKind(a)].color }}
                  />
                ))}
                {d.planned.length > 0 && (
                  <span className="h-1.5 w-1.5 rounded-full border border-birch" />
                )}
              </span>
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

function DayHeader({ d, today }: { d: DayData; today: string }) {
  const tone = d.score != null ? TONE[advice(d.score).tone] : null;
  return (
    <div className="flex flex-wrap items-center gap-1">
      <span
        className={cn(
          "stat-num inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs",
          d.date === today ? "bg-primary text-primary-foreground" : "text-muted-foreground",
        )}
      >
        <span className="mr-1 font-sans md:hidden">{format(parseISO(d.date), "EEE")}</span>
        {Number(d.date.slice(8))}
      </span>
      {tone && (
        <span
          className="stat-num rounded-full px-1.5 text-[10px] font-semibold text-background"
          style={{ background: tone }}
          title={t("Readiness", "Prontezza")}
        >
          {d.score}
        </span>
      )}
      {d.well?.sleepSecs ? (
        <span className="stat-num text-[10px] text-muted-foreground">
          {(d.well.sleepSecs / 3600).toFixed(1)}h
        </span>
      ) : null}
      {d.well?.stress != null && (
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{ background: STRESS_TONE[d.well.stress - 1] }}
          title="Stress"
        />
      )}
    </div>
  );
}

function ActChip({ a }: { a: Activity }) {
  const kind = KINDS[activityKind(a)];
  return (
    <div
      className="stat-num truncate rounded border-l-[3px] bg-background/80 px-1.5 py-0.5 text-[11px] text-foreground"
      style={{ borderColor: kind.color }}
      title={kind.label}
    >
      <kind.icon className="mr-1 inline h-3 w-3 align-[-2px]" style={{ color: kind.color }} />
      <span className="font-semibold" style={{ color: kind.color }}>
        {a.icu_training_load ?? "–"}
      </span>
      {a.distance ? ` · ${(a.distance / 1000).toFixed(0)}km` : ""} · {formatDuration(a.moving_time)}
      <span className="ml-1 font-sans text-muted-foreground">{a.name}</span>
    </div>
  );
}

function PlannedChip({ e }: { e: PlannedEvent }) {
  return (
    <div className="truncate rounded border border-dashed border-birch/50 px-1.5 py-0.5 text-[11px] text-birch">
      {e.name ?? t("Planned", "Pianificato")}
      {e.icu_training_load ? ` · ${e.icu_training_load}` : ""}
    </div>
  );
}

function WeekSummary({ totals }: { totals: WeekRow | undefined }) {
  return (
    <div className="stat-num space-y-0.5 bg-secondary/30 p-2 text-xs">
      {totals ? (
        <>
          <div className="text-sm font-semibold text-fitness">{Math.round(totals.load)} TSS</div>
          <div>{totals.hours.toFixed(1)} h</div>
          <div>{Math.round(totals.km)} km</div>
          <div>{Math.round(totals.elevation)} m</div>
        </>
      ) : (
        <div className="font-sans text-muted-foreground">
          {t("Rest week", "Settimana di riposo")}
        </div>
      )}
    </div>
  );
}

function DayDetail({ d }: { d: DayData }) {
  const [tab, setTab] = useState<"day" | "wellness" | "log" | "race">("day");
  const [editing, setEditing] = useState<Race | undefined>();
  return (
    <div className="space-y-4">
      <div className="flex gap-1 rounded-lg bg-secondary p-1">
        {(
          [
            ["day", t("Activities", "Attività")],
            ["wellness", t("Wellness", "Benessere")],
            ["log", t("Log workout", "Registra allenamento")],
            ["race", t("Race", "Gara")],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            onClick={() => {
              if (k === "race" && tab !== "race") setEditing(undefined);
              setTab(k);
            }}
            className={cn(
              // Four tabs on a phone: long labels wrap to two lines instead of overflowing.
              "min-h-10 flex-1 rounded-md px-1.5 py-1 text-xs leading-tight",
              tab === k ? "bg-background text-foreground" : "text-muted-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "day" &&
        (d.acts.length || d.planned.length ? (
          <div className="space-y-2">
            <div className="-mx-3">
              {d.acts.map((a) => (
                <ActivityRow key={a.id} a={a} />
              ))}
            </div>
            {d.planned.map((e) => {
              const race = isRace(e) ? raceFrom(e) : null;
              return (
                <div
                  key={e.id}
                  className="rounded-lg border border-dashed border-birch/50 p-3 text-sm"
                >
                  <div className="font-medium text-birch">
                    {e.name ?? t("Planned workout", "Allenamento pianificato")}
                  </div>
                  <div className="stat-num text-xs text-muted-foreground">
                    {race
                      ? raceSummary(race)
                      : `${formatDuration(e.moving_time)} · ${t("load", "carico")} ${e.icu_training_load ?? "–"}`}
                  </div>
                  {(race ? race.notes : e.description) && (
                    <p className="mt-2 whitespace-pre-line text-xs text-muted-foreground">
                      {race ? race.notes : e.description}
                    </p>
                  )}
                  {race && (
                    <Button
                      size="sm"
                      variant={race.info ? "ghost" : "secondary"}
                      className={cn("mt-2", race.info && "-ml-3")}
                      onClick={() => {
                        setEditing(race);
                        setTab("race");
                      }}
                    >
                      {race.info
                        ? t("Edit race", "Modifica gara")
                        : t("Set the race kind", "Imposta il tipo di gara")}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="py-4 text-center text-sm text-muted-foreground">
            {t("No activities on this day.", "Nessuna attività in questo giorno.")}
          </p>
        ))}
      {tab === "wellness" && (
        <CheckInForm key={d.date} date={d.date} row={d.well} onSaved={() => setTab("day")} />
      )}
      {tab === "log" && <LogWorkoutForm date={d.date} onSaved={() => setTab("day")} />}
      {tab === "race" && (
        <RaceForm
          key={editing?.id ?? "new"}
          date={d.date}
          race={editing}
          onSaved={() => setTab("day")}
        />
      )}
    </div>
  );
}
