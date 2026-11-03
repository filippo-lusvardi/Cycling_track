// Firebase: accounts (email + password). Firestore lives in ./db, loaded only when something needs it.
import { initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth, onAuthStateChanged, type User } from "firebase/auth";

export const app = initializeApp({
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
});

export const auth = getAuth(app);
if (import.meta.env.VITE_USE_EMULATORS)
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });

/** The signed-in user once Firebase has restored the session from storage (null = signed out). */
export const authReady = new Promise<User | null>((resolve) => {
  const stop = onAuthStateChanged(auth, (u) => {
    stop();
    resolve(u);
  });
});

/** The signed-in user's id; throws when nobody is signed in. */
export function uid(): string {
  const u = auth.currentUser;
  if (!u) throw new Error("Not signed in");
  return u.uid;
}
