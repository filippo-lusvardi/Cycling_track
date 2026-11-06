// How time was spread over power and heart rate: a histogram, and the zones it adds up to. For one activity from its
// streams; for a stretch from each activity's histogram, and its zones alone when it's too long to read them all.
import { useQueries, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Panel } from "@/components/StatCard";
import { ZoneBar } from "@/components/ZoneBar";
import { ZONE_NAMES } from "@/lib/analysis";
import {
  apartCoasting,
  BUCKET,
  drawnBuckets,
  mergeHistograms,
  streamBuckets,
  sumZones,
  zonesOfBuckets,
  type Bucket,
  type DistMetric,
} from "@/lib/distribution";
import { t } from "@/lib/i18n";
import type { Activity, RideStreams } from "@/lib/intervals";
import { histogramsQuery, rideZonesQuery, streamsQuery } from "@/lib/queries";
import { zoneIndex } from "@/lib/run-metrics";
import { mainSport, type MainSport } from "@/lib/sport";
import { formatDuration } from "@/lib/training";
import { cn } from "@/lib/utils";
import { hrZoneNames } from "@/lib/zone-table";

/** Longer than this, a recap shows zones only: its histogram would mean a request per activity. */
export const HISTOGRAM_DAYS = 31;

const UNIT: Record<DistMetric, string> = { power: "W", hr: "bpm" };
const hasTime = (z: number[] | undefined): z is number[] => !!z?.some((s) => s > 0);

