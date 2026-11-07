// The plan's season: choosing its months and kinds of race, how many hours it climbs through, and where it stands.
import { parseISO } from "date-fns";
import { Plus } from "lucide-react";
import { useState } from "react";
import { PHASE } from "@/components/plan/parts";
import { RaceForm } from "@/components/RaceForm";
import { ResponsiveDialog } from "@/components/ResponsiveDialog";
import { Panel } from "@/components/StatCard";
import { Button } from "@/components/ui/button";
import { Stepper } from "@/components/ui/stepper";
import { mondayOf } from "@/lib/focus";
import { format, t } from "@/lib/i18n";
import type { Activity } from "@/lib/intervals";
import { groupWeeks, type OutlineWeek } from "@/lib/plan/outline";
import { monthsFrom, periodsOf, type nextTarget, type Period } from "@/lib/plan/season";
import { availableSeconds } from "@/lib/plan/start-level";
import { SEASON_KINDS, type PlanSeason, type PlanSettings } from "@/lib/plan/types";
import { CLIMB_PERCENT, suggestVolume } from "@/lib/plan/volume";
import { KINDS, raceSport, type Race } from "@/lib/races";
import { addDays, formatDuration } from "@/lib/training";
import { cn } from "@/lib/utils";

type Kinds = PlanSeason["kinds"];

const QUARTER = 900;
const LEAST_START = 3600;
/** How far off a season must be for its climb to be a slow one. */
const SLOW_CLIMB_WEEKS = 8;

const monthName = (date: string) => format(parseISO(date), "MMMM").toLowerCase();
const periodName = (p: Period) => {
  const [a, b] = [monthName(p.from), monthName(p.to)];
  return a === b ? a : `${a} – ${b}`;
};

