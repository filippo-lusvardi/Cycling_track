// A shared ride's page for the forest: its summary, and (when the member shares maps) its route and altitude
// profile with the first and last kilometre cut off, so nobody learns where rides start and end. Pure.
//   forests/{fid}/trees/{uid}/rides/{rideId}   RidePage
import type { Trace, TrackLike } from "../segments";
import { thin } from "./leaderboard";
import type { SharedRide } from "./types";

/** Metres hidden at each end of a route shown to friends (home is usually at one of them). */
export const PRIVACY_ZONE = 1000;
/** Only rides this recent get a page in the forest; older ones stay on the tree as branches. */
export const RIDE_PAGE_DAYS = 365;

export type RidePage = SharedRide & {
  /** The route without its first and last kilometre (thinned out), or null: indoor, too short, or maps not shared. */
  route: Trace | null;
};

/** The track between PRIVACY_ZONE from its start and PRIVACY_ZONE before its end, or null when nothing is left. */
export function trimEnds(
  t: Required<Pick<TrackLike, "lat" | "lng" | "dist" | "alt">>,
): Trace | null {
  const total = t.dist.at(-1) ?? 0;
  if (total < PRIVACY_ZONE * 2 + 500) return null;
  const keep = t.dist.flatMap((d, i) =>
    d >= PRIVACY_ZONE && d <= total - PRIVACY_ZONE ? [i] : [],
  );
  if (keep.length < 2) return null;
  const d0 = t.dist[keep[0]!]!;
  return {
    lat: keep.map((i) => t.lat[i]!),
    lng: keep.map((i) => t.lng[i]!),
    dist: keep.map((i) => t.dist[i]! - d0),
    alt: keep.map((i) => t.alt[i]!),
  };
}

export function ridePage(
  ride: SharedRide,
  track: Pick<TrackLike, "lat" | "lng" | "dist" | "alt"> | null,
  maps: boolean,
): RidePage {
  const route =
    maps && track?.lat?.length && track.dist && track.alt
      ? trimEnds({ lat: track.lat, lng: track.lng!, dist: track.dist, alt: track.alt })
      : null;
  return { ...ride, route: route ? thin(route, 400) : null };
}
