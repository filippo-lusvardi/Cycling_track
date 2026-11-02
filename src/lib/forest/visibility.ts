// Which rides a forest sees: the member's default for that forest (Members tab → "Share new rides"), unless the
// ride says otherwise for it (the ride page's "Visible in").
//   users/{uid}/rideVisibility/{rideId}   { [fid]: true | false }
import { collection, doc, getDocs, onSnapshot, setDoc } from "firebase/firestore";
import { db, uid } from "../firebase";

export type Overrides = Record<string, Record<string, boolean>>;

const col = () => collection(db, "users", uid(), "rideVisibility");

export const isShared = (rideId: string, fid: string, defaultShared: boolean, o: Overrides) =>
  o[rideId]?.[fid] ?? defaultShared;

export async function readOverrides(): Promise<Overrides> {
  const s = await getDocs(col());
  return Object.fromEntries(s.docs.map((d) => [d.id, d.data() as Record<string, boolean>]));
}

export const watchOverrides = (cb: (o: Overrides) => void) =>
  onSnapshot(
    col(),
    (s) => cb(Object.fromEntries(s.docs.map((d) => [d.id, d.data() as Record<string, boolean>]))),
    (e) => console.warn("Ride visibility unavailable", e),
  );

export const setRideShared = (rideId: string, fid: string, shown: boolean) =>
  setDoc(doc(col(), rideId), { [fid]: shown }, { merge: true });
