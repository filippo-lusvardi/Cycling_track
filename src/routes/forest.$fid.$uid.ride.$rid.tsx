import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { parseISO } from "date-fns";
import { ArrowLeft } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { GradientProfile, gradientLines } from "@/components/GradientProfile";
import { RouteMap } from "@/components/RouteMap";
import { Panel, StatCard } from "@/components/StatCard";
import { watchMembers, type Member } from "@/lib/forest/forests";
import { watchClimb, type ForestClimb } from "@/lib/forest/leaderboard";
import { climbOnRoute, PRIVACY_ZONE, type RidePage } from "@/lib/forest/rides";
import { readRidePage } from "@/lib/forest/trees";
import { format, t } from "@/lib/i18n";
import { useScreenTrace } from "@/lib/perf";
import { formatDuration, formatKm } from "@/lib/training";

export const Route = createFileRoute("/forest/$fid/$uid/ride/$rid")({
  // Opened from a forest climb's leaderboard: that climb is highlighted on the route.
  validateSearch: (s: Record<string, unknown>): { climb?: string } =>
    typeof s["climb"] === "string" && s["climb"] ? { climb: s["climb"] } : {},
  head: () => ({ meta: [{ title: t("Ride — Cirmolo", "Uscita — Cirmolo") }] }),
  component: FriendRide,
});

/**
 * A friend's shared ride: its summary, and the route and altitude profile when they share maps, with the first and
 * last kilometre cut off (where rides usually start: home); heart rate and power when they share those. No load.
 */
