import { memo, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { useXZoom, ZOOM_AREA } from "@/hooks/use-x-zoom";
import { wbal } from "@/lib/analysis";
import type { ActivityDetail, RideStreams } from "@/lib/intervals";
import { gapStreams } from "@/lib/gap";
import { formatPace } from "@/lib/pace";
import { rideSeries, type SeriesPoint } from "@/lib/ride-series";
import { isSport } from "@/lib/sport";
import { t } from "@/lib/i18n";

type Metric = {
  key: "speed" | "gap" | "watts" | "hr" | "wbal";
  /** How a value reads, when not as a plain number. */
  format?: (v: number) => string;
  label: string;
  unit: string;
  color: string;
  avg: number | null | undefined;
  max: number | null | undefined;
  digits: number;
  /** Replaces "avg · max" in the header. */
  summary?: string;
  /** Fixed y range instead of 0 → auto. */
  yDomain?: [number, number];
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
 * They also zoom along distance together (drag, or pinch on a phone), and the y axes fit what's shown.
 * With `cp` (critical power and W′ from the power curve), a fourth chart shows W′ balance: the anaerobic reserve left.
 */
export function RideCharts({
  a,
  streams,
  work,
  cp,
}: {
  a: ActivityDetail;
  streams: RideStreams;
  work?: { startKm: number; endKm: number } | null;
  cp?: { cp: number; wPrime: number } | null;
}) {
  const balance = useMemo(
    () =>
      // As % of W′: round axis ticks, and "how much of the reserve is left" reads straight off it.
      cp && streams.watts.some((w) => w != null)
        ? wbal(streams.watts, cp.cp, cp.wPrime).map((j) => (j / cp.wPrime) * 100)
        : undefined,
    [streams, cp],
  );
  const isRun = isSport(a, "run");
  const all = useMemo(
    () =>
      isRun
        ? // Running power isn't charted; pace and grade-adjusted pace are.
          rideSeries({ ...streams, watts: [], gap: gapStreams(streams).gap })
        : rideSeries({ ...streams, wbal: balance }),
    [streams, balance, isRun],
  );
  const data = useMemo(
    () => (work ? all.filter((p) => p.km >= work.startKm && p.km <= work.endKm) : all),
    [all, work],
  );
  // Plot area inside each chart: YAxis 60 px + margin.left -20, margin.right 4.
  const zoom = useXZoom(data, { minSpan: 10, inset: { left: 40, right: 4 } });
  const shown = zoom.view;
  const [idx, setIdx] = useState<number | null>(null);
  const at = idx != null ? shown[idx] : undefined;
  const { onMouseMove: zoomMove, onMouseLeave: zoomLeave, ...zoomChart } = zoom.chart;
  // Stable, so the memoised charts don't redraw on every hover.
  const handlers = useMemo(
    () => ({
      ...zoomChart,
      onMouseMove: (st: Parameters<typeof zoomMove>[0]) => {
        setIdx(st?.activeTooltipIndex ?? null);
        zoomMove(st);
      },
      onMouseLeave: () => {
        setIdx(null);
        zoomLeave();
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [zoom.chart],
  );
  const domain = useMemo<[number, number] | null>(
    () =>
      zoom.zoomed ? [shown[0]!.km, shown.at(-1)!.km] : work ? [work.startKm, work.endKm] : null,
    [zoom.zoomed, shown, work],
  );
  const sel = zoom.selection
    ? ([shown[zoom.selection[0]]!.km, shown[zoom.selection[1]]!.km] as [number, number])
    : null;
  const metrics = useMemo(
    () =>
      (
        [
          {
            key: "speed",
            label: isRun ? t("Pace", "Ritmo") : t("Speed", "Velocità"),
            unit: isRun ? "/km" : "km/h",
            color: "var(--fitness)",
            avg: a.average_speed != null ? a.average_speed * 3.6 : null,
            max: a.max_speed != null ? a.max_speed * 3.6 : null,
            digits: 1,
            ...(isRun ? { format: kmhAsPace } : {}),
          },
          {
            key: "gap",
            label: t("Grade-adjusted pace", "Ritmo corretto per pendenza"),
            unit: "/km",
            color: "var(--pine)",
            avg: avgOf(data.map((p) => p.gap ?? null)),
            max: null,
            digits: 1,
            format: kmhAsPace,
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
          {
            key: "wbal",
            label: t("W′ balance", "Bilancio W′"),
            unit: "%",
            color: "var(--form)",
            avg: null,
            max: null,
            digits: 0,
            yDomain: [0, 100],
          },
        ] satisfies Metric[]
      )
        .filter((m) => data.some((p) => p[m.key] != null))
        .map((m) =>
          work
            ? {
                ...m,
                avg: avgOf(data.map((p) => p[m.key] ?? null)),
                max: peak(data.map((p) => p[m.key] ?? null)),
              }
            : m,
        )
        .map((m): Metric => {
          if (m.key !== "wbal" || !cp) return m;
          const low = Math.min(...data.map((p) => p.wbal ?? Infinity));
          const kj = (low * cp.wPrime) / 100000;
          // Under 0 means the CP/W′ from your curve underrate you: the ride beat the model.
          const lowest = t(
            `lowest ${Math.round(low)}% (${kj.toFixed(1)} kJ)`,
            `minimo ${Math.round(low)}% (${kj.toFixed(1)} kJ)`,
          );
          return {
            ...m,
            summary: `${lowest} · CP ${Math.round(cp.cp)} W`,
            yDomain: [Math.min(0, Math.floor(low / 10) * 10), 100] as [number, number],
          };
        }),
    [a, streams, data, work, cp, isRun],
  );

  if (!metrics.length)
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        {t(
          "No speed, power or heart rate recorded.",
          "Nessuna velocità, potenza o frequenza cardiaca registrata.",
        )}
      </p>
    );
  return (
    <div className="space-y-4 select-none md:cursor-crosshair" {...zoom.wrapper}>
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
                    {m.format && at[m.key] != null ? m.format(at[m.key]!) : fmt(at[m.key], m.digits)}
                  </span>{" "}
                  {m.unit}
                </>
              ) : (
                (m.summary ??
                (m.format
                  ? `${t("avg", "media")} ${m.avg != null ? m.format(m.avg) : "–"}${m.max != null ? ` · max ${m.format(m.max)}` : ""} ${m.unit}`
                  : `${t("avg", "media")} ${fmt(m.avg, m.digits)} · max ${fmt(m.max, m.digits)} ${m.unit}`))
              )}
            </span>
          </div>
          <Chart
            data={shown}
            m={m}
            xAxis={i === metrics.length - 1}
            domain={domain}
            fit={zoom.zoomed}
            selection={sel}
            handlers={handlers}
          />
        </div>
      ))}
      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span>
          {t(
            "Drag across a chart to zoom (pinch on a phone); double-click to reset.",
            "Trascina su un grafico per ingrandire (pizzica sul telefono); doppio clic per tornare.",
          )}
        </span>
        {zoom.zoomed && (
          <Button size="sm" variant="ghost" onClick={zoom.reset}>
            {t("Reset zoom", "Annulla zoom")}
          </Button>
        )}
      </div>
    </div>
  );
}

