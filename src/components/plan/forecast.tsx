// Where fitness, fatigue and form head with the plan: the last weeks as they were, the planned days dashed, the weeks of the
// outline dotted and fainter. A load estimate, said so under it.
import { useQuery } from "@tanstack/react-query";
import { parseISO } from "date-fns";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import { Panel } from "@/components/StatCard";
import { format, t } from "@/lib/i18n";
import type { PlanContext, WindowDay } from "@/lib/plan/engine";
import {
  forecast,
  forecastLoads,
  FORECAST_PAST_DAYS,
  type ForecastPoint,
} from "@/lib/plan/forecast";
import type { OutlineWeek } from "@/lib/plan/outline";
import { wellnessQuery } from "@/lib/queries";
import { cn } from "@/lib/utils";

type Key = "fitness" | "fatigue" | "form";

// Form zones as in `formZone` (training.ts) and the Fitness page.
const FORM_ZONES: [number, number, () => string, string][] = [
  [-200, -30, () => t("High risk", "Rischio alto"), "var(--lingon)"],
  [-30, -10, () => t("Optimal", "Ottimale"), "var(--pine)"],
  [-10, 5, () => t("Grey zone", "Zona grigia"), "var(--z1)"],
  [5, 25, () => t("Fresh", "Fresco"), "var(--fitness)"],
  [25, 200, () => t("Transition", "Transizione"), "var(--birch)"],
];

/** Each series split by kind; the day where one kind ends belongs to the next as well, so the line doesn't break. */
function rows(points: ForecastPoint[]) {
  const last = (k: ForecastPoint["kind"]) => points.filter((p) => p.kind === k).at(-1)?.date;
  const lastPast = last("past");
  const lastPlanned = last("planned");
  return points.map((p) => {
    const row: Record<string, number | string | null> = { date: p.date };
    for (const k of ["fitness", "fatigue", "form"] as Key[]) {
      row[`${k}Past`] = p.kind === "past" ? p[k] : null;
      row[`${k}Plan`] = p.kind === "planned" || p.date === lastPast ? p[k] : null;
      row[`${k}Est`] = p.kind === "estimated" || p.date === lastPlanned ? p[k] : null;
    }
    return row;
  });
}

