// Publishing my tree into every forest I'm in, from the data my Tree page already has. Each forest gets only the
// rides I share with it; only documents whose content changed are written (fingerprints kept on this device).
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  where,
} from "firebase/firestore";
import { del as idbDel, get as idbGet, set as idbSet } from "idb-keyval";
import { uid } from "../firebase";
import { db } from "../db";
import type { Activity, PlannedEvent, Wellness } from "../intervals";
import { storedTrack } from "../segment-app";
import { addDays } from "../training";
import { activityKind } from "../activity-kind";
import { RIDE_KINDS, type Crown } from "../tree";
import { effortOf, ridePage, RIDE_PAGE_DAYS } from "./rides";
import { fingerprint, offStretches, toSharedCrown, toSharedRide, yearDocs } from "./snapshot";
import type { SharedRide, TreeHeader } from "./types";
import { isShared, prefsOf, readOverrides } from "./visibility";

/** Not more often than this, unless asked (a ride's visibility changed). */
const EVERY = 30 * 60_000;
let last = 0;
let running: Promise<void> | null = null;

export type TreeInput = {
  acts: Activity[];
  wellness: Wellness[];
  offEvents: PlannedEvent[];
  crown: Crown;
  today: string;
};

let latest: TreeInput | null = null;
/** A republish asked for before the Tree page handed over its data: the next publish runs at once. */
let pending = false;

/** Keep the forests' copies of my tree current. Safe to call on every Tree render: it throttles itself. */
export function publishTree(input: TreeInput, force = false) {
  latest = input;
  if (pending) force = true;
  if (running || !navigator.onLine || (!force && Date.now() - last < EVERY)) return;
  last = Date.now();
  pending = false;
  running = run(input)
    .catch((e) => console.warn("Forest publish failed", e))
    .finally(() => (running = null));
}

/** Publish again now with the last data the Tree page had (after a sharing change), or as soon as it has some. */
export function republish() {
  if (latest) publishTree(latest, true);
  else pending = true;
}

async function run({ acts, wellness, offEvents, crown, today }: TreeInput) {
  const me = uid();
  const forests = await getDocs(
    query(collection(db, "forests"), where("members", "array-contains", me)),
  );
  if (forests.empty) return;
  const overrides = await readOverrides();
  // How tall the tree stands in every forest: the whole riding history counts, not only what's shared there.
  const growthFacts = lifetime(acts);
  for (const f of forests.docs) {
    const fid = f.id;
    const member = await getDoc(doc(db, "forests", fid, "members", me));
    if (!member.exists()) continue;
    const prefs = prefsOf(member.data());
    const shared = acts
      .filter((a) =>
        isShared({ id: a.id, day: a.start_date_local.slice(0, 10) }, fid, prefs, overrides),
      )
      .map(toSharedRide);
    const years = yearDocs(shared, wellness);
    for (const [y, content] of Object.entries(years)) {
      const key = `forest-pub:${me}:${fid}:${y}`;
      const fp = fingerprint(content);
      if ((await idbGet<string>(key).catch(() => undefined)) === fp) continue;
      await setDoc(doc(db, "forests", fid, "trees", me, "years", y), content);
      await idbSet(key, fp).catch(() => {});
    }
    await publishRidePages(me, fid, shared, acts, prefs.shareRoutes, prefs.shareEffort, today);
    const header: Omit<TreeHeader, "updatedAt"> = {
      crown: toSharedCrown(crown),
      day: today,
      years: Object.keys(years).sort(),
      ...growthFacts,
      off: offStretches(offEvents),
    };
    const key = `forest-pub:${me}:${fid}:header`;
    const fp = fingerprint(header);
    if ((await idbGet<string>(key).catch(() => undefined)) === fp) continue;
    await setDoc(doc(db, "forests", fid, "trees", me), { ...header, updatedAt: Date.now() });
    await idbSet(key, fp).catch(() => {});
  }
}

/**
 * A page for each shared ride of the last year (route with its ends hidden, when maps are shared; heart rate and
 * power, when those are), from the tracks the segment analysis keeps on this device; pages of rides no longer
 * shared, or too old, are taken down.
 */
async function publishRidePages(
  me: string,
  fid: string,
  shared: SharedRide[],
  acts: Activity[],
  maps: boolean,
  effort: boolean,
  today: string,
) {
  const byId = new Map(acts.map((a) => [a.id, a]));
  const since = addDays(today, -RIDE_PAGE_DAYS);
  const recent = shared.filter((r) => r.start_date_local.slice(0, 10) >= since);
  const listKey = `forest-pub:${me}:${fid}:rides`;
  const before = new Set((await idbGet<string[]>(listKey).catch(() => undefined)) ?? []);
  for (const r of recent) {
    const track = (maps || effort) && !r.trainer ? await storedTrack(r.id) : null;
    const a = byId.get(r.id);
    const page = ridePage(r, track, maps, effort && a ? effortOf(a, track) : null);
    const key = `forest-pub:${me}:${fid}:ride:${r.id}`;
    const fp = fingerprint(page);
    before.delete(r.id);
    if ((await idbGet<string>(key).catch(() => undefined)) === fp) continue;
    await setDoc(
      doc(db, "forests", fid, "trees", me, "rides", r.id),
      JSON.parse(JSON.stringify(page)),
    );
    await idbSet(key, fp).catch(() => {});
  }
  for (const gone of before) {
    await deleteDoc(doc(db, "forests", fid, "trees", me, "rides", gone)).catch(() => {});
    await idbDel(`forest-pub:${me}:${fid}:ride:${gone}`).catch(() => {});
  }
  await idbSet(
    listKey,
    recent.map((r) => r.id),
  ).catch(() => {});
}

/** The first ride ever and the kilometres ridden in all, for the tree's height in forests (see ./age). */
export function lifetime(acts: Activity[]): { since: string | null; km: number } {
  let since: string | null = null;
  let metres = 0;
  for (const a of acts) {
    if (!RIDE_KINDS.has(activityKind(a))) continue;
    const d = a.start_date_local.slice(0, 10);
    if (since == null || d < since) since = d;
    metres += a.distance ?? 0;
  }
  return { since, km: Math.round(metres / 1000) };
}
