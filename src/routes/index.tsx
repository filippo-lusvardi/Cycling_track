import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { CalendarClock } from "lucide-react";
import { useMemo } from "react";
import { ActivityRow } from "@/components/ActivityRow";
import { CheckInBanner } from "@/components/CheckIn";
import { ReadinessRing } from "@/components/ReadinessRing";
import { Panel, StatCard } from "@/components/StatCard";
import { activitiesQuery, eventsQuery, wellnessQuery } from "@/lib/queries";
import { readinessFor, recommendation, type Component } from "@/lib/readiness";
import { computeForm, formatDuration, formZone, isoDate } from "@/lib/training";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "Today — Cadence" }] }),
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(wellnessQuery(14)),
      context.queryClient.ensureQueryData(activitiesQuery(1)),
    ]),
  component: Today,
});

const TONE = { pine: "var(--pine)", fitness: "var(--fitness)", birch: "var(--birch)", lingon: "var(--lingon)" } as const;

const STRESS = ["Low", "Average", "High", "Extreme"];

function Today() {
  const today = isoDate(new Date());
  const { data: wellness } = useSuspenseQuery(wellnessQuery(14));
  const row = wellness.find((w) => w.id === today);
  const r = useMemo(() => readinessFor(wellness, today), [wellness, today]);
  const tsb = row?.ctl != null && row.atl != null ? computeForm(row.ctl, row.atl) : null;
  const rec = r.score != null ? recommendation(r.score, tsb) : null;
  const comp = (k: Component["key"]) => r.components.find((c) => c.key === k);

  return (
    <div className="space-y-6">
      <div>
        <div className="eyebrow">{format(new Date(), "EEEE d MMMM")}</div>
        <h1 className="text-3xl font-bold tracking-tight">Today</h1>
      </div>

      <CheckInBanner row={row} />

      <section className="grid items-center gap-6 rounded-xl border border-border bg-card p-5 sm:grid-cols-[auto_1fr]">
        <ReadinessRing score={r.score} color={r.advice ? TONE[r.advice.tone] : "var(--muted-foreground)"} />
        <div className="space-y-3">
          {r.advice ? (
            <>
              <div>
                <span
                  className="inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold text-background"
                  style={{ background: TONE[r.advice.tone] }}
                >
                  {r.advice.title}
                </span>
                <p className="mt-2 text-sm text-muted-foreground">{r.advice.text}</p>
              </div>
              {rec && (
                <div className="grid grid-cols-2 gap-3 rounded-lg bg-background/50 p-3 text-sm">
                  <div>
                    <div className="eyebrow">Target</div>
                    <div className="stat-num text-lg font-semibold">{rec.zones}</div>
                  </div>
                  <div>
                    <div className="eyebrow">Duration</div>
                    <div className="stat-num text-lg font-semibold">{rec.duration}</div>
                  </div>
                  <p className="col-span-2 text-muted-foreground">{rec.text}</p>
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Not enough data for a readiness score yet. Do the check-in, or wait for the watch to sync sleep and HRV.
            </p>
          )}
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label="HRV"
          tone="fitness"
          value={row?.hrv != null ? Math.round(row.hrv) : "–"}
          unit="ms"
          hint={comp("hrv")?.detail.split(" · ")[1] ?? "no 7-day baseline yet"}
        />
        <StatCard
          label="Sleep"
          tone="weight"
          value={row?.sleepSecs ? formatDuration(row.sleepSecs) : "–"}
          hint={comp("sleep") ? `score ${Math.round(comp("sleep")!.score)}` : "not synced yet"}
        />
        <StatCard label="Form" tone="form" value={tsb != null ? Math.round(tsb) : "–"} hint={tsb != null ? formZone(tsb) : undefined} />
        <StatCard
          label="Feel"
          tone="fatigue"
          value={comp("feel") ? Math.round(comp("feel")!.score) : "–"}
          hint={
            row?.fatigue != null || row?.stress != null
              ? [row.fatigue != null && `fatigue ${STRESS[row.fatigue - 1]?.toLowerCase()}`, row.stress != null && `stress ${STRESS[row.stress - 1]?.toLowerCase()}`]
                  .filter(Boolean)
                  .join(" · ")
              : "check in to add"
          }
        />
      </div>

      <Schedule today={today} />
    </div>
  );
}

function Schedule({ today }: { today: string }) {
  const { data: acts } = useSuspenseQuery(activitiesQuery(1));
  const { data: events } = useQuery(eventsQuery({ oldest: today, newest: today }));
  const done = acts.filter((a) => a.start_date_local.startsWith(today));
  const planned = (events ?? []).filter((e) => e.category === "WORKOUT" || e.category.startsWith("RACE") || e.category === "NOTE");

  return (
    <Panel
      title="Today's schedule"
      action={
        <Link to="/fitness" className="text-xs text-primary">
          Fitness & form →
        </Link>
      }
    >
      {planned.length === 0 && done.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">Nothing planned or recorded yet today.</p>
      ) : (
        <div className="-mx-3">
          {planned.map((e) => (
            <div key={e.id} className="flex items-center justify-between gap-3 rounded-lg px-3 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <CalendarClock className="h-4 w-4 shrink-0 text-birch" />
                <div className="min-w-0">
                  <div className="truncate font-medium">{e.name ?? e.category}</div>
                  <div className="text-xs text-muted-foreground">
                    Planned · {e.category === "WORKOUT" ? (e.type ?? "Workout") : e.category.replace("_", " ").toLowerCase()}
                  </div>
                </div>
              </div>
              <div className="stat-num flex shrink-0 gap-4 text-sm">
                <span>{formatDuration(e.moving_time)}</span>
                <span className="w-12 text-right text-primary">{e.icu_training_load ?? "–"}</span>
              </div>
            </div>
          ))}
          {done.map((a) => (
            <ActivityRow key={a.id} a={a} />
          ))}
        </div>
      )}
    </Panel>
  );
}
