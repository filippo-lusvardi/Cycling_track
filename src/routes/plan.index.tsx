import { WorkoutIcon } from "@/components/WorkoutIcon";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { parseISO } from "date-fns";
import { Check, Minus, SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  DayEditor,
  GoalPicker,
  INDOOR,
  OUTDOOR,
  PHASE,
  PlanGate,
  REST,
  usePlanAction,
  WorkoutTap,
} from "@/components/plan/parts";
import { Panel, StatCard } from "@/components/StatCard";
import { Button } from "@/components/ui/button";
import { useOnline } from "@/hooks/use-online";
import { usePlan, usePlanProgress } from "@/hooks/use-plan";
import { format, t } from "@/lib/i18n";
import { mondayOf } from "@/lib/focus";
import { acceptProposal, keepPlan, fillNow, swapToday, undoLast } from "@/lib/plan/actions";
import {
  catchUp,
  easierToday,
  proposalFor,
  windowFor,
  type PlanContext,
  type Proposal,
} from "@/lib/plan/engine";
import type { NoteWeek } from "@/lib/plan/note";
import { outline, type OutlineWeek } from "@/lib/plan/outline";
import { goalRace, weekShape } from "@/lib/plan/phase";
import { pastWeekLines, sessionLines } from "@/lib/plan/progress";
import { needsExperience, startState, type Experience } from "@/lib/plan/start-level";
import { savePlan, type StoredPlan } from "@/lib/plan/store";
import type {
  DayPlan,
  PlanGoal,
  PlanSettings,
  PlannedDay,
  PlanWorkout,
  ReviewReason,
} from "@/lib/plan/types";
import { comingBack, morningGate } from "@/lib/suggest";
import { addDays, formatDuration } from "@/lib/training";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/plan/")({ component: PlanRoute });

const WHY: Partial<Record<ReviewReason, () => string>> = {
  failed: () =>
    t(
      "A session couldn't be finished. A little less this week.",
      "Una seduta non è finita. Questa settimana un po' meno.",
    ),
  "harder-twice": () =>
    t(
      "The last two sessions were harder than expected. A little less this week.",
      "Le ultime due sedute sono state più dure del previsto. Questa settimana un po' meno.",
    ),
  "low-mornings": () =>
    t(
      "You've had several low mornings. A little less this week.",
      "Hai avuto diverse mattine no. Questa settimana un po' meno.",
    ),
  "hrv-and-feel": () =>
    t(
      "You've had several low mornings. A little less this week.",
      "Hai avuto diverse mattine no. Questa settimana un po' meno.",
    ),
  good: () =>
    t(
      "The last sessions went well. A little more from here.",
      "Le ultime sedute sono andate bene. Da qui un po' di più.",
    ),
  "days-changed": () =>
    t(
      "You changed your days, so the week follows.",
      "Hai cambiato i giorni, quindi la settimana si adatta.",
    ),
};

const START_WEEK: DayPlan[] = [0, 60, 60, 60, 0, 180, 90].map((minutes, i) => ({
  minutes,
  indoor: false,
  long: i === 5,
}));

