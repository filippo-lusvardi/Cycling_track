// A ride against its workout: power as ridden, the targets where the comparison found them, and the score. It shows the
// algorithm's own working, so it doubles as a way to check it.
import { useMemo } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Panel } from "@/components/StatCard";
import { t } from "@/lib/i18n";
import { credibleRating } from "@/lib/plan/evaluate";
import { executionOf, type Execution } from "@/lib/plan/execution";
import { ratingIn } from "@/lib/plan/rating";
import type { ActivityDetail } from "@/lib/intervals";
import { usePlanSession } from "@/components/PlanRating";
import type { NoteReview } from "@/lib/plan/note";
import type { Rating } from "@/lib/plan/types";
import { parseWorkout } from "@/lib/workout";

/** Seconds per point: enough to see an interval's shape without drawing every second. */
const SMOOTH = 15;

export type ComparePoint = { min: number; power: number | null; target: number | null };

/** The whole workout, second by second, in watts. */
export function plannedWatts(description: string, ftp: number) {
  const { blocks } = parseWorkout(description, "ride", { ftp });
  const out: number[] = [];
  for (const b of blocks) {
    const n = Math.round(b.seconds);
    for (let i = 0; i < n; i++) out.push((b.from + ((b.to - b.from) * (i + 0.5)) / n) * ftp);
  }
  return out;
}

const binned = (xs: (number | null)[]) => {
  const out: number[] = [];
  for (let i = 0; i < xs.length; i += SMOOTH) {
    const part = xs.slice(i, i + SMOOTH);
    out.push(part.reduce<number>((n, x) => n + (x ?? 0), 0) / part.length);
  }
  return out;
};

/**
 * Where the workout best lines up with the ride, in points: nobody starts a workout the moment they start recording. It
 * can only start later, and the plan is drawn in one piece, so a longer pause shows as a gap between the two lines.
 */
export function bestShift(power: number[], plan: number[]) {
  let best = 0;
  let bestGap = Infinity;
  for (let shift = 0; shift <= Math.max(0, power.length - plan.length); shift++) {
    let gap = 0;
    for (let i = 0; i < plan.length; i++) gap += Math.abs((power[shift + i] ?? 0) - plan[i]!);
    if (gap < bestGap) {
      bestGap = gap;
      best = shift;
    }
  }
  return best;
}

