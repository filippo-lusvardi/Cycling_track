// Firestore IO: the user's profile and saved segments, and the OSM place names every user shares.
//   users/{uid}                   Profile
//   users/{uid}/segments/{id}     SavedSegment
//   users/{uid}/summit/{placeKey} { notes: { [effortKey]: text } }, the summit book's signatures
//   users/{uid}/gear/{id}         Gear (bikes and shoes, their parts and log)
//   users/{uid}/gearRides/{actId} { gear: id | null }, an activity set on other gear than the default
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
import { readGear, type Gear, type Overrides } from "./gear";
import type { SavedSegment } from "./segment-store";
import type { ZoneTops } from "./settings";

export type Profile = {
  intervalsKey?: string | null;
  segmentHistory?: number | null;
  /** The sport that grows the tree. Missing means cycling. */
  mainSport?: "ride" | "run" | null;
  /** Analysis shows both sports, with a toggle between them. */
  analysisBoth?: boolean | null;
  /** The morning check-in is asked and counts toward readiness. Missing means yes. */
  checkIn?: boolean | null;
  /** The Garden is part of the app. Missing means yes. */
  garden?: boolean | null;
  /** The sports in the garden and what grows for each: a CropMap as JSON. */
  gardenCrops?: string | null;
  /** How the recap and activity pages are arranged, as JSON. */
  layouts?: string | null;
  /** The questions kept at hand in the bar, as JSON. */
  pinned?: string | null;
  /** Where training data comes from: intervals.icu (default) or Cirmolo's own store (uploaded ride files). */
  source?: "intervals" | "native" | null;
  // For accounts without intervals.icu, what its athlete settings would hold.
  name?: string | null;
  weight?: number | null;
  ftp?: number | null;
  lthr?: number | null;
  maxHr?: number | null;
  /** Threshold pace set by hand (m/s), over the estimate. Under intervals.icu's, when that has one. */
  runThreshold?: number | null;
  /** Heart rate on foot, when it differs from the bike's. */
  runLthr?: number | null;
  runMaxHr?: number | null;
  /** Zone limits set by hand, as % of each threshold. */
  zoneTops?: ZoneTops | null;
  /** The key of the phone launcher's link (see lib/launcher-share); missing = not shared. */
  launcherKey?: string | null;
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

// --- Gear ---

const gearCol = () => collection(db, "users", uid(), "gear");
const gearRidesCol = () => collection(db, "users", uid(), "gearRides");

/** Resolves when the server has it; offline, Firestore keeps it queued, so callers don't wait on it. */
export const writeGear = (g: Gear) => setDoc(doc(gearCol(), g.id), clean(g));
export const deleteGear = (id: string) => deleteDoc(doc(gearCol(), id));

/** An activity onto a gear (an id), onto none (null), or back to the default (undefined). */
export const writeGearRide = (activityId: string, gear: string | null | undefined) =>
  gear === undefined
    ? deleteDoc(doc(gearRidesCol(), activityId))
    : setDoc(doc(gearRidesCol(), activityId), { gear });

export const watchGear = (cb: (gears: Gear[]) => void) =>
  onSnapshot(
    gearCol(),
    (snap) => cb(snap.docs.map((d) => readGear(d.data() as Gear))),
    (e) => console.warn("Gear sync failed", e),
  );

export const watchGearRides = (cb: (ov: Overrides) => void) =>
  onSnapshot(
    gearRidesCol(),
    (snap) =>
      cb(
        Object.fromEntries(snap.docs.map((d) => [d.id, (d.get("gear") as string | null) ?? null])),
      ),
    (e) => console.warn("Gear sync failed", e),
  );

/** Everything stored for this user, before the account itself is deleted. */
export async function deleteUserData() {
  for (const name of [
    "segments",
    "summit",
    "activities",
    "wellness",
    "events",
    "streams",
    "workouts",
    "gear",
    "gearRides",
  ]) {
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
