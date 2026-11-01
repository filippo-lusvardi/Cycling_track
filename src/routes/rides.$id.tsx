import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { parseISO } from "date-fns";
import { ArrowLeft, ChevronDown, Plus, Star, Trophy } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CAT_COLOR, ElevationProfile } from "@/components/ElevationProfile";
import { RideCharts } from "@/components/RideCharts";
import { RouteMap, type MapLine, type MapPin } from "@/components/RouteMap";
import { Panel, StatCard } from "@/components/StatCard";
import { WorkoutBlocks } from "@/components/WorkoutBlocks";
import { ZoneBar } from "@/components/ZoneBar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { useSegmentNames } from "@/hooks/use-segment-names";
import { useSegmentLibrary } from "@/hooks/use-segments";
import { decoupling } from "@/lib/analysis";
import { detectClimbs } from "@/lib/climbs";
import type { ActivityDetail, RideStreams } from "@/lib/intervals";
import { activityQuery, streamsQuery, wellnessRangeQuery } from "@/lib/queries";
import { segmentEngine } from "@/lib/segment-app";
import { cellOf, mayPass } from "@/lib/segment-index";
import {
  findAttempts,
  isClimbOnTrack,
  segmentFromRange,
  segmentSummary,
  trackFromStreams,
} from "@/lib/segments";
import { addDays, formatClock, formatDuration, formatKm, weightOn } from "@/lib/training";
import { cn } from "@/lib/utils";
import { format, t } from "@/lib/i18n";

export const Route = createFileRoute("/rides/$id")({
  head: () => ({ meta: [{ title: t("Ride details — Cirmolo", "Dettagli attività — Cirmolo") }] }),
  loader: ({ context, params }) => context.queryClient.ensureQueryData(activityQuery(params.id)),
  component: RideDetail,
});

const r = (n: number | null | undefined, suffix = "") =>
  n != null ? `${Math.round(n)}${suffix}` : "–";