function Histogram({
  buckets,
  metric,
  tops,
  faded,
  small,
}: {
  buckets: Bucket[];
  metric: DistMetric;
  tops: number[];
  faded?: boolean;
  small?: boolean;
}) {
  const size = BUCKET[metric];
  const data = useMemo(() => {
    const { buckets: drawn, open } = drawnBuckets(buckets, size);
    return drawn.map((b, i) => {
      const last = open && i === drawn.length - 1;
      return {
        x: last ? `${b.start}+` : String(b.start),
        range: last
          ? `${b.start}+ ${UNIT[metric]}`
          : `${b.start}–${b.start + size} ${UNIT[metric]}`,
        min: b.secs / 60,
        secs: b.secs,
        zone: tops.length ? zoneIndex(b.start + size / 2, tops) + 1 : 2,
      };
    });
  }, [buckets, size, tops, metric]);
  return (
    <div className={cn(small ? "h-28" : "h-44", faded && "opacity-40")}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ left: -20, right: 4, top: 4 }} barCategoryGap={1}>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="x"
            stroke="var(--muted-foreground)"
            fontSize={11}
            minTickGap={24}
            tickLine={false}
          />
          <YAxis
            stroke="var(--muted-foreground)"
            fontSize={11}
            allowDecimals={false}
            tickFormatter={(v: number) => `${v}′`}
          />
          <Tooltip
            cursor={{ fill: "var(--secondary)", fillOpacity: 0.5 }}
            content={({ active, payload }) => {
              const d = payload?.[0]?.payload as (typeof data)[number] | undefined;
              return active && d ? (
                <div className="rounded-lg border border-border bg-card px-2 py-1 text-xs shadow-lg">
                  <span className="stat-num">{d.range}</span>
                  <span className="stat-num ml-2 text-muted-foreground">
                    {formatDuration(d.secs)}
                  </span>
                </div>
              ) : null;
            }}
          />
          <Bar dataKey="min" radius={[3, 3, 0, 0]} isAnimationActive={false}>
            {data.map((d) => (
              <Cell key={d.x} fill={`var(--z${d.zone})`} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

type Side = { buckets: Bucket[] | null; zones: number[] | undefined; tops: number[] };

function DistributionPanel({
  power,
  hr,
  sport,
  initial,
  focused,
  pending,
  zonesOnly,
  count,
  missing,
}: {
  power: Side;
  hr: Side;
  sport: MainSport;
  initial?: DistMetric;
  focused?: boolean;
  /** Histograms still being read: done of total. */
  pending?: { done: number; total: number } | null;
  zonesOnly?: boolean;
  count?: number;
  /** Why there's no histogram, when there should be one. */
  missing?: string | null;
}) {
  const sides = { power, hr };
  const has = (m: DistMetric) => hasTime(sides[m].zones) || !!sides[m].buckets?.length;
  const metrics = (["power", "hr"] as const).filter(has);
  const [picked, setPicked] = useState<DistMetric | null>(initial ?? null);
  const metric = picked && metrics.includes(picked) ? picked : metrics[0];
  const ref = useRef<HTMLDivElement>(null);
  // The page keeps growing above this while its other parts load, so it scrolls again once they've had time to.
  const ready = !!metric;
  useEffect(() => {
    if (!focused || !ready) return;
    const go = () => ref.current?.scrollIntoView({ block: "start" });
    const timers = [100, 600, 1500].map((ms) => setTimeout(go, ms));
    const stop = () => timers.forEach(clearTimeout);
    // Someone already scrolling or tapping is left alone.
    window.addEventListener("wheel", stop, { once: true, passive: true });
    window.addEventListener("touchstart", stop, { once: true, passive: true });
    return () => {
      stop();
      window.removeEventListener("wheel", stop);
      window.removeEventListener("touchstart", stop);
    };
  }, [focused, ready]);
  if (!metric) return null;

  const side = sides[metric];
  const { buckets, coasting } = apartCoasting(side.buckets ?? [], metric);
  const zones = hasTime(side.zones)
    ? side.zones
    : zonesOfBuckets(buckets, BUCKET[metric], side.tops);
  const caption = [
    missing && !buckets.length ? missing : null,
    pending
      ? t(
          `Reading the activities: ${pending.done} of ${pending.total}…`,
          `Lettura delle attività: ${pending.done} di ${pending.total}…`,
        )
      : buckets.length
        ? t(
            `Minutes per ${BUCKET[metric]} ${UNIT[metric]} band`,
            `Minuti per fascia da ${BUCKET[metric]} ${UNIT[metric]}`,
          )
        : null,
    count && buckets.length && !pending
      ? t(`from ${count} activities`, `da ${count} attività`)
      : null,
    coasting && !pending
      ? t(
          `not pedalling ${formatDuration(coasting)}, left out of the chart`,
          `senza pedalare ${formatDuration(coasting)}, fuori dal grafico`,
        )
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div ref={ref} className="scroll-mt-20">
      <Panel
        title={t("Distribution", "Distribuzione")}
        {...(metrics.length > 1
          ? {
              action: (
                <div className="flex gap-1 rounded-lg bg-secondary p-1">
                  {metrics.map((m) => (
                    <button
                      key={m}
                      onClick={() => setPicked(m)}
                      aria-pressed={m === metric}
                      className={cn(
                        "rounded-md px-3 py-1 text-xs",
                        m === metric ? "bg-background text-foreground" : "text-muted-foreground",
                      )}
                    >
                      {m === "power" ? t("Power", "Potenza") : t("HR", "FC")}
                    </button>
                  ))}
                </div>
              ),
            }
          : {})}
      >
        {buckets.length > 0 && (
          <Histogram buckets={buckets} metric={metric} tops={side.tops} faded={!!pending} />
        )}
        {caption && <p className="mt-2 text-xs text-muted-foreground">{caption}</p>}
        <div className={buckets.length || caption ? "mt-3" : undefined}>
          <ZoneBar secs={zones} names={metric === "hr" ? [...hrZoneNames(sport)] : ZONE_NAMES} />
        </div>
        {zonesOnly && (
          <p className="mt-3 text-xs text-muted-foreground">
            {t(
              `For the histogram, choose a stretch of up to ${HISTOGRAM_DAYS} days.`,
              `Per l'istogramma, scegli un periodo fino a ${HISTOGRAM_DAYS} giorni.`,
            )}
          </p>
        )}
      </Panel>
    </div>
  );
}

const NO_ZONES = { power: [] as number[], hr: [] as number[] };

/** One activity: its streams give the histogram, and intervals.icu's own zone times the shares, so the two apps agree. */
export function RideDistribution({
  a,
  streams,
  sport,
  initial,
  focused,
}: {
  a: Activity;
  streams: RideStreams | undefined;
  sport: MainSport;
  initial?: DistMetric;
  focused?: boolean;
}) {
  const streamsFailed = useQuery(streamsQuery(a.id)).isError;
  const { data: zones = NO_ZONES } = useQuery(rideZonesQuery(sport));
  const power = useMemo(
    () => (streams && sport !== "run" ? streamBuckets(streams.watts, "power") : null),
    [streams, sport],
  );
  const hr = useMemo(() => (streams ? streamBuckets(streams.heartrate, "hr") : null), [streams]);
  return (
    <DistributionPanel
      sport={sport}
      power={{
        buckets: power,
        zones: sport === "run" ? undefined : a.zoneTimes,
        tops: zones.power,
      }}
      hr={{ buckets: hr, zones: a.hrZoneTimes, tops: zones.hr }}
      missing={
        streamsFailed
          ? t(
              "Couldn't read this activity for the histogram",
              "Impossibile leggere l'attività per l'istogramma",
            )
          : streams
            ? null
            : t("Loading…", "Caricamento…")
      }
      {...(initial ? { initial } : {})}
      {...(focused ? { focused } : {})}
    />
  );
}

/** A stretch: zones add up at once from what's already read; histograms follow, on stretches short enough. */
export function RecapDistribution({
  acts,
  days,
  initial,
  focused,
}: {
  acts: Activity[];
  days: number;
  initial?: DistMetric;
  focused?: boolean;
}) {
  const sport = mainSport();
  const { data: zones = NO_ZONES } = useQuery(rideZonesQuery(sport));
  const short = days <= HISTOGRAM_DAYS;
  const pool = useMemo(
    () => acts.filter((a) => a.icu_average_watts != null || a.average_heartrate != null),
    [acts],
  );
  const reads = useQueries({
    queries: pool.map((a) => ({ ...histogramsQuery(a.id), enabled: short })),
  });
  const done = reads.filter((r) => r.data || r.isError).length;
  const key = reads.map((r) => r.dataUpdatedAt).join();
  const found = useMemo(
    () => reads.flatMap((r) => (r.data ? [r.data] : [])),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `reads` changes with `key`.
    [key],
  );
  const power = useMemo(() => mergeHistograms(found.map((h) => h.power)), [found]);
  const hr = useMemo(() => mergeHistograms(found.map((h) => h.hr)), [found]);
  const powerZones = useMemo(() => sumZones(acts.map((a) => a.zoneTimes)), [acts]);
  const hrZones = useMemo(() => sumZones(acts.map((a) => a.hrZoneTimes)), [acts]);
  const read = short && found.length > 0;
  const failed = reads.filter((r) => r.isError).length;
  const nothing = short && done === pool.length && pool.length > 0 && !power.length && !hr.length;
  return (
    <DistributionPanel
      sport={sport}
      power={{ buckets: read ? power : null, zones: powerZones, tops: zones.power }}
      hr={{ buckets: read ? hr : null, zones: hrZones, tops: zones.hr }}
      pending={short && done < pool.length ? { done, total: pool.length } : null}
      zonesOnly={!short}
      count={found.length}
      missing={
        short && failed && !found.length
          ? t(
              "Couldn't read the activities for the histogram",
              "Impossibile leggere le attività per l'istogramma",
            )
          : nothing
            ? t("No power or heart rate recorded", "Nessun dato di potenza o FC")
            : null
      }
      {...(initial ? { initial } : {})}
      {...(focused ? { focused } : {})}
    />
  );
}

/** In the bar's panel: only the histogram and the bar, since the keyboard's gone and the page is one tap away. */
export function MiniDistribution({
  acts,
  metric,
  days,
}: {
  acts: Activity[];
  metric: DistMetric;
  days: number;
}) {
  const sport = mainSport();
  const { data: zones = NO_ZONES } = useQuery(rideZonesQuery(sport));
  const short = days <= HISTOGRAM_DAYS;
  const reads = useQueries({
    queries: acts.map((a) => ({ ...histogramsQuery(a.id), enabled: short })),
  });
  const key = reads.map((r) => r.dataUpdatedAt).join();
  const merged = useMemo(
    () => mergeHistograms(reads.flatMap((r) => (r.data ? [r.data[metric]] : []))),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `reads` changes with `key`.
    [key, metric],
  );
  const { buckets } = apartCoasting(merged, metric);
  const tops = metric === "power" ? zones.power : zones.hr;
  const summed = sumZones(acts.map((a) => (metric === "power" ? a.zoneTimes : a.hrZoneTimes)));
  const shares = hasTime(summed) ? summed : zonesOfBuckets(buckets, BUCKET[metric], tops);
  return (
    <div className="space-y-2">
      {buckets.length > 0 && <Histogram buckets={buckets} metric={metric} tops={tops} small />}
      <ZoneBar secs={shares} legend={false} empty="" />
    </div>
  );
}
