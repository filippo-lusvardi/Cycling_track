import { get, set } from "idb-keyval";
import { useEffect, useMemo, useState } from "react";
import { dedupeNames, lookupSegmentName } from "@/lib/places";
import type { Segment } from "@/lib/segments";

// OpenStreetMap names per segment id, looked up once and kept on this device. null = OSM had nothing.
const KEY = "segment-names:v1";
let cache: Record<string, string | null> | null = null;
const listeners = new Set<() => void>();
const queued = new Set<string>();
const queue: Segment[] = [];
let running = false;

async function load() {
  cache ??= (await get<Record<string, string | null>>(KEY).catch(() => undefined)) ?? {};
  return cache;
}

async function pump() {
  if (running) return;
  running = true;
  while (queue.length && navigator.onLine) {
    const s = queue.shift()!;
    try {
      cache![s.id] = await lookupSegmentName(s);
      await set(KEY, cache).catch(() => {});
      listeners.forEach((l) => l());
    } catch {
      // Network trouble: leave it unnamed for now and try again next time the page opens.
    }
    queued.delete(s.id);
  }
  running = false;
}

type Named = Segment & { renamed?: boolean };

/** Display names for segments: your own name if you renamed it, else the OSM landmark or towns, else the stats name. */
export function useSegmentNames(segs: Named[]) {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const l = () => setVersion((v) => v + 1);
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);
  // Keyed by the ids (not the array), so a re-render with the same segments doesn't start another round.
  const ids = segs.map((s) => `${s.id}${s.renamed ? `!${s.name}` : ""}`).join("|");
  useEffect(() => {
    const first = !cache;
    void load().then((c) => {
      if (first) setVersion((v) => v + 1);
      for (const s of segs)
        if (!s.renamed && !(s.id in c) && !queued.has(s.id)) {
          queued.add(s.id);
          queue.push(s);
        }
      void pump();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids]);

  return useMemo(() => {
    const names = dedupeNames(
      segs.map((s) => ({ id: s.id, length: s.length, name: s.renamed ? s.name : (cache?.[s.id] ?? s.name) })),
    );
    return (s: Segment) => names.get(s.id) ?? s.name;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids, version]);
}
