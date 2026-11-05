import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { parseISO } from "date-fns";
import { ArrowLeft, ChevronDown } from "lucide-react";
import { Suspense, useMemo, useState } from "react";
import {
  Area,
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
import { BodySection, WellnessPlot } from "@/components/BodySection";
import { ZonesTab } from "@/components/analysis/ZonesTab";
import { FitnessSection } from "@/components/FitnessSection";
import { Panel, StatCard } from "@/components/StatCard";
import { Button } from "@/components/ui/button";
import { ZoneBar } from "@/components/ZoneBar";
import {
  curveFit,
  distributionLabel,
  DUR,
  mmp,
  omPD,
  polarizationIndex,
  threeZone,
  valueAt,
} from "@/lib/analysis";
import { BUCKETS, EFFORTS, durabilityVerdict } from "@/lib/durability";
import { isBodyPlot, isPlot, PLOT_LABEL, RUN_PLOTS, type Plot, type RunPlot } from "@/lib/plots";
import { DURABILITY_DAYS } from "@/lib/durability-data";
import type { PowerCurve } from "@/lib/intervals";
import {
  activitiesQuery,
  durabilityQuery,
  powerCurvesQuery,
  streamsQuery,
  wellnessQuery,
} from "@/lib/queries";
import { addDays, formatClock, isoDate } from "@/lib/training";
import { cn } from "@/lib/utils";
import { format, t } from "@/lib/i18n";
import { analysisBoth, isSport, mainSport, type MainSport } from "@/lib/sport";
import { RunAnalysis } from "@/components/analysis/RunAnalysis";

type AnalysisSearch = {
  sport?: MainSport;
  view?: "body" | "zones";
  zone?: number;
  plot?: Plot;
};

export const Route = createFileRoute("/analysis")({
  // ?view=body opens the Body view; ?sport= shows the other sport when Settings offers it.
  // ?view=zones the zones (?zone=2 picks one out); ?plot= one chart alone.
  validateSearch: (s: Record<string, unknown>): AnalysisSearch => ({
    ...(s["sport"] === "run" || s["sport"] === "ride" ? { sport: s["sport"] } : {}),
    ...(s["view"] === "body" || s["view"] === "zones" ? { view: s["view"] } : {}),
    ...(/^[1-7]$/.test(String(s["zone"] ?? "")) ? { zone: Number(s["zone"]) } : {}),
    ...(isPlot(s["plot"]) ? { plot: s["plot"] } : {}),
  }),
  head: () => ({ meta: [{ title: t("Analysis — Cirmolo", "Analisi — Cirmolo") }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(wellnessQuery(90)),
  component: Analysis,
});

const TICKS = [1, 5, 15, 60, 300, 1200, 3600, 10800];
const tip = { background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8 };

const durLabel = (s: number) =>
  s < 60 ? `${s}s` : s < 3600 ? `${Math.round(s / 60)}m` : `${s / 3600}h`;

/** A small two-way switch, for the page's view and for its sport. */
function Toggle<T extends string>({
  options,
  active,
  onPick,
}: {
  options: readonly (readonly [T, string])[];
  active: T;
  onPick: (v: T) => void;
}) {
  return (
    <div className="flex gap-1 rounded-lg bg-secondary p-1">
      {options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          aria-pressed={active === v}
          onClick={() => onPick(v)}
          className={cn(
            "rounded-md px-3 py-1 text-xs",
            active === v ? "bg-background text-foreground" : "text-muted-foreground",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function Analysis() {
  const both = analysisBoth();
  const { sport: chosen, view, zone, plot } = Route.useSearch();
  const body = view === "body";
  const zones = view === "zones";
  // Opens on the main sport; the toggle, when Settings offers it, shows the other one.
  const sport = both ? (chosen ?? mainSport()) : mainSport();
  const navigate = useNavigate({ from: Route.fullPath });
  const go = (search: AnalysisSearch) =>
    void navigate({ search, replace: true, resetScroll: false });
  if (plot) return <PlotPage plot={plot} sport={sport} />;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="eyebrow">
            {body
              ? t("Last 180 days", "Ultimi 180 giorni")
              : zones
                ? t("Your thresholds", "Le tue soglie")
                : t("Performance", "Performance")}
          </div>
          <h1 className="on-sky text-3xl font-bold tracking-tight">{t("Analysis", "Analisi")}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {both && !body && (
            <Toggle
              options={[
                ["ride", t("Cycling", "Ciclismo")],
                ["run", t("Running", "Corsa")],
              ]}
              active={sport}
              onPick={(s) => go({ sport: s, ...(zones ? { view: "zones" as const } : {}) })}
            />
          )}
          <Toggle
            options={[
              ["training", t("Training", "Allenamento")],
              ["body", t("Body", "Corpo")],
              ["zones", t("Zones", "Zone")],
            ]}
            active={body ? "body" : zones ? "zones" : "training"}
            onPick={(v) =>
              go({
                ...(chosen ? { sport: chosen } : {}),
                ...(v === "body" ? { view: "body" as const } : {}),
                ...(v === "zones" ? { view: "zones" as const } : {}),
              })
            }
          />
        </div>
      </div>
      {zones ? (
        <ZonesTab sport={sport} zone={zone} />
      ) : body ? (
        <Suspense
          fallback={
            <p className="py-10 text-center text-sm text-muted-foreground">
              {t("Loading…", "Caricamento…")}
            </p>
          }
        >
          <BodySection />
        </Suspense>
      ) : sport === "run" ? (
        <RunAnalysis />
      ) : (
        <>
          <FitnessSection />
          <PowerSection />
          <DurabilitySection />
          <EftpSection />
          <DecouplingSection />
          <ZonesSection />
        </>
      )}
    </div>
  );
}

/** One chart alone, for when that's all that was asked. */
function PlotPage({ plot, sport }: { plot: Plot; sport: MainSport }) {
  const loading = (
    <p className="py-10 text-center text-sm text-muted-foreground">
      {t("Loading…", "Caricamento…")}
    </p>
  );
  // A chart only one sport has is that sport's; the two they share follow the sport being looked at.
  const runOnly = (RUN_PLOTS as readonly Plot[]).includes(plot) && plot !== "fitness" && plot !== "zones";
  const asRun = runOnly || (sport === "run" && (plot === "fitness" || plot === "zones"));
  return (
    <div className="space-y-6">
      <div>
        <Link
          to="/analysis"
          search={sport !== mainSport() ? { sport } : {}}
          className="on-sky mb-2 inline-flex items-center gap-1 text-sm text-foreground/85 hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> {t("All of Analysis", "Tutta l'analisi")}
        </Link>
        <h1 className="on-sky text-3xl font-bold tracking-tight">{PLOT_LABEL[plot]()}</h1>
      </div>
      <Suspense fallback={loading}>
        {isBodyPlot(plot) ? (
          plot === "weight" || plot === "fat" ? (
            <BodySection only={plot} />
          ) : (
            <WellnessPlot kind={plot} />
          )
        ) : asRun ? (
          <RunAnalysis only={plot as RunPlot} />
        ) : plot === "fitness" ? (
          <FitnessSection />
        ) : plot === "power" ? (
          <PowerSection />
        ) : plot === "durability" ? (
          <DurabilitySection />
        ) : plot === "eftp" ? (
          <EftpSection />
        ) : plot === "decoupling" ? (
          <DecouplingSection />
        ) : (
          <ZonesSection />
        )}
      </Suspense>
    </div>
  );
}

function PowerSection() {
  const { data: curves, isLoading } = useQuery(powerCurvesQuery());
  const { data: acts } = useQuery(activitiesQuery(42));
  const rides = useMemo(
    () => (acts ?? []).filter((a) => isSport(a, "ride") && a.icu_average_watts != null),
    [acts],
  );
  const [rideId, setRideId] = useState<string | null>(null);
  // No ride compared until one is picked.
  const ride = rides.find((r) => r.id === rideId);
  const { data: streams } = useQuery({ ...streamsQuery(ride?.id ?? ""), enabled: !!ride });

  const c42 = curves?.find((c) => c.id.includes("42"));
  const c1y = curves?.find((c) => c.id.includes("1y") || c.id.includes("365"));
  const fit42 = useMemo(() => curveFit(c42), [c42]);
  const fit1y = useMemo(() => curveFit(c1y), [c1y]);
  const rideMmp = useMemo(() => (streams ? mmp(streams.watts, DUR) : null), [streams]);

  const rows = DUR.map((d, i) => {
    const model = !fit42
      ? null
      : fit42.omni
        ? omPD(fit42, d)
        : d >= 120 && d <= 3600
          ? fit42.cp + fit42.wPrime / d
          : null;
    return {
      secs: d,
      c42: valueAt(c42, d),
      c1y: valueAt(c1y, d),
      ride: rideMmp?.[i] ?? null,
      model,
      // What W′ adds on top of CP at this duration: the band between the CP line and the model.
      wband:
        fit42 && model != null && model > fit42.cp ? ([fit42.cp, model] as [number, number]) : null,
    };
  });

  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label={t("Critical power", "Potenza critica")}
          tone="fitness"
          value={fit42 ? Math.round(fit42.cp) : "–"}
          unit="W"
          hint={
            fit42?.omni
              ? t("42 days, whole curve (OmPD)", "42 giorni, curva intera (OmPD)")
              : t("42-day best, 3–20 min", "Migliore 42 giorni, 3–20 min")
          }
        />
        <StatCard
          label="W′"
          tone="form"
          value={fit42 ? (fit42.wPrime / 1000).toFixed(1) : "–"}
          unit="kJ"
          hint={fit42 ? `fit R² ${fit42.r2.toFixed(3)}` : undefined}
        />
        <StatCard
          label={t("Sprint power", "Potenza sprint")}
          value={fit42?.pmax != null ? Math.round(fit42.pmax) : "–"}
          unit="W"
          hint={
            fit42?.omni
              ? t(
                  `model 1 h: ${Math.round(omPD(fit42, 3600))} W`,
                  `modello 1 h: ${Math.round(omPD(fit42, 3600))} W`,
                )
              : undefined
          }
        />
        <StatCard
          label={t("CP, 1 year", "CP, 1 anno")}
          value={fit1y ? Math.round(fit1y.cp) : "–"}
          unit="W"
          hint={fit1y ? `W′ ${(fit1y.wPrime / 1000).toFixed(1)} kJ` : undefined}
        />
      </div>
      <Panel
        title={t("Power duration curve", "Curva potenza-durata")}
        action={
          rides.length > 0 && (
            <select
              aria-label={t("Compare ride", "Confronta uscita")}
              value={ride?.id ?? ""}
              onChange={(e) => setRideId(e.target.value || null)}
              className="h-8 max-w-[11rem] rounded-md border border-input bg-transparent px-2 text-xs"
            >
              <option value="" className="bg-popover">
                {t("Compare a ride…", "Confronta un'uscita…")}
              </option>
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
          <p className="py-10 text-center text-sm text-muted-foreground">
            {t("Loading power curves…", "Caricamento curve di potenza…")}
          </p>
        ) : (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={rows} margin={{ left: -12, right: 8, top: 8 }}>
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
                  formatter={(v, name) =>
                    Array.isArray(v)
                      ? [`+${Math.round(Number(v[1]) - Number(v[0]))} W`, t("W′ part", "Parte W′")]
                      : [`${Math.round(Number(v))} W`, name]
                  }
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {fit42 && (
                  <Area
                    name={t(
                      `W′ ${(fit42.wPrime / 1000).toFixed(1)} kJ (above CP)`,
                      `W′ ${(fit42.wPrime / 1000).toFixed(1)} kJ (sopra la CP)`,
                    )}
                    dataKey="wband"
                    fill="var(--birch)"
                    fillOpacity={0.18}
                    stroke="none"
                    connectNulls
                    isAnimationActive={false}
                  />
                )}
                {fit42 && (
                  <ReferenceLine
                    y={fit42.cp}
                    stroke="var(--lingon)"
                    strokeOpacity={0.7}
                    strokeDasharray="2 4"
                    label={{
                      value: `CP ${Math.round(fit42.cp)} W`,
                      position: "insideBottomRight",
                      fill: "var(--muted-foreground)",
                      fontSize: 11,
                    }}
                  />
                )}
                <Line
                  name={t("Best 1 year", "Migliore 1 anno")}
                  dataKey="c1y"
                  stroke="var(--z1)"
                  strokeWidth={1.5}
                  dot={false}
                  connectNulls
                  isAnimationActive={false}
                />
                <Line
                  name={t("Best 42 days", "Migliore 42 giorni")}
                  dataKey="c42"
                  stroke="var(--fitness)"
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                  isAnimationActive={false}
                />
                {rideMmp && (
                  <Line
                    name={t("Selected ride", "Uscita selezionata")}
                    dataKey="ride"
                    stroke="var(--pine)"
                    strokeWidth={1.5}
                    dot={false}
                    connectNulls
                    isAnimationActive={false}
                  />
                )}
                {fit42 && (
                  <Line
                    name={
                      fit42.omni ? t("OmPD model", "Modello OmPD") : t("CP model", "Modello CP")
                    }
                    dataKey="model"
                    stroke="var(--lingon)"
                    strokeDasharray="4 4"
                    strokeWidth={1.5}
                    dot={false}
                    connectNulls
                    isAnimationActive={false}
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
        {fit42 && !isLoading && (
          <p className="mt-2 text-xs text-muted-foreground">
            {t(
              "Shaded: what W′ adds on top of CP. Short efforts lean on it, long ones are mostly CP.",
              "Area ombreggiata: quanto W′ aggiunge sopra la CP. Gli sforzi brevi dipendono da W′, quelli lunghi quasi solo dalla CP.",
            )}
          </p>
        )}
      </Panel>
    </>
  );
}

const EFFORT_LABEL = (s: number) => `${s / 60} min`;

/** Power left after hours of work: best 1/5/20 min after 15, 30 and 45 kJ/kg, against fresh. */
function DurabilitySection() {
  const { data, isLoading, isError } = useQuery(durabilityQuery());
  const verdict = data ? durabilityVerdict(data) : null;
  const VERDICT = {
    strong: {
      text: t(
        "Holds power well late in long rides.",
        "Tieni bene la potenza nel finale delle uscite lunghe.",
      ),
      tone: "text-pine",
    },
    average: {
      text: t(
        "Loses some power late in long rides.",
        "Perdi un po' di potenza nel finale delle uscite lunghe.",
      ),
      tone: "text-fitness",
    },
    fades: {
      text: t(
        "Fades late in long rides: long Z2 rides and fuelling build durability.",
        "Cali nel finale delle uscite lunghe: fondo lungo in Z2 e alimentazione costruiscono la durability.",
      ),
      tone: "text-birch",
    },
  } as const;
  return (
    <Panel
      title={t(
        `Durability · rides ≥ 2 h, last ${DURABILITY_DAYS} days`,
        `Durability · uscite ≥ 2 h, ultimi ${DURABILITY_DAYS} giorni`,
      )}
    >
      {isLoading ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {t("Reading the power of your long rides…", "Lettura della potenza delle uscite lunghe…")}
        </p>
      ) : isError || !data ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {t("Couldn't load the rides.", "Impossibile caricare le uscite.")}
        </p>
      ) : data.rides === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {data.missingWeight
            ? t(
                "Log your weight on the Body page: durability is measured per kg.",
                "Registra il peso nella pagina Corpo: la durability si misura per kg.",
              )
            : t(
                "No ride of 2 hours or more with power yet.",
                "Ancora nessuna uscita di almeno 2 ore con potenza.",
              )}
        </p>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {t(
              `Your best power once you'd already done 15, 30 or 45 kJ per kg of work, from ${data.rides} ${data.rides === 1 ? "ride" : "rides"}. The smaller the drop from fresh, the more you have left for the finale.`,
              `La tua potenza migliore dopo aver già svolto 15, 30 o 45 kJ per kg di lavoro, su ${data.rides} ${data.rides === 1 ? "uscita" : "uscite"}. Meno cala rispetto a fresco, più ne hai per il finale.`,
            )}
          </p>
          {/* Fits a phone without scrolling: short column heads, the drop under each value. */}
          <table className="stat-num w-full table-fixed text-sm">
            <thead>
              <tr className="text-[11px] text-muted-foreground">
                <th className="w-14 font-normal" />
                <th className="font-normal" />
                <th colSpan={3} className="pb-0.5 text-center font-sans font-normal">
                  {t("kJ/kg already done", "kJ/kg già svolti")}
                </th>
              </tr>
              <tr className="text-xs text-muted-foreground">
                <th className="py-1 text-left font-normal" />
                {BUCKETS.map((b) => (
                  <th key={b} className="py-1 text-right font-normal">
                    {b ? b : t("Fresh", "Fresco")}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {EFFORTS.map((e, k) => (
                <tr key={e} className="border-t border-border align-top">
                  <td className="py-2 font-sans text-muted-foreground">{EFFORT_LABEL(e)}</td>
                  {BUCKETS.map((b) => {
                    const w = data.best[b][k];
                    const d = data.drop[b][k];
                    return (
                      <td key={b} className="py-2 text-right leading-tight">
                        <div>
                          {w != null ? Math.round(w) : "–"}
                          {w != null && <span className="text-xs text-muted-foreground"> W</span>}
                        </div>
                        {b > 0 && d != null && (
                          <div
                            className={cn(
                              "text-xs",
                              d < 5 ? "text-pine" : d <= 10 ? "text-fitness" : "text-birch",
                            )}
                          >
                            {d > 0 ? "−" : "+"}
                            {Math.abs(d).toFixed(0)}%
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {verdict && (
            <p className={cn("text-sm font-medium", VERDICT[verdict].tone)}>
              {VERDICT[verdict].text}
            </p>
          )}
          {data.missingWeight > 0 && (
            <p className="text-xs text-muted-foreground">
              {t(
                `${data.missingWeight} ${data.missingWeight === 1 ? "ride" : "rides"} skipped: no weight logged before ${data.missingWeight === 1 ? "it" : "them"}.`,
                `${data.missingWeight} ${data.missingWeight === 1 ? "uscita esclusa" : "uscite escluse"}: nessun peso registrato prima.`,
              )}
            </p>
          )}
        </div>
      )}
    </Panel>
  );
}

function EftpSection() {
  const { data } = useQuery(wellnessQuery(365));
  const series = useMemo(
    () =>
      (data ?? [])
        .filter((w) => w.eftp != null)
        .map((w) => ({ date: w.id, eftp: Math.round(w.eftp!) })),
    [data],
  );
  // One tick per month (first data point in it), so labels don't repeat.
  const ticks = useMemo(
    () =>
      series
        .filter((p, i) => i === 0 || p.date.slice(0, 7) !== series[i - 1]!.date.slice(0, 7))
        .map((p) => p.date),
    [series],
  );
  if (series.length < 2) return null;
  const latest = series.at(-1)!;
  const yearAgo = series[0]!;
  return (
    <Panel
      title={`eFTP · ${latest.eftp} W (${latest.eftp - yearAgo.eftp >= 0 ? "+" : ""}${latest.eftp - yearAgo.eftp} W ${t("in a year", "in un anno")})`}
    >
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={series} margin={{ left: -16, right: 8, top: 8 }}>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="date"
              ticks={ticks}
              tickFormatter={(d: string) => format(parseISO(d), "MMM")}
              stroke="var(--muted-foreground)"
              fontSize={11}
              minTickGap={16}
            />
            <YAxis
              domain={["dataMin - 10", "dataMax + 10"]}
              stroke="var(--muted-foreground)"
              fontSize={11}
            />
            <Tooltip
              contentStyle={tip}
              labelFormatter={(d) => format(parseISO(String(d)), "d MMM yyyy")}
              formatter={(v) => [`${v} W`, "eFTP"]}
            />
            <Line
              type="stepAfter"
              dataKey="eftp"
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

function DecouplingSection() {
  const { data } = useQuery(activitiesQuery(180));
  // The rides behind the average stay folded away until asked for.
  const [showRides, setShowRides] = useState(false);
  const steady = useMemo(
    () =>
      (data ?? [])
        .filter(
          (a) =>
            isSport(a, "ride") &&
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
    <Panel
      title={t(
        "Aerobic decoupling (Pw:HR) · steady rides ≥ 1 h",
        "Decoupling (Pw:HR) · uscite regolari ≥ 1 h",
      )}
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
              tickFormatter={(t: number) => format(t, "d MMM")}
              stroke="var(--muted-foreground)"
              fontSize={11}
            />
            <YAxis dataKey="d" unit="%" stroke="var(--muted-foreground)" fontSize={11} />
            <ReferenceLine y={5} stroke="var(--birch)" strokeDasharray="4 4" />
            <Tooltip
              contentStyle={tip}
              formatter={(v, n) =>
                n === "d"
                  ? [`${Number(v).toFixed(1)}%`, t("Decoupling", "Decoupling")]
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
        onClick={() => setShowRides((v) => !v)}
        aria-expanded={showRides}
      >
        {showRides
          ? t(`Hide rides (${recent.length})`, `Nascondi uscite (${recent.length})`)
          : t(`Show rides (${recent.length})`, `Mostra uscite (${recent.length})`)}
        <ChevronDown className={cn("transition-transform", showRides && "rotate-180")} />
      </Button>
      {showRides && (
        <div className="-mx-3 mt-1 divide-y divide-border text-sm">
          {recent.map((a) => (
            <Link
              key={a.id}
              to="/rides/$id"
              params={{ id: a.id }}
              className="stat-num flex justify-between gap-3 px-3 py-2 hover:bg-secondary"
            >
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
    for (const a of data ?? [])
      if (isSport(a, "ride") && a.start_date_local.slice(0, 10) >= from)
        a.zoneTimes.forEach((s, i) => (z[i] = (z[i] ?? 0) + s));
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
              className={cn(
                "stat-num rounded-md px-3 py-1 text-xs",
                weeks === w ? "bg-background text-foreground" : "text-muted-foreground",
              )}
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
            value={<span className="font-sans text-lg leading-tight">{distributionLabel(f)}</span>}
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
