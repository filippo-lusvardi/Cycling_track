import { useQuery } from "@tanstack/react-query";
import { parseISO } from "date-fns";
import { format, t as tr } from "@/lib/i18n";
import { Pause, Play, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { GradientProfile } from "@/components/GradientProfile";
import { RouteMap, type MapLine, type MapPin } from "@/components/RouteMap";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  atTime,
  duration,
  effortSeries,
  gapSeries,
  timeAtDist,
  type EffortSeries,
} from "@/lib/ghost";
import { segmentEngine } from "@/lib/segment-app";
import type { Attempt, Trace } from "@/lib/segments";
import { formatClock } from "@/lib/training";
import { cn } from "@/lib/utils";

export const effortKey = (e: Pick<Attempt, "trackId" | "i0">) => `${e.trackId}-${e.i0}`;

const A_COLOR = "var(--birch)";
const B_COLOR = "var(--fitness)";
const SPEEDS = [10, 30, 60] as const;

/** A stored ride's track (IndexedDB, no download), kept for the session. */
const useTrack = (id: string | undefined) =>
  useQuery({
    queryKey: ["effort-track", id],
    queryFn: () => segmentEngine.loadTrack(id!),
    enabled: !!id,
    staleTime: Infinity,
  });

/** One entry of a rider's picker. */
export type RaceOption = { key: string; label: string };

const signed = (s: number) => `${s < 0 ? "−" : "+"}${formatClock(Math.abs(s))}`;

/**
 * Two efforts replayed on one clock: dots race along the map and the gradient profile, with the live gap and
 * where time was won or lost. `efforts` are sorted fastest first (index 0 is the PR).
 */
export function GhostRace({
  efforts,
  initialA,
  initialB,
  trace,
  lines,
  pins,
  onClose,
}: {
  efforts: Attempt[];
  initialA: string;
  initialB: string;
  trace: Trace;
  lines: MapLine[];
  pins: MapPin[];
  onClose: () => void;
}) {
  const [aKey, setAKey] = useState(initialA);
  const [bKey, setBKey] = useState(initialB);
  const a = efforts.find((e) => effortKey(e) === aKey) ?? efforts[0]!;
  const b = efforts.find((e) => effortKey(e) === bKey) ?? efforts[1] ?? efforts[0]!;
  const { data: ta } = useTrack(a.trackId);
  const { data: tb } = useTrack(b.trackId);
  const sa = useMemo(() => (ta ? effortSeries(ta, a) : null), [ta, a]);
  const sb = useMemo(() => (tb ? effortSeries(tb, b) : null), [tb, b]);
  const options = efforts.map((e) => ({
    key: effortKey(e),
    label: `${format(parseISO(e.date), "d MMM yyyy")} · ${formatClock(e.duration)}${e === efforts[0] ? " (PR)" : ""}`,
  }));
  return (
    <RaceReplay
      a={sa}
      b={sb}
      aKey={effortKey(a)}
      bKey={effortKey(b)}
      onPickA={setAKey}
      onPickB={setBKey}
      options={options}
      trace={trace}
      lines={lines}
      pins={pins}
      onClose={onClose}
    />
  );
}

