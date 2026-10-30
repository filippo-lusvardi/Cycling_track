import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { ArrowLeft, Plus, Star } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { CAT_COLOR, ElevationProfile } from "@/components/ElevationProfile";
import { RouteMap, type MapLine, type MapPin } from "@/components/RouteMap";
import { Panel, StatCard } from "@/components/StatCard";
import { WorkoutBlocks } from "@/components/WorkoutBlocks";
import { ZoneBar } from "@/components/ZoneBar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { useSegmentNames } from "@/hooks/use-segment-names";
import { useSegments } from "@/hooks/use-segments";
import { decoupling } from "@/lib/analysis";
import { detectClimbs } from "@/lib/climbs";
import type { ActivityDetail, RideStreams } from "@/lib/intervals";
import { activityQuery, streamsQuery, wellnessRangeQuery } from "@/lib/queries";
import { findAttempts, isClimbOnTrack, segmentFromRange, trackFromStreams } from "@/lib/segments";
import { addDays, formatClock, formatDuration, formatKm, weightOn } from "@/lib/training";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/rides/$id")({
  head: () => ({ meta: [{ title: "Ride details — Cadence" }] }),
  loader: ({ context, params }) => context.queryClient.ensureQueryData(activityQuery(params.id)),
  component: RideDetail,
});

const r = (n: number | null | undefined, suffix = "") => (n != null ? `${Math.round(n)}${suffix}` : "–");

