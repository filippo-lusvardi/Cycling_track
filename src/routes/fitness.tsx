import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { useMemo, useState } from "react";
import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { activitiesQuery, wellnessQuery } from "@/lib/queries";
import { computeForm, formZone } from "@/lib/training";
import { Panel, StatCard } from "@/components/StatCard";
import { ActivityRow } from "@/components/ActivityRow";
import { cn } from "@/lib/utils";

const RANGES = [42, 90, 180, 365] as const;

export const Route = createFileRoute("/fitness")({
  head: () => ({
    meta: [
      { title: "Fitness & Form — Cadence" },
      { name: "description", content: "Fitness, fatigue and form trends from your intervals.icu data." },
      { property: "og:title", content: "Fitness & Form — Cadence" },
      { property: "og:description", content: "Personal cycling fitness, fatigue and form dashboard." },
    ],
  }),
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(wellnessQuery(90)),
      context.queryClient.ensureQueryData(activitiesQuery(14)),
    ]),
  component: Dashboard,
});

function Dashboard() {
  const [days, setDays] = useState<number>(90);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="eyebrow">Training load</div>
          <h1 className="text-3xl font-bold tracking-tight">Fitness & Form</h1>
        </div>
        <div className="flex gap-1 rounded-lg bg-secondary p-1">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setDays(r)}
              className={cn(
                "stat-num rounded-md px-3 py-1 text-xs",
                days === r ? "bg-background text-foreground" : "text-muted-foreground",
              )}
            >
              {r}d
            </button>
          ))}
        </div>
      </div>
      <FormSection days={days} />
      <RecentRides />
    </div>
  );
}

function FormSection({ days }: { days: number }) {
  const { data } = useSuspenseQuery(wellnessQuery(days));
  const series = useMemo(
    () =>
      data
        .filter((w) => w.ctl != null && w.atl != null)
        .map((w) => ({
          date: w.id,
          fitness: Math.round(w.ctl!),
          fatigue: Math.round(w.atl!),
          form: computeForm(w.ctl!, w.atl!),
        })),
    [data],
  );
  const today = series.at(-1);
  const weekAgo = series.at(-8);
  const ramp = data.at(-1)?.rampRate;

  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label="Fitness"
          tone="fitness"
          value={today?.fitness ?? "–"}
          hint={weekAgo && today ? `${today.fitness - weekAgo.fitness >= 0 ? "+" : ""}${today.fitness - weekAgo.fitness} vs last week` : undefined}
        />
        <StatCard label="Fatigue" tone="fatigue" value={today?.fatigue ?? "–"} />
        <StatCard label="Form" tone="form" value={today ? Math.round(today.form) : "–"} hint={today ? formZone(today.form) : undefined} />
        <StatCard label="Ramp rate" value={ramp != null ? ramp.toFixed(1) : "–"} hint="Fitness change / week" />
      </div>
      <Panel title="Performance management">
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={series} margin={{ left: -20, right: 4, top: 8 }}>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis dataKey="date" tickFormatter={(d) => format(parseISO(d), "d MMM")} stroke="var(--muted-foreground)" fontSize={11} minTickGap={40} />
              <YAxis stroke="var(--muted-foreground)" fontSize={11} />
              <Tooltip
                contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8 }}
                labelFormatter={(d) => format(parseISO(String(d)), "EEE d MMM yyyy")}
              />
              <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeDasharray="3 3" />
              <Area type="monotone" dataKey="fitness" stroke="var(--fitness)" fill="var(--fitness)" fillOpacity={0.15} strokeWidth={2} isAnimationActive={false} />
              <Line type="monotone" dataKey="fatigue" stroke="var(--fatigue)" dot={false} strokeWidth={1.5} isAnimationActive={false} />
              <Line type="monotone" dataKey="form" stroke="var(--form)" dot={false} strokeWidth={1.5} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Panel>
    </>
  );
}

function RecentRides() {
  const { data } = useSuspenseQuery(activitiesQuery(14));
  return (
    <Panel
      title="Last 14 days"
      action={
        <Link to="/rides" className="text-xs text-primary">
          All rides →
        </Link>
      }
    >
      {data.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">No activities yet.</p>
      ) : (
        <div className="-mx-3">{data.slice(0, 8).map((a) => <ActivityRow key={a.id} a={a} />)}</div>
      )}
    </Panel>
  );
}
