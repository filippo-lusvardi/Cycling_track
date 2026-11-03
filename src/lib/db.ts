// Firestore, the store that follows a user between devices. Kept apart from ./firebase (accounts) so the app can
// start, and decide where to go, before this much larger SDK has loaded.
import {
  connectFirestoreEmulator,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "firebase/firestore";
import { app } from "./firebase";

// Persistent cache: writes made offline queue on the device and go out when the connection is back.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

if (import.meta.env.VITE_USE_EMULATORS) connectFirestoreEmulator(db, "127.0.0.1", 8080);
