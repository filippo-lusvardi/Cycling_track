// A forest's climbs and their leaderboard. Any member adds one of their climbs; every member's own device finds
// their efforts on it (the segment engine searches their rides) and publishes their best time from the rides
// they share with that forest.
//   forests/{fid}/segments/{sid}              ForestClimb (sid = placeKey: the same climb on every device)
//   forests/{fid}/segments/{sid}/times/{uid}  ForestTime
// Adding or removing a climb also stamps the forest's `climbsAt`, so background sync re-reads the climbs only then.
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  setDoc,
  writeBatch,
} from "firebase/firestore";
import { get as idbGet, set as idbSet } from "idb-keyval";
import { uid } from "../firebase";
import { db } from "../db";
import type { Splits } from "../ghost";
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
  /** Set on runs; missing means a ride. A member has one time per climb, in their main sport. */
  sport?: "run";
  /** The effort's pacing, for racing it on the climb's page. Missing on times from before, or without a stored track. */
  splits?: Splits;
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
  const b = writeBatch(db);
  b.set(doc(segs(fid), placeKey(s)), JSON.parse(JSON.stringify(climb)));
  b.update(doc(db, "forests", fid), { climbsAt: Date.now() });
  await b.commit();
}

export async function removeClimb(fid: string, sid: string) {
  const b = writeBatch(db);
  b.delete(doc(segs(fid), sid));
  b.update(doc(db, "forests", fid), { climbsAt: Date.now() });
  await b.commit();
}

/** Even with an unchanged stamp, re-read after this long: climbs added by app versions that didn't stamp it. */
const CLIMBS_MAX_AGE = 24 * 3600_000;
type CachedClimbs = { at: number; fetchedAt: number; climbs: ForestClimb[] };

/**
 * A forest's climbs, from this device's copy while `climbsAt` (the forest's stamp) hasn't moved, else from Firestore.
 * One read per climb only when something changed, instead of on every app open.
 */
export async function readClimbs(fid: string, climbsAt: number): Promise<ForestClimb[]> {
  const key = `forest-climbs:${fid}`;
  const cached = await idbGet<CachedClimbs>(key).catch(() => undefined);
  if (cached && cached.at === climbsAt && Date.now() - cached.fetchedAt < CLIMBS_MAX_AGE)
    return cached.climbs;
  const s = await getDocs(segs(fid));
  const climbs = s.docs
    .map((d) => ({ ...(d.data() as Omit<ForestClimb, "sid">), sid: d.id }))
    .sort((a, b) => a.name.localeCompare(b.name));
  await idbSet(key, { at: climbsAt, fetchedAt: Date.now(), climbs }).catch(() => {});
  return climbs;
}

/** My best effort among the attempts, counting only the rides I share with the forest. */
export function bestShared(attempts: Attempt[], shared: (a: Attempt) => boolean): Attempt | null {
  let best: Attempt | null = null;
  for (const a of attempts) if (shared(a) && (!best || a.duration < best.duration)) best = a;
  return best;
}

export async function publishTime(
  fid: string,
  sid: string,
  a: Attempt | null,
  splits: Splits | null = null,
) {
  const ref = doc(db, "forests", fid, "segments", sid, "times", uid());
  if (!a) return deleteDoc(ref);
  await setDoc(ref, {
    duration: a.duration,
    date: a.date,
    rideId: a.trackId,
    rideName: a.trackName,
    avgWatts: a.sport === "run" || a.avgWatts == null ? null : Math.round(a.avgWatts),
    ...(a.sport === "run" ? { sport: "run" } : {}),
    ...(splits ? { splits } : {}),
  });
}

/**
 * Who races whom (uids), from the raceable members fastest first: A is the reference, B is measured against A. With
 * nobody picked, the record against me (or against the runner-up if the record is mine); a picked rival faces me if
 * I have a time, else the record, else the runner-up.
 */
export function racePair(
  uids: string[],
  me: string | undefined,
  picked?: string,
): { a: string; b: string } | null {
  if (uids.length < 2) return null;
  const mine = me && uids.includes(me) ? me : undefined;
  const [first, second] = uids as [string, string];
  if (picked && uids.includes(picked)) {
    if (mine && mine !== picked) return { a: mine, b: picked };
    return { a: picked === first ? second : first, b: picked };
  }
  if (mine === first) return { a: first, b: second };
  return { a: first, b: mine ?? second };
}

/** One climb of the forest, live (null once removed). */
export const watchClimb = (fid: string, sid: string, cb: (c: ForestClimb | null) => void) =>
  onSnapshot(
    doc(segs(fid), sid),
    (s) => cb(s.exists() ? { ...(s.data() as Omit<ForestClimb, "sid">), sid: s.id } : null),
    () => cb(null),
  );
