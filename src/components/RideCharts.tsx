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
import { formatPace, stepsPerMinute } from "@/lib/pace";
import { hrAxis, rideSeries, type SeriesPoint } from "@/lib/ride-series";
import { isSport } from "@/lib/sport";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type Metric = {
  key: "speed" | "gap" | "watts" | "hr" | "cadence" | "wbal";
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
  /** Where the y axis starts and its ticks, instead of 0 → auto; only this axis fits the data shown when zoomed in. */
  yAxis?: { domain: [number, number]; ticks: number[] };
};

const peak = (xs: (number | null)[]) =>
  xs.reduce<number | null>((m, x) => (x != null && (m == null || x > m) ? x : m), null);

const avgOf = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x != null);
  return v.length ? v.reduce((t, x) => t + x, 0) / v.length : null;
};

/**
 * Speed, power, heart rate and cadence along the ride, stacked on one distance axis; hovering one shows the same spot on all.
 * With a `work` selected, the charts zoom to that stretch and the averages are the work's own.
 * They also zoom along distance together (drag, or pinch on a phone), and heart rate's y axis fits what's shown; the others keep their start.
 * With `cp` (critical power and W′ from the power curve), a fourth chart shows W′ balance: the anaerobic reserve left.
 */
export function RideCharts({
  a,
  streams,
  work,
  cp,
  chosen,
  onChoose,
}: {
  a: ActivityDetail;
  streams: RideStreams;
  work?: { startKm: number; endKm: number } | null;
  cp?: { cp: number; wPrime: number } | null;
  /** Which charts to show, in this order; all of them when missing. */
  chosen?: { id: string; hidden: boolean }[] | undefined;
  onChoose?: ((id: string, hidden: boolean) => void) | undefined;
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
  // Runs count steps a minute, however the device reports them, as the number on the page does.
  const cadence = useMemo(
    () => (isRun ? streams.cadence.map((c) => stepsPerMinute(c)) : streams.cadence),
    [streams, isRun],
  );
  const all = useMemo(
    () =>
      isRun
        ? // Running power isn't charted; pace and grade-adjusted pace are.
          rideSeries({ ...streams, cadence, watts: [], gap: gapStreams(streams).gap })
        : rideSeries({ ...streams, wbal: balance }),
    [streams, balance, isRun, cadence],
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
            label: isRun ? t("Pace", "Passo") : t("Speed", "Velocità"),
            unit: isRun ? "/km" : "km/h",
            color: "var(--fitness)",
            avg: a.average_speed != null ? a.average_speed * 3.6 : null,
            max: a.max_speed != null ? a.max_speed * 3.6 : null,
            digits: 1,
            ...(isRun ? { format: kmhAsPace } : {}),
          },
          {
            key: "gap",
            label: t("Grade-adjusted pace", "Passo corretto per pendenza"),
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
            yAxis: hrAxis(streams.heartrate, peak(data.map((p) => p.hr))),
          },
          {
            key: "cadence",
            label: t("Cadence", "Cadenza"),
            unit: isRun ? t("steps/min", "passi/min") : "rpm",
            color: "var(--spring)",
            avg: isRun ? stepsPerMinute(a.average_cadence) : a.average_cadence,
            max: peak(cadence),
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
    [a, streams, data, work, cp, isRun, cadence],
  );

  const place = (key: string) => {
    const i = chosen?.findIndex((c) => c.id === key) ?? -1;
    return i < 0 ? Infinity : i;
  };
  // What this activity has, chosen or not, so a hidden chart can always come back.
  const inOrder = [...metrics].sort((x, y) => place(x.key) - place(y.key));
  const isHidden = (key: string) => !!chosen?.find((c) => c.id === key)?.hidden;
  const shownMetrics = inOrder.filter((m) => !isHidden(m.key));

  if (!metrics.length)
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        {t(
          "No speed, power, heart rate or cadence recorded.",
          "Nessuna velocità, potenza, frequenza cardiaca o cadenza registrata.",
        )}
      </p>
    );
  return (
    <>
      {onChoose && (
        <div className="-mx-1 mb-3 flex flex-wrap gap-1">
          {inOrder.map((m) => {
            const on = !isHidden(m.key);
            return (
              <button
                key={m.key}
                type="button"
                aria-pressed={on}
                onClick={() => onChoose(m.key, on)}
                className={cn(
                  "min-h-8 rounded-full px-3 text-xs",
                  on ? "bg-secondary text-foreground" : "text-muted-foreground",
                )}
              >
                {m.label}
              </button>
            );
          })}
        </div>
      )}
      {shownMetrics.length > 0 && (
        <div className="space-y-4 select-none md:cursor-crosshair" {...zoom.wrapper}>
          {shownMetrics.map((m, i) => (
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
                        {m.format && at[m.key] != null
                          ? m.format(at[m.key]!)
                          : fmt(at[m.key], m.digits)}
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
                xAxis={i === shownMetrics.length - 1}
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
                "Trascina su un grafico per ingrandire (zoom con due dita sul telefono); doppio clic per ripristinare.",
              )}
            </span>
            {zoom.zoomed && (
              <Button size="sm" variant="ghost" onClick={zoom.reset}>
                {t("Reset zoom", "Reimposta zoom")}
              </Button>
            )}
          </div>
        </div>
      )}
    </>
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
  /** Zoomed in: a metric with its own `yAxis` fits the data shown. */
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
        <AreaChart
          data={data}
          syncId="ride"
          // Room for half a label above and below, on charts with no distance axis under them.
          margin={{ left: -20, right: 4, top: 8, bottom: xAxis ? 0 : 8 }}
          {...handlers}
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
          <YAxis
            stroke="var(--muted-foreground)"
            fontSize={11}
            allowDecimals={false}
            // Every label, or Recharts drops the lowest as not fitting: the axis would seem to start above it.
            interval={0}
            domain={
              m.yDomain ?? (m.yAxis ? (fit ? ["auto", "auto"] : m.yAxis.domain) : [0, "auto"])
            }
            {...(m.yAxis && !fit ? { ticks: m.yAxis.ticks, allowDataOverflow: true } : {})}
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
