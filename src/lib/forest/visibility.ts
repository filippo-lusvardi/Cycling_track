// Which rides a forest sees: a ride's own choice for that forest (the ride page's "Visible in") wins; otherwise
// rides from before joining follow "Show rides from before I joined", later ones "Share new rides".
//   users/{uid}/rideVisibility/{rideId}   { [fid]: true | false }
import { collection, doc, getDocs, onSnapshot, setDoc } from "firebase/firestore";
import { uid } from "../firebase";
import { db } from "../db";
import { isoDate } from "../training";

export type Overrides = Record<string, Record<string, boolean>>;

const col = () => collection(db, "users", uid(), "rideVisibility");

/** My sharing settings in one forest (the member doc's fields; missing ones mean "shared", as before they existed). */
export type SharePrefs = {
  defaultShared: boolean;
  sharePast: boolean;
  joinedDay: string;
  /** Ride pages carry the route (ends hidden). Off unless agreed to: earlier members joined without maps. */
  shareRoutes: boolean;
  /** Ride pages carry heart rate and power. Health data, so off unless agreed to. */
  shareEffort: boolean;
};

export const prefsOf = (m: Record<string, unknown> | undefined): SharePrefs => ({
  defaultShared: m?.["defaultShared"] !== false,
  sharePast: m?.["sharePast"] !== false,
  joinedDay: typeof m?.["joinedAt"] === "number" ? isoDate(new Date(m["joinedAt"])) : "",
  shareRoutes: m?.["shareRoutes"] === true,
  shareEffort: m?.["shareEffort"] === true,
});

/** Is a ride (its id, and its day as YYYY-MM-DD) visible in a forest? */
export const isShared = (
  ride: { id: string; day: string },
  fid: string,
  p: SharePrefs,
  o: Overrides,
) => o[ride.id]?.[fid] ?? (ride.day < p.joinedDay ? p.sharePast : p.defaultShared);

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
