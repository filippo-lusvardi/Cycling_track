import { memo, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ActivityDetail, RideStreams } from "@/lib/intervals";
import { rideSeries, type SeriesPoint } from "@/lib/ride-series";

type Metric = {
  key: "speed" | "watts" | "hr";
  label: string;
  unit: string;
  color: string;
  avg: number | null | undefined;
  max: number | null | undefined;
  digits: number;
};

const peak = (xs: (number | null)[]) =>
  xs.reduce<number | null>((m, x) => (x != null && (m == null || x > m) ? x : m), null);

/** Speed, power and heart rate along the ride, stacked on one distance axis; hovering one shows the same spot on all. */
export function RideCharts({ a, streams }: { a: ActivityDetail; streams: RideStreams }) {
  const data = useMemo(() => rideSeries(streams), [streams]);
  const [idx, setIdx] = useState<number | null>(null);
  const at = idx != null ? data[idx] : undefined;
  const metrics = useMemo(
    () =>
      (
        [
          {
            key: "speed",
            label: "Speed",
            unit: "km/h",
            color: "var(--fitness)",
            avg: a.average_speed != null ? a.average_speed * 3.6 : null,
            max: a.max_speed != null ? a.max_speed * 3.6 : null,
            digits: 1,
          },
          {
            key: "watts",
            label: "Power",
            unit: "W",
            color: "var(--birch)",
            avg: a.icu_average_watts,
            max: peak(streams.watts),
            digits: 0,
          },
          {
            key: "hr",
            label: "Heart rate",
            unit: "bpm",
            color: "var(--fatigue)",
            avg: a.average_heartrate,
            max: a.max_heartrate ?? peak(streams.heartrate),
            digits: 0,
          },
        ] satisfies Metric[]
      ).filter((m) => data.some((p) => p[m.key] != null)),
    [a, streams, data],
  );

  if (!metrics.length)
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        No speed, power or heart rate recorded.
      </p>
    );
  return (
    <div className="space-y-4">
      {metrics.map((m, i) => (
        <div key={m.key}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
            <span className="flex items-center gap-2 font-medium">
              <span className="h-1 w-4 rounded-full" style={{ background: m.color }} />
              {m.label}
            </span>
            {/* The value under your finger or pointer replaces the summary, instead of tooltips covering the charts. */}
            <span className="stat-num text-muted-foreground">
              {at ? (
                <>
                  {at.km.toFixed(1)} km ·{" "}
                  <span className="font-semibold" style={{ color: m.color }}>
                    {fmt(at[m.key], m.digits)}
                  </span>{" "}
                  {m.unit}
                </>
              ) : (
                `avg ${fmt(m.avg, m.digits)} · max ${fmt(m.max, m.digits)} ${m.unit}`
              )}
            </span>
          </div>
          <Chart data={data} m={m} xAxis={i === metrics.length - 1} onHover={setIdx} />
        </div>
      ))}
    </div>
  );
}

const fmt = (v: number | null | undefined, digits: number) => (v != null ? v.toFixed(digits) : "–");

// Memoised so moving the pointer only re-renders the readouts, not three charts of 500 points.
const Chart = memo(function Chart({
  data,
  m,
  xAxis,
  onHover,
}: {
  data: SeriesPoint[];
  m: Metric;
  xAxis: boolean;
  onHover: (i: number | null) => void;
}) {
  return (
    <div className={xAxis ? "h-36" : "h-28"}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          syncId="ride"
          margin={{ left: -20, right: 4, top: 4 }}
          onMouseMove={(st) => onHover(st?.activeTooltipIndex ?? null)}
          onMouseLeave={() => onHover(null)}
        >
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="km"
            type="number"
            domain={[0, "dataMax"]}
            hide={!xAxis}
            tickFormatter={(v: number) => `${Math.round(v)} km`}
            stroke="var(--muted-foreground)"
            fontSize={11}
            minTickGap={30}
          />
          <YAxis stroke="var(--muted-foreground)" fontSize={11} allowDecimals={false} />
          {/* Cursor line and dot only; the value shows in the header. */}
          <Tooltip
            content={() => null}
            cursor={{ stroke: "var(--foreground)", strokeOpacity: 0.5 }}
          />
          {m.avg != null && (
            <ReferenceLine y={m.avg} stroke={m.color} strokeOpacity={0.6} strokeDasharray="4 4" />
          )}
          <Area
            type="monotone"
            dataKey={m.key}
            stroke={m.color}
            fill={m.color}
            fillOpacity={0.12}
            strokeWidth={1.5}
            connectNulls
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
});
