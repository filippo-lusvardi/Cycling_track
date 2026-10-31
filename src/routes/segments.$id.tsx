import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
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

export const Route = createFileRoute("/segments/$id")({
  head: () => ({ meta: [{ title: "Segment — Cirmolo" }] }),
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
            { lat: trace.lat[0]!, lng: trace.lng[0]!, color: "var(--pine)", label: "Start" },
            {
              lat: trace.lat.at(-1)!,
              lng: trace.lng.at(-1)!,
              color: "var(--lingon)",
              label: "Finish",
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
          {isLoading ? "Loading rides…" : "This segment no longer exists."}
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
                ? "Manual segment"
                : "Saved climb"
              : "Auto-detected climb"}
            {seg.renamed ? " · your name" : ""}
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
                placeholder="Empty = automatic name from the map"
              />
              <Button type="submit">Save</Button>
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
            aria-label={seg.starred ? "Unstar" : "Star"}
            onClick={() => lib.toggleStar(seg)}
          >
            <Star className={cn(seg.starred ? "fill-birch text-birch" : "text-muted-foreground")} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Rename"
            onClick={() => setEditing(seg.renamed ? seg.name : "")}
          >
            <Pencil />
          </Button>
          {seg.saved && (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Delete"
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
        <StatCard label="Length" value={(seg.length / 1000).toFixed(2)} unit="km" />
        <StatCard
          label="Avg grade"
          value={seg.grade != null ? seg.grade.toFixed(1) : "–"}
          unit="%"
          hint={steepest != null ? `max ${steepest.toFixed(1)}% over 100 m` : undefined}
        />
        <StatCard
          label="Best time"
          tone="form"
          value={best ? formatClock(best.duration) : "–"}
          hint={best ? format(parseISO(best.date), "d MMM yyyy") : undefined}
        />
        <StatCard
          label="Efforts"
          value={efforts.length}
          hint={
            historyYears()
              ? `last ${historyYears()} year${historyYears() > 1 ? "s" : ""}`
              : "all history"
          }
        />
      </div>

      {trace && (
        <div ref={routeRef} className="scroll-mt-20">
          <Panel
            title={`Route · ${Math.round(seg.gain ?? 0)} m up · ${Math.round(trace.alt[0]!)} → ${Math.round(trace.alt.at(-1)!)} m`}
            action={
              !race && efforts.length > 1 ? (
                <Button size="sm" variant="secondary" onClick={() => startRace()}>
                  <Swords /> Race
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
          title="Progression"
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
                  {m === "time" ? "Time" : "Power"}
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
                      ? [formatClock(Number(v) * 60), "Time"]
                      : [`${Math.round(Number(v))} W`, "Power"]
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
            <p className="mt-1 text-xs text-muted-foreground">Faster is higher.</p>
          )}
        </Panel>
      )}

      <Panel title="All efforts">
        {isLoading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Loading rides…</p>
        ) : efforts.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No efforts found in the analysed rides.
          </p>
        ) : (
          <>
            {/* Phone: one compact row per effort instead of a table wider than the screen. */}
            <div className="-mx-4 divide-y divide-border md:hidden">
              {efforts.map((e, i) => {
                const stats = [
                  e.avgWatts != null && `${Math.round(e.avgWatts)} W`,
                  e.wkg && `${e.wkg.toFixed(2)} W/kg`,
                  e.vam != null && `VAM ${Math.round(e.vam)}`,
                  e.avgHr != null && `${Math.round(e.avgHr)} bpm`,
                  e.avgCad != null && `${Math.round(e.avgCad)} rpm`,
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
                        <span className="stat-num block truncate text-xs text-muted-foreground">
                          {stats.join(" · ")}
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
                        aria-label="Race against the PR"
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
                    <th className="font-normal">Date</th>
                    <th className="text-right font-normal">Time</th>
                    <th className="text-right font-normal">Power</th>
                    <th className="text-right font-normal">W/kg</th>
                    <th className="text-right font-normal">VAM</th>
                    <th className="text-right font-normal">HR</th>
                    <th className="text-right font-normal">Cad</th>
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
                            aria-label="Race against the PR"
                            title="Race against the PR"
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
      <ArrowLeft className="h-4 w-4" /> Segments
    </Link>
  );
}