function RideDetail() {
  const { id } = Route.useParams();
  const { data: a } = useSuspenseQuery(activityQuery(id));
  const { data: streams } = useQuery(streamsQuery(id));
  const date = a.start_date_local.slice(0, 10);
  const { data: wellness } = useQuery({ ...wellnessRangeQuery({ oldest: addDays(date, -30), newest: date }), enabled: !!date });
  const weight = wellness ? weightOn(wellness, date) : null;
  const intervals = (a.icu_intervals ?? []).filter((i) => i.type === "WORK" || i.label);
  const decouple = a.decoupling ?? (streams ? decoupling(streams.watts, streams.heartrate) : null);
  const np = a.icu_weighted_avg_watts;

  return (
    <div className="space-y-6">
      <Link to="/rides" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Rides
      </Link>
      <div>
        <div className="eyebrow">
          {a.start_date_local ? format(parseISO(a.start_date_local), "EEEE d MMMM yyyy · HH:mm") : ""} · {a.type}
        </div>
        <h1 className="text-3xl font-bold tracking-tight">{a.name ?? "Activity"}</h1>
        {a.description && <p className="mt-2 text-sm text-muted-foreground">{a.description}</p>}
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Distance" value={formatKm(a.distance)} />
        <StatCard label="Moving time" value={formatDuration(a.moving_time)} />
        <StatCard label="Elevation" value={r(a.total_elevation_gain)} unit="m" />
        <StatCard label="Load" value={r(a.icu_training_load)} tone="fitness" />
        <StatCard label="Avg power" value={r(a.icu_average_watts)} unit="W" />
        <StatCard
          label="Norm. power"
          value={r(np)}
          unit="W"
          hint={[a.icu_ftp && `FTP ${a.icu_ftp}W`, np && weight && `${(np / weight).toFixed(2)} W/kg`].filter(Boolean).join(" · ") || undefined}
        />
        <StatCard label="Intensity" value={a.icu_intensity != null ? `${Math.round(a.icu_intensity)}%` : "–"} tone="form" />
        <StatCard label="Avg / max HR" value={`${r(a.average_heartrate)} / ${r(a.max_heartrate)}`} unit="bpm" tone="fatigue" />
        <StatCard label="Avg speed" value={a.average_speed ? (a.average_speed * 3.6).toFixed(1) : "–"} unit="km/h" />
        <StatCard label="Cadence" value={r(a.average_cadence)} unit="rpm" />
        <StatCard
          label="Decoupling"
          value={decouple != null ? decouple.toFixed(1) : "–"}
          unit="%"
          hint={decouple != null ? (decouple < 5 ? "Pw:HR steady (< 5%)" : "HR drifted vs power") : undefined}
        />
        <StatCard label="Calories" value={r(a.calories)} unit="kcal" />
      </div>

      {a.zoneTimes.some((s) => s > 0) && (
        <Panel title="Time in power zones">
          <ZoneBar secs={a.zoneTimes} />
        </Panel>
      )}

      {a.icu_ftp && (a.icu_intervals?.length ?? 0) > 0 && (
        <Panel title="Workout blocks">
          <WorkoutBlocks intervals={a.icu_intervals ?? []} ftp={a.icu_ftp} />
        </Panel>
      )}

      {streams ? (
        <Climbs a={a} streams={streams} weight={weight} />
      ) : (
        <Panel title="Elevation & climbs">
          <p className="py-6 text-center text-sm text-muted-foreground">Loading ride streams…</p>
        </Panel>
      )}

      {intervals.length > 0 && (
        <Panel title="Intervals">
          <div className="divide-y divide-border text-sm">
            {intervals.map((i) => (
              <div key={i.id} className="stat-num flex justify-between py-2">
                <span className="font-sans">{i.label ?? i.type}</span>
                <span className="flex gap-4">
                  <span>{formatDuration(i.moving_time)}</span>
                  <span className="w-14 text-right">{r(i.average_watts, "W")}</span>
                  <span className="w-16 text-right text-fatigue">{r(i.average_heartrate, " bpm")}</span>
                </span>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}

function Climbs({ a, streams, weight }: { a: ActivityDetail; streams: RideStreams; weight: number | null }) {
  const [hover, setHover] = useState<number | null>(null);
  const [hoverKm, setHoverKm] = useState<number | null>(null);
  const [range, setRange] = useState<[number, number] | null>(null);
  const [name, setName] = useState("");
  const store = useSegments();
  const nameOf = useSegmentNames(store.segments);
  const climbs = useMemo(
    () => detectClimbs({ distance: streams.distance, altitude: streams.altitude, time: streams.time, watts: streams.watts, heartrate: streams.heartrate }),
    [streams],
  );
  const track = useMemo(
    () => (streams.lat.length ? trackFromStreams({ id: a.id, name: a.name, date: a.start_date_local }, streams) : null),
    [a, streams],
  );
  const onRide = useMemo(
    () =>
      track
        ? store.segments.flatMap((s) => findAttempts(track, s).map((at) => ({ seg: s, at })))
        : [],
    [track, store.segments],
  );
  const totalKm = (streams.distance.at(-1) ?? 0) / 1000;

  // Map: the ride, its climbs by category, and the segment being marked with the slider.
  const at = (km: number) => {
    const i = track ? track.dist.findIndex((d) => d >= km * 1000) : -1;
    return i < 0 ? (track?.dist.length ?? 1) - 1 : i;
  };
  const cut = (a: number, b: number) => ({ lat: track!.lat.slice(at(a), at(b) + 1), lng: track!.lng.slice(at(a), at(b) + 1) });
  const mapLines = useMemo<MapLine[]>(() => {
    if (!track) return [];
    const ls: MapLine[] = [{ lat: track.lat, lng: track.lng, color: "var(--foreground)", weight: 3, opacity: 0.55 }];
    climbs.forEach((c, i) =>
      ls.push({ ...cut(c.startKm, c.endKm), color: CAT_COLOR[c.category], weight: hover === i ? 9 : 6, tooltip: `Climb ${i + 1} · ${(c.length / 1000).toFixed(1)} km @ ${c.avgGrade.toFixed(1)}%` }),
    );
    if (range) ls.push({ ...cut(range[0], range[1]), color: "#ffffff", weight: 7 });
    return ls;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track, climbs, hover, range]);
  const mapPins = useMemo<MapPin[]>(() => {
    if (!track) return [];
    const p = (km: number) => ({ lat: track.lat[at(km)]!, lng: track.lng[at(km)]! });
    if (range)
      return [
        { ...p(range[0]), color: "var(--pine)", label: "Segment start" },
        { ...p(range[1]), color: "var(--lingon)", label: "Segment finish" },
      ];
    return [
      { lat: track.lat[0]!, lng: track.lng[0]!, color: "var(--pine)", label: "Start" },
      { lat: track.lat.at(-1)!, lng: track.lng.at(-1)!, color: "var(--lingon)", label: "Finish" },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track, range]);
  const cursor = track && hoverKm != null ? { lat: track.lat[at(hoverKm)]!, lng: track.lng[at(hoverKm)]! } : null;
  const savedFor = (startKm: number, endKm: number) =>
    track ? (store.segments.find((s) => isClimbOnTrack(track, s, startKm, endKm)) ?? null) : null;

  function saveRange() {
    if (!track || !range) return;
    const seg = segmentFromRange(track, range[0], range[1], "custom", name.trim() || undefined);
    store.save(seg, !!name.trim());
    toast.success(name.trim() ? `Saved “${seg.name}”` : "Segment saved; it gets its name from the map");
    setRange(null);
    setName("");
  }

  return (
    <Panel
      title={`${track ? "Map, elevation" : "Elevation"} & climbs${climbs.length ? ` · ${climbs.length}` : ""}`}
      action={
        track && !range ? (
          <Button size="sm" variant="ghost" onClick={() => setRange([Math.min(1, totalKm / 3), Math.min(totalKm, Math.max(2, totalKm / 2))])}>
            <Plus /> Segment
          </Button>
        ) : undefined
      }
    >
      {track && <RouteMap fitKey={a.id} lines={mapLines} pins={mapPins} cursor={cursor} className="mb-4" />}
      <ElevationProfile
        distance={streams.distance}
        altitude={streams.altitude}
        climbs={climbs}
        highlight={hover}
        selection={range}
        onHoverKm={setHoverKm}
      />

      {range && (
        <div className="mt-4 space-y-3 rounded-lg bg-background/50 p-3">
          <div className="stat-num flex justify-between text-xs text-muted-foreground">
            <span>Start {range[0].toFixed(2)} km</span>
            <span>{((range[1] - range[0]) * 1000).toFixed(0)} m</span>
            <span>Finish {range[1].toFixed(2)} km</span>
          </div>
          <Slider min={0} max={totalKm} step={0.01} minStepsBetweenThumbs={20} value={range} onValueChange={(v) => setRange([v[0]!, v[1]!])} />
          <div className="flex gap-2">
            <Input placeholder="Segment name (optional)" value={name} onChange={(e) => setName(e.target.value)} />
            <Button onClick={saveRange}>Save</Button>
            <Button variant="ghost" onClick={() => setRange(null)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {climbs.length > 0 && (
        <div className="-mx-4 mt-4 overflow-x-auto px-4">
          <table className="stat-num w-full min-w-[560px] text-sm">
            <thead>
              <tr className="eyebrow text-left">
                <th className="py-2 font-normal">#</th>
                <th className="font-normal">Cat</th>
                <th className="text-right font-normal">Km</th>
                <th className="text-right font-normal">Avg</th>
                <th className="text-right font-normal">Max</th>
                <th className="text-right font-normal">Time</th>
                <th className="text-right font-normal">VAM</th>
                <th className="text-right font-normal">Power</th>
                <th className="text-right font-normal">W/kg</th>
                {track && <th />}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {climbs.map((c, i) => {
                const saved = savedFor(c.startKm, c.endKm);
                return (
                  <tr
                    key={i}
                    onMouseEnter={() => setHover(i)}
                    onMouseLeave={() => setHover(null)}
                    onClick={() => setHover(hover === i ? null : i)}
                    className={cn("transition-colors", hover === i && "bg-secondary/60")}
                  >
                    <td className="py-2 text-muted-foreground">{i + 1}</td>
                    <td>
                      <span className="rounded px-1.5 py-0.5 text-xs font-semibold text-background" style={{ background: CAT_COLOR[c.category] }}>
                        {c.category === "Uncat" ? "–" : c.category === "HC" ? "HC" : `Cat ${c.category}`}
                      </span>
                    </td>
                    <td className="text-right">{(c.length / 1000).toFixed(1)}</td>
                    <td className="text-right">{c.avgGrade.toFixed(1)}%</td>
                    <td className="text-right">{c.maxGrade.toFixed(1)}%</td>
                    <td className="text-right">{formatClock(c.duration)}</td>
                    <td className="text-right">{r(c.vam)}</td>
                    <td className="text-right">{r(c.avgWatts, "W")}</td>
                    <td className="text-right">{c.avgWatts && weight ? (c.avgWatts / weight).toFixed(2) : "–"}</td>
                    {track && (
                      <td className="text-right">
                        <button
                          aria-label={saved?.starred ? "Unstar climb" : "Star climb"}
                          onClick={(e) => {
                            e.stopPropagation();
                            store.toggleStar(saved ?? segmentFromRange(track, c.startKm, c.endKm, "auto"));
                          }}
                          className="p-1"
                        >
                          <Star className={cn("h-4 w-4", saved?.starred ? "fill-birch text-birch" : "text-muted-foreground")} />
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {onRide.length > 0 && (
        <div className="mt-5">
          <div className="eyebrow mb-2">Saved segments on this ride</div>
          <div className="divide-y divide-border text-sm">
            {onRide.map(({ seg, at }, i) => (
              <Link
                key={`${seg.id}-${i}`}
                to="/segments/$id"
                params={{ id: seg.id }}
                className="stat-num flex items-center justify-between gap-3 py-2 hover:text-primary"
              >
                <span className="truncate font-sans">
                  {seg.starred && <Star className="mr-1 inline h-3.5 w-3.5 fill-birch text-birch" />}
                  {nameOf(seg)}
                </span>
                <span className="flex shrink-0 gap-4">
                  <span>{formatClock(at.duration)}</span>
                  <span className="w-14 text-right">{r(at.avgWatts, "W")}</span>
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </Panel>
  );
}