/** The race itself: two efforts on one clock, whoever they belong to. A null effort is still loading. */
export function RaceReplay({
  a: sa,
  b: sb,
  aKey,
  bKey,
  onPickA,
  onPickB,
  options,
  trace,
  lines,
  pins,
  onClose,
}: {
  a: EffortSeries | null;
  b: EffortSeries | null;
  aKey: string;
  bKey: string;
  onPickA: (key: string) => void;
  onPickB: (key: string) => void;
  options: RaceOption[];
  trace: Trace;
  lines: MapLine[];
  pins: MapPin[];
  onClose: () => void;
}) {
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(30);
  const end = sa && sb ? Math.max(duration(sa), duration(sb)) : 0;
  const gaps = useMemo(() => (sa && sb ? gapSeries(sa, sb) : []), [sa, sb]);

  // Animation: advance the shared clock by real time × speed until the slower rider finishes.
  useEffect(() => {
    if (!playing || !end) return;
    let last = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      const dt = (now - last) / 1000;
      last = now;
      setT((v) => Math.min(end, v + dt * speed));
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [playing, speed, end]);
  useEffect(() => {
    if (end && t >= end) setPlaying(false);
  }, [t, end]);
  // A new pair starts from the line.
  useEffect(() => {
    setT(0);
    setPlaying(true);
  }, [aKey, bKey]);

  if (!sa || !sb)
    return (
      <p className="py-16 text-center text-sm text-muted-foreground">
        {tr("Loading the two rides…", "Caricamento delle due attività…")}
      </p>
    );

  const pa = atTime(sa, t);
  const pb = atTime(sb, t);
  const total = trace.dist.at(-1) ?? 0;
  // Time gap at the point both riders have passed: negative = B ahead of A.
  const at = Math.min(pa.d, pb.d);
  const gap = timeAtDist(sb, at) - timeAtDist(sa, at);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <RiderSelect color={A_COLOR} value={aKey} onChange={onPickA} options={options} />
        <span className="text-muted-foreground">vs</span>
        <RiderSelect color={B_COLOR} value={bKey} onChange={onPickB} options={options} />
        <Button size="sm" variant="ghost" className="ml-auto" onClick={onClose}>
          <X /> {tr("End race", "Termina sfida")}
        </Button>
      </div>

      <RouteMap
        fitKey="race"
        lines={lines}
        pins={pins}
        markers={[
          { lat: pa.lat, lng: pa.lng, color: A_COLOR, label: "A" },
          { lat: pb.lat, lng: pb.lng, color: B_COLOR, label: "B" },
        ]}
      />
      <GradientProfile
        dist={trace.dist}
        alt={trace.alt}
        markers={[
          { dist: Math.min(pa.d, total), color: A_COLOR },
          { dist: Math.min(pb.d, total), color: B_COLOR },
        ]}
      />

      <div className="flex flex-wrap items-center gap-3">
        <Button
          size="icon"
          aria-label={playing ? tr("Pause", "Pausa") : tr("Play", "Avvia")}
          onClick={() => {
            if (!playing && t >= end) setT(0);
            setPlaying((p) => !p);
          }}
        >
          {playing ? <Pause /> : <Play />}
        </Button>
        <div className="flex gap-1 rounded-lg bg-secondary p-1">
          {SPEEDS.map((s) => (
            <button
              key={s}
              onClick={() => setSpeed(s)}
              className={cn(
                "stat-num rounded-md px-2.5 py-1 text-xs",
                speed === s ? "bg-background text-foreground" : "text-muted-foreground",
              )}
            >
              ×{s}
            </button>
          ))}
        </div>
        <Slider
          className="min-w-40 flex-1"
          min={0}
          max={end}
          step={1}
          value={[t]}
          onValueChange={(v) => {
            setPlaying(false);
            setT(v[0]!);
          }}
        />
        <span className="stat-num w-24 text-right text-sm">
          {formatClock(t)} / {formatClock(end)}
        </span>
      </div>

      <div className="stat-num rounded-lg bg-background/50 px-3 py-2 text-sm">
        {at < 1 ? (
          <span className="text-muted-foreground">
            {tr("On the line…", "Sulla linea di partenza…")}
          </span>
        ) : (
          <>
            {tr("at", "a")} {(at / 1000).toFixed(2)} km: <span style={{ color: B_COLOR }}>B</span>{" "}
            {Math.abs(gap) < 0.5 ? (
              <span className="font-semibold">{tr("level with", "alla pari con")}</span>
            ) : (
              <span className={cn("font-semibold", gap < 0 ? "text-pine" : "text-lingon")}>
                {signed(gap)}
              </span>
            )}{" "}
            {Math.abs(gap) < 0.5 ? "" : "vs "}
            <span style={{ color: A_COLOR }}>A</span>
            {Math.abs(gap) >= 0.5 && (
              <span className="font-sans text-muted-foreground">
                {" "}
                ({gap < 0 ? tr("ahead", "avanti") : tr("behind", "indietro")})
              </span>
            )}
          </>
        )}
      </div>

      <div>
        <div className="mb-1 text-xs text-muted-foreground">
          {tr(
            "Gap along the climb (B vs A; below zero = B faster)",
            "Distacco lungo la salita (B vs A; sotto zero = B più veloce)",
          )}
        </div>
        <div className="h-32">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={gaps.map((g) => ({ km: g.d / 1000, gap: g.gap }))}
              margin={{ left: -16, right: 8, top: 4 }}
            >
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="km"
                type="number"
                domain={[0, "dataMax"]}
                tickFormatter={(v: number) => `${v.toFixed(1)} km`}
                stroke="var(--muted-foreground)"
                fontSize={11}
              />
              <YAxis
                stroke="var(--muted-foreground)"
                fontSize={11}
                tickFormatter={(v: number) => signed(v)}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--popover)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                }}
                labelFormatter={(v) => `${Number(v).toFixed(2)} km`}
                formatter={(v) => [signed(Number(v)), tr("Gap", "Distacco")]}
              />
              <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeDasharray="3 3" />
              <ReferenceLine x={at / 1000} stroke="var(--foreground)" strokeOpacity={0.6} />
              <Line
                type="monotone"
                dataKey="gap"
                stroke={B_COLOR}
                dot={false}
                strokeWidth={2}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

function RiderSelect({
  color,
  value,
  onChange,
  options,
}: {
  color: string;
  value: string;
  onChange: (key: string) => void;
  options: RaceOption[];
}) {
  return (
    <label className="flex items-center gap-2">
      <span className="h-3 w-3 rounded-full" style={{ background: color }} />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 max-w-[14rem] rounded-md border border-input bg-transparent px-2 text-xs"
      >
        {options.map((o) => (
          <option key={o.key} value={o.key} className="bg-popover">
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
