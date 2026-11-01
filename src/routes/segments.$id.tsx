import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { parseISO } from "date-fns";
import { ArrowLeft, Pencil, Star, Swords, Trash2, Trophy } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { effortKey, GhostRace } from "@/components/GhostRace";
import { GradientProfile, gradientLines } from "@/components/GradientProfile";
import { RouteMap } from "@/components/RouteMap";
import { Panel, StatCard } from "@/components/StatCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSegmentNames } from "@/hooks/use-segment-names";
import { useSegmentLibrary } from "@/hooks/use-segments";
import { wellnessRangeQuery } from "@/lib/queries";
import { gradeChunks, maxGrade } from "@/lib/profile";
import { historyYears } from "@/lib/segment-app";
import { segmentSummary } from "@/lib/segments";
import { formatClock, isoDate, weightOn } from "@/lib/training";
import { cn } from "@/lib/utils";
import { format, t } from "@/lib/i18n";

export const Route = createFileRoute("/segments/$id")({
  head: () => ({ meta: [{ title: t("Segment — Cirmolo", "Segmento — Cirmolo") }] }),
  component: SegmentPage,
});

const r = (n: number | null | undefined, suffix = "") =>
  n != null ? `${Math.round(n)}${suffix}` : "–";

function SegmentPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const lib = useSegmentLibrary();
  const nameOf = useSegmentNames(lib.list);
  const seg = lib.list.find((s) => s.id === id);
  const isLoading = !seg && lib.status.phase !== "idle";
  const [metric, setMetric] = useState<"time" | "watts">("time");
  const [editing, setEditing] = useState<string | null>(null);

  // Efforts come from the on-device index: no ride is re-read to open this page.
  const attempts = seg ? lib.efforts[seg.effortsKey]?.attempts : undefined;
  const oldest = attempts
    ?.reduce((m, a) => (a.date < m ? a.date : m), isoDate(new Date()))
    .slice(0, 10);
  const { data: wellness } = useQuery({
    ...wellnessRangeQuery({ oldest: oldest ?? isoDate(new Date()), newest: isoDate(new Date()) }),
    enabled: !!oldest,
  });
  const efforts = useMemo(
    () =>
      (attempts ?? [])
        .map((a) => {
          const kg = wellness ? weightOn(wellness, a.date) : null;
          return { ...a, wkg: a.avgWatts && kg ? a.avgWatts / kg : null };
        })
        .sort((a, b) => a.duration - b.duration),
    [attempts, wellness],
  );
  // Path and profile of the fastest effort (or of the climb itself while efforts are being computed).
  const trace = seg?.trace ?? null;
  const [hover, setHover] = useState<number | null>(null);
  // Ghost race: A vs B (effort keys); `n` restarts the race when a new pair is picked from the table.
  const [race, setRace] = useState<{ a: string; b: string; n: number } | null>(null);
  const routeRef = useRef<HTMLDivElement>(null);
  const startRace = (b?: string) => {
    if (efforts.length < 2) return;
    const pr = effortKey(efforts[0]!);
    const latest = [...efforts].sort((x, y) => y.date.localeCompare(x.date))[0]!;
    const fallback = effortKey(latest) === pr ? effortKey(efforts[1]!) : effortKey(latest);
    setRace({ a: pr, b: b ?? fallback, n: Date.now() });
    routeRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const lines = useMemo(() => (trace ? gradientLines(trace) : []), [trace]);
  const pins = useMemo(
    () =>
      trace
        ? [
            { lat: trace.lat[0]!, lng: trace.lng[0]!, color: "var(--pine)", label: t("Start", "Partenza") },
            {
              lat: trace.lat.at(-1)!,
              lng: trace.lng.at(-1)!,
              color: "var(--lingon)",
              label: t("Finish", "Arrivo"),
            },
          ]
        : [],
    [trace],
  );
  const steepest = useMemo(
    () => (trace ? maxGrade(gradeChunks(trace.dist, trace.alt)) : null),
    [trace],
  );
  const trend = useMemo(
    () =>
      [...efforts]
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((e) => ({ date: e.date.slice(0, 10), time: e.duration / 60, watts: e.avgWatts })),
    [efforts],
  );

  if (!seg)
    return (
      <div className="space-y-4">
        <BackLink />
        <p className="text-sm text-muted-foreground">
          {isLoading ? t("Loading rides…", "Caricamento attività…") : t("This segment no longer exists.", "Questo segmento non esiste più.")}
        </p>
      </div>
    );

  const best = efforts[0];

  return (
    <div className="space-y-6">
      <BackLink />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="eyebrow">
            {seg.saved
              ? seg.source === "custom"
                ? t("Manual segment", "Segmento manuale")
                : t("Saved climb", "Salita salvata")
              : t("Auto-detected climb", "Salita rilevata automaticamente")}
            {seg.renamed ? t(" · your name", " · nome tuo") : ""}
          </div>
          {editing != null ? (
            <form
              className="mt-1 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (editing.trim() || seg.renamed) lib.rename(seg, editing);
                setEditing(null);
              }}
            >
              <Input
                autoFocus
                value={editing}
                onChange={(e) => setEditing(e.target.value)}
                placeholder={t("Empty = automatic name from the map", "Vuoto = nome automatico dalla mappa")}
              />
              <Button type="submit">{t("Save", "Salva")}</Button>
            </form>
          ) : (
            <h1 className="text-3xl font-bold tracking-tight">{nameOf(seg)}</h1>
          )}
          <div className="stat-num mt-1 text-sm text-muted-foreground">{segmentSummary(seg)}</div>
        </div>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label={seg.starred ? t("Unstar", "Togli dai preferiti") : t("Star", "Aggiungi ai preferiti")}
            onClick={() => lib.toggleStar(seg)}
          >
            <Star className={cn(seg.starred ? "fill-birch text-birch" : "text-muted-foreground")} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("Rename", "Rinomina")}
            onClick={() => setEditing(seg.renamed ? seg.name : "")}
          >
            <Pencil />
          </Button>
          {seg.saved && (
            <Button
              variant="ghost"
              size="icon"
              aria-label={t("Delete", "Elimina")}
              onClick={() => {
                lib.remove(seg);
                navigate({ to: "/segments" });
              }}
            >
              <Trash2 />
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label={t("Length", "Lunghezza")} value={(seg.length / 1000).toFixed(2)} unit="km" />
        <StatCard
          label={t("Avg grade", "Pendenza media")}
          value={seg.grade != null ? seg.grade.toFixed(1) : "–"}
          unit="%"
          hint={steepest != null ? t(`max ${steepest.toFixed(1)}% over 100 m`, `max ${steepest.toFixed(1)}% su 100 m`) : undefined}
        />
        <StatCard
          label={t("Best time", "Miglior tempo")}
          tone="form"
          value={best ? formatClock(best.duration) : "–"}
          hint={best ? format(parseISO(best.date), "d MMM yyyy") : undefined}
        />
        <StatCard
          label={t("Efforts", "Passaggi")}
          value={efforts.length}
          hint={
            historyYears()
              ? historyYears() > 1
                ? t(`last ${historyYears()} years`, `ultimi ${historyYears()} anni`)
                : t("last year", "ultimo anno")
              : t("all history", "tutto lo storico")
          }
        />
      </div>

      {trace && (
        <div ref={routeRef} className="scroll-mt-20">
          <Panel
            title={`${t("Route", "Percorso")} · ${Math.round(seg.gain ?? 0)} ${t("m up", "m D+")} · ${Math.round(trace.alt[0]!)} → ${Math.round(trace.alt.at(-1)!)} m`}
            action={
              !race && efforts.length > 1 ? (
                <Button size="sm" variant="secondary" onClick={() => startRace()}>
                  <Swords /> {t("Race", "Sfida")}
                </Button>
              ) : undefined
            }
          >
            {race ? (
              <GhostRace
                key={race.n}
                efforts={efforts}
                initialA={race.a}
                initialB={race.b}
                trace={trace}
                lines={lines}
                pins={pins}
                onClose={() => setRace(null)}
              />
            ) : (
              <div className="space-y-4">
                <RouteMap
                  fitKey={seg.id}
                  lines={lines}
                  pins={pins}
                  cursor={hover != null ? { lat: trace.lat[hover]!, lng: trace.lng[hover]! } : null}
                />
                <GradientProfile
                  dist={trace.dist}
                  alt={trace.alt}
                  hover={hover}
                  onHover={setHover}
                />
              </div>
            )}
          </Panel>
        </div>
      )}

      {trend.length > 1 && (
        <Panel
          title={t("Progression", "Progressione")}
          action={
            <div className="flex gap-1 rounded-lg bg-secondary p-1">
              {(["time", "watts"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMetric(m)}
                  className={cn(
                    "rounded-md px-3 py-1 text-xs",
                    metric === m ? "bg-background text-foreground" : "text-muted-foreground",
                  )}
                >
                  {m === "time" ? t("Time", "Tempo") : t("Power", "Potenza")}
                </button>
              ))}
            </div>
          }
        >
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend} margin={{ left: -16, right: 8, top: 8 }}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={(d: string) => format(parseISO(d), "d MMM")}
                  stroke="var(--muted-foreground)"
                  fontSize={11}
                  minTickGap={30}
                />
                <YAxis
                  stroke="var(--muted-foreground)"
                  fontSize={11}
                  reversed={metric === "time"}
                  domain={["auto", "auto"]}
                  tickFormatter={(v: number) =>
                    metric === "time" ? formatClock(v * 60) : `${Math.round(v)}`
                  }
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--popover)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                  }}
                  labelFormatter={(d) => format(parseISO(String(d)), "EEE d MMM yyyy")}
                  formatter={(v) =>
                    metric === "time"
                      ? [formatClock(Number(v) * 60), t("Time", "Tempo")]
                      : [`${Math.round(Number(v))} W`, t("Power", "Potenza")]
                  }
                />
                <Line
                  type="monotone"
                  dataKey={metric}
                  stroke={metric === "time" ? "var(--form)" : "var(--fitness)"}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  connectNulls
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          {metric === "time" && (
            <p className="mt-1 text-xs text-muted-foreground">{t("Faster is higher.", "Più in alto = più veloce.")}</p>
          )}
        </Panel>
      )}

      <Panel title={t("All efforts", "Tutti i passaggi")}>
        {isLoading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{t("Loading rides…", "Caricamento attività…")}</p>
        ) : efforts.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {t("No efforts found in the analysed rides.", "Nessun passaggio trovato nelle attività analizzate.")}
          </p>
        ) : (
          <>
            {/* Phone: one compact row per effort instead of a table wider than the screen. */}
            <div className="-mx-4 divide-y divide-border md:hidden">
              {efforts.map((e, i) => {
                // Two short lines that fit a phone: effort (power, heart rate), then pace (VAM, speed).
                const effort = [
                  e.avgWatts != null && `${Math.round(e.avgWatts)} W`,
                  e.avgHr != null && `${Math.round(e.avgHr)} bpm`,
                ].filter(Boolean);
                const pace = [
                  e.vam != null && `VAM ${Math.round(e.vam)}`,
                  `${e.speed.toFixed(1)} km/h`,
                ].filter(Boolean);
                return (
                  <div key={`${e.trackId}-${i}`} className="flex items-center gap-1 pr-2">
                    <Link
                      to="/rides/$id"
                      params={{ id: e.trackId }}
                      className="flex min-w-0 flex-1 items-center gap-3 py-3 pl-4 active:bg-secondary/40"
                    >
                      <span className="stat-num w-5 shrink-0 text-sm text-muted-foreground">
                        {i + 1}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2 text-sm">
                          {format(parseISO(e.date), "d MMM yyyy")}
                          {i === 0 && (
                            <span className="inline-flex items-center gap-1 rounded bg-birch px-1.5 py-0.5 text-[10px] font-semibold text-background">
                              <Trophy className="h-3 w-3" /> PR
                            </span>
                          )}
                        </span>
                        {effort.length > 0 && (
                          <span className="stat-num block text-xs text-muted-foreground">
                            {effort.join(" · ")}
                          </span>
                        )}
                        <span className="stat-num block text-xs text-muted-foreground">
                          {pace.join(" · ")}
                        </span>
                      </span>
                      <span className="stat-num shrink-0 text-right">
                        <span className="block text-base font-semibold">
                          {formatClock(e.duration)}
                        </span>
                        {i > 0 && (
                          <span className="block text-xs text-muted-foreground">
                            +{formatClock(e.duration - efforts[0]!.duration)}
                          </span>
                        )}
                      </span>
                    </Link>
                    {i > 0 ? (
                      <button
                        aria-label={t("Race against the PR", "Sfida il PR")}
                        onClick={() => startRace(effortKey(e))}
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground active:bg-secondary/60"
                      >
                        <Swords className="h-5 w-5" />
                      </button>
                    ) : (
                      <span className="w-11 shrink-0" />
                    )}
                  </div>
                );
              })}
            </div>
            <div className="-mx-4 hidden overflow-x-auto px-4 md:block">
              <table className="stat-num w-full min-w-[660px] text-sm">
                <thead>
                  <tr className="eyebrow text-left">
                    <th className="py-2 font-normal">#</th>
                    <th className="font-normal">{t("Date", "Data")}</th>
                    <th className="text-right font-normal">{t("Time", "Tempo")}</th>
                    <th className="text-right font-normal">{t("Power", "Potenza")}</th>
                    <th className="text-right font-normal">W/kg</th>
                    <th className="text-right font-normal">VAM</th>
                    <th className="text-right font-normal">{t("HR", "FC")}</th>
                    <th className="text-right font-normal">{t("Cad", "Cad")}</th>
                    <th className="text-right font-normal">km/h</th>
                    <th />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {efforts.map((e, i) => (
                    <tr key={`${e.trackId}-${i}`}>
                      <td className="py-2 text-muted-foreground">{i + 1}</td>
                      <td className="font-sans">
                        <Link
                          to="/rides/$id"
                          params={{ id: e.trackId }}
                          className="hover:text-primary"
                        >
                          {format(parseISO(e.date), "d MMM yyyy")}
                        </Link>
                        {i === 0 && (
                          <span className="ml-2 inline-flex items-center gap-1 rounded bg-birch px-1.5 py-0.5 text-[10px] font-semibold text-background">
                            <Trophy className="h-3 w-3" /> PR
                          </span>
                        )}
                      </td>
                      <td className="text-right">{formatClock(e.duration)}</td>
                      <td className="text-right">{r(e.avgWatts, "W")}</td>
                      <td className="text-right">{e.wkg ? e.wkg.toFixed(2) : "–"}</td>
                      <td className="text-right">{r(e.vam)}</td>
                      <td className="text-right text-fatigue">{r(e.avgHr)}</td>
                      <td className="text-right">{r(e.avgCad)}</td>
                      <td className="text-right">{e.speed.toFixed(1)}</td>
                      <td className="text-right">
                        {i > 0 && (
                          <button
                            aria-label={t("Race against the PR", "Sfida il PR")}
                            title={t("Race against the PR", "Sfida il PR")}
                            onClick={() => startRace(effortKey(e))}
                            className="p-1 text-muted-foreground hover:text-primary"
                          >
                            <Swords className="h-4 w-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Panel>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      to="/segments"
      className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" /> {t("Segments", "Segmenti")}
    </Link>
  );
}
