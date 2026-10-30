import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { ArrowLeft, Pencil, Star, Trash2, Trophy } from "lucide-react";
import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { GradientProfile, gradientLines } from "@/components/GradientProfile";
import { RouteMap } from "@/components/RouteMap";
import { Panel, StatCard } from "@/components/StatCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSegmentNames } from "@/hooks/use-segment-names";
import { useSegmentLibrary } from "@/hooks/use-segments";
import { tracksQuery, wellnessQuery } from "@/lib/queries";
import { gradeChunks, maxGrade } from "@/lib/profile";
import { findAttempts, segmentSummary, segmentTrace } from "@/lib/segments";
import { formatClock, weightOn } from "@/lib/training";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/segments/$id")({
  head: () => ({ meta: [{ title: "Segment — Cadence" }] }),
  component: SegmentPage,
});

const r = (n: number | null | undefined, suffix = "") => (n != null ? `${Math.round(n)}${suffix}` : "–");

function SegmentPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { data: tracks, isLoading } = useQuery(tracksQuery(180));
  const { data: wellness } = useQuery(wellnessQuery(365));
  const lib = useSegmentLibrary(tracks);
  const nameOf = useSegmentNames(lib.list);
  const seg = lib.list.find((s) => s.id === id);
  const [metric, setMetric] = useState<"time" | "watts">("time");
  const [editing, setEditing] = useState<string | null>(null);

  const efforts = useMemo(() => {
    if (!seg || !tracks) return [];
    return tracks
      .flatMap((t) => findAttempts(t, seg))
      .map((a) => {
        const kg = wellness ? weightOn(wellness, a.date) : null;
        return { ...a, wkg: a.avgWatts && kg ? a.avgWatts / kg : null };
      })
      .sort((a, b) => a.duration - b.duration);
  }, [seg, tracks, wellness]);
  // Path and profile from the best effort (the cleanest GPS pass is as good as any).
  const trace = useMemo(() => (seg && tracks ? segmentTrace(tracks, seg, efforts[0]) : null), [seg, tracks, efforts]);
  const [hover, setHover] = useState<number | null>(null);
  const lines = useMemo(() => (trace ? gradientLines(trace) : []), [trace]);
  const steepest = useMemo(() => (trace ? maxGrade(gradeChunks(trace.dist, trace.alt)) : null), [trace]);
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
        <p className="text-sm text-muted-foreground">{isLoading ? "Loading rides…" : "This segment no longer exists."}</p>
      </div>
    );

  const best = efforts[0];

  return (
    <div className="space-y-6">
      <BackLink />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="eyebrow">
            {seg.saved ? (seg.source === "custom" ? "Manual segment" : "Saved climb") : "Auto-detected climb"}
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
          <Button variant="ghost" size="icon" aria-label={seg.starred ? "Unstar" : "Star"} onClick={() => lib.toggleStar(seg)}>
            <Star className={cn(seg.starred ? "fill-birch text-birch" : "text-muted-foreground")} />
          </Button>
          <Button variant="ghost" size="icon" aria-label="Rename" onClick={() => setEditing(seg.renamed ? seg.name : "")}>
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
        <StatCard label="Best time" tone="form" value={best ? formatClock(best.duration) : "–"} hint={best ? format(parseISO(best.date), "d MMM yyyy") : undefined} />
        <StatCard label="Efforts" value={efforts.length} hint="last 180 days" />
      </div>

      {trace && (
        <Panel title={`Route · ${Math.round(seg.gain ?? 0)} m up · ${Math.round(trace.alt[0]!)} → ${Math.round(trace.alt.at(-1)!)} m`}>
          <div className="space-y-4">
            <RouteMap
              fitKey={seg.id}
              lines={lines}
              pins={[
                { lat: trace.lat[0]!, lng: trace.lng[0]!, color: "var(--pine)", label: "Start" },
                { lat: trace.lat.at(-1)!, lng: trace.lng.at(-1)!, color: "var(--lingon)", label: "Finish" },
              ]}
              cursor={hover != null ? { lat: trace.lat[hover]!, lng: trace.lng[hover]! } : null}
            />
            <GradientProfile dist={trace.dist} alt={trace.alt} hover={hover} onHover={setHover} />
          </div>
        </Panel>
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
                  className={cn("rounded-md px-3 py-1 text-xs", metric === m ? "bg-background text-foreground" : "text-muted-foreground")}
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
                <XAxis dataKey="date" tickFormatter={(d: string) => format(parseISO(d), "d MMM")} stroke="var(--muted-foreground)" fontSize={11} minTickGap={30} />
                <YAxis
                  stroke="var(--muted-foreground)"
                  fontSize={11}
                  reversed={metric === "time"}
                  domain={["auto", "auto"]}
                  tickFormatter={(v: number) => (metric === "time" ? formatClock(v * 60) : `${Math.round(v)}`)}
                />
                <Tooltip
                  contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8 }}
                  labelFormatter={(d) => format(parseISO(String(d)), "EEE d MMM yyyy")}
                  formatter={(v) => (metric === "time" ? [formatClock(Number(v) * 60), "Time"] : [`${Math.round(Number(v))} W`, "Power"])}
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
          {metric === "time" && <p className="mt-1 text-xs text-muted-foreground">Faster is higher.</p>}
        </Panel>
      )}

      <Panel title="All efforts">
        {isLoading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Loading rides…</p>
        ) : efforts.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No efforts found in the last 180 days.</p>
        ) : (
          <div className="-mx-4 overflow-x-auto px-4">
            <table className="stat-num w-full min-w-[620px] text-sm">
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
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {efforts.map((e, i) => (
                  <tr key={`${e.trackId}-${i}`}>
                    <td className="py-2 text-muted-foreground">{i + 1}</td>
                    <td className="font-sans">
                      <Link to="/rides/$id" params={{ id: e.trackId }} className="hover:text-primary">
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

function BackLink() {
  return (
    <Link to="/segments" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft className="h-4 w-4" /> Segments
    </Link>
  );
}
