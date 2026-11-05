import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useCanGoBack, useNavigate, useRouter } from "@tanstack/react-router";
import { parseISO } from "date-fns";
import { ArrowLeft, Check, Plus, RefreshCw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { workoutEntry } from "@/components/WorkoutLibrary";
import { WorkoutPreview } from "@/components/WorkoutPreview";
import { useSuggestInput } from "@/hooks/use-suggest-input";
import { format, t } from "@/lib/i18n";
import { deleteEvent, scheduleWorkout } from "@/lib/source";
import {
  suggestDay,
  suggestWeek,
  targetText,
  type SuggestInput,
  type SuggestWorkout,
} from "@/lib/suggest";
import { formatDuration, isoDate } from "@/lib/training";
import { cn } from "@/lib/utils";
import { kindLabel } from "@/lib/workout-templates";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const isDate = (v: unknown): v is string => typeof v === "string" && DATE.test(v);

type Search = { date?: string; id?: string; from?: string; to?: string };

export const Route = createFileRoute("/suggest")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    ...(isDate(s["date"]) ? { date: s["date"] } : {}),
    ...(typeof s["id"] === "string" ? { id: s["id"] } : {}),
    ...(isDate(s["from"]) && isDate(s["to"]) && s["from"] <= s["to"]
      ? { from: s["from"], to: s["to"] }
      : {}),
  }),
  component: SuggestPage,
});

const longDay = (date: string) => format(parseISO(date), "EEEE d MMMM");
const sessions = (n: number) =>
  t(n === 1 ? "1 session" : `${n} sessions`, n === 1 ? "1 seduta" : `${n} sedute`);

/** Puts these on the calendar and offers the way back, then opens the calendar where they went. */
function usePlan() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: ["events"] });
  const plan = async (items: { w: SuggestWorkout; date: string }[], th: SuggestInput["th"]) => {
    if (busy || !items.length) return;
    setBusy(true);
    const ids: string[] = [];
    try {
      for (const { w, date } of items) ids.push(await scheduleWorkout(workoutEntry(w, th), date));
    } catch (err) {
      console.warn("Suggestion not planned", err);
      toast.error(
        ids.length
          ? t(
              `Couldn't plan them all: ${ids.length} of ${items.length} are on the calendar`,
              `Impossibile pianificarle tutte: ${ids.length} di ${items.length} sono sul calendario`,
            )
          : t("Couldn't plan the workout", "Impossibile pianificare l'allenamento"),
      );
      await refresh();
      setBusy(false);
      return;
    }
    await refresh();
    toast.success(
      items.length === 1
        ? t("On the calendar", "In calendario")
        : t(`${items.length} sessions on the calendar`, `${items.length} sedute in calendario`),
      {
        action: {
          label: t("Undo", "Annulla"),
          onClick: () =>
            void Promise.all(ids.map((id) => deleteEvent(id)))
              .then(refresh)
              .catch(() => toast.error(t("Couldn't undo", "Impossibile annullare"))),
        },
      },
    );
    void navigate({ to: "/calendar", search: { month: items[0]!.date.slice(0, 7) } });
  };
  return { busy, plan };
}

function Back() {
  const router = useRouter();
  const canGoBack = useCanGoBack();
  if (!canGoBack) return null;
  return (
    <button
      type="button"
      onClick={() => router.history.back()}
      className="on-sky inline-flex min-h-9 items-center gap-1 text-sm text-foreground/85 hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" /> {t("Back", "Indietro")}
    </button>
  );
}

function SuggestPage() {
  const search = Route.useSearch();
  const input = useSuggestInput();
  const today = isoDate(new Date());
  if (!input)
    return (
      <div className="space-y-3">
        <Back />
        <p className="on-sky text-sm text-foreground/85">{t("Loading…", "Caricamento…")}</p>
      </div>
    );
  if (search.from && search.to) return <Week input={input} from={search.from} to={search.to} />;
  return <Day input={input} date={search.date ?? today} id={search.id} />;
}

