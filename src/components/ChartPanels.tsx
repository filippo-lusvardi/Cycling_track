// A chart asked for by typing: the same drawing in the panel and on its page. Different measures are stacked charts on the
// same periods, never one chart with two scales.
import { useEffect, useRef } from "react";
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ChartPanel, ChartView } from "@/lib/ask-detail";
import { num, t } from "@/lib/i18n";

const axis = { stroke: "var(--muted-foreground)", fontSize: 11, tickLine: false } as const;
const margin = { left: -18, right: 6, top: 8, bottom: 0 };
const tip = {
  contentStyle: {
    background: "var(--popover)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    fontSize: 12,
  },
  labelStyle: { color: "var(--muted-foreground)" },
  itemStyle: { color: "var(--foreground)" },
  cursor: {
    stroke: "var(--foreground)",
    strokeOpacity: 0.3,
    fill: "var(--foreground)",
    fillOpacity: 0.06,
  },
};
// The ride charts' own speed and power colours: told apart at any season, which the accent can't promise.
const FIRST = "var(--fitness)";
const SECOND = "var(--birch)";

function shown(p: ChartPanel, v: number) {
  const scale = 10 ** p.digits;
  return [num(Math.round(v * scale) / scale), p.unit].filter(Boolean).join(" ");
}

function Plot({ p, height }: { p: ChartPanel; height: string }) {
  // Values glide when the same periods are redrawn; a different number of periods would slide into nonsense, so it just changes.
  const before = useRef<number | null>(null);
  const motion = {
    isAnimationActive: before.current === p.points.length,
    animationDuration: 200,
  };
  useEffect(() => {
    before.current = p.points.length;
  }, [p.points.length]);
  const formatter = (v: unknown, name: unknown) => [shown(p, v as number), name as string] as const;
  const name = p.names?.[0] ?? p.title;
  const first = p.names ? FIRST : "var(--primary)";
  const dot = (fill: string) =>
    p.draw === "points" ? { r: 4, fill, stroke: "var(--card)", strokeWidth: 2 } : false;
  return (
    <div className={height}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={p.points}
          margin={margin}
          barGap={2}
          barCategoryGap={p.names ? "20%" : 2}
        >
          <CartesianGrid stroke="var(--border)" vertical={false} />
          {/* The scale left to Recharts: named outright, it stops centring the labels under their periods. */}
          <XAxis dataKey="label" {...axis} minTickGap={12} />
          <YAxis
            {...axis}
            ticks={p.ticks}
            domain={[p.ticks[0]!, p.ticks.at(-1)!]}
            allowDataOverflow
            interval={0}
            tickFormatter={(v: number) => num(v)}
          />
          <Tooltip {...tip} formatter={formatter} />
          {p.names && (
            <Legend
              wrapperStyle={{ fontSize: 12 }}
              formatter={(n) => <span className="text-muted-foreground">{n}</span>}
            />
          )}
          {p.draw === "bars" ? (
            <Bar name={name} dataKey="value" fill={first} radius={[4, 4, 0, 0]} {...motion}>
              {!p.names && p.points.map((d, i) => <Cell key={i} fillOpacity={d.open ? 0.4 : 1} />)}
            </Bar>
          ) : (
            // Holds the periods as wide as bars would, so stacked over a bar chart each month lines up.
            <Bar dataKey="none" legendType="none" tooltipType="none" {...motion} />
          )}
          {p.draw !== "bars" && (
            <Line
              name={name}
              dataKey="value"
              stroke={first}
              strokeWidth={2}
              {...motion}
              dot={dot(first)}
            />
          )}
          {p.names &&
            (p.draw === "bars" ? (
              <Bar
                name={p.names[1]}
                dataKey="other"
                fill={SECOND}
                radius={[4, 4, 0, 0]}
                {...motion}
              />
            ) : (
              <Line
                name={p.names[1]}
                dataKey="other"
                stroke={SECOND}
                strokeWidth={2}
                {...motion}
                dot={dot(SECOND)}
              />
            ))}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

const hasData = (p: ChartPanel) => p.points.some((d) => d.value != null || d.other != null);

/** The chart alone, with nothing but what was asked around it; whether it's read yet or there's nothing to draw is said. */
export function ChartPlot({ p, height }: { p: ChartPanel; height: string }) {
  return hasData(p) ? (
    <Plot p={p} height={height} />
  ) : (
    <p className="py-6 text-center text-sm text-muted-foreground">
      {t("Nothing to show in this stretch", "Niente da mostrare in questo periodo")}
    </p>
  );
}

/** For the panel, where every chart shares one card. */
export function ChartPanels({ view }: { view: ChartView }) {
  const stacked = view.panels.length > 1;
  const height = stacked ? "h-24" : "h-28";
  // As tall as the chart that's coming, so nothing jumps when it arrives.
  if (view.loading && !view.panels.some(hasData))
    return (
      <p className={`flex ${height} items-center justify-center text-sm text-muted-foreground`}>
        {t("Loading…", "Caricamento…")}
      </p>
    );
  return (
    <div className="space-y-1">
      {view.panels.map((p) => (
        <div key={p.title}>
          {stacked && <div className="text-xs font-medium">{p.title}</div>}
          <ChartPlot p={p} height={height} />
        </div>
      ))}
      {view.note && <p className="pt-1 text-xs text-muted-foreground">{view.note}</p>}
    </div>
  );
}
