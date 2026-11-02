// Firestore IO: the user's profile and saved segments, and the OSM place names every user shares.
//   users/{uid}                   Profile
//   users/{uid}/segments/{id}     SavedSegment
//   places/{placeKey}             { name, at }
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { db, uid } from "./firebase";
import type { SavedSegment } from "./segment-store";

export type Profile = { intervalsKey?: string | null; segmentHistory?: number | null };

const profileDoc = () => doc(db, "users", uid());
const segmentsCol = () => collection(db, "users", uid(), "segments");

export async function readProfile(): Promise<Profile> {
  return ((await getDoc(profileDoc())).data() as Profile | undefined) ?? {};
}

export const saveProfile = (patch: Profile) => setDoc(profileDoc(), patch, { merge: true });

export async function readSegments(): Promise<SavedSegment[]> {
  return (await getDocs(segmentsCol())).docs.map((d) => d.data() as SavedSegment);
}

// Firestore rejects undefined fields; optional ones that are unset are simply left out.
const clean = <T extends object>(o: T) => JSON.parse(JSON.stringify(o)) as T;

/** One batch (max 500 writes each), one doc per segment so devices editing different segments never collide. */
export async function writeSegments(segs: SavedSegment[]) {
  for (let i = 0; i < segs.length; i += 500) {
    const batch = writeBatch(db);
    for (const s of segs.slice(i, i + 500)) batch.set(doc(segmentsCol(), s.id), clean(s));
    await batch.commit();
  }
}

/** Live copy of the saved segments, so a star on the phone shows up on the PC while it's open. */
export const watchSegments = (cb: (segs: SavedSegment[]) => void) =>
  onSnapshot(
    segmentsCol(),
    (snap) => cb(snap.docs.map((d) => d.data() as SavedSegment)),
    (e) => console.warn("Segment sync failed", e),
  );

/** Everything stored for this user, before the account itself is deleted. */
export async function deleteUserData() {
  const segs = await getDocs(segmentsCol());
  for (let i = 0; i < segs.docs.length; i += 500) {
    const batch = writeBatch(db);
    for (const d of segs.docs.slice(i, i + 500)) batch.delete(d.ref);
    await batch.commit();
  }
  await deleteDoc(profileDoc());
}

type Names = Record<string, string | null>;

/** Place names added since `since` (ms; 0 = all), and the newest `at` seen, to ask from next time. */
export async function readPlaces(since: number): Promise<{ names: Names; latest: number }> {
  const snap = await getDocs(query(collection(db, "places"), where("at", ">", since)));
  const names: Names = {};
  let latest = since;
  for (const d of snap.docs) {
    const v = d.data() as { name: string | null; at: number };
    names[d.id] = v.name;
    latest = Math.max(latest, v.at);
  }
  return { names, latest };
}

export async function writePlaces(names: Names) {
  const entries = Object.entries(names);
  const at = Date.now();
  for (let i = 0; i < entries.length; i += 500) {
    const batch = writeBatch(db);
    for (const [k, name] of entries.slice(i, i + 500))
      batch.set(doc(db, "places", k), { name, at });
    await batch.commit();
  }
}
