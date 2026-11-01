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
import { t } from "@/lib/i18n";

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

const avgOf = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x != null);
  return v.length ? v.reduce((t, x) => t + x, 0) / v.length : null;
};

/**
 * Speed, power and heart rate along the ride, stacked on one distance axis; hovering one shows the same spot on all.
 * With a `work` selected, the charts zoom to that stretch and the averages are the work's own.
 */
export function RideCharts({
  a,
  streams,
  work,
}: {
  a: ActivityDetail;
  streams: RideStreams;
  work?: { startKm: number; endKm: number } | null;
}) {
  const all = useMemo(() => rideSeries(streams), [streams]);
  const data = useMemo(
    () => (work ? all.filter((p) => p.km >= work.startKm && p.km <= work.endKm) : all),
    [all, work],
  );
  const [idx, setIdx] = useState<number | null>(null);
  const at = idx != null ? data[idx] : undefined;
  const metrics = useMemo(
    () =>
      (
        [
          {
            key: "speed",
            label: t("Speed", "Velocità"),
            unit: "km/h",
            color: "var(--fitness)",
            avg: a.average_speed != null ? a.average_speed * 3.6 : null,
            max: a.max_speed != null ? a.max_speed * 3.6 : null,
            digits: 1,
          },
          {
            key: "watts",
            label: t("Power", "Potenza"),
            unit: "W",
            color: "var(--birch)",
            avg: a.icu_average_watts,
            max: peak(streams.watts),
            digits: 0,
          },
          {
            key: "hr",
            label: t("Heart rate", "Frequenza cardiaca"),
            unit: "bpm",
            color: "var(--fatigue)",
            avg: a.average_heartrate,
            max: a.max_heartrate ?? peak(streams.heartrate),
            digits: 0,
          },
        ] satisfies Metric[]
      )
        .filter((m) => data.some((p) => p[m.key] != null))
        .map((m) =>
          work
            ? { ...m, avg: avgOf(data.map((p) => p[m.key])), max: peak(data.map((p) => p[m.key])) }
            : m,
        ),
    [a, streams, data, work],
  );

  if (!metrics.length)
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        {t("No speed, power or heart rate recorded.", "Nessuna velocità, potenza o frequenza cardiaca registrata.")}
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
                `${t("avg", "media")} ${fmt(m.avg, m.digits)} · max ${fmt(m.max, m.digits)} ${m.unit}`
              )}
            </span>
          </div>
          <Chart
            data={data}
            m={m}
            xAxis={i === metrics.length - 1}
            domain={work ? [work.startKm, work.endKm] : null}
            onHover={setIdx}
          />
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
  domain,
  onHover,
}: {
  data: SeriesPoint[];
  m: Metric;
  xAxis: boolean;
  domain: [number, number] | null;
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
            domain={domain ?? [0, "dataMax"]}
            allowDataOverflow
            hide={!xAxis}
            tickFormatter={(v: number) => (domain ? `${v.toFixed(1)} km` : `${Math.round(v)} km`)}
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