/** Speeds are charted in km/h, higher being faster; on runs they read as min/km. */
const kmhAsPace = (kmh: number) => formatPace(kmh / 3.6);

const fmt = (v: number | null | undefined, digits: number) => (v != null ? v.toFixed(digits) : "–");

// Memoised so moving the pointer only re-renders the readouts, not three charts of 500 points.
const Chart = memo(function Chart({
  data,
  m,
  xAxis,
  domain,
  fit,
  selection,
  handlers,
}: {
  data: SeriesPoint[];
  m: Metric;
  xAxis: boolean;
  domain: [number, number] | null;
  /** Fit the y axis to the data shown instead of starting at 0 (when zoomed in). */
  fit: boolean;
  /** The stretch (km) being dragged to zoom. */
  selection: [number, number] | null;
  handlers: Pick<
    React.ComponentProps<typeof AreaChart>,
    "onMouseDown" | "onMouseMove" | "onMouseUp" | "onMouseLeave"
  >;
}) {
  return (
    <div className={xAxis ? "h-36" : "h-28"}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} syncId="ride" margin={{ left: -20, right: 4, top: 4 }} {...handlers}>
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
          <YAxis
            stroke="var(--muted-foreground)"
            fontSize={11}
            allowDecimals={false}
            domain={m.yDomain ?? (fit ? ["auto", "auto"] : [0, "auto"])}
            {...(m.format ? { tickFormatter: m.format } : {})}
          />
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
          {selection && (
            <ReferenceArea x1={selection[0]} x2={selection[1]} {...ZOOM_AREA} ifOverflow="hidden" />
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
});
