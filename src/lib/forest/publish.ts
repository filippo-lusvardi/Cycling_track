// Publishing my tree into every forest I'm in, from the data my Tree page already has. Each forest gets only the
// rides I share with it; only documents whose content changed are written (fingerprints kept on this device).
import { collection, doc, getDoc, getDocs, query, setDoc, where } from "firebase/firestore";
import { get as idbGet, set as idbSet } from "idb-keyval";
import { db, uid } from "../firebase";
import type { Activity, PlannedEvent, Wellness } from "../intervals";
import type { Crown } from "../tree";
import { fingerprint, offStretches, toSharedCrown, toSharedRide, yearDocs } from "./snapshot";
import type { TreeHeader } from "./types";
import { isShared, readOverrides } from "./visibility";

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

/** Keep the forests' copies of my tree current. Safe to call on every Tree render: it throttles itself. */
export function publishTree(input: TreeInput, force = false) {
  latest = input;
  if (running || !navigator.onLine || (!force && Date.now() - last < EVERY)) return;
  last = Date.now();
  running = run(input)
    .catch((e) => console.warn("Forest publish failed", e))
    .finally(() => (running = null));
}

/** Publish again now with the last data the Tree page had (after hiding or showing a ride). */
export const republish = () => latest && publishTree(latest, true);

async function run({ acts, wellness, offEvents, crown, today }: TreeInput) {
  const me = uid();
  const forests = await getDocs(
    query(collection(db, "forests"), where("members", "array-contains", me)),
  );
  if (forests.empty) return;
  const overrides = await readOverrides();
  for (const f of forests.docs) {
    const fid = f.id;
    const member = await getDoc(doc(db, "forests", fid, "members", me));
    if (!member.exists()) continue;
    const shared = acts
      .filter((a) => isShared(a.id, fid, member.get("defaultShared") !== false, overrides))
      .map(toSharedRide);
    const years = yearDocs(shared, wellness);
    for (const [y, content] of Object.entries(years)) {
      const key = `forest-pub:${me}:${fid}:${y}`;
      const fp = fingerprint(content);
      if ((await idbGet<string>(key).catch(() => undefined)) === fp) continue;
      await setDoc(doc(db, "forests", fid, "trees", me, "years", y), content);
      await idbSet(key, fp).catch(() => {});
    }
    const header: Omit<TreeHeader, "updatedAt"> = {
      crown: toSharedCrown(crown),
      day: today,
      years: Object.keys(years).sort(),
      off: offStretches(offEvents),
    };
    const key = `forest-pub:${me}:${fid}:header`;
    const fp = fingerprint(header);
    if ((await idbGet<string>(key).catch(() => undefined)) === fp) continue;
    await setDoc(doc(db, "forests", fid, "trees", me), { ...header, updatedAt: Date.now() });
    await idbSet(key, fp).catch(() => {});
  }
}