function Lines({
  data,
  today,
  series,
  tall,
  xAxis,
  zones,
}: {
  data: ReturnType<typeof rows>;
  today: string;
  series: [Key, string, boolean?][];
  tall?: boolean;
  xAxis?: boolean;
  zones?: boolean;
}) {
  const vals = data
    .flatMap((r) => series.flatMap(([k]) => [r[`${k}Past`], r[`${k}Plan`], r[`${k}Est`]]))
    .filter((v): v is number => typeof v === "number");
  const lo = Math.floor((Math.min(...vals) - 3) / 5) * 5;
  const hi = Math.ceil((Math.max(...vals) + 3) / 5) * 5;
  return (
    <div className={tall ? "h-56" : "h-40"}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} syncId="plan-forecast" margin={{ left: -20, right: 4, top: 4 }}>
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
          {zones &&
            FORM_ZONES.filter(([a, b]) => b > lo && a < hi).map(([a, b, name, color]) => (
              <ReferenceArea
                key={color}
                y1={Math.max(a, lo)}
                y2={Math.min(b, hi)}
                fill={color}
                fillOpacity={0.12}
                label={{
                  value: name(),
                  position: "insideRight",
                  fontSize: 10,
                  fill: "var(--muted-foreground)",
                }}
              />
            ))}
          <ReferenceLine
            x={today}
            stroke="var(--foreground)"
            strokeOpacity={0.5}
            {...(xAxis
              ? {}
              : {
                  label: {
                    value: t("today", "oggi"),
                    position: "insideTopLeft" as const,
                    fontSize: 10,
                    fill: "var(--muted-foreground)",
                  },
                })}
          />
          {series.flatMap(([k, color, area]) => [
            area ? (
              <Area
                key={`${k}Past`}
                dataKey={`${k}Past`}
                type="monotone"
                stroke={color}
                fill={color}
                fillOpacity={0.15}
                strokeWidth={2}
                isAnimationActive={false}
              />
            ) : (
              <Line
                key={`${k}Past`}
                dataKey={`${k}Past`}
                type="monotone"
                stroke={color}
                dot={false}
                strokeWidth={2}
                isAnimationActive={false}
              />
            ),
            <Line
              key={`${k}Plan`}
              dataKey={`${k}Plan`}
              type="monotone"
              stroke={color}
              dot={false}
              strokeWidth={2}
              strokeDasharray="5 3"
              isAnimationActive={false}
            />,
            <Line
              key={`${k}Est`}
              dataKey={`${k}Est`}
              type="monotone"
              stroke={color}
              strokeOpacity={0.45}
              dot={false}
              strokeWidth={2}
              strokeDasharray="2 4"
              isAnimationActive={false}
            />,
          ])}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function Key({
  color,
  label,
  dash,
  faint,
}: {
  color: string;
  label: string;
  dash?: string;
  faint?: boolean;
}) {
  return (
    <span className="flex items-center gap-1.5">
      <svg width="18" height="4" aria-hidden>
        <line
          x1="0"
          y1="2"
          x2="18"
          y2="2"
          stroke={color}
          strokeWidth="3"
          strokeDasharray={dash}
          strokeOpacity={faint ? 0.45 : 1}
        />
      </svg>
      {label}
    </span>
  );
}

/** The forecast panel. `days` are the next seven as shown, or as a proposal would make them. */
export function ForecastPanel({
  ctx,
  days,
  ahead,
}: {
  ctx: PlanContext;
  days: WindowDay[];
  ahead: OutlineWeek[];
}) {
  const { data: wellness } = useQuery(wellnessQuery(FORECAST_PAST_DAYS + 21));
  if (!wellness) return null;
  const { today } = ctx.input;
  const points = forecast(wellness, today, forecastLoads(ctx, days, ahead));
  const planned = points.filter((p) => p.kind === "planned").at(-1);
  if (!planned) return null;
  const end = points.at(-1)!;
  const data = rows(points);
  const numbers: [string, Key, string][] = [
    [t("Fitness", "Fitness"), "fitness", "text-fitness"],
    [t("Fatigue", "Fatica"), "fatigue", "text-fatigue"],
    [t("Form", "Forma"), "form", "text-form"],
  ];
  return (
    <Panel title={t("Fitness ahead", "Fitness nei prossimi giorni")}>
      <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <Key color="var(--fitness)" label={t("Fitness (CTL)", "Fitness (CTL)")} />
        <Key color="var(--fatigue)" label={t("Fatigue (ATL)", "Fatica (ATL)")} />
        <Key color="var(--muted-foreground)" label={t("planned", "pianificato")} dash="5 3" />
        <Key color="var(--muted-foreground)" label={t("estimated", "stimato")} dash="2 4" faint />
      </div>
      <div className="space-y-3">
        <Lines
          data={data}
          today={today}
          series={[
            ["fitness", "var(--fitness)", true],
            ["fatigue", "var(--fatigue)"],
          ]}
          tall
        />
        <Lines data={data} today={today} series={[["form", "var(--form)"]]} xAxis zones />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        {numbers.map(([label, k, cls]) => (
          <div key={k} className="rounded-lg bg-secondary/60 px-2 py-2">
            <div className="eyebrow">{label}</div>
            <div className={cn("stat-num text-xl font-semibold", cls)}>
              {Math.round(planned[k])}
            </div>
            <div className="stat-num text-[11px] text-muted-foreground">
              {format(parseISO(planned.date), "d MMM")}
              {end.kind === "estimated" ? ` · ${t("then", "poi")} ${Math.round(end[k])}` : ""}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        {t(
          "An estimate of load from the planned sessions, then from the weeks ahead. It says how tired the plan makes you, not how fast you'll be.",
          "Una stima del carico dalle sedute previste, poi dalle settimane dopo. Dice quanto il piano ti stanca, non quanto andrai forte.",
        )}
      </p>
    </Panel>
  );
}
