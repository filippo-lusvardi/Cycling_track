import { createFileRoute, Link } from "@tanstack/react-router";
import { parseISO } from "date-fns";
import { ArrowLeft } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { GradientProfile, gradientLines } from "@/components/GradientProfile";
import { RouteMap } from "@/components/RouteMap";
import { Panel, StatCard } from "@/components/StatCard";
import { watchMembers, type Member } from "@/lib/forest/forests";
import { PRIVACY_ZONE, type RidePage } from "@/lib/forest/rides";
import { readRidePage } from "@/lib/forest/trees";
import { format, t } from "@/lib/i18n";
import { formatDuration, formatKm } from "@/lib/training";

export const Route = createFileRoute("/forest/$fid/$uid/ride/$rid")({
  head: () => ({ meta: [{ title: t("Ride — Cirmolo", "Uscita — Cirmolo") }] }),
  component: FriendRide,
});

/**
 * A friend's shared ride: its summary, and the route and altitude profile when they share maps, with the first and
 * last kilometre cut off (where rides usually start: home); heart rate and power when they share those. No load.
 */
function FriendRide() {
  const { fid, uid, rid } = Route.useParams();
  const [ride, setRide] = useState<RidePage | null | undefined>(undefined);
  const [members, setMembers] = useState<Member[]>([]);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    void readRidePage(fid, uid, rid).then(setRide, () => setRide(null));
  }, [fid, uid, rid]);
  useEffect(() => watchMembers(fid, setMembers), [fid]);
  const route = ride?.route ?? null;
  const lines = useMemo(() => (route ? gradientLines(route) : []), [route]);
  const name = members.find((m) => m.uid === uid)?.name ?? "";
  const back = (
    <Link
      to="/forest/$fid/$uid"
      params={{ fid, uid }}
      className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
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
            <RouteMap
              fitKey={rid}
              lines={lines}
              cursor={hover != null ? { lat: route.lat[hover]!, lng: route.lng[hover]! } : null}
            />
            <GradientProfile dist={route.dist} alt={route.alt} hover={hover} onHover={setHover} />
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
