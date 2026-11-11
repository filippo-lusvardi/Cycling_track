// What the Routes pages read: you as a rider (for times), and the climbs you know (for loops and names).
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useSegmentNames } from "@/hooks/use-segment-names";
import { useSegmentLibrary } from "@/hooks/use-segments";
import type { Climb } from "@/lib/climbs";
import { riderFrom, type Rider } from "@/lib/course/estimate";
import type { KnownClimb } from "@/lib/course/generate";
import { between, type Line } from "@/lib/course/geo";
import { riderFactor } from "@/lib/course/roads-app";
import { athleteQuery, rideZonesQuery, wellnessQuery } from "@/lib/queries";

/** FTP and weight from your data, corrected by how your own rides compare with the model. */
export function useRider(): Rider {
  const { data: zones } = useQuery(rideZonesQuery("ride"));
  const { data: wellness } = useQuery(wellnessQuery(60));
  const { data: athlete } = useQuery(athleteQuery());
  const kg =
    [...(wellness ?? [])].sort((a, b) => b.id.localeCompare(a.id)).find((w) => w.weight)?.weight ??
    athlete?.weight ??
    null;
  const base = useMemo(() => riderFrom(zones?.ftp, kg), [zones?.ftp, kg]);
  const [factor, setFactor] = useState(1);
  useEffect(() => {
    let live = true;
    riderFactor(base)
      .then((f) => live && setFactor(f))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [base]);
  return useMemo(() => ({ ...base, factor }), [base, factor]);
}

export type NamedClimb = KnownClimb & { rides: number };

/** The climbs you ride (cycling), with their names. */
export function useKnownClimbs(): NamedClimb[] {
  const lib = useSegmentLibrary({ sync: false, sport: "ride" });
  const nameOf = useSegmentNames(lib.list);
  return useMemo(
    () =>
      lib.list
        .filter((s) => (s.grade ?? 0) > 0 && s.length > 0)
        .map((s) => ({
          id: s.id,
          name: nameOf(s),
          start: { lat: s.lat1, lng: s.lng1 },
          top: { lat: s.lat2, lng: s.lng2 },
          length: s.length,
          grade: s.grade ?? 0,
          rides: s.rides ?? 0,
        })),
    [lib.list, nameOf],
  );
}

const pointAt = (l: Line, m: number) => {
  let i = l.dist.findIndex((d) => d >= m);
  if (i < 0) i = l.dist.length - 1;
  return { lat: l.lat[i]!, lng: l.lng[i]! };
};

/** A name for each climb of a route: the known climb that starts and tops out where it does, if any. */
export function climbNames(climbs: Climb[], line: Line, known: KnownClimb[]): (string | null)[] {
  return climbs.map((c) => {
    const foot = pointAt(line, c.startKm * 1000);
    const top = pointAt(line, c.endKm * 1000);
    let best: { name: string; d: number } | null = null;
    for (const k of known) {
      const dTop = between(k.top, top);
      const dFoot = between(k.start, foot);
      // The known climb may be a part of this one (or the other way round): the tops must meet, the feet roughly.
      if (dTop > 400 || dFoot > Math.max(600, c.length * 0.4)) continue;
      const d = dTop + dFoot / 2;
      if (!best || d < best.d) best = { name: k.name, d };
    }
    return best?.name ?? null;
  });
}
