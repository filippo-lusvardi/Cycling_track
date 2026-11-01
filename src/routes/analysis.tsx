import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { parseISO } from "date-fns";
import { ChevronDown } from "lucide-react";
import { useMemo, useState } from "react";
import {
  CartesianGrid,
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
import { distributionLabel, fitCriticalPower, mmp, polarizationIndex, threeZone } from "@/lib/analysis";
import type { PowerCurve } from "@/lib/intervals";
import { activitiesQuery, powerCurvesQuery, streamsQuery, wellnessQuery } from "@/lib/queries";
import { addDays, formatClock, isoDate } from "@/lib/training";
import { cn } from "@/lib/utils";
import { format, t } from "@/lib/i18n";

export const Route = createFileRoute("/analysis")({
  head: () => ({ meta: [{ title: t("Analysis — Cirmolo", "Analisi — Cirmolo") }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(wellnessQuery(90)),
  component: Analysis,
});

const DUR = [1, 2, 3, 5, 8, 10, 15, 20, 30, 45, 60, 90, 120, 180, 240, 300, 420, 600, 900, 1200, 1800, 2400, 3600, 5400, 7200, 10800];
const TICKS = [1, 5, 15, 60, 300, 1200, 3600, 10800];
const tip = { background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8 };

const durLabel = (s: number) => (s < 60 ? `${s}s` : s < 3600 ? `${Math.round(s / 60)}m` : `${s / 3600}h`);

/** Watts at duration d on an intervals.icu curve (exact or next longer duration). */
function valueAt(c: PowerCurve | undefined, d: number): number | null {
  if (!c) return null;
  const i = c.secs.findIndex((s) => s >= d);
  return i >= 0 && c.watts[i] ? c.watts[i]! : null;
}

function Analysis() {
  return (
    <div className="space-y-6">
      <div>
        <div className="eyebrow">{t("Performance", "Prestazione")}</div>
        <h1 className="text-3xl font-bold tracking-tight">{t("Analysis", "Analisi")}</h1>
      </div>
      <FitnessSection />
      <PowerSection />
      <EftpSection />
      <DecouplingSection />
      <ZonesSection />
    </div>
  );
}

function PowerSection() {
  const { data: curves, isLoading } = useQuery(powerCurvesQuery());
  const { data: acts } = useQuery(activitiesQuery(42));
  const rides = useMemo(() => (acts ?? []).filter((a) => a.icu_average_watts != null), [acts]);
  const [rideId, setRideId] = useState<string | null>(null);
  const ride = rides.find((r) => r.id === rideId) ?? rides[0];
  const { data: streams } = useQuery({ ...streamsQuery(ride?.id ?? ""), enabled: !!ride });

  const c42 = curves?.find((c) => c.id.includes("42"));
  const c1y = curves?.find((c) => c.id.includes("1y") || c.id.includes("365"));
  const fit42 = useMemo(() => fitCriticalPower(DUR.map((d) => ({ secs: d, watts: valueAt(c42, d) ?? 0 }))), [c42]);
  const fit1y = useMemo(() => fitCriticalPower(DUR.map((d) => ({ secs: d, watts: valueAt(c1y, d) ?? 0 }))), [c1y]);
  const rideMmp = useMemo(() => (streams ? mmp(streams.watts, DUR) : null), [streams]);

  const rows = DUR.map((d, i) => ({
    secs: d,
    c42: valueAt(c42, d),
    c1y: valueAt(c1y, d),
    ride: rideMmp?.[i] ?? null,
    model: fit42 && d >= 120 && d <= 3600 ? fit42.cp + fit42.wPrime / d : null,
  }));

  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label={t("Critical power", "Potenza critica")} tone="fitness" value={fit42 ? Math.round(fit42.cp) : "–"} unit="W" hint={t("42-day best, 3–20 min", "Migliore 42 giorni, 3–20 min")} />
        <StatCard label="W′" tone="form" value={fit42 ? (fit42.wPrime / 1000).toFixed(1) : "–"} unit="kJ" hint={fit42 ? `fit R² ${fit42.r2.toFixed(3)}` : undefined} />
        <StatCard label={t("CP, 1 year", "CP, 1 anno")} value={fit1y ? Math.round(fit1y.cp) : "–"} unit="W" hint={fit1y ? `W′ ${(fit1y.wPrime / 1000).toFixed(1)} kJ` : undefined} />
        <StatCard label={t("20 min best", "Migliore 20 min")} value={valueAt(c42, 1200) ?? "–"} unit="W" hint={t("last 42 days", "ultimi 42 giorni")} />
      </div>
      <Panel
        title={t("Power duration curve", "Curva potenza-durata")}
        action={
          rides.length > 0 && (
            <select
              aria-label={t("Compare ride", "Confronta attività")}
              value={ride?.id ?? ""}
              onChange={(e) => setRideId(e.target.value)}
              className="h-8 max-w-[11rem] rounded-md border border-input bg-transparent px-2 text-xs"
            >
              {rides.map((r) => (
                <option key={r.id} value={r.id} className="bg-popover">
                  {format(parseISO(r.start_date_local), "d MMM")} · {r.name}
                </option>
              ))}
            </select>
          )
        }
      >
        {isLoading ? (
          <p className="py-10 text-center text-sm text-muted-foreground">{t("Loading power curves…", "Caricamento curve di potenza…")}</p>
        ) : (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={rows} margin={{ left: -12, right: 8, top: 8 }}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="secs"
                  type="number"
                  scale="log"
                  domain={[1, 10800]}
                  ticks={TICKS}
                  tickFormatter={durLabel}
                  stroke="var(--muted-foreground)"
                  fontSize={11}
                  allowDataOverflow
                />
                <YAxis stroke="var(--muted-foreground)" fontSize={11} />
                <Tooltip
                  contentStyle={tip}
                  labelFormatter={(s) => formatClock(Number(s))}
                  formatter={(v, name) => [`${Math.round(Number(v))} W`, name]}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line name={t("Best 1 year", "Migliore 1 anno")} dataKey="c1y" stroke="var(--z1)" strokeWidth={1.5} dot={false} connectNulls isAnimationActive={false} />
                <Line name={t("Best 42 days", "Migliore 42 giorni")} dataKey="c42" stroke="var(--fitness)" strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
                {rideMmp && <Line name={t("Selected ride", "Attività selezionata")} dataKey="ride" stroke="var(--form)" strokeWidth={1.5} dot={false} connectNulls isAnimationActive={false} />}
                {fit42 && (
                  <Line name={t("CP model", "Modello CP")} dataKey="model" stroke="var(--lingon)" strokeDasharray="4 4" strokeWidth={1.5} dot={false} connectNulls isAnimationActive={false} />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </Panel>
    </>
  );
}

function EftpSection() {
  const { data } = useQuery(wellnessQuery(365));
  const series = useMemo(() => (data ?? []).filter((w) => w.eftp != null).map((w) => ({ date: w.id, eftp: Math.round(w.eftp!) })), [data]);
  // One tick per month (first data point in it), so labels don't repeat.
  const ticks = useMemo(() => series.filter((p, i) => i === 0 || p.date.slice(0, 7) !== series[i - 1]!.date.slice(0, 7)).map((p) => p.date), [series]);
  if (series.length < 2) return null;
  const latest = series.at(-1)!;
  const yearAgo = series[0]!;
  return (
    <Panel title={`eFTP · ${latest.eftp} W (${latest.eftp - yearAgo.eftp >= 0 ? "+" : ""}${latest.eftp - yearAgo.eftp} W ${t("in a year", "in un anno")})`}>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={series} margin={{ left: -16, right: 8, top: 8 }}>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis dataKey="date" ticks={ticks} tickFormatter={(d: string) => format(parseISO(d), "MMM")} stroke="var(--muted-foreground)" fontSize={11} minTickGap={16} />
            <YAxis domain={["dataMin - 10", "dataMax + 10"]} stroke="var(--muted-foreground)" fontSize={11} />
            <Tooltip contentStyle={tip} labelFormatter={(d) => format(parseISO(String(d)), "d MMM yyyy")} formatter={(v) => [`${v} W`, "eFTP"]} />
            <Line type="stepAfter" dataKey="eftp" stroke="var(--fitness)" strokeWidth={2} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Panel>
  );
}

function DecouplingSection() {
  const { data } = useQuery(activitiesQuery(180));
  // The rides behind the average stay folded away until asked for.
  const [showRides, setShowRides] = useState(false);
  const steady = useMemo(
    () =>
      (data ?? [])
        .filter(
          (a) =>
            (a.type ?? "").includes("Ride") &&
            (a.moving_time ?? 0) >= 3600 &&
            a.icu_intensity != null &&
            a.icu_intensity < 80 &&
            a.decoupling != null,
        )
        .map((a) => ({ ...a, t: parseISO(a.start_date_local).getTime(), d: a.decoupling! })),
    [data],
  );
  if (!steady.length) return null;
  const recent = steady.slice(0, 8);
  const avg = recent.reduce((s, a) => s + a.d, 0) / recent.length;
  return (
    <Panel title={t("Aerobic decoupling (Pw:HR) · steady rides ≥ 1 h", "Disaccoppiamento aerobico (Pw:FC) · attività regolari ≥ 1 h")}>
      <p className="mb-3 text-sm text-muted-foreground">
        {t(`Average of the last ${recent.length}:`, `Media delle ultime ${recent.length}:`)}{" "}
        <span className={cn("stat-num font-semibold", avg < 5 ? "text-pine" : "text-birch")}>{avg.toFixed(1)}%</span>{" "}
        {avg < 5
          ? t("is under 5%: solid aerobic base.", "è sotto il 5%: base aerobica solida.")
          : t("is over 5%: endurance has room to build.", "è sopra il 5%: il fondo ha margine di crescita.")}
      </p>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ left: -16, right: 8, top: 8 }}>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} tickFormatter={(t: number) => format(t, "d MMM")} stroke="var(--muted-foreground)" fontSize={11} />
            <YAxis dataKey="d" unit="%" stroke="var(--muted-foreground)" fontSize={11} />
            <ReferenceLine y={5} stroke="var(--birch)" strokeDasharray="4 4" />
            <Tooltip contentStyle={tip} formatter={(v, n) => (n === "d" ? [`${Number(v).toFixed(1)}%`, t("Decoupling", "Disaccoppiamento")] : [format(Number(v), "d MMM"), t("Date", "Data")])} />
            <Scatter data={steady} fill="var(--fitness)" isAnimationActive={false} />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      <Button
        size="sm"
        variant="ghost"
        className="-ml-3 mt-2"
        onClick={() => setShowRides((v) => !v)}
        aria-expanded={showRides}
      >
        {showRides
          ? t(`Hide the ${recent.length} rides`, `Nascondi le ${recent.length} attività`)
          : t(`Show the ${recent.length} rides`, `Mostra le ${recent.length} attività`)}
        <ChevronDown className={cn("transition-transform", showRides && "rotate-180")} />
      </Button>
      {showRides && (
      <div className="-mx-3 mt-1 divide-y divide-border text-sm">
        {recent.map((a) => (
          <Link key={a.id} to="/rides/$id" params={{ id: a.id }} className="stat-num flex justify-between gap-3 px-3 py-2 hover:bg-secondary">
            <span className="truncate font-sans">
              {format(parseISO(a.start_date_local), "d MMM")} · {a.name}
            </span>
            <span className={a.d < 5 ? "text-pine" : "text-birch"}>{a.d.toFixed(1)}%</span>
          </Link>
        ))}
      </div>
      )}
    </Panel>
  );
}

const WINDOWS = [4, 8, 12] as const;

function ZonesSection() {
  const { data } = useQuery(activitiesQuery(84));
  const [weeks, setWeeks] = useState<(typeof WINDOWS)[number]>(4);
  const zones = useMemo(() => {
    const from = addDays(isoDate(new Date()), -weeks * 7);
    const z = Array(7).fill(0) as number[];
    for (const a of data ?? []) if (a.start_date_local.slice(0, 10) >= from) a.zoneTimes.forEach((s, i) => (z[i] = (z[i] ?? 0) + s));
    return z;
  }, [data, weeks]);
  const f = threeZone(zones);
  const pi = f ? polarizationIndex(f) : null;

  return (
    <Panel
      title={t("Intensity distribution", "Distribuzione dell'intensità")}
      action={
        <div className="flex gap-1 rounded-lg bg-secondary p-1">
          {WINDOWS.map((w) => (
            <button
              key={w}
              onClick={() => setWeeks(w)}
              className={cn("stat-num rounded-md px-3 py-1 text-xs", weeks === w ? "bg-background text-foreground" : "text-muted-foreground")}
            >
              {w}
              {t("w", "s")}
            </button>
          ))}
        </div>
      }
    >
      <ZoneBar secs={zones} />
      {f && (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label={t("Low (Z1–2)", "Bassa (Z1–2)")} value={Math.round(f.low * 100)} unit="%" tone="weight" />
          <StatCard label={t("Moderate (Z3)", "Moderata (Z3)")} value={Math.round(f.mid * 100)} unit="%" tone="form" />
          <StatCard label={t("High (Z4+)", "Alta (Z4+)")} value={Math.round(f.high * 100)} unit="%" tone="fatigue" />
          <StatCard label={t("Pattern", "Modello")} value={<span className="font-sans text-lg leading-tight">{distributionLabel(f)}</span>} hint={pi != null ? `${t("polarization index", "indice di polarizzazione")} ${pi.toFixed(2)}` : undefined} />
        </div>
      )}
    </Panel>
  );
}
