import { get, set } from "idb-keyval";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { NAMES_FILE, readGist, writeGist } from "@/lib/gist";
import { dedupeNames, lookupSegmentName, mergeNames, placeKey } from "@/lib/places";
import type { Segment } from "@/lib/segments";
import { GITHUB_TOKEN, readSetting } from "@/lib/settings";

// OpenStreetMap names keyed by where the segment runs (ids depend on each device's ride history), kept on this
// device and shared through the gist, so each climb is looked up once across all devices. null = OSM had nothing.
type Names = Record<string, string | null>;
const KEY = "segment-names:v2";
const OLD = "segment-names:v1"; // the earlier per-id cache, moved over as its segments show up
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

/** This device's names, then (once per session) the ones other devices found. */
function whenReady() {
  return (ready ??= (async () => {
    cache = (await get<Names>(KEY).catch(() => undefined)) ?? {};
    old = (await get<Names>(OLD).catch(() => undefined)) ?? {};
    notify();
    if (!readSetting<string>(GITHUB_TOKEN) || !navigator.onLine) return;
    try {
      const remote = await readGist<Names>(NAMES_FILE);
      if (remote) {
        cache = mergeNames(cache, remote);
        await save();
        notify();
      }
    } catch (e) {
      console.warn("Name sync failed", e);
    }
  })());
}

let pushTimer: ReturnType<typeof setTimeout> | undefined;
function schedulePush() {
  if (!readSetting<string>(GITHUB_TOKEN)) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(async () => {
    try {
      const remote = (await readGist<Names>(NAMES_FILE)) ?? {};
      cache = mergeNames(cache!, remote);
      if (Object.keys(cache).some((k) => cache![k] !== remote[k]))
        await writeGist(cache, NAMES_FILE);
    } catch (e) {
      console.warn("Name sync failed", e);
    }
  }, 15000);
}

async function pump() {
  if (running) return;
  running = true;
  while (queue.length && navigator.onLine) {
    const job = queue.shift()!;
    try {
      cache![job.key] = await lookupSegmentName(job.seg);
      queued.delete(job.key);
      await save();
      schedulePush();
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
      let moved = false;
      for (const s of segs) {
        const k = placeKey(s);
        if (s.renamed || k in cache! || queued.has(k)) continue;
        if (s.id in old) {
          cache![k] = old[s.id]!;
          moved = true;
        } else {
          queued.add(k);
          queue.push({ key: k, seg: s, tries: 0 });
        }
      }
      if (moved) {
        void save();
        schedulePush();
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
