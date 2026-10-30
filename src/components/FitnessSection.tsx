import { useSuspenseQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { Suspense, useMemo, useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Panel, StatCard } from "@/components/StatCard";
import { wellnessQuery } from "@/lib/queries";
import { computeForm, formZone } from "@/lib/training";
import { cn } from "@/lib/utils";

const RANGES = [42, 90, 180, 365] as const;

/** Fitness (CTL), fatigue (ATL) and form (TSB) cards and chart, with a range picker. */
export function FitnessSection() {
  const [days, setDays] = useState<number>(90);
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">Fitness, fatigue & form</h2>
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
      <Suspense
        fallback={<p className="py-16 text-center text-sm text-muted-foreground">Loading…</p>}
      >
        <FormSection days={days} />
      </Suspense>
    </section>
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
          hint={
            weekAgo && today
              ? `${today.fitness - weekAgo.fitness >= 0 ? "+" : ""}${today.fitness - weekAgo.fitness} vs last week`
              : undefined
          }
        />
        <StatCard label="Fatigue" tone="fatigue" value={today?.fatigue ?? "–"} />
        <StatCard
          label="Form"
          tone="form"
          value={today ? Math.round(today.form) : "–"}
          hint={today ? formZone(today.form) : undefined}
        />
        <StatCard
          label="Ramp rate"
          value={ramp != null ? ramp.toFixed(1) : "–"}
          hint="Fitness change / week"
        />
      </div>
      <Panel title="Performance management">
        {/* Fitness and fatigue share a scale; form has its own, with zones. Hovering one shows the same day on both. */}
        <div className="space-y-4">
          <MetricChart
            data={series}
            lines={[
              { key: "fitness", label: "Fitness (CTL)", color: "var(--fitness)", area: true },
              { key: "fatigue", label: "Fatigue (ATL)", color: "var(--fatigue)" },
            ]}
            tall
          />
          <MetricChart
            data={series}
            lines={[{ key: "form", label: "Form (TSB)", color: "var(--form)" }]}
            xAxis
            zones={FORM_ZONES}
          />
        </div>
      </Panel>
    </>
  );
}

// Form zones as in `formZone` (training.ts), drawn behind the form line.
const FORM_ZONES: [number, number, string, string][] = [
  [-200, -30, "High risk", "var(--lingon)"],
  [-30, -10, "Optimal", "var(--pine)"],
  [-10, 5, "Grey zone", "var(--z1)"],
  [5, 25, "Fresh", "var(--fitness)"],
  [25, 200, "Transition", "var(--birch)"],
];

type Point = { date: string; fitness: number; fatigue: number; form: number };

type Series = { key: "fitness" | "fatigue" | "form"; label: string; color: string; area?: boolean };

function MetricChart({
  data,
  lines,
  xAxis,
  tall,
  zones,
}: {
  data: Point[];
  lines: Series[];
  xAxis?: boolean;
  tall?: boolean;
  zones?: typeof FORM_ZONES;
}) {
  // Round the scale out to steps of 5 so ticks read cleanly; zones are clipped to it so each visible one is labelled.
  const vals = data.flatMap((p) => lines.map((l) => p[l.key]));
  const lo = Math.floor((Math.min(...vals) - 3) / 5) * 5;
  const hi = Math.ceil((Math.max(...vals) + 3) / 5) * 5;
  const labelOf = (key: unknown) => lines.find((l) => l.key === key)?.label ?? String(key);
  return (
    <div>
      <div className="mb-1 flex gap-4 text-xs text-muted-foreground">
        {lines.map((l) => (
          <span key={l.key} className="flex items-center gap-2">
            <span className="h-1 w-4 rounded-full" style={{ background: l.color }} />
            {l.label}
          </span>
        ))}
      </div>
      <div className={tall ? "h-60" : "h-44"}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} syncId="pmc" margin={{ left: -20, right: 4, top: 4 }}>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="date"
              hide={!xAxis}
              tickFormatter={(d) => format(parseISO(d), "d MMM")}
              stroke="var(--muted-foreground)"
              fontSize={11}
              minTickGap={40}
            />
            <YAxis
              stroke="var(--muted-foreground)"
              fontSize={11}
              domain={[lo, hi]}
              allowDecimals={false}
            />
            <Tooltip
              contentStyle={{
                background: "var(--popover)",
                border: "1px solid var(--border)",
                borderRadius: 8,
              }}
              labelFormatter={(d) => format(parseISO(String(d)), "EEE d MMM yyyy")}
              formatter={(v, key) => [Math.round(Number(v)), labelOf(key)]}
            />
            {zones
              ?.filter(([y1, y2]) => y2 > lo && y1 < hi)
              .map(([y1, y2, name, color]) => (
                <ReferenceArea
                  key={name}
                  y1={Math.max(y1, lo)}
                  y2={Math.min(y2, hi)}
                  fill={color}
                  fillOpacity={0.12}
                  label={{
                    value: name,
                    position: "insideRight",
                    fontSize: 10,
                    fill: "var(--muted-foreground)",
                  }}
                />
              ))}
            {zones && lo < 0 && hi > 0 && (
              <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeDasharray="3 3" />
            )}
            {lines.map((l) =>
              l.area ? (
                <Area
                  key={l.key}
                  type="monotone"
                  dataKey={l.key}
                  stroke={l.color}
                  fill={l.color}
                  fillOpacity={0.15}
                  strokeWidth={2}
                  isAnimationActive={false}
                />
              ) : (
                <Line
                  key={l.key}
                  type="monotone"
                  dataKey={l.key}
                  stroke={l.color}
                  dot={false}
                  strokeWidth={2}
                  isAnimationActive={false}
                />
              ),
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
