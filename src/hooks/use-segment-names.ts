import { get, set } from "idb-keyval";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { readPlaces, writePlaces } from "@/lib/cloud";
import { auth } from "@/lib/firebase";
import { dedupeNames, lookupSegmentName, mergeNames, placeKey } from "@/lib/places";
import type { Segment } from "@/lib/segments";

// OpenStreetMap names keyed by where the segment runs (ids depend on each device's ride history), kept on this
// device and shared in Firestore by every user, so each climb is looked up once by anyone. null = OSM had nothing.
type Names = Record<string, string | null>;
const KEY = "segment-names:v2";
const OLD = "segment-names:v1"; // the earlier per-id cache, moved over as its segments show up
const SINCE = "segment-names:since"; // newest shared name already pulled, so each session asks only for later ones
let cache: Names | null = null;
let old: Names = {};
let ready: Promise<void> | undefined;
const listeners = new Set<() => void>();
const queued = new Set<string>();
const queue: { key: string; seg: Segment; tries: number }[] = [];
let running = false;

const notify = () => listeners.forEach((l) => l());
const save = () => set(KEY, cache).catch(() => {});
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};

/** This device's names, then (once per session) the ones found elsewhere since the last pull. */
function whenReady() {
  return (ready ??= (async () => {
    cache = (await get<Names>(KEY).catch(() => undefined)) ?? {};
    old = (await get<Names>(OLD).catch(() => undefined)) ?? {};
    notify();
    if (!auth.currentUser || !navigator.onLine) return;
    try {
      const since = (await get<number>(SINCE).catch(() => undefined)) ?? 0;
      const { names, latest } = await readPlaces(since);
      cache = mergeNames(cache, names);
      await save();
      await set(SINCE, latest).catch(() => {});
      notify();
      // On the first pull (which brings every shared name), names only this device knows go out once.
      if (!since) {
        const mine = Object.fromEntries(
          Object.entries(cache).filter(([k, v]) => !(k in names) && v !== null),
        );
        if (Object.keys(mine).length) found(mine);
      }
    } catch (e) {
      console.warn("Name sync failed", e);
    }
  })());
}

const unsent: Names = {};
let pushTimer: ReturnType<typeof setTimeout> | undefined;
/** Names found here, sent in one batch a little later. */
function found(names: Names) {
  Object.assign(unsent, names);
  if (!auth.currentUser) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    const out = { ...unsent };
    for (const k of Object.keys(out)) delete unsent[k];
    // A shared cache: if the batch fails (offline for long, or someone else's name won), the names stay local.
    writePlaces(out).catch((e) => console.warn("Name sync failed", e));
  }, 15000);
}

async function pump() {
  if (running) return;
  running = true;
  while (queue.length && navigator.onLine) {
    const job = queue.shift()!;
    try {
      const name = await lookupSegmentName(job.seg);
      cache![job.key] = name;
      queued.delete(job.key);
      await save();
      found({ [job.key]: name });
    } catch {
      // OSM busy or the connection dropped: back off and retry at the end of the round, up to three times.
      if (++job.tries < 3) {
        queue.push(job);
        await new Promise((r) => setTimeout(r, 15000 * job.tries));
      } else queued.delete(job.key);
    }
    notify();
  }
  running = false;
}
if (typeof window !== "undefined") window.addEventListener("online", () => void pump());

/** How many segments are still waiting for their OpenStreetMap name. */
export const useNamesPending = () => useSyncExternalStore(subscribe, () => queued.size);

type Named = Segment & { renamed?: boolean };

/** Display names for segments: your own name if you renamed it, else the OSM landmark or towns, else the stats name. */
export function useSegmentNames(segs: Named[]) {
  const [version, setVersion] = useState(0);
  useEffect(() => subscribe(() => setVersion((v) => v + 1)), []);
  // Keyed by where the segments run (not the array), so a re-render with the same segments doesn't start another round.
  const ids = segs.map((s) => `${s.id}@${placeKey(s)}${s.renamed ? `!${s.name}` : ""}`).join("|");
  useEffect(() => {
    void whenReady().then(() => {
      const moved: Names = {};
      for (const s of segs) {
        const k = placeKey(s);
        if (s.renamed || k in cache! || queued.has(k)) continue;
        if (s.id in old) {
          cache![k] = moved[k] = old[s.id]!;
        } else {
          queued.add(k);
          queue.push({ key: k, seg: s, tries: 0 });
        }
      }
      if (Object.keys(moved).length) {
        void save();
        found(moved);
      }
      notify();
      void pump();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids]);

  return useMemo(() => {
    const names = dedupeNames(
      segs.map((s) => ({
        id: s.id,
        length: s.length,
        name: s.renamed ? s.name : (cache?.[placeKey(s)] ?? s.name),
      })),
    );
    return (s: Segment) => names.get(s.id) ?? s.name;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids, version]);
}
