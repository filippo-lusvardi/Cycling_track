// Forests: friends and teammates whose trees grow side by side. Membership lives in Firestore; each member's own
// app publishes a filtered copy of their tree into every forest they're in (./publish.ts), since training data
// never passes through a server.
//   forests/{fid}                 { name, createdBy, createdAt, members: [uid], climbsAt? }
//   forests/{fid}/invites/{key}   { name, by }            the secret in an invite link
//   forests/{fid}/requests/{uid}  { name, key, at, consentAt }
//   forests/{fid}/members/{uid}   { name, joinedAt, consentAt, defaultShared, sharePast }
import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { del, keys } from "idb-keyval";
import { auth, uid } from "../firebase";
import { db } from "../db";
import type { MainSport } from "../sport";

/** A name to start from: the part of the account's email before the @. */
export const defaultName = () => auth.currentUser?.email?.split("@")[0] ?? "";

/** Most trees a forest holds: enough for a team, still readable as one landscape. */
export const MAX_MEMBERS = 30;

export type Forest = {
  id: string;
  name: string;
  createdBy: string;
  createdAt: number;
  members: string[];
  /** The sport its trees grow from, chosen when planted and fixed after; missing means cycling. */
  sport?: "run";
  /** When a climb was last added or removed (missing until the first change after stamps existed). */
  climbsAt?: number;
};
/** The sport a forest's trees and leaderboards are about. */
export const forestSport = (f: Pick<Forest, "sport">): MainSport =>
  f.sport === "run" ? "run" : "ride";

export type Member = {
  uid: string;
  name: string;
  joinedAt: number;
  consentAt: number;
  /** New rides are visible in this forest unless hidden one by one. */
  defaultShared: boolean;
  /** Rides from before joining are visible too (missing = yes, as before the setting existed). */
  sharePast?: boolean;
  /** Ride pages show the route with its first and last kilometre hidden (missing = no). */
  shareRoutes?: boolean;
  /** Ride pages show heart rate and power (avg / max, NP). Health data: missing = no. */
  shareEffort?: boolean;
};
export type JoinRequest = {
  uid: string;
  name: string;
  at: number;
  consentAt: number;
  /** Chosen on the join page: show the rides from before joining. */
  sharePast?: boolean;
  /** Chosen on the join page: show ride maps (ends hidden). */
  shareRoutes?: boolean;
  /** Chosen on the join page: show heart rate and power on ride pages. */
  shareEffort?: boolean;
};

const forestDoc = (fid: string) => doc(db, "forests", fid);
const sub = (fid: string, name: "invites" | "requests" | "members" | "trees" | "segments") =>
  collection(db, "forests", fid, name);

/** A long random key for invite links (knowing it is what lets someone ask to join). */
function secret() {
  const b = crypto.getRandomValues(new Uint8Array(18));
  return btoa(String.fromCharCode(...b)).replace(
    /[+/=]/g,
    (c) => ({ "+": "-", "/": "_", "=": "" })[c]!,
  );
}

/** The forests I'm in, live, by name; `onError` when they can't be read (offline on first load, rules). */
export const watchMyForests = (cb: (f: Forest[]) => void, onError?: (e: Error) => void) =>
  onSnapshot(
    query(collection(db, "forests"), where("members", "array-contains", uid())),
    (s) =>
      cb(
        s.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<Forest, "id">) }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      ),
    (e) => {
      console.warn("Forests unavailable", e);
      onError?.(e);
    },
  );

export const watchForest = (fid: string, cb: (f: Forest | null) => void) =>
  onSnapshot(
    forestDoc(fid),
    (s) => cb(s.exists() ? { id: s.id, ...(s.data() as Omit<Forest, "id">) } : null),
    () => cb(null),
  );

export const watchMembers = (fid: string, cb: (m: Member[]) => void) =>
  onSnapshot(
    sub(fid, "members"),
    (s) => cb(s.docs.map((d) => ({ uid: d.id, ...(d.data() as Omit<Member, "uid">) }))),
    (e) => console.warn("Members unavailable", e),
  );

export const watchRequests = (fid: string, cb: (r: JoinRequest[]) => void) =>
  onSnapshot(
    sub(fid, "requests"),
    (s) => cb(s.docs.map((d) => ({ uid: d.id, ...(d.data() as Omit<JoinRequest, "uid">) }))),
    (e) => console.warn("Join requests unavailable", e),
  );

/** Plant a forest: me as its first member, and an invite to pass on. */
export async function createForest(name: string, myName: string, sport: MainSport) {
  const me = uid();
  const ref = doc(collection(db, "forests"));
  const now = Date.now();
  await setDoc(ref, {
    name: name.trim().slice(0, 40),
    createdBy: me,
    createdAt: now,
    members: [me],
    ...(sport === "run" ? { sport } : {}),
  });
  await setDoc(doc(sub(ref.id, "members"), me), {
    name: myName.trim().slice(0, 40),
    joinedAt: now,
    consentAt: now,
    defaultShared: true,
    sharePast: true,
    shareRoutes: true,
  });
  return ref.id;
}