function FriendRide() {
  const { fid, uid, rid } = Route.useParams();
  const { climb: sid } = Route.useSearch();
  // A published page rarely changes: kept on the device (persisted query cache), checked again after an hour.
  const q = useQuery({
    queryKey: ["forest-ride", fid, uid, rid],
    queryFn: () => readRidePage(fid, uid, rid),
    staleTime: 3600_000,
  });
  const ride: RidePage | null | undefined = q.isError ? null : q.data;
  useScreenTrace("forest_ride_open", ride !== undefined, !q.isFetchedAfterMount);
  const [members, setMembers] = useState<Member[]>([]);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => watchMembers(fid, setMembers), [fid]);
  const [climb, setClimb] = useState<ForestClimb | null>(null);
  useEffect(() => {
    if (!sid) return void setClimb(null);
    return watchClimb(fid, sid, setClimb);
  }, [fid, sid]);
  const route = ride?.route ?? null;
  const span = useMemo(() => (route && climb ? climbOnRoute(route, climb) : null), [route, climb]);
  const lines = useMemo(() => (route ? gradientLines(route, span) : []), [route, span]);
  const pins = useMemo(
    () =>
      route && span
        ? [
            {
              lat: route.lat[span.i0]!,
              lng: route.lng[span.i0]!,
              color: "var(--pine)",
              label: t("Climb start", "Inizio salita"),
            },
            {
              lat: route.lat[span.i1]!,
              lng: route.lng[span.i1]!,
              color: "var(--lingon)",
              label: t("Climb top", "Fine salita"),
            },
          ]
        : [],
    [route, span],
  );
  const name = members.find((m) => m.uid === uid)?.name ?? "";
  const backCls =
    "inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground";
  // Back to where it was opened from: the climb's leaderboard, or the member's tree.
  const back = sid ? (
    <Link to="/forest/$fid/climb/$sid" params={{ fid, sid }} className={backCls}>
      <ArrowLeft className="h-4 w-4" />
      {climb?.name ?? t("Climb", "Salita")}
    </Link>
  ) : (
    <Link to="/forest/$fid/$uid" params={{ fid, uid }} className={backCls}>
      <ArrowLeft className="h-4 w-4" />
      {name ? t(`${name}'s tree`, `L'albero di ${name}`) : t("Tree", "Albero")}
    </Link>
  );

  if (ride === undefined) return back;
  if (ride === null)
    return (
      <div className="space-y-4">
        {back}
        <p className="text-sm text-muted-foreground">
          {t(
            "This ride isn't shared in this forest (or is more than a year old).",
            "Questa uscita non è condivisa in questo bosco (o ha più di un anno).",
          )}
        </p>
      </div>
    );
  const speed = ride.distance && ride.moving_time ? (ride.distance / ride.moving_time) * 3.6 : null;
  // Pages published before heart rate and power could be shared have no effort field.
  const effort = ride.effort ?? null;
  const n = (v: number | null) => (v != null ? String(v) : "–");
  const hidden = effort ? undefined : t("Not shared", "Non condivisi");

  return (
    <div className="space-y-6">
      {back}
      <div>
        <div className="eyebrow">
          {format(parseISO(ride.start_date_local), "EEEE d MMMM yyyy")}
          {name && ` · ${name}`}
        </div>
        <h1 className="text-3xl font-bold tracking-tight">{ride.name ?? ride.type}</h1>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label={t("Distance", "Distanza")} value={formatKm(ride.distance)} />
        <StatCard
          label={t("Moving time", "Tempo in movimento")}
          value={formatDuration(ride.moving_time)}
        />
        <StatCard
          label={t("Climbing", "Dislivello")}
          value={ride.total_elevation_gain != null ? Math.round(ride.total_elevation_gain) : "–"}
          unit="m"
        />
        <StatCard
          label={t("Avg speed", "Velocità media")}
          value={speed != null ? speed.toFixed(1) : "–"}
          unit="km/h"
        />
        <StatCard
          label={t("Avg / max HR", "FC media / max")}
          value={effort ? `${n(effort.avgHr)} / ${n(effort.maxHr)}` : "–"}
          unit="bpm"
          tone="fatigue"
          hint={hidden}
        />
        <StatCard
          label={t("Avg / max power", "Potenza media / max")}
          value={effort ? `${n(effort.avgWatts)} / ${n(effort.maxWatts)}` : "–"}
          unit="W"
          hint={hidden}
        />
        <StatCard
          label={t("Norm. power", "Potenza norm.")}
          value={effort ? n(effort.np) : "–"}
          unit="W"
          hint={hidden}
        />
      </div>
      {route ? (
        <Panel title={t("Route", "Percorso")}>
          <div className="space-y-3">
            {climb && (
              <p className="text-sm">
                {span ? (
                  <>
                    <span className="text-muted-foreground">
                      {t("Highlighted: ", "Evidenziata: ")}
                    </span>
                    <span className="font-medium">{climb.name}</span>
                    <span className="stat-num text-muted-foreground">
                      {` · km ${(span.from / 1000).toFixed(1)}–${(span.to / 1000).toFixed(1)}`}
                    </span>
                  </>
                ) : (
                  <span className="text-muted-foreground">
                    {t(
                      `${climb.name} can't be shown on this map (it may fall in a hidden end).`,
                      `${climb.name} non si può mostrare su questa mappa (potrebbe cadere in un tratto nascosto).`,
                    )}
                  </span>
                )}
              </p>
            )}
            <RouteMap
              fitKey={rid}
              lines={lines}
              pins={pins}
              cursor={hover != null ? { lat: route.lat[hover]!, lng: route.lng[hover]! } : null}
            />
            <GradientProfile
              dist={route.dist}
              alt={route.alt}
              hover={hover}
              onHover={setHover}
              focus={span}
            />
            <p className="text-xs text-muted-foreground">
              {t(
                `The first and last ${PRIVACY_ZONE / 1000} km are hidden, for privacy.`,
                `Il primo e l'ultimo ${PRIVACY_ZONE / 1000} km sono nascosti, per privacy.`,
              )}
            </p>
          </div>
        </Panel>
      ) : (
        <p className="text-sm text-muted-foreground">
          {ride.trainer
            ? t("An indoor ride: no route.", "Un'uscita indoor: nessun percorso.")
            : t("No map for this ride.", "Nessuna mappa per questa uscita.")}
        </p>
      )}
    </div>
  );
}