function RideDetail() {
  const { id } = Route.useParams();
  const { data: a } = useSuspenseQuery(activityQuery(id));
  const { data: streams } = useQuery(streamsQuery(id));
  const date = a.start_date_local.slice(0, 10);
  const { data: wellness } = useQuery({
    ...wellnessRangeQuery({ oldest: addDays(date, -30), newest: date }),
    enabled: !!date,
  });
  const weight = wellness ? weightOn(wellness, date) : null;
  const intervals = (a.icu_intervals ?? []).filter((i) => i.type === "WORK" || i.label);
  // Collapsed by default: long and only occasionally needed.
  const [showCharts, setShowCharts] = useState(false);
  const [showIntervals, setShowIntervals] = useState(false);
  // The selected work: the map, elevation and charts all show just that stretch.
  const [workId, setWorkId] = useState<number | null>(null);
  const work = useMemo(() => workOf(a, streams, workId), [a, streams, workId]);
  const select = (id: number | null, from: "blocks" | "list") => {
    setWorkId(id);
    if (id == null) return;
    setShowCharts(true);
    // From the list at the bottom, bring the map up into view to show the work.
    if (from === "list")
      document.getElementById("ride-map")?.scrollIntoView({ behavior: "smooth" });
  };
  const decouple = a.decoupling ?? (streams ? decoupling(streams.watts, streams.heartrate) : null);
  const np = a.icu_weighted_avg_watts;

  return (
    <div className="space-y-6">
      <Link
        to="/rides"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> {t("Rides", "Attività")}
      </Link>
      <div>
        <div className="eyebrow">
          {a.start_date_local
            ? format(parseISO(a.start_date_local), "EEEE d MMMM yyyy · HH:mm")
            : ""}{" "}
          · {a.type}
        </div>
        <h1 className="text-3xl font-bold tracking-tight">{a.name ?? t("Activity", "Attività")}</h1>
        {a.description && <p className="mt-2 text-sm text-muted-foreground">{a.description}</p>}
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label={t("Distance", "Distanza")} value={formatKm(a.distance)} />
        <StatCard
          label={t("Moving time", "Tempo in movimento")}
          value={formatDuration(a.moving_time)}
        />
        <StatCard label={t("Elevation", "Dislivello")} value={r(a.total_elevation_gain)} unit="m" />
        <StatCard label={t("Load", "Carico")} value={r(a.icu_training_load)} tone="fitness" />
        <StatCard label={t("Avg power", "Potenza media")} value={r(a.icu_average_watts)} unit="W" />
        <StatCard
          label={t("Norm. power", "Potenza norm.")}
          value={r(np)}
          unit="W"
          hint={
            [a.icu_ftp && `FTP ${a.icu_ftp}W`, np && weight && `${(np / weight).toFixed(2)} W/kg`]
              .filter(Boolean)
              .join(" · ") || undefined
          }
        />
        <StatCard
          label={t("Intensity", "Intensità")}
          value={a.icu_intensity != null ? `${Math.round(a.icu_intensity)}%` : "–"}
          tone="form"
        />
        <StatCard
          label={t("Avg / max HR", "FC media / max")}
          value={`${r(a.average_heartrate)} / ${r(a.max_heartrate)}`}
          unit="bpm"
          tone="fatigue"
        />
        <StatCard
          label={t("Avg speed", "Velocità media")}
          value={a.average_speed ? (a.average_speed * 3.6).toFixed(1) : "–"}
          unit="km/h"
        />
        <StatCard label={t("Cadence", "Cadenza")} value={r(a.average_cadence)} unit="rpm" />
        <StatCard
          label={t("Decoupling", "Disaccoppiamento")}
          value={decouple != null ? decouple.toFixed(1) : "–"}
          unit="%"
          hint={
            decouple != null
              ? decouple < 5
                ? t("Pw:HR steady (< 5%)", "Pw:FC stabile (< 5%)")
                : t("HR drifted vs power", "FC in deriva rispetto alla potenza")
              : undefined
          }
        />
        <StatCard label={t("Calories", "Calorie")} value={r(a.calories)} unit="kcal" />
      </div>

      {a.zoneTimes.some((s) => s > 0) && (
        <Panel title={t("Time in power zones", "Tempo nelle zone di potenza")}>
          <ZoneBar secs={a.zoneTimes} />
        </Panel>
      )}

      {a.icu_ftp && (a.icu_intervals?.length ?? 0) > 0 && (
        <Panel title={t("Workout blocks", "Blocchi di allenamento")}>
          <WorkoutBlocks
            intervals={a.icu_intervals ?? []}
            ftp={a.icu_ftp}
            selected={workId}
            onSelect={(id) => select(id, "blocks")}
          />
          <p className="mt-2 text-xs text-muted-foreground">
            {t(
              "Tap a block to see just that work on the map and charts.",
              "Tocca un blocco per vedere solo quel lavoro su mappa e grafici.",
            )}
          </p>
        </Panel>
      )}

      {streams ? (
        <div id="ride-map" className="scroll-mt-16">
          <Climbs
            a={a}
            streams={streams}
            weight={weight}
            work={work}
            onClear={() => setWorkId(null)}
          />
        </div>
      ) : (
        <Panel title={t("Elevation & climbs", "Altimetria e salite")}>
          <p className="py-6 text-center text-sm text-muted-foreground">
            {t("Loading ride streams…", "Caricamento dati attività…")}
          </p>
        </Panel>
      )}

      <Panel
        title={t("Speed, power & heart rate", "Velocità, potenza e frequenza cardiaca")}
        action={<ShowHide open={showCharts} onToggle={() => setShowCharts((v) => !v)} />}
      >
        {showCharts && work && <WorkBar work={work} onClear={() => setWorkId(null)} />}
        {showCharts &&
          (streams ? (
            <RideCharts a={a} streams={streams} work={work} />
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {t("Loading ride streams…", "Caricamento dati attività…")}
            </p>
          ))}
      </Panel>

      {intervals.length > 0 && (
        <Panel
          title={`${t("Intervals", "Intervalli")} · ${intervals.length}`}
          action={<ShowHide open={showIntervals} onToggle={() => setShowIntervals((v) => !v)} />}
        >
          {showIntervals && (
            <div className="-mx-2 divide-y divide-border text-sm">
              {intervals.map((i) => (
                <button
                  key={i.id}
                  type="button"
                  aria-pressed={workId === i.id}
                  onClick={() => select(workId === i.id ? null : i.id, "list")}
                  className={cn(
                    "stat-num flex w-full justify-between rounded-md px-2 py-2.5 text-left transition-colors hover:bg-secondary/40",
                    workId === i.id && "bg-secondary/60",
                  )}
                >
                  <span className="font-sans">{i.label ?? i.type}</span>
                  <span className="flex gap-4">
                    <span>{formatDuration(i.moving_time)}</span>
                    <span className="w-14 text-right">{r(i.average_watts, "W")}</span>
                    <span className="w-16 text-right text-fatigue">
                      {r(i.average_heartrate, " bpm")}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </Panel>
      )}
    </div>
  );
}

type Work = {
  id: number;
  label: string;
  startKm: number;
  endKm: number;
  secs: number;
  watts: number | null;
  hr: number | null;
};

/** Where an interval lies along the ride: its times matched to the streams' distance. */
function workOf(
  a: ActivityDetail,
  streams: RideStreams | undefined,
  id: number | null,
): Work | null {
  const iv = id != null ? a.icu_intervals?.find((i) => i.id === id) : undefined;
  if (!iv || !streams || iv.start_time == null || iv.end_time == null) return null;
  const at = (t: number) => {
    const i = streams.time.findIndex((x) => x >= t);
    return i < 0 ? streams.time.length - 1 : i;
  };
  const km = (i: number) => (streams.distance[i] ?? 0) / 1000;
  return {
    id: iv.id,
    label: iv.label ?? iv.type ?? t("Interval", "Intervallo"),
    startKm: km(at(iv.start_time)),
    endKm: km(at(iv.end_time)),
    secs: iv.end_time - iv.start_time,
    watts: iv.average_watts,
    hr: iv.average_heartrate,
  };
}

/** What's selected, and the way back to the whole ride. */
function WorkBar({ work, onClear }: { work: Work; onClear: () => void }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3 rounded-lg bg-secondary/60 px-3 py-2 text-sm">
      <span className="stat-num min-w-0">
        <span className="font-sans font-medium">{work.label}</span> · {formatDuration(work.secs)}
        {work.watts != null && ` · ${Math.round(work.watts)} W`}
        {work.hr != null && ` · ${Math.round(work.hr)} bpm`}
      </span>
      <Button size="sm" variant="ghost" onClick={onClear} className="shrink-0">
        {t("Whole ride", "Attività intera")}
      </Button>
    </div>
  );
}

function ShowHide({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <Button size="sm" variant="ghost" onClick={onToggle} aria-expanded={open}>
      {open ? t("Hide", "Nascondi") : t("Show", "Mostra")}
      <ChevronDown className={cn("transition-transform", open && "rotate-180")} />
    </Button>
  );
}

function Climbs({
  a,
  streams,
  weight,
  work,
  onClear,
}: {
  a: ActivityDetail;
  streams: RideStreams;
  weight: number | null;
  work: Work | null;
  onClear: () => void;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const [hoverKm, setHoverKm] = useState<number | null>(null);
  const [range, setRange] = useState<[number, number] | null>(null);
  const [name, setName] = useState("");
  // Saved segments as the library sees them (old stars follow their climb's shared stretch); no history sync here.
  const store = useSegmentLibrary({ sync: false });
  const savedList = useMemo(() => store.list.filter((s) => s.saved), [store.list]);
  const nameOf = useSegmentNames(store.list);
  const [segHover, setSegHover] = useState<number | null>(null);
  const climbs = useMemo(
    () =>
      detectClimbs({
        distance: streams.distance,
        altitude: streams.altitude,
        time: streams.time,
        watts: streams.watts,
        heartrate: streams.heartrate,
      }),
    [streams],
  );
  const track = useMemo(
    () =>
      streams.lat.length
        ? trackFromStreams({ id: a.id, name: a.name, date: a.start_date_local }, streams)
        : null,
    [a, streams],
  );
  // Every segment (saved + recurring auto) this ride went through, in riding order, ranked against all efforts.
  const onRide = useMemo(() => {
    if (!track) return [];
    const cells = new Set(track.lat.map((la, i) => cellOf(la, track.lng[i]!)));
    return store.list
      .filter((s) => mayPass(cells, s))
      .flatMap((seg) =>
        findAttempts(track, seg).map((at) => {
          const others = (store.efforts[seg.effortsKey]?.attempts ?? []).filter(
            (o) => o.trackId !== track.id,
          );
          return {
            seg,
            at,
            rank: 1 + others.filter((o) => o.duration < at.duration).length,
            of: others.length + 1,
          };
        }),
      )
      .sort((x, y) => x.at.i0 - y.at.i0);
  }, [track, store.list, store.efforts]);
  // An outdoor ride missing from the segment index (e.g. uploaded late) is analysed now, so its efforts also
  // count in each segment's standings and the rank shown here is against every effort.
  const outdoor =
    !!track &&
    (a.type ?? "").includes("Ride") &&
    !(a.type ?? "").startsWith("Virtual") &&
    !a.trainer;
  useEffect(() => {
    if (outdoor)
      void segmentEngine
        .ensureRide({ id: a.id, name: a.name, date: a.start_date_local })
        .catch((e) => console.warn("Couldn't add the ride to the segment index", e));
  }, [outdoor, a.id, a.name, a.start_date_local]);
  const totalKm = (streams.distance.at(-1) ?? 0) / 1000;

  // Map: the ride, its climbs by category, and the segment being marked with the slider.
  const at = (km: number) => {
    const i = track ? track.dist.findIndex((d) => d >= km * 1000) : -1;
    return i < 0 ? (track?.dist.length ?? 1) - 1 : i;
  };
  const cut = (a: number, b: number) => ({
    lat: track!.lat.slice(at(a), at(b) + 1),
    lng: track!.lng.slice(at(a), at(b) + 1),
  });
  const mapLines = useMemo<MapLine[]>(() => {
    if (!track) return [];
    const ls: MapLine[] = [
      { lat: track.lat, lng: track.lng, color: "var(--foreground)", weight: 3, opacity: 0.55 },
    ];
    climbs.forEach((c, i) =>
      ls.push({
        ...cut(c.startKm, c.endKm),
        color: CAT_COLOR[c.category],
        weight: hover === i ? 9 : 6,
        tooltip: `${t("Climb", "Salita")} ${i + 1} · ${(c.length / 1000).toFixed(1)} km @ ${c.avgGrade.toFixed(1)}%`,
      }),
    );
    if (range) ls.push({ ...cut(range[0], range[1]), color: "#ffffff", weight: 7 });
    if (work && !range) ls.push({ ...cut(work.startKm, work.endKm), color: "#ffffff", weight: 8 });
    const sh = segHover != null ? onRide[segHover] : undefined;
    if (sh)
      ls.push({
        lat: track.lat.slice(sh.at.i0, sh.at.i1 + 1),
        lng: track.lng.slice(sh.at.i0, sh.at.i1 + 1),
        color: "#ffffff",
        weight: 8,
      });
    return ls;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track, climbs, hover, range, segHover, onRide, work]);
  const mapPins = useMemo<MapPin[]>(() => {
    if (!track) return [];
    const p = (km: number) => ({ lat: track.lat[at(km)]!, lng: track.lng[at(km)]! });
    if (range)
      return [
        { ...p(range[0]), color: "var(--pine)", label: t("Segment start", "Inizio segmento") },
        { ...p(range[1]), color: "var(--lingon)", label: t("Segment finish", "Fine segmento") },
      ];
    return [
      {
        lat: track.lat[0]!,
        lng: track.lng[0]!,
        color: "var(--pine)",
        label: t("Start", "Partenza"),
      },
      {
        lat: track.lat.at(-1)!,
        lng: track.lng.at(-1)!,
        color: "var(--lingon)",
        label: t("Finish", "Arrivo"),
      },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track, range]);
  const cursor =
    track && hoverKm != null
      ? { lat: track.lat[at(hoverKm)]!, lng: track.lng[at(hoverKm)]! }
      : null;
  const savedFor = (startKm: number, endKm: number) =>
    track ? (savedList.find((s) => isClimbOnTrack(track, s, startKm, endKm)) ?? null) : null;

  function saveRange() {
    if (!track || !range) return;
    const seg = segmentFromRange(track, range[0], range[1], "custom", name.trim() || undefined);
    store.save(seg, !!name.trim());
    toast.success(
      name.trim()
        ? t(`Saved “${seg.name}”`, `Salvato “${seg.name}”`)
        : t(
            "Segment saved; it gets its name from the map",
            "Segmento salvato; prenderà il nome dalla mappa",
          ),
    );
    setRange(null);
    setName("");
  }

  return (
    <>
      <Panel
        title={`${track ? t("Map, elevation & climbs", "Mappa, altimetria e salite") : t("Elevation & climbs", "Altimetria e salite")}${climbs.length ? ` · ${climbs.length}` : ""}`}
        action={
          track && !range ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                setRange([Math.min(1, totalKm / 3), Math.min(totalKm, Math.max(2, totalKm / 2))])
              }
            >
              <Plus /> {t("Segment", "Segmento")}
            </Button>
          ) : undefined
        }
      >
        {work && <WorkBar work={work} onClear={onClear} />}
        {track && (
          <RouteMap
            fitKey={a.id}
            lines={mapLines}
            pins={mapPins}
            cursor={cursor}
            focus={work ? { key: `work-${work.id}`, ...cut(work.startKm, work.endKm) } : null}
            className="mb-4"
          />
        )}
        <ElevationProfile
          distance={streams.distance}
          altitude={streams.altitude}
          climbs={climbs}
          highlight={hover}
          selection={range ?? (work ? [work.startKm, work.endKm] : null)}
          onHoverKm={setHoverKm}
        />

        {range && (
          <div className="mt-4 space-y-3 rounded-lg bg-background/50 p-3">
            <div className="stat-num flex justify-between text-xs text-muted-foreground">
              <span>
                {t("Start", "Inizio")} {range[0].toFixed(2)} km
              </span>
              <span>{((range[1] - range[0]) * 1000).toFixed(0)} m</span>
              <span>
                {t("Finish", "Fine")} {range[1].toFixed(2)} km
              </span>
            </div>
            <Slider
              min={0}
              max={totalKm}
              step={0.01}
              minStepsBetweenThumbs={20}
              value={range}
              onValueChange={(v) => setRange([v[0]!, v[1]!])}
            />
            <div className="flex gap-2">
              <Input
                placeholder={t("Segment name (optional)", "Nome segmento (facoltativo)")}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <Button onClick={saveRange}>{t("Save", "Salva")}</Button>
              <Button variant="ghost" onClick={() => setRange(null)}>
                {t("Cancel", "Annulla")}
              </Button>
            </div>
          </div>
        )}

        {climbs.length > 0 && (
          <>
            {/* Phone: one compact row per climb instead of a table wider than the screen. */}
            <div className="-mx-4 mt-4 divide-y divide-border md:hidden">
              {climbs.map((c, i) => {
                const saved = savedFor(c.startKm, c.endKm);
                // Two short lines that fit a phone: shape (length, grades), then effort (VAM, power).
                const effort = [
                  c.vam != null && `VAM ${Math.round(c.vam)}`,
                  c.avgWatts != null && `${Math.round(c.avgWatts)} W`,
                  c.avgWatts && weight && `${(c.avgWatts / weight).toFixed(2)} W/kg`,
                ].filter(Boolean);
                return (
                  <div
                    key={i}
                    className={cn(
                      "flex items-center gap-1 pr-2 transition-colors",
                      hover === i && "bg-secondary/60",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => setHover(hover === i ? null : i)}
                      className="flex min-w-0 flex-1 items-center gap-3 py-3 pl-4 text-left active:bg-secondary/40"
                    >
                      <span className="stat-num w-5 shrink-0 text-sm text-muted-foreground">
                        {i + 1}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="stat-num flex items-center gap-2 text-sm">
                          <span
                            className="rounded px-1.5 py-0.5 text-xs font-semibold text-background"
                            style={{ background: CAT_COLOR[c.category] }}
                          >
                            {c.category === "Uncat"
                              ? "–"
                              : c.category === "HC"
                                ? "HC"
                                : `Cat ${c.category}`}
                          </span>
                          {(c.length / 1000).toFixed(1)} km · {c.avgGrade.toFixed(1)}%
                        </span>
                        <span className="stat-num block text-xs text-muted-foreground">
                          Max {c.maxGrade.toFixed(1)}%
                          {effort.length > 0 && ` · ${effort.join(" · ")}`}
                        </span>
                      </span>
                      <span className="stat-num shrink-0 text-right text-base font-semibold">
                        {formatClock(c.duration)}
                      </span>
                    </button>
                    {track ? (
                      <button
                        aria-label={
                          saved?.starred
                            ? t("Unstar climb", "Togli dai preferiti")
                            : t("Star climb", "Aggiungi ai preferiti")
                        }
                        onClick={() =>
                          store.toggleStar(
                            saved ?? segmentFromRange(track, c.startKm, c.endKm, "auto"),
                          )
                        }
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg active:bg-secondary/60"
                      >
                        <Star
                          className={cn(
                            "h-5 w-5",
                            saved?.starred ? "fill-birch text-birch" : "text-muted-foreground",
                          )}
                        />
                      </button>
                    ) : (
                      <span className="w-11 shrink-0" />
                    )}
                  </div>
                );
              })}
            </div>
            <div className="-mx-4 mt-4 hidden overflow-x-auto px-4 md:block">
              <table className="stat-num w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="eyebrow text-left">
                    <th className="py-2 font-normal">#</th>
                    <th className="font-normal">Cat</th>
                    <th className="text-right font-normal">Km</th>
                    <th className="text-right font-normal">{t("Avg", "Media")}</th>
                    <th className="text-right font-normal">Max</th>
                    <th className="text-right font-normal">{t("Time", "Tempo")}</th>
                    <th className="text-right font-normal">VAM</th>
                    <th className="text-right font-normal">{t("Power", "Potenza")}</th>
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
                          <span
                            className="rounded px-1.5 py-0.5 text-xs font-semibold text-background"
                            style={{ background: CAT_COLOR[c.category] }}
                          >
                            {c.category === "Uncat"
                              ? "–"
                              : c.category === "HC"
                                ? "HC"
                                : `Cat ${c.category}`}
                          </span>
                        </td>
                        <td className="text-right">{(c.length / 1000).toFixed(1)}</td>
                        <td className="text-right">{c.avgGrade.toFixed(1)}%</td>
                        <td className="text-right">{c.maxGrade.toFixed(1)}%</td>
                        <td className="text-right">{formatClock(c.duration)}</td>
                        <td className="text-right">{r(c.vam)}</td>
                        <td className="text-right">{r(c.avgWatts, "W")}</td>
                        <td className="text-right">
                          {c.avgWatts && weight ? (c.avgWatts / weight).toFixed(2) : "–"}
                        </td>
                        {track && (
                          <td className="text-right">
                            <button
                              aria-label={
                                saved?.starred
                                  ? t("Unstar climb", "Togli dai preferiti")
                                  : t("Star climb", "Aggiungi ai preferiti")
                              }
                              onClick={(e) => {
                                e.stopPropagation();
                                store.toggleStar(
                                  saved ?? segmentFromRange(track, c.startKm, c.endKm, "auto"),
                                );
                              }}
                              className="p-1"
                            >
                              <Star
                                className={cn(
                                  "h-4 w-4",
                                  saved?.starred
                                    ? "fill-birch text-birch"
                                    : "text-muted-foreground",
                                )}
                              />
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Panel>

      <Panel
        title={`${t("Segments on this ride", "Segmenti in questa attività")}${onRide.length ? ` · ${onRide.length}` : ""}`}
      >
        {onRide.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            {track
              ? store.ridesAnalysed
                ? t(
                    "This ride doesn't pass any of your segments.",
                    "Questa attività non passa da nessuno dei tuoi segmenti.",
                  )
                : t(
                    "Open Segments once to analyse your rides; recurring climbs will then show up here.",
                    "Apri Segmenti una volta per analizzare le attività; le salite ricorrenti appariranno qui.",
                  )
              : t("No GPS on this ride.", "Nessun GPS in questa attività.")}
          </p>
        ) : (
          <>
            {/* Phone: one compact row per segment instead of a table wider than the screen. */}
            <div className="-mx-4 divide-y divide-border md:hidden">
              {onRide.map(({ seg, at, rank, of }) => {
                const effort = [
                  at.avgWatts != null && `${Math.round(at.avgWatts)} W`,
                  at.avgWatts && weight && `${(at.avgWatts / weight).toFixed(2)} W/kg`,
                  at.vam != null && `VAM ${Math.round(at.vam)}`,
                  at.avgHr != null && `${Math.round(at.avgHr)} bpm`,
                ].filter(Boolean);
                return (
                  <Link
                    key={`${seg.id}-${at.i0}`}
                    to="/segments/$id"
                    params={{ id: seg.id }}
                    className="flex items-center gap-3 px-4 py-3 active:bg-secondary/40"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {seg.starred && (
                          <Star className="mr-1 inline h-3.5 w-3.5 fill-birch text-birch" />
                        )}
                        {nameOf(seg)}
                      </span>
                      <span className="stat-num block truncate text-xs text-muted-foreground">
                        {segmentSummary(seg)}
                      </span>
                      {effort.length > 0 && (
                        <span className="stat-num block truncate text-xs text-muted-foreground">
                          {effort.join(" · ")}
                        </span>
                      )}
                    </span>
                    <span className="stat-num shrink-0 text-right">
                      <span className="block text-base font-semibold">
                        {formatClock(at.duration)}
                      </span>
                      {rank === 1 && of > 1 ? (
                        <span className="inline-flex items-center gap-1 rounded bg-birch px-1.5 py-0.5 text-[10px] font-semibold text-background">
                          <Trophy className="h-3 w-3" /> PR
                        </span>
                      ) : (
                        <span className="block text-xs text-muted-foreground">
                          {rank}/{of}
                        </span>
                      )}
                    </span>
                  </Link>
                );
              })}
            </div>
            <div className="-mx-4 hidden overflow-x-auto px-4 md:block">
              <table className="stat-num w-full min-w-[600px] text-sm">
                <thead>
                  <tr className="eyebrow text-left">
                    <th className="py-2 font-normal">{t("Segment", "Segmento")}</th>
                    <th className="text-right font-normal">{t("Time", "Tempo")}</th>
                    <th className="text-right font-normal">{t("Rank", "Pos.")}</th>
                    <th className="text-right font-normal">{t("Power", "Potenza")}</th>
                    <th className="text-right font-normal">W/kg</th>
                    <th className="text-right font-normal">VAM</th>
                    <th className="text-right font-normal">{t("HR", "FC")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {onRide.map(({ seg, at, rank, of }, i) => (
                    <tr
                      key={`${seg.id}-${at.i0}`}
                      onMouseEnter={() => setSegHover(i)}
                      onMouseLeave={() => setSegHover(null)}
                      className={cn("transition-colors", segHover === i && "bg-secondary/60")}
                    >
                      <td className="max-w-0 py-2 pr-3 font-sans">
                        <Link
                          to="/segments/$id"
                          params={{ id: seg.id }}
                          className="block truncate font-medium hover:text-primary"
                        >
                          {seg.starred && (
                            <Star className="mr-1 inline h-3.5 w-3.5 fill-birch text-birch" />
                          )}
                          {nameOf(seg)}
                        </Link>
                        <div className="stat-num truncate text-xs text-muted-foreground">
                          {segmentSummary(seg)}
                        </div>
                      </td>
                      <td className="text-right">{formatClock(at.duration)}</td>
                      <td className="text-right">
                        {rank === 1 && of > 1 ? (
                          <span className="inline-flex items-center gap-1 rounded bg-birch px-1.5 py-0.5 text-[10px] font-semibold text-background">
                            <Trophy className="h-3 w-3" /> PR
                          </span>
                        ) : (
                          <span className="text-muted-foreground">
                            {rank}
                            <span className="text-[10px]">/{of}</span>
                          </span>
                        )}
                      </td>
                      <td className="text-right">{r(at.avgWatts, "W")}</td>
                      <td className="text-right">
                        {at.avgWatts && weight ? (at.avgWatts / weight).toFixed(2) : "–"}
                      </td>
                      <td className="text-right">{r(at.vam)}</td>
                      <td className="text-right text-fatigue">{r(at.avgHr)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Panel>
    </>
  );
}