function Day({ input, date, id }: { input: SuggestInput; date: string; id: string | undefined }) {
  const navigate = useNavigate();
  const { busy, plan } = usePlan();
  const day = suggestDay(input, date);
  const workout = input.pool.find((w) => w.id === id) ?? day.picks[0]?.workout;
  if (!workout)
    return (
      <div className="space-y-3">
        <Back />
        <p className="on-sky text-sm text-foreground/85">
          {t("Nothing to suggest for this day.", "Niente da suggerire per questo giorno.")}
        </p>
      </div>
    );
  const pick = day.picks.find((p) => p.workout.id === workout.id);
  const others = day.picks.filter((p) => p.workout.id !== workout.id);
  const target = targetText(workout, input.sport, input.th);
  const hard = !["recovery", "endurance", "warmup"].includes(workout.kind);
  return (
    <div className="space-y-4">
      <Back />
      <div>
        <h1 className="on-sky text-3xl font-bold tracking-tight">{workout.name}</h1>
        <p className="on-sky text-sm text-foreground/85">{longDay(date)}</p>
      </div>
      <section className="rounded-xl border border-border bg-card p-4 text-sm">
        <div className="eyebrow mb-1">{pick?.why ?? kindLabel(workout.kind, input.sport)}</div>
        <div className="stat-num mb-3 flex flex-wrap gap-x-3 text-muted-foreground">
          <span>{formatDuration(workout.seconds)}</span>
          <span>
            {t("load", "carico")} {workout.load}
          </span>
          {target && <span className="text-foreground">{target}</span>}
        </div>
        <WorkoutPreview text={workout.description} type={workout.type} />
        {day.conditional && hard && others.length > 0 && (
          <p className="mt-3 text-xs text-muted-foreground">
            {t(
              "If you don't wake up well that morning, there's an easier one below.",
              "Se la mattina non ti svegli bene, c'è un'alternativa più tranquilla qui sotto.",
            )}
          </p>
        )}
        {day.planned[0]?.name && (
          <p className="mt-3 text-xs text-muted-foreground">
            {t(
              `Already planned that day: ${day.planned[0].name}`,
              `Già in programma quel giorno: ${day.planned[0].name}`,
            )}
          </p>
        )}
      </section>
      <Button
        className="w-full"
        disabled={busy}
        onClick={() => void plan([{ w: workout, date }], input.th)}
      >
        {t("Put on the calendar", "Metti in calendario")} · {format(parseISO(date), "EEEE")}
      </Button>
      {others.length > 0 && (
        <section>
          <div className="eyebrow on-sky mb-1">{t("Or", "Oppure")}</div>
          <div className="rounded-xl border border-border bg-card p-1">
            {others.map((o) => (
              <button
                key={o.workout.id}
                type="button"
                onClick={() =>
                  void navigate({
                    to: "/suggest",
                    search: { date, id: o.workout.id },
                    replace: true,
                  })
                }
                className="flex min-h-12 w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-secondary"
              >
                <span className="min-w-0 flex-1">
                  <span className="block font-medium leading-snug">{o.workout.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {[o.why, o.target].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <span className="stat-num shrink-0 text-sm font-semibold">
                  {formatDuration(o.workout.seconds)}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Week({ input, from, to }: { input: SuggestInput; from: string; to: string }) {
  const { busy, plan } = usePlan();
  const week = suggestWeek(input, from, to);
  const [left, setLeft] = useState<Set<string>>(() => new Set());
  const [swapped, setSwapped] = useState<Record<string, number>>({});
  const pickOn = (d: (typeof week.days)[number]) =>
    d.picks[(swapped[d.date] ?? 0) % Math.max(d.picks.length, 1)];
  const chosen = week.days.flatMap((d) => {
    const p = pickOn(d);
    return p && !left.has(d.date) ? [{ w: p.workout, date: d.date }] : [];
  });
  const plannedDays = week.days.filter((d) => d.planned.length);
  const secs =
    chosen.reduce((s, c) => s + c.w.seconds, 0) +
    plannedDays.flatMap((d) => d.planned).reduce((s, e) => s + (e.moving_time ?? 0), 0);
  const count = chosen.length + plannedDays.length;
  const toggle = (date: string) =>
    setLeft((was) => {
      const next = new Set(was);
      if (!next.delete(date)) next.add(date);
      return next;
    });
  return (
    <div className="space-y-3">
      <Back />
      <div>
        <h1 className="on-sky text-3xl font-bold tracking-tight">{t("Week", "Settimana")}</h1>
        <p className="on-sky text-sm text-foreground/85">
          {sessions(count)} · {formatDuration(secs)}
        </p>
      </div>
      <div className="rounded-xl border border-border bg-card p-1">
        {week.days.map((d) => {
          const p = pickOn(d);
          const out = left.has(d.date);
          const there = d.planned[0];
          return (
            <div key={d.date} className="flex min-h-14 items-center gap-3 rounded-lg px-3 py-2">
              <span className={cn("eyebrow w-9 shrink-0", out && "opacity-50")}>
                {format(parseISO(d.date), "EEE")}
                <br />
                {format(parseISO(d.date), "d")}
              </span>
              <span className={cn("min-w-0 flex-1", out && "opacity-50")}>
                {p ? (
                  <>
                    <span className="block font-medium leading-snug">{p.workout.name}</span>
                    <span className="line-clamp-1 text-xs text-muted-foreground">
                      {[formatDuration(p.workout.seconds), p.why, p.target]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </>
                ) : there ? (
                  <>
                    <span className="block font-medium leading-snug text-birch">{there.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {t("Already planned", "Già in programma")}
                    </span>
                  </>
                ) : (
                  <span className="text-sm text-muted-foreground">
                    {d.ask === "off"
                      ? t("Time off", "Giornata di stop")
                      : d.ask === "race"
                        ? t("Race", "Gara")
                        : t("Rest", "Riposo")}
                  </span>
                )}
              </span>
              {p && (
                <span className="flex shrink-0 items-center">
                  {d.picks.length > 1 && !out && (
                    <button
                      type="button"
                      aria-label={t("Another workout", "Un altro allenamento")}
                      onClick={() =>
                        setSwapped((was) => ({ ...was, [d.date]: (was[d.date] ?? 0) + 1 }))
                      }
                      className="flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
                    >
                      <RefreshCw className="h-4 w-4" />
                    </button>
                  )}
                  <button
                    type="button"
                    aria-pressed={!out}
                    aria-label={
                      out
                        ? t("Put back in the week", "Rimetti nella settimana")
                        : t("Leave out of the week", "Togli dalla settimana")
                    }
                    onClick={() => toggle(d.date)}
                    className={cn(
                      "flex h-11 w-11 items-center justify-center rounded-full",
                      out ? "text-muted-foreground" : "bg-secondary text-primary",
                    )}
                  >
                    {out ? <Plus className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                  </button>
                </span>
              )}
            </div>
          );
        })}
      </div>
      <Button
        className="w-full"
        disabled={busy || !chosen.length}
        onClick={() => void plan(chosen, input.th)}
      >
        {t("Put on the calendar", "Metti in calendario")} · {sessions(chosen.length)}
      </Button>
    </div>
  );
}