function Setup({ onStarted }: { onStarted: () => Promise<unknown> }) {
  const { input, today, calendar } = usePlan();
  const [goal, setGoal] = useState<PlanGoal>("fitter");
  const [week, setWeek] = useState(START_WEEK);
  const [experience, setExperience] = useState<Experience>("new");
  const [busy, setBusy] = useState(false);
  if (!input) return null;
  const race = goalRace(input.races, today);
  const ask = needsExperience(input.acts, today);
  const levels: [Experience, string][] = [
    ["new", t("I'm starting out", "Comincio ora")],
    ["some", t("I ride regularly", "Pedalo con regolarità")],
    ["experienced", t("I've trained for years", "Mi alleno da anni")],
  ];
  async function start() {
    const settings: PlanSettings = { goal, week };
    setBusy(true);
    try {
      const state = startState({
        today,
        acts: input!.acts,
        settings,
        experience,
        comingBack: comingBack(input!),
      });
      const note = {
        settings,
        state: { ...state, weekRolled: mondayOf(today) },
        sessions: [],
        reviews: [],
        undo: [],
      };
      const id = await savePlan(note, today, null);
      await fillNow({ id, date: today, note }, { note, input: input!, calendar }, today);
    } catch (err) {
      console.warn("Plan not started", err);
      toast.error(t("Couldn't start the plan", "Impossibile iniziare il piano"));
    } finally {
      // Even after a failure: if the note was written, the page must show it, or a second tap would start another.
      await onStarted();
      setBusy(false);
    }
  }
  const canStart = week.some((d) => d.minutes > 0) && (goal !== "race" || !!race);
  return (
    <div className="space-y-3">
      <h1 className="on-sky text-3xl font-bold tracking-tight">{t("Your plan", "Il tuo piano")}</h1>
      <GoalPicker goal={goal} race={race} busy={false} onChange={setGoal} />
      <section>
        <div className="eyebrow on-sky mb-1">{t("When you can ride", "Quando puoi pedalare")}</div>
        <DayEditor week={week} onChange={setWeek} />
      </section>
      {ask && (
        <section>
          <div className="eyebrow on-sky mb-1">{t("Your riding so far", "Come pedali finora")}</div>
          <div className="rounded-xl border border-border bg-card p-1">
            {levels.map(([id, label]) => (
              <button
                key={id}
                type="button"
                aria-pressed={experience === id}
                onClick={() => setExperience(id)}
                className={cn(
                  "block min-h-11 w-full rounded-lg px-3 py-2 text-left",
                  experience === id && "bg-secondary",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </section>
      )}
      <Button className="w-full" disabled={busy || !canStart} onClick={() => void start()}>
        {t("Start the plan", "Inizia il piano")}
      </Button>
    </div>
  );
}

function ProposalCard({
  proposal,
  busy,
  online,
  onAccept,
  onKeep,
}: {
  proposal: Proposal;
  busy: boolean;
  online: boolean;
  onAccept: () => void;
  onKeep: () => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="eyebrow mb-1">
        {t("A proposal for the next days", "Una proposta per i prossimi giorni")}
      </div>
      <p className="font-medium leading-snug">{WHY[proposal.review.reason]?.()}</p>
      <div className="mt-3 space-y-1">
        {proposal.changes.map((c) => {
          const cls = "-mx-2 flex min-h-11 items-center gap-3 rounded-lg px-2 py-1 text-sm";
          const inner = (
            <>
              <span className="eyebrow w-12 shrink-0">{format(parseISO(c.date), "EEE d")}</span>
              <WorkoutIcon name={c.to?.name} />
              <span className="min-w-0 flex-1">
                {c.from && (
                  <span className="block text-xs text-muted-foreground line-through">
                    {c.from.name}
                  </span>
                )}
                <span className="block font-medium">{c.to?.name ?? REST()}</span>
              </span>
            </>
          );
          return c.to ? (
            <WorkoutTap key={c.date} date={c.date} workout={c.to} className={cls}>
              {inner}
            </WorkoutTap>
          ) : (
            <div key={c.date} className={cls}>
              {inner}
            </div>
          );
        })}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button disabled={busy || !online} onClick={onAccept}>
          {t("Accept", "Accetta")}
        </Button>
        <Button variant="outline" disabled={busy || !online} onClick={onKeep}>
          {t("Leave it", "Lascia com'è")}
        </Button>
      </div>
    </div>
  );
}

type DayLine = {
  date: string;
  role: PlannedDay["role"];
  workout: PlanWorkout | null;
  upcoming?: boolean | undefined;
  /** A session that had its day. */
  done?: boolean;
  missed?: boolean;
  actId?: string | undefined;
  rode?: number | undefined;
  score?: number | null;
};

function Row({ day, today }: { day: DayLine; today: string }) {
  const when = parseISO(day.date);
  const w = day.workout;
  const own = w?.id.startsWith("plan-");
  const place = w ? (w.type === "VirtualRide" ? INDOOR() : OUTDOOR()) : null;
  const empty =
    day.role === "race"
      ? t("Race", "Gara")
      : day.role === "taken"
        ? t("Already there", "Già in programma")
        : REST();
  const inner = (
    <>
      <span className={cn("eyebrow w-9 shrink-0", day.date < today && "opacity-70")}>
        {format(when, "EEE")}
        <br />
        {format(when, "d")}
      </span>
      <WorkoutIcon name={w?.name} />
      <span className={cn("min-w-0 flex-1", day.upcoming && "opacity-60")}>
        {w ? (
          <>
            <span
              className={cn(
                "block font-medium leading-snug",
                day.missed && "text-muted-foreground",
              )}
            >
              {w.name}
            </span>
            <span className="line-clamp-1 text-xs text-muted-foreground">
              {[
                day.date === today ? t("today", "oggi") : null,
                day.rode != null
                  ? formatDuration(day.rode)
                  : own
                    ? null
                    : formatDuration(w.seconds),
                place,
                day.upcoming ? t("at the next check", "al prossimo controllo") : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </>
        ) : (
          <span className="text-sm text-muted-foreground">{empty}</span>
        )}
      </span>
      {day.role === "hard" && (
        <span
          role="img"
          aria-label={t("Hard session", "Seduta dura")}
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ background: "var(--autumn)" }}
        />
      )}
      {day.score != null && (
        <span className="stat-num shrink-0 text-right text-sm font-semibold">
          {day.score}
          <span className="text-[10px] font-normal text-muted-foreground">/100</span>
        </span>
      )}
      {day.done && (
        <Check role="img" aria-label={t("Done", "Fatta")} className="h-4 w-4 shrink-0 text-pine" />
      )}
      {day.missed && (
        <Minus
          role="img"
          aria-label={t("Not done", "Non fatta")}
          className="h-4 w-4 shrink-0 text-muted-foreground"
        />
      )}
    </>
  );
  const cls = "flex min-h-14 items-center gap-3 rounded-lg px-3 py-2";
  return day.actId ? (
    <Link to="/rides/$id" params={{ id: day.actId }} className={cn(cls, "hover:bg-secondary/60")}>
      {inner}
    </Link>
  ) : w ? (
    <WorkoutTap date={day.date} workout={w} className={cls}>
      {inner}
    </WorkoutTap>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

/** One dot per session planned, filled for those done. */
function Pips({ done, of }: { done: number; of: number }) {
  return (
    <span
      role="img"
      aria-label={t(`${done} of ${of} sessions`, `${done} sedute su ${of}`)}
      className="flex gap-1"
    >
      {Array.from({ length: of }, (_, i) => (
        <span
          key={i}
          className={cn("h-2 w-2 rounded-full", i < done ? "bg-pine" : "bg-secondary")}
        />
      ))}
    </span>
  );
}

function PastWeeks({ weeks }: { weeks: NoteWeek[] }) {
  return (
    <Panel title={t("Past weeks", "Settimane passate")}>
      <div className="-mx-3 -my-1">
        {weeks.map((w) => (
          <div
            key={w.monday}
            className="flex min-h-11 items-center gap-3 rounded-lg px-3 py-1.5 text-sm"
          >
            <span className="eyebrow w-14 shrink-0">{format(parseISO(w.monday), "d MMM")}</span>
            <span className="min-w-0 flex-1">
              <span className="block leading-snug">
                {w.recovery ? t("Recovery", "Scarico") : PHASE[w.phase]()}
              </span>
              <Pips done={w.done} of={w.planned} />
            </span>
            <span className="stat-num shrink-0 text-right">
              <span className="block font-semibold">{formatDuration(w.seconds)}</span>
              <span className="block text-xs text-muted-foreground">
                {w.score != null
                  ? `${t("avg", "media")} ${w.score}`
                  : t("no power", "senza potenza")}
              </span>
            </span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

const ROAD_BEHIND = 6;

/** Weeks gone by, this one, and those ahead, by hours: where you are on the way. */
function Road({
  past,
  ahead,
  monday,
  started,
  race,
}: {
  past: NoteWeek[];
  ahead: OutlineWeek[];
  monday: string;
  /** The plan's first day. */
  started: string;
  race: { name: string; date: string } | null;
}) {
  const bars = [
    // The last few are enough to see where you've come from, however long the plan has run.
    ...past
      .slice(0, ROAD_BEHIND)
      .reverse()
      .map((w) => ({
        monday: w.monday,
        phase: w.phase,
        recovery: !!w.recovery,
        seconds: w.seconds,
      })),
    ...ahead.map((w) => ({
      monday: w.monday,
      phase: w.phase,
      recovery: w.recovery,
      seconds: w.seconds,
    })),
  ];
  const most = Math.max(1, ...bars.map((b) => b.seconds));
  const at = bars.findIndex((b) => b.monday === monday);
  // Consecutive weeks of a phase under one name; recovery weeks belong to the phase around them.
  const stretches: { phase: NoteWeek["phase"]; weeks: number }[] = [];
  for (const b of bars) {
    const last = stretches.at(-1);
    if (last?.phase === b.phase) last.weeks++;
    else stretches.push({ phase: b.phase, weeks: 1 });
  }
  const weekNo = Math.round((Date.parse(monday) - Date.parse(mondayOf(started))) / (7 * 864e5)) + 1;
  const next = ahead.find((w) => w.monday === addDays(monday, 7));
  const rest = ahead.find((w) => w.monday > monday && w.recovery);
  return (
    <Panel title={t("The road from here", "La strada da qui")}>
      <div className="flex h-24 items-end gap-1" aria-hidden>
        {bars.map((b, i) => (
          <div
            key={b.monday}
            className="flex-1 rounded-t-sm"
            style={{
              height: `${Math.max(6, (b.seconds / most) * 100)}%`,
              background:
                i === at
                  ? "var(--primary)"
                  : b.recovery
                    ? "var(--secondary)"
                    : i < at
                      ? "color-mix(in oklab, var(--primary) 40%, var(--secondary))"
                      : "color-mix(in oklab, var(--foreground) 22%, var(--secondary))",
            }}
          />
        ))}
      </div>
      <div className="mt-1.5 flex gap-1 text-[10px] text-muted-foreground">
        {stretches.map((s, i) => (
          <span key={i} className="min-w-0 truncate" style={{ flex: s.weeks }}>
            {PHASE[s.phase]()}
          </span>
        ))}
      </div>
      <p className="mt-3 text-sm">
        {race
          ? t(
              `Week ${weekNo} of ${weekNo + ahead.length - 1}`,
              `Settimana ${weekNo} di ${weekNo + ahead.length - 1}`,
            )
          : t(`Week ${weekNo}`, `Settimana ${weekNo}`)}
        {race && (
          <span className="text-muted-foreground">
            {" "}
            · {t("towards", "verso")} {race.name}, {format(parseISO(race.date), "d MMMM")}
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

function PlanPage({ stored, ctx }: { stored: StoredPlan; ctx: PlanContext }) {
  const online = useOnline();
  const { today, executions } = usePlan();
  const { wide, oldest, scores } = usePlanProgress(ctx);
  const { busy, act } = usePlanAction();
  const { note } = stored;
  const { input } = ctx;
  const state = catchUp(ctx);

  const proposal = executions ? proposalFor(ctx, executions) : null;

  const days = windowFor(ctx, state);
  const monday = mondayOf(today);
  const shape = weekShape(monday, note.settings, input.races, state);
  const race = note.settings.goal === "race" ? goalRace(input.races, today) : null;
  const ahead = outline(monday, note.settings.goal, input.races, state, note.settings);
  const past = pastWeekLines(wide, scores, oldest);

  // This week so far with what happened, then the days the plan has in hand: past a Sunday the next ones still show.
  const lines = sessionLines(wide, monday, today, scores, oldest);
  const lineOn = new Map(lines.map((l) => [l.date, l]));
  const soFar: DayLine[] = [];
  for (let d = monday; d < today; d = addDays(d, 1)) {
    const l = lineOn.get(d);
    soFar.push(
      l
        ? {
            date: d,
            role: l.role,
            workout: l.workout,
            done: !!l.act,
            missed: !l.act,
            actId: l.act?.id,
            rode: l.act?.moving_time ?? undefined,
            score: l.score,
          }
        : { date: d, role: "rest", workout: null },
    );
  }
  const coming: DayLine[] = days.map((d) => {
    const l = d.date === today ? lineOn.get(d.date) : undefined;
    return l?.act ? { ...d, done: true, actId: l.act.id, rode: l.act.moving_time ?? undefined } : d;
  });
  const rows = [...soFar, ...coming];

  // What the two cards count: this week alone, Monday to Sunday.
  const end = addDays(monday, 6);
  const week = rows.filter((r) => r.date <= end && r.workout && !r.upcoming);
  const planned = week.reduce((n, r) => n + r.workout!.seconds, 0);
  const rode = week.reduce((n, r) => n + (r.rode ?? 0), 0);

  const todayDay = days.find((d) => d.date === today);
  const swap = todayDay && easierToday(todayDay);
  const lowToday = morningGate(input, "quality") !== "quality";
  const todayEvent = note.sessions.find((s) => s.date === today)?.eventId;

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="eyebrow on-sky">
            {shape.recovery ? t("Recovery", "Scarico") : PHASE[shape.phase]()}
            {race ? ` · ${t("towards", "verso")} ${race.name}` : ""}
          </div>
          <h1 className="on-sky text-3xl font-bold tracking-tight">{t("Plan", "Piano")}</h1>
        </div>
        <Link
          to="/plan/settings"
          className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border border-border bg-card/85 px-3 text-xs text-muted-foreground backdrop-blur hover:text-foreground"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" /> {t("Settings", "Impostazioni")}
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label={t("This week", "Questa settimana")}
          value={`${week.filter((r) => r.done).length}/${week.length}`}
          hint={t("sessions done", "sedute fatte")}
        />
        <StatCard
          label={t("Time", "Tempo")}
          value={formatDuration(rode)}
          hint={t(
            `of ${formatDuration(planned)} planned`,
            `di ${formatDuration(planned)} previste`,
          )}
        />
      </div>
      {proposal && !proposal.silent && (
        <ProposalCard
          proposal={proposal}
          busy={busy}
          online={online}
          onAccept={() =>
            void act(
              () => acceptProposal(stored, ctx, proposal, today),
              t("Couldn't change the plan", "Impossibile modificare il piano"),
            )
          }
          onKeep={() =>
            void act(
              () => keepPlan(stored, state, proposal, today),
              t("Couldn't save", "Impossibile salvare"),
            )
          }
        />
      )}
      {swap && lowToday && todayEvent && (
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="font-medium leading-snug">
            {t(
              "Not your morning? Something easier today.",
              "Non è la mattina giusta? Oggi qualcosa di più facile.",
            )}
          </p>
          <p className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
            <WorkoutIcon name={swap.name} />
            {swap.name}
          </p>
          <Button
            className="mt-3 w-full"
            variant="outline"
            disabled={busy || !online}
            onClick={() =>
              void act(
                () => swapToday(stored, { date: today, eventId: todayEvent, to: swap }, today),
                t("Couldn't change the plan", "Impossibile modificare il piano"),
              )
            }
          >
            {t("Swap", "Cambia")}
          </Button>
        </div>
      )}
      <Panel title={t("These days", "Questi giorni")}>
        <div className="-mx-3 -my-1">
          {rows.map((d) => (
            <Row key={d.date} day={d} today={today} />
          ))}
        </div>
      </Panel>
      {note.undo.length > 0 && (
        <Button
          className="w-full"
          variant="outline"
          disabled={busy || !online}
          onClick={() =>
            void act(
              () => undoLast(stored, ctx, input.pool, today),
              t("Couldn't undo", "Impossibile annullare"),
            )
          }
        >
          {t("Undo the last change", "Annulla l'ultima modifica")}
        </Button>
      )}
      {past.length > 0 && <PastWeeks weeks={past} />}
      <Road past={past} ahead={ahead} monday={monday} started={note.state.startedOn} race={race} />
    </div>
  );
}

function PlanRoute() {
  const qc = useQueryClient();
  return (
    <PlanGate
      none={() => <Setup onStarted={() => qc.invalidateQueries({ queryKey: ["events"] })} />}
    >
      {(stored, ctx) => <PlanPage stored={stored} ctx={ctx} />}
    </PlanGate>
  );
}
