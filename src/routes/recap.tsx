import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useCanGoBack, useRouter } from "@tanstack/react-router";
import { parseISO } from "date-fns";
import { ArrowLeft, CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Fragment, useMemo, useState, type ReactNode } from "react";
import { ActivityRow } from "@/components/ActivityRow";
import { LayoutEditor, Sections, TuneButton } from "@/components/layout/Customizable";
import { Panel, StatCard } from "@/components/StatCard";
import { WorkoutPreview } from "@/components/WorkoutPreview";
import { useLayout } from "@/hooks/use-layout";
import { KINDS } from "@/lib/activity-kind";
import { recapKind, recapSections } from "@/lib/layouts";
import { daysIn, shiftSpan, spanDates, spanTitle, type Span } from "@/lib/ask-when";
import { format, t } from "@/lib/i18n";
import type { PlannedEvent } from "@/lib/intervals";
import { allActivitiesQuery, eventsQuery, offEventsQuery, wellnessRangeQuery } from "@/lib/queries";
import { isRace, raceFrom, raceSummary } from "@/lib/races";
import { buildRecap, type Recap as RecapData } from "@/lib/recap";
import { addDays, formatDuration, isoDate } from "@/lib/training";
import { offDays } from "@/lib/tree";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const Route = createFileRoute("/recap")({
  head: () => ({ meta: [{ title: t("Recap — Cirmolo", "Recap — Cirmolo") }] }),
  validateSearch: (s: Record<string, unknown>): { from?: string; to?: string } =>
    typeof s["from"] === "string" &&
    typeof s["to"] === "string" &&
    DATE.test(s["from"]) &&
    DATE.test(s["to"]) &&
    s["from"] <= s["to"]
      ? { from: s["from"], to: s["to"] }
      : {},
  loader: ({ context }) => context.queryClient.ensureQueryData(allActivitiesQuery()),
  component: RecapPage,
});

const NO_EVENTS: PlannedEvent[] = [];
const days = (n: number) =>
  t(n === 1 ? "1 day" : `${n} days`, n === 1 ? "1 giorno" : `${n} giorni`);

function Move({ span, dir }: { span: Span; dir: 1 | -1 }) {
  const Icon = dir < 0 ? ChevronLeft : ChevronRight;
  return (
    <Link
      to="/recap"
      search={shiftSpan(span, dir)}
      replace
      aria-label={dir < 0 ? t("Before", "Prima") : t("After", "Dopo")}
      className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card/85 text-muted-foreground backdrop-blur hover:text-foreground"
    >
      <Icon className="h-4 w-4" />
    </Link>
  );
}

function Fact({ label, value, hint }: { label: string; value: string; hint?: string | undefined }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="stat-num font-medium">
        {value}
        {hint && <span className="ml-2 text-xs font-normal text-muted-foreground">{hint}</span>}
      </span>
    </div>
  );
}

const signed = (n: number, show: (abs: number) => string) =>
  `${n < 0 ? "−" : "+"}${show(Math.abs(n))}`;

/** One small line against your own stretch before: no verdict, nobody else. */
function compareLine(r: RecapData, span: Span) {
  if (!r.before) return null;
  const secs = r.totals.secs - r.before.totals.secs;
  const climb = Math.round(r.totals.climb - r.before.totals.climb);
  const rest = r.restDays - r.before.restDays;
  const parts = [
    secs ? signed(secs, (v) => formatDuration(v)) : null,
    climb ? signed(climb, (v) => `${v} m`) : null,
    rest
      ? signed(rest, (v) => t(`${v} rest`, `${v} di riposo`))
      : t("same rest days", "stessi giorni di riposo"),
  ].filter(Boolean);
  const whole = /-01$/.test(span.from) && r.before.span.from.endsWith("-01") && daysIn(span) >= 28;
  const against = whole
    ? t(
        `Against ${format(parseISO(r.before.span.from), "MMMM")}`,
        `Rispetto a ${format(parseISO(r.before.span.from), "MMMM").toLowerCase()}`,
      )
    : t(`Against the ${daysIn(span)} days before`, `Rispetto ai ${daysIn(span)} giorni prima`);
  return `${against}: ${parts.join(" · ")}`;
}