/** The forest's invite link, making one the first time it's asked for. */
export async function inviteLink(f: Forest): Promise<string> {
  const mine = await getDocs(sub(f.id, "invites"));
  const key = mine.docs[0]?.id ?? secret();
  if (!mine.docs.length)
    await setDoc(doc(sub(f.id, "invites"), key), {
      name: f.name,
      by: uid(),
      ...(f.sport ? { sport: f.sport } : {}),
    });
  return `${window.location.origin}/forest/join/${f.id}/${key}`;
}

/** A fresh link; the old one stops working (for a link that went further than meant). */
export async function renewInvite(f: Forest): Promise<string> {
  const old = await getDocs(sub(f.id, "invites"));
  for (const d of old.docs) await deleteDoc(d.ref);
  return inviteLink(f);
}

/** What an invite link shows before joining: the forest's name and sport, or null when the link is no longer valid. */
export async function readInvite(
  fid: string,
  key: string,
): Promise<{ name: string; sport: MainSport } | null> {
  const s = await getDoc(doc(sub(fid, "invites"), key)).catch(() => null);
  return s?.exists()
    ? { name: s.get("name") as string, sport: forestSport({ sport: s.get("sport") as "run" }) }
    : null;
}

export async function requestToJoin(
  fid: string,
  key: string,
  name: string,
  sharePast: boolean,
  shareRoutes: boolean,
  shareEffort: boolean,
) {
  const now = Date.now();
  await setDoc(doc(sub(fid, "requests"), uid()), {
    name: name.trim().slice(0, 40),
    key,
    at: now,
    consentAt: now,
    sharePast,
    shareRoutes,
    shareEffort,
  });
}

/** My pending request to a forest, live (null once approved, declined or withdrawn). */
export const watchMyRequest = (fid: string, cb: (pending: boolean) => void) =>
  onSnapshot(
    doc(sub(fid, "requests"), uid()),
    (s) => cb(s.exists()),
    () => cb(false),
  );

export async function approve(fid: string, r: JoinRequest) {
  const b = writeBatch(db);
  b.update(forestDoc(fid), { members: arrayUnion(r.uid) });
  b.set(doc(sub(fid, "members"), r.uid), {
    name: r.name,
    joinedAt: Date.now(),
    consentAt: r.consentAt,
    defaultShared: true,
    sharePast: r.sharePast !== false,
    shareRoutes: r.shareRoutes === true,
    shareEffort: r.shareEffort === true,
  });
  b.delete(doc(sub(fid, "requests"), r.uid));
  await b.commit();
}

export const decline = (fid: string, r: JoinRequest) => deleteDoc(doc(sub(fid, "requests"), r.uid));

export const setMyForestPrefs = (
  fid: string,
  patch: Partial<
    Pick<Member, "name" | "defaultShared" | "sharePast" | "shareRoutes" | "shareEffort">
  >,
) => updateDoc(doc(sub(fid, "members"), uid()), patch);

/**
 * Leave a forest: my copy of the tree, my times and my membership go first (afterwards I can't reach them), then
 * my place in the forest. The last one out takes the forest with them.
 */
export async function leaveForest(f: Forest) {
  const me = uid();
  const years = await getDocs(collection(db, "forests", f.id, "trees", me, "years")).catch(
    () => null,
  );
  for (const d of years?.docs ?? []) await deleteDoc(d.ref);
  const pages = await getDocs(collection(db, "forests", f.id, "trees", me, "rides")).catch(
    () => null,
  );
  for (const d of pages?.docs ?? []) await deleteDoc(d.ref);
  await deleteDoc(doc(sub(f.id, "trees"), me)).catch(() => {});
  const segs = await getDocs(sub(f.id, "segments")).catch(() => null);
  for (const s of segs?.docs ?? []) await deleteDoc(doc(s.ref, "times", me)).catch(() => {});
  await deleteDoc(doc(sub(f.id, "members"), me));
  // Forget what was published there, so coming back publishes the tree afresh.
  for (const k of (await keys().catch(() => [])).map(String))
    if (k.startsWith(`forest-pub:${me}:${f.id}:`) || k.startsWith(`forest-time:${me}:${f.id}:`))
      await del(k);
  if (f.members.length <= 1) {
    for (const s of segs?.docs ?? []) await deleteDoc(s.ref).catch(() => {});
    const inv = await getDocs(sub(f.id, "invites")).catch(() => null);
    for (const d of inv?.docs ?? []) await deleteDoc(d.ref).catch(() => {});
    await deleteDoc(forestDoc(f.id));
  } else await updateDoc(forestDoc(f.id), { members: arrayRemove(me) });
}

/** Every forest I'm in, left (account deletion). */
export async function leaveAllForests() {
  const mine = await getDocs(
    query(collection(db, "forests"), where("members", "array-contains", uid())),
  );
  for (const d of mine.docs)
    await leaveForest({ id: d.id, ...(d.data() as Omit<Forest, "id">) }).catch((e) =>
      console.warn("Couldn't leave", d.id, e),
    );
}
