// Today's season for the phone launcher (Minimal), which takes it as its accent. One document per account, named
// by a long random key: whoever holds the link reads that document and nothing else; only its owner writes it.
//   accents/{key}   { uid, season, color, day, at }
// Firestore is imported on demand, like ./cloud, so accounts that don't share never load it for this.
import { isoDate } from "./training";
import { LAUNCHER_KEY, LAUNCHER_SHARED, readSetting, writeSetting } from "./settings";
import type { Season } from "./tree";

/** SEASON_ACCENT_COLOR (./accent) in sRGB, for a launcher that doesn't speak oklch. */
export const SEASON_ACCENT_HEX: Record<Season, string> = {
  spring: "#ACDD78",
  summer: "#6CD092",
  autumn: "#F8A052",
  winter: "#A9D9F1",
};

/** The link to paste in the launcher: Firestore's REST address of the document, readable without signing in. */
export const launcherLink = (key: string) =>
  `https://firestore.googleapis.com/v1/projects/${import.meta.env.VITE_FIREBASE_PROJECT_ID}/databases/(default)/documents/accents/${key}`;

/** 24 random bytes, URL-safe: unguessable, so the link is the only way to the document. */
export function newLauncherKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

const docFor = async (key: string) => {
  const [{ doc }, { db }] = await Promise.all([import("firebase/firestore"), import("./db")]);
  return doc(db, "accents", key);
};

/** Publish today's season if this account shares one and it hasn't gone out today (or changed since). */
export async function shareSeason(season: Season, force = false) {
  const key = readSetting<string>(LAUNCHER_KEY);
  if (!key) return;
  const day = isoDate(new Date());
  const last = readSetting<{ day: string; season: Season }>(LAUNCHER_SHARED);
  if (!force && last?.day === day && last.season === season) return;
  const [{ setDoc }, { uid }] = await Promise.all([
    import("firebase/firestore"),
    import("./firebase"),
  ]);
  await setDoc(await docFor(key), {
    uid: uid(),
    season,
    color: SEASON_ACCENT_HEX[season],
    day,
    at: Date.now(),
  });
  writeSetting(LAUNCHER_SHARED, { day, season });
}

/** Stop sharing: the document goes, so the old link reads nothing. */
export async function stopSharing(key: string) {
  const { deleteDoc } = await import("firebase/firestore");
  await deleteDoc(await docFor(key));
  writeSetting(LAUNCHER_SHARED, null);
}
