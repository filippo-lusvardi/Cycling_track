// Firestore IO: the user's profile and saved segments, and the OSM place names every user shares.
//   users/{uid}                   Profile
//   users/{uid}/segments/{id}     SavedSegment
//   users/{uid}/summit/{placeKey} { notes: { [effortKey]: text } }, the summit book's signatures
//   places/{placeKey}             { name, at }
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { uid } from "./firebase";
import { db } from "./db";
import type { SavedSegment } from "./segment-store";

export type Profile = {
  intervalsKey?: string | null;
  segmentHistory?: number | null;
  /** Where training data comes from: intervals.icu (default) or Cirmolo's own store (uploaded ride files). */
  source?: "intervals" | "native" | null;
  // For accounts without intervals.icu, what its athlete settings would hold.
  name?: string | null;
  weight?: number | null;
  ftp?: number | null;
  lthr?: number | null;
  maxHr?: number | null;
  /** When the user consented to Cirmolo storing their health data (accounts without intervals.icu). */
  healthConsentAt?: number | null;
};

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

// --- Summit book notes (keyed by where the climb runs, so every device finds them) ---

const summitDoc = (place: string) => doc(db, "users", uid(), "summit", place);

/** A climb's signed notes, live; from the device's cache when offline. */
export const watchSummitNotes = (place: string, cb: (notes: Record<string, string>) => void) =>
  onSnapshot(
    summitDoc(place),
    (s) => cb((s.get("notes") as Record<string, string> | undefined) ?? {}),
    (e) => console.warn("Summit notes unavailable", e),
  );

/** Sign one ascent (an empty note erases it). */
export const saveSummitNote = (place: string, effort: string, text: string) =>
  setDoc(
    summitDoc(place),
    { notes: { [effort]: text.trim() ? text.trim().slice(0, 120) : deleteField() } },
    { merge: true },
  );

/** Everything stored for this user, before the account itself is deleted. */
export async function deleteUserData() {
  for (const name of ["segments", "summit", "activities", "wellness", "events", "streams"]) {
    const docs = (await getDocs(collection(db, "users", uid(), name))).docs;
    for (let i = 0; i < docs.length; i += 500) {
      const batch = writeBatch(db);
      for (const d of docs.slice(i, i + 500)) batch.delete(d.ref);
      await batch.commit();
    }
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
