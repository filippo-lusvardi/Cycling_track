// The signed-in session: bring the account's profile onto this device, keep segments in step, wipe on sign-out.
// Firestore code (./cloud, segment sync) is imported on demand, so the first screen doesn't wait for its SDK.
import { onAuthStateChanged, signOut } from "firebase/auth";
import { clear, createStore } from "idb-keyval";
import { auth } from "./firebase";
import {
  API_KEY,
  LANGUAGE,
  NO_PERF,
  MAIN_SPORT,
  ANALYSIS_BOTH,
  CHECK_IN,
  GARDEN,
  GARDEN_CROPS,
  LAUNCHER_KEY,
  LAYOUTS,
  PINNED,
  ZONE_TOPS,
  RUN_THRESHOLD,
  SEGMENT_HISTORY,
  SOURCE,
  readSetting,
  writeSetting,
} from "./settings";

let session: { uid: string; done: Promise<void> } | undefined;
let stopFollow: (() => void) | undefined;

/** Start following the auth state; call once at startup. */
export function initAccount() {
  onAuthStateChanged(auth, (u) => {
    if (u) return void sessionReady();
    stopFollow?.();
    stopFollow = undefined;
    session = undefined;
  });
}

/** Resolves once the signed-in user's profile has reached this device (at once when signed out). */
export function sessionReady(): Promise<void> {
  const u = auth.currentUser;
  if (!u) return Promise.resolve();
  if (session?.uid !== u.uid) {
    stopFollow?.();
    session = { uid: u.uid, done: startSession() };
  }
  return session.done;
}

async function startSession() {
  await pullProfile().catch((e) => console.warn("Profile sync failed", e));
  const { followSegments, syncSegments } = await import("@/hooks/use-segments");
  // Signed out while the import was loading: nothing to follow.
  if (!auth.currentUser) return;
  syncSegments().catch((e) => console.warn("Segment sync failed", e));
  const stopSegments = followSegments();
  const { followGear } = await import("./gear-store");
  const stopGear = auth.currentUser ? await followGear() : () => {};
  stopFollow = () => {
    stopSegments();
    stopGear();
  };
}

/** The account's settings win; a device that had them before the account existed hands them over. */
async function pullProfile() {
  const { readProfile, saveProfile } = await import("./cloud");
  const p = await readProfile();
  const key = readSetting<string>(API_KEY);
  const years = readSetting<number>(SEGMENT_HISTORY);
  const sport = readSetting<"ride" | "run">(MAIN_SPORT);
  const both = readSetting<boolean>(ANALYSIS_BOTH);
  const checkIn = readSetting<boolean>(CHECK_IN);
  const garden = readSetting<boolean>(GARDEN);
  const crops = readSetting<object>(GARDEN_CROPS);
  const layouts = readSetting<object>(LAYOUTS);
  const pinned = readSetting<string[]>(PINNED);
  if (p.intervalsKey) writeSetting(API_KEY, p.intervalsKey);
  if (p.segmentHistory != null) writeSetting(SEGMENT_HISTORY, p.segmentHistory);
  if (p.source) writeSetting(SOURCE, p.source);
  if (p.mainSport) writeSetting(MAIN_SPORT, p.mainSport);
  if (p.analysisBoth != null) writeSetting(ANALYSIS_BOTH, p.analysisBoth);
  if (p.checkIn != null) writeSetting(CHECK_IN, p.checkIn);
  if (p.garden != null) writeSetting(GARDEN, p.garden);
  if (p.gardenCrops) writeSetting(GARDEN_CROPS, JSON.parse(p.gardenCrops) as object);
  if (p.layouts) writeSetting(LAYOUTS, JSON.parse(p.layouts) as object);
  if (p.pinned) writeSetting(PINNED, JSON.parse(p.pinned) as string[]);
  writeSetting(RUN_THRESHOLD, p.runThreshold ?? null);
  writeSetting(ZONE_TOPS, p.zoneTops ?? null);
  writeSetting(LAUNCHER_KEY, p.launcherKey ?? null);
  const up = {
    ...(!p.intervalsKey && key ? { intervalsKey: key } : {}),
    ...(p.segmentHistory == null && years != null ? { segmentHistory: years } : {}),
    ...(!p.mainSport && sport ? { mainSport: sport } : {}),
    ...(p.analysisBoth == null && both != null ? { analysisBoth: both } : {}),
    ...(p.checkIn == null && checkIn != null ? { checkIn } : {}),
    ...(p.garden == null && garden != null ? { garden } : {}),
    ...(!p.gardenCrops && crops ? { gardenCrops: JSON.stringify(crops) } : {}),
    ...(!p.layouts && layouts ? { layouts: JSON.stringify(layouts) } : {}),
    ...(!p.pinned && pinned?.length ? { pinned: JSON.stringify(pinned) } : {}),
  };
  if (Object.keys(up).length) await saveProfile(up);
  // Wording and pages are fixed for the page's lifetime, so another sport from the account means starting over.
  if (p.mainSport && (sport ?? "ride") !== p.mainSport) window.location.reload();
  return p;
}

/** Sign out and forget everything this device holds for the account, so the next user starts clean. */
export async function signOutAndWipe() {
  stopFollow?.();
  await signOut(auth);
  const [{ clearIndexedDbPersistence, terminate }, { db }] = await Promise.all([
    import("firebase/firestore"),
    import("./db"),
  ]);
  await terminate(db);
  await clearIndexedDbPersistence(db).catch(() => {});
  for (const k of Object.keys(localStorage))
    if (k.startsWith("cadence_") && k !== LANGUAGE && k !== NO_PERF) localStorage.removeItem(k);
  await Promise.all([
    clear(),
    clear(createStore("cadence-tracks", "tracks")),
    clear(createStore("cadence-segments", "meta")),
  ]).catch(() => {});
  // A fresh page: in-memory caches (queries, segment index, names) go with it.
  window.location.replace("/login");
}