/** The next twelve months, on one row when there's room and two when there isn't. Months next to each other read as one band. */
function MonthStrip({
  first,
  months,
  onChange,
}: {
  first: string;
  months: string[];
  onChange: (months: string[]) => void;
}) {
  const all = monthsFrom(first);
  return (
    <div className="grid grid-cols-6 gap-y-1.5 rounded-xl border border-border bg-card p-2 md:grid-cols-12">
      {all.map((m, i) => {
        const selected = months.includes(m);
        const before = !!all[i - 1] && months.includes(all[i - 1]!);
        const after = !!all[i + 1] && months.includes(all[i + 1]!);
        const date = parseISO(`${m}-01`);
        return (
          <button
            key={m}
            type="button"
            aria-pressed={selected}
            aria-label={format(date, "MMMM yyyy")}
            onClick={() => onChange(selected ? months.filter((x) => x !== m) : [...months, m])}
            className={cn(
              "flex min-h-12 flex-col items-center justify-center text-sm",
              selected ? "bg-primary font-medium text-primary-foreground" : "text-foreground",
              // Where the strip wraps on the phone, the band ends there and goes on in the next row.
              selected &&
                (!before ? "rounded-l-lg" : i % 6 === 0 && "rounded-l-lg md:rounded-l-none"),
              selected &&
                (!after ? "rounded-r-lg" : i % 6 === 5 && "rounded-r-lg md:rounded-r-none"),
            )}
          >
            <span>{format(date, "MMM")}</span>
            {(i === 0 || m.endsWith("-01")) && (
              <span
                className={cn(
                  "text-[10px]",
                  selected ? "text-primary-foreground/80" : "text-muted-foreground",
                )}
              >
                {format(date, "yyyy")}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function KindChips({ kinds, onChange }: { kinds: Kinds; onChange: (kinds: Kinds) => void }) {
  const group = (discipline: "road" | "mtb", label: string) => (
    <div>
      <div className="mb-1 text-xs text-muted-foreground">{label}</div>
      <div className="flex flex-wrap gap-1.5">
        {SEASON_KINDS.filter((k) => KINDS[k].discipline === discipline).map((k) => {
          const on = kinds.includes(k);
          return (
            <button
              key={k}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(on ? kinds.filter((x) => x !== k) : [...kinds, k])}
              className={cn(
                "min-h-9 rounded-full border px-3 text-sm",
                on ? "border-transparent bg-primary text-primary-foreground" : "border-border",
              )}
            >
              {KINDS[k].label}
            </button>
          );
        })}
      </div>
    </div>
  );
  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-3">
      {group("road", t("Road", "Strada"))}
      {group("mtb", "MTB")}
    </div>
  );
}

/** The months and the kinds of race. */
export function SeasonEditor({
  first,
  months,
  kinds,
  onMonths,
  onKinds,
}: {
  /** The first month to offer. */
  first: string;
  months: string[];
  kinds: Kinds;
  onMonths: (months: string[]) => void;
  onKinds: (kinds: Kinds) => void;
}) {
  const periods = periodsOf({ months, kinds });
  return (
    <>
      <section>
        <div className="eyebrow on-sky mb-1">
          {t("When your goals are", "Quando sono i tuoi obiettivi")}
        </div>
        <MonthStrip first={first} months={months} onChange={onMonths} />
        <p className="on-sky mt-1 text-xs first-letter:uppercase">
          {periods.length
            ? periods.map(periodName).join(", ")
            : t("Choose at least one month.", "Scegli almeno un mese.")}
        </p>
      </section>
      <section>
        <div className="eyebrow on-sky mb-1">{t("What kind of races", "Che tipo di gare")}</div>
        <KindChips kinds={kinds} onChange={onKinds} />
        <p className="on-sky mt-1 text-xs">
          {t("Not sure yet? You can leave this empty.", "Non lo sai ancora? Puoi lasciarlo vuoto.")}
        </p>
      </section>
    </>
  );
}

/** Where a new season starts and what it climbs to: suggested from last year, then the rider's to change. */
export function useSeasonVolume({
  acts,
  today,
  settings,
  races,
  usual,
}: {
  acts: Activity[];
  today: string;
  settings: PlanSettings;
  races: Race[];
  /** What the plan would start from with no year to read. */
  usual: number;
}) {
  const [percent, setPercent] = useState<number>(CLIMB_PERCENT.usual);
  const [chosen, setChosen] = useState<number | null>(null);
  const state = { buildWeeks: 3 as const, cycleStart: mondayOf(today), forcedRecovery: null };
  const ask = (climbPercent: number) =>
    suggestVolume({
      acts,
      today,
      settings,
      races,
      state,
      // With no year to read, the climb is measured from the start chosen.
      fallbackSeconds: chosen ?? usual,
      climbPercent,
    });
  const suggestion = ask(percent);
  const hasYear = suggestion.climbPercent != null;
  // Fewer free hours can leave a start chosen earlier above them.
  const start = Math.min(chosen ?? suggestion.startSeconds, suggestion.reachSeconds);
  const top = hasYear ? suggestion.reachSeconds : availableSeconds(settings);
  const nextMonthOn = periodsOf(settings.season ?? { months: [], kinds: [] }).find(
    (p) => p.from > today,
  );
  return {
    suggestion,
    start,
    percent,
    canStartHigher: start + QUARTER <= top,
    canStartLower: start - QUARTER >= LEAST_START,
    setStart: setChosen,
    canClimbHigher: hasYear && percent < CLIMB_PERCENT.most && !ask(percent + 1).limitedByDays,
    canClimbLower: hasYear && percent > CLIMB_PERCENT.least && !suggestion.limitedByDays,
    setPercent,
    /** The next period's first day, and the weeks to it. */
    next: nextMonthOn
      ? {
          from: nextMonthOn.from,
          weeks: Math.round((Date.parse(nextMonthOn.from) - Date.parse(today)) / (7 * 864e5)),
        }
      : null,
  };
}

export function VolumeCard({ volume }: { volume: ReturnType<typeof useSeasonVolume> }) {
  const { suggestion, start, percent, next } = volume;
  const reach = formatDuration(suggestion.reachSeconds);
  const lately = formatDuration(suggestion.recentSeconds);
  const hasYear = suggestion.lastYearBest != null;
  const best = formatDuration(suggestion.lastYearBest ?? 0);
  const year = t(
    `Last year your best month was ${best} a week, and lately you ride ${lately}.`,
    `L'anno scorso il tuo mese migliore è stato di ${best} a settimana, e di recente pedali ${lately}.`,
  );
  const explain = !hasYear
    ? t(
        `There isn't a year of rides to read yet, so the climb is measured from where you start. Lately you ride ${lately}.`,
        `Non c'è ancora un anno di uscite da leggere, quindi la salita si misura da dove parti. Di recente pedali ${lately}.`,
      )
    : suggestion.limitedByDays
      ? `${year} ${t(
          `The days you chose hold ${reach}: to climb higher, give them more time.`,
          `I giorni che hai scelto arrivano a ${reach}: per salire di più, dagli più tempo.`,
        )}`
      : next && next.weeks >= SLOW_CLIMB_WEEKS
        ? `${year} ${t(
            `With ${next.weeks} weeks to ${monthName(next.from)}, you climb slowly.`,
            `Con ${next.weeks} settimane fino a ${monthName(next.from)}, sali piano.`,
          )}`
        : year;
  return (
    <section>
      <div className="eyebrow on-sky mb-1">{t("Hours a week", "Ore a settimana")}</div>
      <div className="space-y-3 rounded-xl border border-border bg-card p-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm">{t("Start from", "Parti da")}</span>
          <Stepper
            compact
            less={t("Start from less", "Parti da meno")}
            more={t("Start from more", "Parti da più")}
            canLess={volume.canStartLower}
            canMore={volume.canStartHigher}
            onLess={() => volume.setStart(start - QUARTER)}
            onMore={() => volume.setStart(start + QUARTER)}
          >
            <span aria-live="polite" className="stat-num inline-block w-20 text-center">
              {formatDuration(start)}
            </span>
          </Stepper>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="min-w-0 text-sm">
            {t("Climb to", "Arriva a")}
            <span className="block text-xs text-muted-foreground">
              {!hasYear
                ? t("from where you start", "da dove parti")
                : suggestion.limitedByDays
                  ? t("as far as your days go", "fin dove arrivano i tuoi giorni")
                  : t(`${percent}% over last year`, `${percent}% sull'anno scorso`)}
            </span>
          </span>
          {hasYear ? (
            <Stepper
              compact
              less={t("Climb to less", "Arriva a meno")}
              more={t("Climb to more", "Arriva a più")}
              canLess={volume.canClimbLower}
              canMore={volume.canClimbHigher}
              onLess={() => volume.setPercent(percent - 1)}
              onMore={() => volume.setPercent(percent + 1)}
            >
              <span aria-live="polite" className="stat-num inline-block w-20 text-center">
                {reach}
              </span>
            </Stepper>
          ) : (
            <span className="stat-num">{reach}</span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">{explain}</p>
      </div>
    </section>
  );
}

/** The periods still to come with the races known so far, and a way to add one. */
export function SeasonPanel({
  season,
  races,
  today,
}: {
  season: PlanSeason;
  races: Race[];
  today: string;
}) {
  const [adding, setAdding] = useState(false);
  const periods = periodsOf(season).filter((p) => p.to >= today);
  const ahead = races.filter((r) => r.date >= today && raceSport(r) === "ride");
  const inPeriod = (r: Race) => periods.some((p) => r.date >= p.from && r.date <= p.to);
  const elsewhere = ahead.filter((r) => !inPeriod(r));
  const kinds = season.kinds.map((k) => KINDS[k].label).join(", ");
  const none = t("no dates yet", "ancora senza date");
  const raceLines = (list: Race[]) => (
    <div className="mt-1 space-y-1">
      {list.map((r) => (
        <div key={r.id} className="flex items-baseline gap-2 text-sm">
          <span className="eyebrow w-14 shrink-0">{format(parseISO(r.date), "d MMM")}</span>
          <span className="min-w-0 flex-1 truncate">{r.name}</span>
          <span className="stat-num text-xs text-muted-foreground">{r.priority}</span>
        </div>
      ))}
    </div>
  );
  const firstAhead = periods.find((p) => p.from > today)?.from ?? today;
  return (
    <Panel title={t("The season", "La stagione")}>
      <div className="-my-1 divide-y divide-border">
        {periods.map((p) => {
          const inside = ahead.filter((r) => r.date >= p.from && r.date <= p.to);
          return (
            <div key={p.from} className="py-2">
              <div className="font-medium first-letter:uppercase">{periodName(p)}</div>
              {inside.length ? (
                raceLines(inside)
              ) : (
                <div className="text-sm text-muted-foreground">
                  {kinds ? `${kinds} · ${none}` : none}
                </div>
              )}
            </div>
          );
        })}
        {elsewhere.length > 0 && (
          <div className="py-2">
            <div className="font-medium">{t("Other races", "Altre gare")}</div>
            {raceLines(elsewhere)}
          </div>
        )}
      </div>
      <Button variant="outline" className="mt-2 w-full" onClick={() => setAdding(true)}>
        <Plus className="h-4 w-4" /> {t("Add a race", "Aggiungi una gara")}
      </Button>
      <ResponsiveDialog
        open={adding}
        onOpenChange={setAdding}
        title={t("Add a race", "Aggiungi una gara")}
      >
        <RaceForm date={firstAhead} onSaved={() => setAdding(false)} />
      </ResponsiveDialog>
    </Panel>
  );
}

const hours = (seconds: number) => {
  const minutes = Math.round(seconds / QUARTER) * 15;
  const h = Math.floor(minutes / 60);
  return `${h}h${minutes % 60 ? String(minutes % 60).padStart(2, "0") : ""}`;
};
const AHEAD = "color-mix(in oklab, var(--foreground) 22%, var(--secondary))";
/** A group this share of the road has room to say its hours. */
const LABELLED = 0.09;

/** The whole way to the end of the season, with similar weeks as one bar, so that a long road stays readable on a phone. */
export function SeasonRoad({
  ahead,
  season,
  races,
  monday,
  started,
  target,
}: {
  ahead: OutlineWeek[];
  season: PlanSeason;
  races: Race[];
  monday: string;
  started: string;
  target: ReturnType<typeof nextTarget>;
}) {
  const groups = groupWeeks(ahead);
  const most = Math.max(1, ...groups.map((g) => g.seconds));
  const labels: { phase: OutlineWeek["phase"]; weeks: number }[] = [];
  for (const g of groups) {
    const last = labels.at(-1);
    if (last?.phase === g.phase) last.weeks += g.weeks;
    else labels.push({ phase: g.phase, weeks: g.weeks });
  }
  const periods = periodsOf(season);
  const inPeriod = (m: string) => periods.some((p) => addDays(m, 6) >= p.from && m <= p.to);
  const mains = races.filter((r) => r.priority === "A" && raceSport(r) === "ride");
  const weekNo = Math.round((Date.parse(monday) - Date.parse(mondayOf(started))) / (7 * 864e5)) + 1;
  const next = ahead.find((w) => w.monday === addDays(monday, 7));
  const rest = ahead.find((w) => w.monday > monday && w.recovery);
  return (
    <Panel title={t("The road from here", "La strada da qui")}>
      <div className="flex h-24 items-end gap-[3px]" aria-hidden>
        {groups.map((g, i) => (
          <div
            key={g.monday}
            className="flex h-full min-w-0 flex-col justify-end"
            style={{ flex: g.weeks }}
          >
            {g.weeks / ahead.length >= LABELLED && (
              <div className="stat-num mb-0.5 truncate text-center text-[10px] text-muted-foreground">
                {hours(g.seconds)}
              </div>
            )}
            <div
              className="rounded-t-sm"
              style={{
                height: `${Math.max(8, (g.seconds / most) * 78)}%`,
                // This week alone is lit, however many weeks its bar holds.
                background:
                  i === 0
                    ? `linear-gradient(to right, var(--primary) ${100 / g.weeks}%, ${AHEAD} ${100 / g.weeks}%)`
                    : AHEAD,
              }}
            />
          </div>
        ))}
      </div>
      {/* The periods, and the A races on them, on the same scale. */}
      <div className="mt-1 flex h-2.5 items-center" aria-hidden>
        {ahead.map((w) => (
          <div key={w.monday} className="relative flex h-full flex-1 items-center justify-center">
            {inPeriod(w.monday) && <div className="absolute inset-x-0 h-1 bg-primary" />}
            {mains.some((r) => r.date >= w.monday && r.date <= addDays(w.monday, 6)) && (
              <div className="absolute z-10 h-2.5 w-2.5 rounded-full border-2 border-card bg-primary" />
            )}
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-[3px] text-[10px] text-muted-foreground">
        {labels.map((l, i) => (
          <span key={i} className="min-w-0 truncate" style={{ flex: l.weeks }}>
            {l.weeks >= ahead.length / 7 ? PHASE[l.phase]() : ""}
          </span>
        ))}
      </div>
      <p className="mt-3 text-sm">
        {t(
          `Week ${weekNo} of ${weekNo + ahead.length - 1}`,
          `Settimana ${weekNo} di ${weekNo + ahead.length - 1}`,
        )}
        {target && (
          <span className="text-muted-foreground">
            {" "}
            · {t("towards", "verso")}{" "}
            {"race" in target
              ? `${target.race.name}, ${format(parseISO(target.race.date), "d MMMM")}`
              : monthName(target.month)}
          </span>
        )}
      </p>
      <div className="mt-2 grid grid-cols-2 gap-x-4">
        {next && (
          <div className="min-w-0">
            <div className="eyebrow">{t("Next week", "Prossima settimana")}</div>
            <div className="stat-num mt-0.5 text-base font-semibold">
              {formatDuration(next.seconds)}
            </div>
          </div>
        )}
        {rest && (
          <div className="min-w-0">
            <div className="eyebrow">{t("Next recovery", "Prossimo scarico")}</div>
            <div className="stat-num mt-0.5 text-base font-semibold">
              {format(parseISO(rest.monday), "d MMMM")}
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
}
