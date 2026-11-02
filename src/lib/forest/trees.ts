// Reading members' published trees (written by ./publish.ts on each member's own device).
import { collection, doc, getDoc, getDocs, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import type { RidePage } from "./rides";
import type { TreeHeader, TreeYearDoc } from "./types";

/** Every member's tree header (crown, years, knots), live; members who haven't published yet are missing. */
export const watchHeaders = (fid: string, cb: (h: Record<string, TreeHeader>) => void) =>
  onSnapshot(
    collection(db, "forests", fid, "trees"),
    (s) => cb(Object.fromEntries(s.docs.map((d) => [d.id, d.data() as TreeHeader]))),
    (e) => console.warn("Forest trees unavailable", e),
  );

/** One member's whole published tree: the header and each year. */
export async function readTree(fid: string, member: string) {
  const header = await getDoc(doc(db, "forests", fid, "trees", member));
  if (!header.exists()) return null;
  const years = await getDocs(collection(db, "forests", fid, "trees", member, "years"));
  return {
    header: header.data() as TreeHeader,
    years: Object.fromEntries(years.docs.map((d) => [d.id, d.data() as TreeYearDoc])),
  };
}

/** A member's shared ride page (summary, route with its ends hidden), or null. */
export async function readRidePage(fid: string, member: string, ride: string) {
  const s = await getDoc(doc(db, "forests", fid, "trees", member, "rides", ride));
  return s.exists() ? (s.data() as RidePage) : null;
}
