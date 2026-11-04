// The Analysis page for running: pace and grade-adjusted pace instead of power.
import { zoneTops } from "@/lib/settings";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { parseISO } from "date-fns";
import { ChevronDown } from "lucide-react";
import { useMemo, useState, useSyncExternalStore } from "react";
import {
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { FitnessSection } from "@/components/FitnessSection";
import { Panel, StatCard } from "@/components/StatCard";
import { Button } from "@/components/ui/button";
import { ZoneBar } from "@/components/ZoneBar";
import { distributionLabel, polarizationIndex, threeZone } from "@/lib/analysis";
import { format, t } from "@/lib/i18n";
import { formatClock, formatPace, paceLabel } from "@/lib/pace";
import { rideZonesQuery, runDataQuery, wellnessQuery } from "@/lib/queries";
import { runProgress, type RunData, type RunEntry } from "@/lib/run-data";
import {
  BEST_DISTANCES,
  BEST_LABEL,
  bestOfCurves,
  bestsAmong,
  FADE_EFFORTS,
  FADE_KM,
  fadeProfile,
  fadeVerdict,
  hrZones,
  paceZones,
  RUN_DUR,
  RUN_ZONE_NAMES,
  thresholdTrend,
} from "@/lib/run-metrics";
import { addDays, isoDate } from "@/lib/training";
import { cn } from "@/lib/utils";

const tip = { background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8 };
const TICKS = [30, 60, 300, 1200, 3600, 10800];
const durLabel = (s: number) =>
  s < 60 ? `${s}s` : s < 3600 ? `${Math.round(s / 60)}m` : `${s / 3600}h`;

const within = (runs: RunEntry[], days: number) => {
  const since = addDays(isoDate(new Date()), -days);
  return runs.filter((r) => r.date >= since);
};

export function RunAnalysis() {
  const { data, isLoading, isError } = useQuery(runDataQuery());
  const progress = useSyncExternalStore(runProgress.subscribe, runProgress.get);
  // So Fitness's window is ready alongside the rest.
  useQuery(wellnessQuery(90));
  return (
    <>
      <FitnessSection />
      {isLoading && (
        <Panel title={t("Reading your runs", "Lettura delle corse")}>
          <p className="stat-num text-sm text-muted-foreground">
            {progress
              ? t(
                  `${progress.done} of ${progress.total} runs analysed. Each one is read only once.`,
                  `${progress.done} corse su ${progress.total} analizzate. Ognuna viene letta una volta sola.`,
                )
              : t("Just a moment…", "Un momento…")}
          </p>
        </Panel>
      )}
      {isError && (
        <Panel title={t("Runs", "Corse")}>
          <p className="text-sm text-muted-foreground">
            {t(
              "Couldn't read your runs. Try again later.",
              "Impossibile leggere le corse. Riprova più tardi.",
            )}
          </p>
        </Panel>
      )}
      {data && !data.runs.length && (
        <Panel title={t("Runs", "Corse")}>
          <p className="text-sm text-muted-foreground">
            {t(
              "No runs with distance data yet: pace, GAP and your bests will appear here after your first one.",
              "Ancora nessuna corsa con dati di distanza: passo, GAP e i tuoi migliori tempi compariranno qui dopo la prima.",
            )}
          </p>
        </Panel>
      )}
      {data && data.runs.length > 0 && (
        <>
          <PaceSection data={data} />
          <BestsSection runs={data.runs} />
          <FadeSection runs={data.runs} />
          <ThresholdSection data={data} />
          <DriftSection data={data} />
          <RunZonesSection data={data} />
        </>
      )}
    </>
  );
}

/** Best grade-adjusted (or plain) pace per duration, critical speed and a run to compare. */
function PaceSection({ data }: { data: RunData }) {
  const [kind, setKind] = useState<"gap" | "pace">("gap");
  const [runId, setRunId] = useState<string | null>(null);
  const recent = useMemo(() => within(data.runs, 42), [data.runs]);
  const key = kind === "gap" ? "gapCurve" : "paceCurve";
  const c42 = useMemo(() => bestOfCurves(recent.map((r) => r.s[key])), [recent, key]);
  const c1y = useMemo(
    () => bestOfCurves(within(data.runs, 365).map((r) => r.s[key])),
    [data.runs, key],
  );
  const run = recent.find((r) => r.a.id === runId);
  const fit = data.fit;
  const rows = RUN_DUR.map((secs, i) => ({
    secs,
    c42: c42[i] ?? null,
    c1y: c1y[i] ?? null,
    run: run?.s[key][i] ?? null,
    model:
      fit?.cs != null && fit.dPrime != null && secs >= 120 && secs <= 3600
        ? fit.cs + fit.dPrime / secs
        : null,
  }));
  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label={t("Threshold pace", "Passo di soglia")}
          tone="fitness"
          value={formatPace(data.threshold)}
          unit="/km"
          hint={
            data.manual
              ? t("set in Settings", "da Impostazioni")
              : t("estimated, 90 days", "stimato, 90 giorni")
          }
        />
        <StatCard
          label={t("Critical speed", "Velocità critica")}
          tone="form"
          value={formatPace(fit?.cs)}
          unit="/km"
          hint={t("GAP, 3–20 min efforts", "GAP, sforzi di 3–20 min")}
        />
        <StatCard
          label="D′"
          tone="fatigue"
          value={fit?.dPrime != null ? Math.round(fit.dPrime) : "–"}
          unit="m"
          hint={t("distance above critical speed", "distanza sopra la velocità critica")}
        />
        <StatCard
          label={t("Runs", "Corse")}
          value={recent.length}
          hint={t("last 42 days", "ultimi 42 giorni")}
        />
      </div>
      <Panel
        title={
          kind === "gap"
            ? t("Grade-adjusted pace curve", "Curva del passo corretto per pendenza")
            : t("Pace curve", "Curva del passo")
        }
        action={
          <div className="flex gap-1 rounded-lg bg-secondary p-1">
            {(["gap", "pace"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setKind(k)}
                className={cn(
                  "rounded-md px-3 py-1 text-xs",
                  kind === k ? "bg-background text-foreground" : "text-muted-foreground",
                )}
              >
                {k === "gap" ? "GAP" : t("Pace", "Passo")}
              </button>
            ))}
          </div>
        }
      >
        <p className="mb-2 text-xs text-muted-foreground">
          {t(
            "GAP is the flat pace that would cost the same effort, so hilly runs compare with flat ones.",
            "Il GAP è il passo in piano che costerebbe lo stesso sforzo, così le corse in salita si confrontano con quelle in piano.",
          )}
        </p>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={rows} margin={{ left: -8, right: 8, top: 8 }}>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="secs"
                type="number"
                scale="log"
                domain={[30, 14400]}
                ticks={TICKS}
                tickFormatter={durLabel}
                stroke="var(--muted-foreground)"
                fontSize={11}
              />
              <YAxis
                domain={["auto", "auto"]}
                tickFormatter={(v: number) => formatPace(v)}
                stroke="var(--muted-foreground)"
                fontSize={11}
              />
              <Tooltip
                contentStyle={tip}
                labelFormatter={(s) => durLabel(Number(s))}
                formatter={(v, n) => [paceLabel(Number(v)), String(n)]}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line
                dataKey="c1y"
                name={t("Last year", "Ultimo anno")}
                stroke="var(--muted-foreground)"
                dot={false}
                connectNulls
                isAnimationActive={false}
              />
              <Line
                dataKey="c42"
                name={t("Last 42 days", "Ultimi 42 giorni")}
                stroke="var(--fitness)"
                strokeWidth={2}
                dot={false}
                connectNulls
                isAnimationActive={false}
              />
              {kind === "gap" && (
                <Line
                  dataKey="model"
                  name={t("Model", "Modello")}
                  stroke="var(--form)"
                  strokeDasharray="4 4"
                  dot={false}
                  connectNulls
                  isAnimationActive={false}
                />
              )}
              {run && (
                <Line
                  dataKey="run"
                  name={run.a.name ?? t("Run", "Corsa")}
                  stroke="var(--lingon)"
                  dot={false}
                  connectNulls
                  isAnimationActive={false}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        {recent.length > 0 && (
          <select
            aria-label={t("Compare a run", "Confronta una corsa")}
            className="mt-3 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
            value={runId ?? ""}
            onChange={(e) => setRunId(e.target.value || null)}
          >
            <option value="">{t("Compare a run…", "Confronta una corsa…")}</option>
            {recent.map((r) => (
              <option key={r.a.id} value={r.a.id}>
                {format(parseISO(r.a.start_date_local), "d MMM")} · {r.a.name}
              </option>
            ))}
          </select>
        )}
      </Panel>
    </>
  );
}

/** Fastest times over the usual distances, taken from within any run. */
function BestsSection({ runs }: { runs: RunEntry[] }) {
  const columns = useMemo(() => {
    const flat = (rs: RunEntry[]) => rs.map((r) => ({ id: r.a.id, bests: r.s.bests }));
    return [
      { label: t("42 days", "42 giorni"), bests: bestsAmong(flat(within(runs, 42))) },
      { label: t("1 year", "1 anno"), bests: bestsAmong(flat(within(runs, 365))) },
      { label: t("All", "Tutte"), bests: bestsAmong(flat(runs)) },
    ];
  }, [runs]);
  return (
    <Panel title={t("Best times", "Migliori tempi")}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-muted-foreground">
              <th className="py-1 text-left font-normal">{t("Distance", "Distanza")}</th>
              {columns.map((c) => (
                <th key={c.label} className="py-1 text-right font-normal">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {BEST_DISTANCES.map((metres, i) => (
              <tr key={metres}>
                <td className="py-1.5">{BEST_LABEL[i]}</td>
                {columns.map((c) => {
                  const b = c.bests[i];
                  return (
                    <td key={c.label} className="stat-num py-1.5 text-right">
                      {b ? (
                        <Link
                          to="/rides/$id"
                          params={{ id: b.id }}
                          className="hover:underline"
                          title={paceLabel(metres / b.secs)}
                        >
                          {formatClock(b.secs)}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">–</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {t(
          "Taken from within any run, stops included.",
          "Presi da qualsiasi tratto di ogni corsa, soste comprese.",
        )}
      </p>
    </Panel>
  );
}

const FADE_DAYS = 90;
const FADE_MIN_SECS = 90 * 60;

/** Pace left late in long runs: best 5 and 20 min GAP after 15, 25 and 35 km of flat-equivalent running. */
function FadeSection({ runs }: { runs: RunEntry[] }) {
  const p = useMemo(
    () =>
      fadeProfile(
        within(runs, FADE_DAYS)
          .filter((r) => (r.a.moving_time ?? 0) >= FADE_MIN_SECS)
          .map((r) => r.s.fade),
      ),
    [runs],
  );
  const verdict = fadeVerdict(p);
  const VERDICT = {
    strong: {
      text: t("Holds pace well late in long runs.", "Tieni bene il passo nel finale dei lunghi."),
      tone: "text-pine",
    },
    average: {
      text: t("Loses some pace late in long runs.", "Perdi un po' di passo nel finale dei lunghi."),
      tone: "text-fitness",
    },
    fades: {
      text: t(
        "Fades late in long runs: long easy runs and fuelling build durability.",
        "Cali nel finale dei lunghi: lunghi lenti e alimentazione costruiscono la durability.",
      ),
      tone: "text-birch",
    },
  } as const;
  return (
    <Panel
      title={t(
        `Late-run fade · runs ≥ 90 min, last ${FADE_DAYS} days`,
        `Calo nel finale · corse ≥ 90 min, ultimi ${FADE_DAYS} giorni`,
      )}
    >
      {!p.runs ? (
        <p className="text-sm text-muted-foreground">
          {t(
            "No runs of 90 minutes or more lately.",
            "Nessuna corsa di almeno 90 minuti di recente.",
          )}
        </p>
      ) : (
        <>
          {verdict && (
            <p className={cn("mb-3 text-sm", VERDICT[verdict].tone)}>{VERDICT[verdict].text}</p>
          )}
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground">
                <th className="py-1 text-left font-normal">{t("After", "Dopo")}</th>
                {FADE_EFFORTS.map((e) => (
                  <th key={e} className="py-1 text-right font-normal">
                    {durLabel(e)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {FADE_KM.map((km) => (
                <tr key={km}>
                  <td className="py-1.5">{km ? `${km} km` : t("Fresh", "Fresco")}</td>
                  {FADE_EFFORTS.map((e, k) => {
                    const d = p.drop[km][k];
                    return (
                      <td key={e} className="stat-num py-1.5 text-right">
                        {paceLabel(p.best[km][k])}
                        {km > 0 && d != null && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            {d > 0 ? `−${d.toFixed(0)}%` : "="}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-muted-foreground">
            {t(
              "Kilometres are flat-equivalent: climbing counts as extra distance.",
              "I chilometri sono equivalenti in piano: la salita conta come distanza in più.",
            )}
          </p>
        </>
      )}
    </Panel>
  );
}

/** How the threshold pace has moved over the year. */
function ThresholdSection({ data }: { data: RunData }) {
  const series = useMemo(() => {
    const today = isoDate(new Date());
    return thresholdTrend(
      data.runs.map((r) => ({ date: r.date, curve: r.s.gapCurve })),
      today,
    );
  }, [data.runs]);
  if (series.length < 2) return null;
  const [first, last] = [series[0]!, series.at(-1)!];
  const delta = Math.round(1000 / first.speed - 1000 / last.speed);
  return (
    <Panel
      title={t(
        `Threshold pace · ${paceLabel(last.speed)} (${delta >= 0 ? `${delta} s/km faster` : `${-delta} s/km slower`} in a year)`,
        `Passo di soglia · ${paceLabel(last.speed)} (${delta >= 0 ? `${delta} s/km più veloce` : `${-delta} s/km più lento`} in un anno)`,
      )}
    >
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={series} margin={{ left: -8, right: 8, top: 8 }}>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={(d: string) => format(parseISO(d), "MMM")}
              stroke="var(--muted-foreground)"
              fontSize={11}
              minTickGap={24}
            />
            <YAxis
              domain={["auto", "auto"]}
              tickFormatter={(v: number) => formatPace(v)}
              stroke="var(--muted-foreground)"
              fontSize={11}
            />
            <Tooltip
              contentStyle={tip}
              labelFormatter={(d) => format(parseISO(String(d)), "d MMM yyyy")}
              formatter={(v) => [paceLabel(Number(v)), t("Threshold", "Soglia")]}
            />
            <Line
              dataKey="speed"
              stroke="var(--fitness)"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Panel>
  );
}

/** Pa:HR on long easy runs: how much pace per heartbeat drops from the first half to the second. */
function DriftSection({ data }: { data: RunData }) {
  const [show, setShow] = useState(false);
  const steady = useMemo(
    () =>
      data.runs
        .filter((r) => {
          const intensity =
            data.threshold && r.s.ngp ? (r.s.ngp / data.threshold) * 100 : r.a.icu_intensity;
          return (
            (r.a.moving_time ?? 0) >= 3600 &&
            intensity != null &&
            intensity < 80 &&
            r.s.drift != null
          );
        })
        .map((r) => ({ r, t: parseISO(r.a.start_date_local).getTime(), d: r.s.drift! })),
    [data],
  );
  if (!steady.length) return null;
  const recent = steady.slice(0, 8);
  const avg = recent.reduce((s, x) => s + x.d, 0) / recent.length;
  return (
    <Panel
      title={t("Aerobic drift (Pa:HR) · easy runs ≥ 1 h", "Decoupling (Pa:HR) · corse lente ≥ 1 h")}
    >
      <p className="mb-3 text-sm text-muted-foreground">
        {t(`Average of the last ${recent.length}:`, `Media delle ultime ${recent.length}:`)}{" "}
        <span className={cn("stat-num font-semibold", avg < 5 ? "text-pine" : "text-birch")}>
          {avg.toFixed(1)}%
        </span>{" "}
        {avg < 5
          ? t("is under 5%: solid aerobic base.", "è sotto il 5%: base aerobica solida.")
          : t(
              "is over 5%: endurance has room to build.",
              "è sopra il 5%: il fondo ha margine di crescita.",
            )}
      </p>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ left: -16, right: 8, top: 8 }}>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="t"
              type="number"
              domain={["dataMin", "dataMax"]}
              tickFormatter={(v: number) => format(v, "d MMM")}
              stroke="var(--muted-foreground)"
              fontSize={11}
            />
            <YAxis dataKey="d" unit="%" stroke="var(--muted-foreground)" fontSize={11} />
            <ReferenceLine y={5} stroke="var(--birch)" strokeDasharray="4 4" />
            <Tooltip
              contentStyle={tip}
              formatter={(v, n) =>
                n === "d"
                  ? [`${Number(v).toFixed(1)}%`, t("Drift", "Decoupling")]
                  : [format(Number(v), "d MMM"), t("Date", "Data")]
              }
            />
            <Scatter data={steady} fill="var(--fitness)" isAnimationActive={false} />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      <Button
        size="sm"
        variant="ghost"
        className="-ml-3 mt-2"
        onClick={() => setShow((v) => !v)}
        aria-expanded={show}
      >
        {show
          ? t(`Hide runs (${recent.length})`, `Nascondi corse (${recent.length})`)
          : t(`Show runs (${recent.length})`, `Mostra corse (${recent.length})`)}
        <ChevronDown className={cn("transition-transform", show && "rotate-180")} />
      </Button>
      {show && (
        <div className="-mx-3 mt-1 divide-y divide-border text-sm">
          {recent.map(({ r, d }) => (
            <Link
              key={r.a.id}
              to="/rides/$id"
              params={{ id: r.a.id }}
              className="stat-num flex justify-between gap-3 px-3 py-2 hover:bg-secondary"
            >
              <span className="truncate font-sans">
                {format(parseISO(r.a.start_date_local), "d MMM")} · {r.a.name}
              </span>
              <span className={d < 5 ? "text-pine" : "text-birch"}>{d.toFixed(1)}%</span>
            </Link>
          ))}
        </div>
      )}
    </Panel>
  );
}

const WINDOWS = [4, 8, 12] as const;

/** Time in pace or heart-rate zones. */
function RunZonesSection({ data }: { data: RunData }) {
  const { data: zones } = useQuery(rideZonesQuery("run"));
  const [weeks, setWeeks] = useState<(typeof WINDOWS)[number]>(4);
  const [kind, setKind] = useState<"pace" | "hr">("pace");
  const hrTops = useMemo(() => zones?.hr ?? [], [zones]);
  const secs = useMemo(() => {
    const out = Array(7).fill(0) as number[];
    for (const r of within(data.runs, weeks * 7)) {
      const z =
        kind === "pace"
          ? data.threshold
            ? paceZones(r.s, data.threshold, zoneTops().pace)
            : []
          : hrTops.length
            ? hrZones(r.s, hrTops)
            : [];
      z.forEach((s, i) => (out[i] = (out[i] ?? 0) + s));
    }
    return out;
  }, [data, weeks, kind, hrTops]);
  const f = threeZone(secs);
  const pi = f ? polarizationIndex(f) : null;
  const empty =
    kind === "pace"
      ? t(
          "No pace zones yet: set a threshold pace in Settings, or do a hard effort of 20 minutes.",
          "Ancora nessuna zona di passo: imposta il passo di soglia nelle Impostazioni, o fai uno sforzo duro di 20 minuti.",
        )
      : t(
          "No heart-rate zones: set a threshold heart rate, and run with a sensor.",
          "Nessuna zona di FC: imposta la FC di soglia e corri con un sensore.",
        );
  const toggle = "rounded-md px-3 py-1 text-xs";
  return (
    <Panel
      title={t("Intensity distribution", "Distribuzione dell'intensità")}
      action={
        <div className="flex flex-wrap justify-end gap-2">
          <div className="flex gap-1 rounded-lg bg-secondary p-1">
            {(["pace", "hr"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setKind(k)}
                className={cn(
                  toggle,
                  kind === k ? "bg-background text-foreground" : "text-muted-foreground",
                )}
              >
                {k === "pace" ? "GAP" : t("HR", "FC")}
              </button>
            ))}
          </div>
          <div className="flex gap-1 rounded-lg bg-secondary p-1">
            {WINDOWS.map((w) => (
              <button
                key={w}
                onClick={() => setWeeks(w)}
                className={cn(
                  "stat-num",
                  toggle,
                  weeks === w ? "bg-background text-foreground" : "text-muted-foreground",
                )}
              >
                {w}
                {t("w", "s")}
              </button>
            ))}
          </div>
        </div>
      }
    >
      <ZoneBar secs={secs} names={RUN_ZONE_NAMES} empty={empty} />
      {f && (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            label={t("Low (Z1–2)", "Bassa (Z1–2)")}
            value={Math.round(f.low * 100)}
            unit="%"
            tone="weight"
          />
          <StatCard
            label={t("Moderate (Z3)", "Moderata (Z3)")}
            value={Math.round(f.mid * 100)}
            unit="%"
            tone="form"
          />
          <StatCard
            label={t("High (Z4+)", "Alta (Z4+)")}
            value={Math.round(f.high * 100)}
            unit="%"
            tone="fatigue"
          />
          <StatCard
            label={t("Pattern", "Pattern")}
            value={
              <span className="font-sans text-lg leading-tight">
                {distributionLabel(f, t("Threshold", "Soglia"))}
              </span>
            }
            hint={
              pi != null
                ? `${t("polarization index", "indice di polarizzazione")} ${pi.toFixed(2)}`
                : undefined
            }
          />
        </div>
      )}
    </Panel>
  );
}
