// A forest's climbs and their leaderboard. Any member adds one of their climbs; every member's own device finds
// their efforts on it (the segment engine searches their rides) and publishes their best time from the rides
// they share with that forest.
//   forests/{fid}/segments/{sid}              ForestClimb (sid = placeKey: the same climb on every device)
//   forests/{fid}/segments/{sid}/times/{uid}  ForestTime
import { collection, deleteDoc, doc, onSnapshot, setDoc } from "firebase/firestore";
import { db, uid } from "../firebase";
import { placeKey } from "../places";
import type { Attempt, Segment, Trace } from "../segments";

/** A climb in a forest, with the route and profile of the adder's best effort for its page (thinned out). */
export type ForestClimb = Segment & { sid: string; addedBy: string; at: number; trace?: Trace };

/** At most `n` points of a route, evenly spaced, ends kept: enough for a map line and a profile. */
export function thin(t: Trace, n = 160): Trace {
  if (t.lat.length <= n) return t;
  const idx = Array.from({ length: n }, (_, i) => Math.round((i / (n - 1)) * (t.lat.length - 1)));
  const pick = (a: number[]) => idx.map((i) => Math.round(a[i]! * 1e5) / 1e5);
  return {
    lat: pick(t.lat),
    lng: pick(t.lng),
    dist: idx.map((i) => Math.round(t.dist[i]!)),
    alt: idx.map((i) => Math.round(t.alt[i]!)),
  };
}
export type ForestTime = {
  uid: string;
  duration: number;
  date: string;
  rideId: string;
  rideName: string | null;
  avgWatts: number | null;
};

const segs = (fid: string) => collection(db, "forests", fid, "segments");

export const watchClimbs = (fid: string, cb: (c: ForestClimb[]) => void) =>
  onSnapshot(
    segs(fid),
    (s) =>
      cb(
        s.docs
          .map((d) => ({ ...(d.data() as Omit<ForestClimb, "sid">), sid: d.id }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      ),
    (e) => console.warn("Forest climbs unavailable", e),
  );

export const watchTimes = (fid: string, sid: string, cb: (t: ForestTime[]) => void) =>
  onSnapshot(
    collection(db, "forests", fid, "segments", sid, "times"),
    (s) =>
      cb(
        s.docs
          .map((d) => ({ ...(d.data() as Omit<ForestTime, "uid">), uid: d.id }))
          .sort((a, b) => a.duration - b.duration),
      ),
    (e) => console.warn("Leaderboard unavailable", e),
  );

/** Add one of my climbs to the forest (its own fields only, under the id every device computes alike). */
export async function addClimb(fid: string, s: Segment, name: string, trace: Trace | null) {
  const { id, name: _n, source, lat1, lng1, lat2, lng2, length, gain, grade } = s;
  void id;
  const climb = {
    source,
    lat1,
    lng1,
    lat2,
    lng2,
    length,
    gain,
    grade,
    id: placeKey(s),
    name: name.slice(0, 80),
    addedBy: uid(),
    at: Date.now(),
    ...(trace && trace.lat.length > 1 ? { trace: thin(trace) } : {}),
  };
  await setDoc(doc(segs(fid), placeKey(s)), JSON.parse(JSON.stringify(climb)));
}

export const removeClimb = (fid: string, sid: string) => deleteDoc(doc(segs(fid), sid));

/** My best effort among the attempts, counting only the rides I share with the forest. */
export function bestShared(
  attempts: Attempt[],
  shared: (rideId: string) => boolean,
): Attempt | null {
  let best: Attempt | null = null;
  for (const a of attempts)
    if (shared(a.trackId) && (!best || a.duration < best.duration)) best = a;
  return best;
}

export async function publishTime(fid: string, sid: string, a: Attempt | null) {
  const ref = doc(db, "forests", fid, "segments", sid, "times", uid());
  if (!a) return deleteDoc(ref);
  await setDoc(ref, {
    duration: a.duration,
    date: a.date,
    rideId: a.trackId,
    rideName: a.trackName,
    avgWatts: a.avgWatts != null ? Math.round(a.avgWatts) : null,
  });
}

/** One climb of the forest, live (null once removed). */
export const watchClimb = (fid: string, sid: string, cb: (c: ForestClimb | null) => void) =>
  onSnapshot(
    doc(segs(fid), sid),
    (s) => cb(s.exists() ? { ...(s.data() as Omit<ForestClimb, "sid">), sid: s.id } : null),
    () => cb(null),
  );
