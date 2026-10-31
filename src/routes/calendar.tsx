import { createFileRoute, Link } from "@tanstack/react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { ActivityRow } from "@/components/ActivityRow";
import { CheckInForm } from "@/components/CheckIn";
import { LogWorkoutForm } from "@/components/LogWorkout";
import { ResponsiveDialog } from "@/components/ResponsiveDialog";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { useLocalStore } from "@/hooks/use-local-store";
import { weeklyTotals, type WeekRow } from "@/lib/analysis";
import type { Activity, PlannedEvent, Wellness } from "@/lib/intervals";
import { activitiesRangeQuery, eventsQuery, wellnessRangeQuery } from "@/lib/queries";
import { activityKind, KINDS } from "@/lib/activity-kind";
import { advice, readinessFor } from "@/lib/readiness";
import { addDays, formatDuration, isoDate } from "@/lib/training";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/calendar")({
  head: () => ({ meta: [{ title: "Calendar — Cirmolo" }] }),
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
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type DayData = {
  date: string;
  inMonth: boolean;
  acts: Activity[];
  planned: PlannedEvent[];
  well: Wellness | undefined;
  score: number | null;
  load: number;
};

// Daily training load bands: easy → hard runs green → cyan → gold → orange → red, all at the same soft strength.
const LOAD_BANDS: [number, string, string][] = [
  [1, "var(--pine)", "< 40"],
  [40, "var(--z3)", "40–80"],
  [80, "var(--birch)", "80–120"],
  [120, "var(--z5)", "120–160"],
  [160, "var(--lingon)", "160+"],
];
// Blended colours go muddy on the dark background, so the band shows as a vivid stripe over a faint wash.
const tint = (color: string) => `color-mix(in oklab, ${color} 10%, transparent)`;
const loadColor = (load: number) =>
  load > 0 ? [...LOAD_BANDS].reverse().find(([min]) => load >= min)?.[1] : undefined;
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
  // Phone: one week at a time by default (it opens on today), or a compact month grid.
  const mobile = useIsMobile();
  const [view, setView] = useLocalStore<View>("cadence_calendar_view", "week");
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
          <div className="eyebrow">Training & wellness</div>
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
                  "min-h-8 rounded-md px-3 text-xs capitalize",
                  view === v ? "bg-background text-foreground" : "text-muted-foreground",
                )}
              >
                {v}
              </button>
            ))}
          </div>
          <Button
            variant="ghost"
            size="icon"
            asChild
            aria-label={weekView ? "Previous week" : "Previous month"}
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
              Today
            </Link>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            asChild
            aria-label={weekView ? "Next week" : "Next month"}
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
            <span className="hidden sm:inline">Log workout</span>
            <span className="sm:hidden">Log</span>
          </Button>
        </div>
      </div>

      {/* Desktop: month grid with a weekly summary column. */}
      <div className="hidden overflow-hidden rounded-xl border border-border bg-card md:block">
        <div className="grid grid-cols-[repeat(7,minmax(0,1fr))_9rem] border-b border-border">
          {[...DOW, "Week"].map((d) => (
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
                title={d.load ? `Load ${Math.round(d.load)}` : undefined}
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
            <WeekSummary t={w.totals} />
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        <span>Daily load:</span>
        {LOAD_BANDS.map(([, color, label]) => (
          <span key={label} className="flex items-center gap-1">
            <span className="h-1.5 w-5 rounded-full" style={{ background: color }} /> {label}
          </span>
        ))}
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
                <span className="font-sans">Week</span>
                <span>
                  {w.totals
                    ? `${Math.round(w.totals.load)} TSS · ${w.totals.hours.toFixed(1)} h · ${Math.round(w.totals.km)} km · ${Math.round(w.totals.elevation)} m`
                    : "rest week"}
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
        title="Log a workout"
        description="For sessions the watch didn't record."
      >
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
              aria-label={`${format(parseISO(d.date), "EEEE d MMMM")}: ${d.acts.length} activities`}
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
          title="Readiness"
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
      {e.name ?? "Planned"}
      {e.icu_training_load ? ` · ${e.icu_training_load}` : ""}
    </div>
  );
}

function WeekSummary({ t }: { t: WeekRow | undefined }) {
  return (
    <div className="stat-num space-y-0.5 bg-secondary/30 p-2 text-xs">
      {t ? (
        <>
          <div className="text-sm font-semibold text-fitness">{Math.round(t.load)} TSS</div>
          <div>{t.hours.toFixed(1)} h</div>
          <div>{Math.round(t.km)} km</div>
          <div>{Math.round(t.elevation)} m</div>
        </>
      ) : (
        <div className="font-sans text-muted-foreground">Rest week</div>
      )}
    </div>
  );
}

function DayDetail({ d }: { d: DayData }) {
  const [tab, setTab] = useState<"day" | "wellness" | "log">("day");
  return (
    <div className="space-y-4">
      <div className="flex gap-1 rounded-lg bg-secondary p-1">
        {(
          [
            ["day", "Activities"],
            ["wellness", "Wellness"],
            ["log", "Log workout"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={cn(
              "flex-1 rounded-md px-3 py-1.5 text-xs",
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
            {d.planned.map((e) => (
              <div
                key={e.id}
                className="rounded-lg border border-dashed border-birch/50 p-3 text-sm"
              >
                <div className="font-medium text-birch">{e.name ?? "Planned workout"}</div>
                <div className="stat-num text-xs text-muted-foreground">
                  {formatDuration(e.moving_time)} · load {e.icu_training_load ?? "–"}
                </div>
                {e.description && (
                  <p className="mt-2 whitespace-pre-line text-xs text-muted-foreground">
                    {e.description}
                  </p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="py-4 text-center text-sm text-muted-foreground">
            No activities on this day.
          </p>
        ))}
      {tab === "wellness" && (
        <CheckInForm key={d.date} date={d.date} row={d.well} onSaved={() => setTab("day")} />
      )}
      {tab === "log" && <LogWorkoutForm date={d.date} onSaved={() => setTab("day")} />}
    </div>
  );
}