export function comparePoints(watts: (number | null)[], description: string, ftp: number) {
  const power = binned(watts);
  const plan = binned(plannedWatts(description, ftp));
  const shift = bestShift(power, plan);
  const length = Math.max(power.length, shift + plan.length);
  return Array.from({ length }, (_, i): ComparePoint => {
    const p = power[i];
    const w = plan[i - shift];
    return {
      min: Math.round(((i * SMOOTH) / 60) * 10) / 10,
      power: p == null ? null : Math.round(p),
      target: w == null ? null : Math.round(w),
    };
  });
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const length = (s: number) =>
  s % 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` : `${s / 60} min`;

export function PlanVsRide({
  watts,
  description,
  ftp,
  execution,
  rating,
  reviews,
}: {
  watts: (number | null)[];
  description: string;
  ftp: number;
  execution: Execution;
  rating: Rating | null;
  reviews: NoteReview[];
}) {
  const data = useMemo(() => comparePoints(watts, description, ftp), [watts, description, ftp]);
  const counted =
    credibleRating({
      date: "",
      hard: true,
      plannedSeconds: 0,
      doneSeconds: 0,
      rating,
      execution,
    }) === rating;
  return (
    <Panel title={t("Planned and ridden", "Previsto e fatto")}>
      <div className="flex items-baseline gap-2">
        <span className="stat-num text-3xl font-semibold">{execution.score}</span>
        <span className="text-sm text-muted-foreground">
          /100 · {t("average", "media")} {pct(execution.ratio)} {t("of target", "del previsto")}
        </span>
      </div>
      <div className="mt-3 h-44">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ left: -18, right: 4, top: 4 }}>
            <CartesianGrid stroke="var(--border)" strokeOpacity={0.5} vertical={false} />
            <XAxis
              dataKey="min"
              type="number"
              domain={[0, "dataMax"]}
              ticks={Array.from(
                { length: Math.floor((data[data.length - 1]?.min ?? 0) / 15) + 1 },
                (_, i) => i * 15,
              )}
              unit="′"
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              unit=" W"
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              tickLine={false}
              axisLine={false}
              width={62}
            />
            {execution.matches.flatMap((m) =>
              m.start == null
                ? []
                : [
                    <ReferenceArea
                      key={m.start}
                      x1={m.start / 60}
                      x2={(m.start + m.seconds) / 60}
                      fill="var(--foreground)"
                      fillOpacity={0.07}
                      stroke="none"
                    />,
                  ],
            )}
            <Tooltip
              contentStyle={{
                background: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                fontSize: 12,
              }}
              labelFormatter={(m) => `${m}′`}
              formatter={(v, name) => [`${v as number} W`, name]}
            />
            <Legend
              iconType="plainline"
              wrapperStyle={{ fontSize: 12 }}
              formatter={(name) => <span className="text-muted-foreground">{name}</span>}
            />
            <Line
              name={t("Ridden", "Fatto")}
              dataKey="power"
              stroke="#3f9fc9"
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
            />
            <Line
              name={t("Planned", "Previsto")}
              dataKey="target"
              stroke="#cf7a3d"
              strokeWidth={2.5}
              dot={false}
              connectNulls={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-xs text-muted-foreground">
          {t("Diagnostics", "Diagnostica")}
        </summary>
        <p className="mt-2 text-xs text-muted-foreground">
          {t(
            "Shaded: the stretches of the ride compared with each block.",
            "In evidenza: i tratti dell'uscita confrontati con ogni blocco.",
          )}
        </p>
        <table className="mt-2 w-full text-xs">
          <thead className="text-muted-foreground">
            <tr className="text-left">
              <th className="font-normal">{t("Step", "Blocco")}</th>
              <th className="font-normal">{t("From", "Da")}</th>
              <th className="text-right font-normal">{t("Planned", "Previsto")}</th>
              <th className="text-right font-normal">{t("Ridden", "Fatto")}</th>
              <th className="text-right font-normal">%</th>
            </tr>
          </thead>
          <tbody className="stat-num">
            {execution.matches.map((m, i) => (
              <tr key={i}>
                <td>{length(m.seconds)}</td>
                <td>{m.start == null ? "–" : `${Math.round(m.start / 60)}′`}</td>
                <td className="text-right">{Math.round(m.target)} W</td>
                <td className="text-right">{Math.round(m.ridden)} W</td>
                <td className="text-right">{pct(m.ridden / m.target)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
          <dt className="text-muted-foreground">{t("Verdict", "Verdetto")}</dt>
          <dd>{execution.verdict}</dd>
          <dt className="text-muted-foreground">{t("Steps hit", "Blocchi centrati")}</dt>
          <dd>
            {execution.stepsHit}/{execution.steps}
          </dd>
          <dt className="text-muted-foreground">{t("Rating", "Valutazione")}</dt>
          <dd>
            {rating ?? "–"}
            {rating
              ? ` · ${counted ? t("counted", "contata") : t("not counted", "non contata")}`
              : ""}
          </dd>
        </dl>
        {reviews.length > 0 && (
          <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
            {reviews.slice(-5).map((r) => (
              <li key={`${r.on}-${r.reason}`}>
                {r.on} · {r.result} · {r.reason}
                {r.accepted === false ? ` · ${t("left", "lasciata")}` : ""}
              </li>
            ))}
          </ul>
        )}
      </details>
    </Panel>
  );
}

/** On a ride that went with a session of the plan: how the two compare. Nothing for any other ride, or with no power. */
export function PlanCompare({
  a,
  watts,
  ftp,
}: {
  a: ActivityDetail;
  watts: (number | null)[] | undefined;
  ftp: number | null | undefined;
}) {
  const matched = usePlanSession(a);
  const description = matched?.event.description;
  const execution = useMemo(
    () =>
      description
        ? executionOf({ description, ftp, watts, weightedWatts: a.icu_weighted_avg_watts })
        : null,
    [description, ftp, watts, a.icu_weighted_avg_watts],
  );
  if (!matched || !description || !execution || !ftp || !watts?.some((w) => w)) return null;
  return (
    <PlanVsRide
      watts={watts}
      description={description}
      ftp={ftp}
      execution={execution}
      rating={ratingIn(a.description)}
      reviews={matched.reviews}
    />
  );
}