function Planned({ e }: { e: PlannedEvent }) {
  const race = isRace(e);
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="eyebrow mb-1">{format(parseISO(e.date), "EEEE d MMMM")}</div>
      <h2 className="font-semibold">{e.name ?? t("Workout", "Allenamento")}</h2>
      {race ? (
        <p className="stat-num mt-0.5 text-xs text-muted-foreground">{raceSummary(raceFrom(e))}</p>
      ) : (
        <WorkoutPreview text={e.description} type={e.type} className="mt-3" />
      )}
      <Link
        to="/calendar"
        search={{ month: e.date.slice(0, 7) }}
        className="mt-3 inline-flex min-h-9 items-center gap-1.5 text-sm text-primary"
      >
        <CalendarDays className="h-4 w-4" /> {t("Open in the calendar", "Apri nel calendario")}
      </Link>
    </section>
  );
}

function RecapPage() {
  const search = Route.useSearch();
  const today = isoDate(new Date());
  const span: Span = useMemo(
    () =>
      search.from && search.to
        ? { from: search.from, to: search.to }
        : { from: addDays(today, -6), to: today },
    [search.from, search.to, today],
  );
  const { data: acts } = useSuspenseQuery(allActivitiesQuery());
  const before = shiftSpan(span, -1);
  const pastTo = span.to < today ? span.to : today;
  const hasPast = span.from <= today;
  const { data: wellness } = useQuery({
    ...wellnessRangeQuery({ oldest: addDays(before.from, -60), newest: pastTo }),
    enabled: hasPast,
  });
  const { data: events = NO_EVENTS } = useQuery({
    ...eventsQuery({ oldest: span.from > today ? span.from : today, newest: span.to }),
    enabled: span.to >= today,
  });
  const { data: offEvents = NO_EVENTS } = useQuery({
    ...offEventsQuery({ oldest: before.from, newest: pastTo }),
    enabled: hasPast,
  });
  const r = useMemo(
    () =>
      buildRecap({ span, today, acts, wellness: wellness ?? [], events, off: offDays(offEvents) }),
    [span, today, acts, wellness, events, offEvents],
  );
  const single = span.from === span.to;
  const long = daysIn(span) > 14;
  const onlyAhead = !hasPast;
  const line = compareLine(r, span);
  const offText = [
    r.offDays.sick ? t(`${days(r.offDays.sick)} ill`, `${days(r.offDays.sick)} di malattia`) : null,
    r.offDays.injured
      ? t(`${days(r.offDays.injured)} injured`, `${days(r.offDays.injured)} di infortunio`)
      : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const usual =
    r.usualHrv != null
      ? t(`usual ${Math.round(r.usualHrv)}`, `solito ${Math.round(r.usualHrv)}`)
      : undefined;
  const weekMax = Math.max(1, ...r.weeks.map((w) => w.secs));
  const kind = recapKind(daysIn(span));
  const defs = useMemo(() => recapSections(kind), [kind]);
  const layout = useLayout(kind, defs);
  const [editing, setEditing] = useState(false);
  const router = useRouter();
  const canGoBack = useCanGoBack();
  const empty = hasPast && !r.acts.length && !r.planned.length && single;

  const cards: Record<string, ReactNode> = {
    time: (
      <StatCard
        label={t("Time", "Tempo")}
        tone="fitness"
        value={r.totals.secs ? formatDuration(r.totals.secs) : "–"}
        hint={t(`${r.totals.count} activities`, `${r.totals.count} attività`)}
      />
    ),
    rest: (
      <StatCard
        label={t("Rest", "Riposo")}
        tone="weight"
        value={r.restDays}
        unit={t("days", "giorni")}
        hint={offText || t("no days ill or injured", "nessun giorno di malattia")}
      />
    ),
    distance: (
      <StatCard label={t("Distance", "Distanza")} value={Math.round(r.totals.km)} unit="km" />
    ),
    climbing: (
      <StatCard label={t("Climbing", "Dislivello")} value={Math.round(r.totals.climb)} unit="m" />
    ),
    load: <StatCard label={t("Load", "Carico")} value={Math.round(r.totals.load)} />,
    count: <StatCard label={t("Activities", "Attività")} value={r.totals.count} />,
  };
  const facts: Record<string, ReactNode> = {
    sleep: r.sleepSecs != null && (
      <Fact
        label={single ? t("Sleep", "Sonno") : t("Average sleep", "Sonno medio")}
        value={formatDuration(r.sleepSecs)}
      />
    ),
    hrv: r.hrv != null && (
      <Fact
        label={single ? "HRV" : t("Average HRV", "HRV media")}
        value={`${Math.round(r.hrv)} ms`}
        hint={usual}
      />
    ),
    fitness: r.ctl && !single && (
      <Fact label="Fitness" value={`${Math.round(r.ctl.from)} → ${Math.round(r.ctl.to)}`} />
    ),
    load: r.totals.load > 0 && (
      <Fact label={t("Load", "Carico")} value={String(Math.round(r.totals.load))} />
    ),
  };

  return (
    <div className="space-y-4">
      {canGoBack && !editing && (
        <button
          type="button"
          onClick={() => router.history.back()}
          className="on-sky inline-flex min-h-9 items-center gap-1 text-sm text-foreground/85 hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> {t("Back", "Indietro")}
        </button>
      )}
      {editing ? (
        <LayoutEditor
          eyebrow="Recap"
          kind={kind}
          layout={layout}
          onDone={() => setEditing(false)}
        />
      ) : (
        <>
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <div className="eyebrow">{spanDates(span)}</div>
              <h1 className="on-sky text-3xl font-bold tracking-tight">{spanTitle(span, today)}</h1>
            </div>
            <div className="flex shrink-0 gap-1">
              <Move span={span} dir={-1} />
              <Move span={span} dir={1} />
            </div>
          </div>
          <div className="flex justify-end">
            <TuneButton onClick={() => setEditing(true)} />
          </div>
          {empty && (
            <Panel title={offText || t("Nothing recorded", "Nessuna attività")}>
              <p className="text-sm text-muted-foreground">{spanDates(span)}</p>
            </Panel>
          )}
          {!r.planned.length && onlyAhead && (
            <Panel title={t("Nothing planned", "Niente in programma")}>
              <Link
                to="/calendar"
                search={{ month: span.from.slice(0, 7) }}
                className="inline-flex min-h-9 items-center gap-1.5 text-sm text-primary"
              >
                <CalendarDays className="h-4 w-4" />{" "}
                {t("Open in the calendar", "Apri nel calendario")}
              </Link>
            </Panel>
          )}
          <Sections
            layout={layout}
            hints={{
              planned: r.planned.length ? String(r.planned.length) : undefined,
              sports: r.byKind.length
                ? t(`${r.byKind.length} sports`, `${r.byKind.length} sport`)
                : undefined,
              activities: r.acts.length ? String(r.acts.length) : undefined,
              weeks: r.weeks.length ? String(r.weeks.length) : undefined,
            }}
            render={(sec) => {
              switch (sec.id) {
                case "numbers": {
                  if (!hasPast) return null;
                  const shown = sec.numbers.filter((n) => !n.hidden);
                  return shown.length ? (
                    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                      {shown.map((n) => (
                        <Fragment key={n.id}>{cards[n.id]}</Fragment>
                      ))}
                    </div>
                  ) : null;
                }
                case "compare":
                  return line ? (
                    <p className="on-sky px-1 text-xs text-foreground/85">{line}</p>
                  ) : null;
                case "planned":
                  return r.planned.length ? (
                    <div className="space-y-4">
                      {!single && (
                        <div className="grid grid-cols-2 gap-3">
                          <StatCard
                            label={t("Planned", "In programma")}
                            tone="fitness"
                            value={r.plannedSecs ? formatDuration(r.plannedSecs) : r.planned.length}
                            hint={t(
                              `${r.planned.length} planned`,
                              `${r.planned.length} in programma`,
                            )}
                          />
                          {r.plannedLoad > 0 && (
                            <StatCard
                              label={t("Estimated load", "Carico stimato")}
                              value={Math.round(r.plannedLoad)}
                            />
                          )}
                        </div>
                      )}
                      {r.planned.map((e) => (
                        <Planned key={e.id} e={e} />
                      ))}
                    </div>
                  ) : null;
                case "weeks":
                  return r.weeks.length ? (
                    <Panel title={t("Week by week", "Settimana per settimana")}>
                      {r.weeks.map((w) => (
                        <div key={w.start} className="py-1.5">
                          <div className="flex justify-between gap-3 text-xs">
                            <span className="text-muted-foreground">
                              {format(parseISO(w.start), "d MMM")} –{" "}
                              {format(parseISO(w.end), "d MMM")}
                            </span>
                            <span className="stat-num">
                              {w.secs ? formatDuration(w.secs) : "–"}
                            </span>
                          </div>
                          <div className="mt-1 h-2 rounded-full bg-secondary">
                            <div
                              className="h-2 rounded-full bg-fitness"
                              style={{ width: `${(w.secs / weekMax) * 100}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </Panel>
                  ) : null;
                case "sports":
                  return r.byKind.length > 1 ? (
                    <Panel title={t("By sport", "Per sport")}>
                      {r.byKind.map(({ kind: k2, totals }) => {
                        const k = KINDS[k2];
                        return (
                          <div key={k2} className="flex items-center gap-3 py-1.5">
                            <span
                              className="flex h-8 w-8 items-center justify-center rounded-lg"
                              style={{
                                background: `color-mix(in oklab, ${k.color} 22%, transparent)`,
                                color: k.color,
                              }}
                            >
                              <k.icon className="h-4 w-4" />
                            </span>
                            <span className="min-w-0 flex-1 text-sm font-medium">{k.label}</span>
                            <span className="stat-num text-xs text-muted-foreground">
                              {totals.count} · {formatDuration(totals.secs)} ·{" "}
                              {Math.round(totals.km)} km
                            </span>
                          </div>
                        );
                      })}
                    </Panel>
                  ) : null;
                case "body": {
                  if (!hasPast) return null;
                  const shown = sec.numbers.filter((n) => !n.hidden && facts[n.id]);
                  return shown.length ? (
                    <Panel title={t("Body", "Corpo")}>
                      {shown.map((n) => (
                        <Fragment key={n.id}>{facts[n.id]}</Fragment>
                      ))}
                    </Panel>
                  ) : null;
                }
                case "mix":
                  return r.mix ? (
                    <Panel title={t("Intensity", "Intensità")}>
                      <div className="flex h-3 overflow-hidden rounded-full">
                        <span style={{ width: `${r.mix.low * 100}%`, background: "var(--z2)" }} />
                        <span style={{ width: `${r.mix.mid * 100}%`, background: "var(--z4)" }} />
                        <span style={{ width: `${r.mix.high * 100}%`, background: "var(--z6)" }} />
                      </div>
                      <div className="stat-num mt-2 flex justify-between text-xs text-muted-foreground">
                        <span>
                          {t("Easy", "Facile")} {Math.round(r.mix.low * 100)}%
                        </span>
                        <span>
                          {t("Middle", "Medio")} {Math.round(r.mix.mid * 100)}%
                        </span>
                        <span>
                          {t("Hard", "Duro")} {Math.round(r.mix.high * 100)}%
                        </span>
                      </div>
                    </Panel>
                  ) : null;
                case "activities":
                  return r.acts.length ? (
                    <Panel
                      title={long ? t("The longest", "Le più lunghe") : t("Activities", "Attività")}
                    >
                      <div className="-mx-3 -my-1">
                        {(long ? r.longest : r.acts).map((v) => (
                          <ActivityRow key={v.id} a={v} />
                        ))}
                      </div>
                    </Panel>
                  ) : null;
                default:
                  return null;
              }
            }}
          />
        </>
      )}
    </div>
  );
}
