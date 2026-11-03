// The signed-in session: bring the account's profile onto this device, keep segments in step, wipe on sign-out.
// Firestore code (./cloud, segment sync) is imported on demand, so the first screen doesn't wait for its SDK.
import { onAuthStateChanged, signOut } from "firebase/auth";
import { clear, createStore } from "idb-keyval";
import { toast } from "sonner";
import { auth } from "./firebase";
import { readGist, NAMES_FILE } from "./gist";
import { t } from "./i18n";
import type { SavedSegment } from "./segment-store";
import {
  API_KEY,
  GIST_ID,
  GITHUB_TOKEN,
  LANGUAGE,
  NO_PERF,
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
  await importGist().catch((e) => console.warn("Gist import failed", e));
  const { followSegments, syncSegments } = await import("@/hooks/use-segments");
  // Signed out while the import was loading: nothing to follow.
  if (!auth.currentUser) return;
  syncSegments().catch((e) => console.warn("Segment sync failed", e));
  stopFollow = followSegments();
}

/** The account's settings win; a device that had them before the account existed hands them over. */
async function pullProfile() {
  const { readProfile, saveProfile } = await import("./cloud");
  const p = await readProfile();
  const key = readSetting<string>(API_KEY);
  const years = readSetting<number>(SEGMENT_HISTORY);
  if (p.intervalsKey) writeSetting(API_KEY, p.intervalsKey);
  if (p.segmentHistory != null) writeSetting(SEGMENT_HISTORY, p.segmentHistory);
  if (p.source) writeSetting(SOURCE, p.source);
  const up = {
    ...(!p.intervalsKey && key ? { intervalsKey: key } : {}),
    ...(p.segmentHistory == null && years != null ? { segmentHistory: years } : {}),
  };
  if (Object.keys(up).length) await saveProfile(up);
  return p;
}

/** One-off move from the GitHub gist that synced segments before accounts existed. */
async function importGist() {
  if (!readSetting<string>(GITHUB_TOKEN)) return;
  const [{ syncSegments }, { writePlaces }] = await Promise.all([
    import("@/hooks/use-segments"),
    import("./cloud"),
  ]);
  const [segs, names] = await Promise.all([
    readGist<SavedSegment[]>(),
    readGist<Record<string, string | null>>(NAMES_FILE),
  ]);
  await syncSegments(segs ?? []);
  if (names)
    await writePlaces(Object.fromEntries(Object.entries(names).filter(([, v]) => v !== null)));
  writeSetting(GITHUB_TOKEN, null);
  writeSetting(GIST_ID, null);
  toast.success(
    t("Saved segments moved to your account", "Segmenti salvati spostati nel tuo account"),
  );
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
