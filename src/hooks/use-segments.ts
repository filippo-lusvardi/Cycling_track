import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { useLocalStore } from "./use-local-store";
import { readSegments, watchSegments, writeSegments } from "@/lib/cloud";
import { auth } from "@/lib/firebase";
import { liveSegments, mergeSegments, type SavedSegment } from "@/lib/segment-store";
import { segmentEngine, startSegments } from "@/lib/segment-app";
import { groupSegment, groupTrace, ridesIn } from "@/lib/segment-index";
import type { Segment, Trace } from "@/lib/segments";
import { SEGMENTS, readSetting, writeSetting } from "@/lib/settings";

/** Remote copies newer than this device's (or unknown here) come in; this device's newer ones go out. */
function mergeRemote(remote: SavedSegment[]) {
  const local = readSetting<SavedSegment[]>(SEGMENTS) ?? [];
  const merged = mergeSegments(local, remote);
  const theirs = new Map(remote.map((s) => [s.id, s.updatedAt]));
  if (JSON.stringify(merged) !== JSON.stringify(mergeSegments(local, [])))
    writeSetting(SEGMENTS, merged);
  return merged.filter((s) => theirs.get(s.id) !== s.updatedAt);
}

/** Merge this device's segments with the account's and write the result to both. No-op when signed out. */
export async function syncSegments(extra: SavedSegment[] = []) {
  if (!auth.currentUser) return;
  const ahead = mergeRemote(mergeSegments(await readSegments(), extra));
  if (ahead.length) await writeSegments(ahead);
}

/** Keep this device's segments in step with the account while signed in; returns the unsubscribe. */
export const followSegments = () => watchSegments((remote) => void mergeRemote(remote));

const pending = new Map<string, SavedSegment>();
let pushTimer: ReturnType<typeof setTimeout> | undefined;
function schedulePush(s: SavedSegment) {
  pending.set(s.id, s);
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    const out = [...pending.values()];
    pending.clear();
    if (auth.currentUser) writeSegments(out).catch((e) => console.warn("Segment sync failed", e));
  }, 1500);
}

export function useSegments() {
  const [all, setAll] = useLocalStore<SavedSegment[]>(SEGMENTS, []);

  const upsert = useCallback(
    (
      s: Segment,
      patch: Partial<Pick<SavedSegment, "starred" | "name" | "deleted" | "renamed">> = {},
    ) => {
      setAll((prev) => {
        const cur = prev.find((p) => p.id === s.id);
        // Only the segment's own fields: list items also carry traces and counts that mustn't reach storage or Firestore.
        const { id, name, source, lat1, lng1, lat2, lng2, length, gain, grade } = s;
        const own: Segment = { id, name, source, lat1, lng1, lat2, lng2, length };
        if (gain != null) own.gain = gain;
        if (grade != null) own.grade = grade;
        const next: SavedSegment = {
          starred: false,
          ...cur,
          ...own,
          ...patch,
          updatedAt: Date.now(),
        };
        if (!patch.deleted) delete next.deleted;
        schedulePush(next);
        return mergeSegments(prev, [next]);
      });
    },
    [setAll],
  );

  // Memoised: a new array on every render would make every page using segments recompute (and loop) forever.
  const segments = useMemo(() => liveSegments(all), [all]);

  return {
    segments,
    isStarred: (id: string) => all.some((s) => s.id === id && s.starred && !s.deleted),
    toggleStar: (s: Segment) =>
      upsert(s, { starred: !all.some((p) => p.id === s.id && p.starred && !p.deleted) }),
    save: (s: Segment, named = false) => upsert(s, { starred: true, renamed: named }),
    /** A blank name goes back to the automatic (OpenStreetMap) one. */
    rename: (s: Segment, name: string) =>
      upsert(s, name.trim() ? { name: name.trim(), renamed: true } : { renamed: false }),
    remove: (s: Segment) => upsert(s, { deleted: true, starred: false }),
  };
}

export type LibrarySegment = Segment & {
  starred: boolean;
  saved: boolean;
  /** Rides through it (from the cached efforts; detections while those are still being computed). */
  rides: number | null;
  renamed?: boolean;
  /** Where its efforts live: the group it follows, or its own id. */
  effortsKey: string;
  /** Path and profile of its fastest effort (or of the climb itself), for maps and altimetry. */
  trace: Trace | null;
};

/**
 * Saved segments plus climbs found on ≥ 2 rides, from the on-device segment index; starred first, then by
 * how often ridden. Climbs starred from auto-detection follow their group's shared stretch. With `sync`,
 * opening the page also fetches and analyses new rides in the background.
 */
export function useSegmentLibrary({ sync = true }: { sync?: boolean } = {}) {
  const store = useSegments();
  const idx = useSyncExternalStore(segmentEngine.subscribe, segmentEngine.getSnapshot);
  useEffect(() => void startSegments(sync), [sync]);
  useEffect(() => segmentEngine.setSaved(store.segments), [store.segments]);

  const list = useMemo<LibrarySegment[]>(() => {
    const groups = new Map(idx.groups.map((g) => [g.id, g]));
    const followed = new Set(Object.values(idx.links));
    const saved = store.segments.map((s) => {
      const g = groups.get(idx.links[s.id] ?? "");
      const rec = idx.efforts[g?.id ?? s.id];
      return {
        ...(g ? groupSegment(g) : s),
        id: s.id,
        name: s.name,
        source: s.source,
        starred: s.starred,
        ...(s.renamed ? { renamed: true } : {}),
        saved: true,
        effortsKey: g?.id ?? s.id,
        rides: rec ? ridesIn(rec) : null,
        trace: rec?.trace ?? (g ? groupTrace(g) : null),
      };
    });
    const auto = idx.groups
      .filter((g) => !followed.has(g.id))
      .map((g) => {
        const rec = idx.efforts[g.id];
        return {
          ...groupSegment(g),
          starred: false,
          saved: false,
          effortsKey: g.id,
          rides: rec ? ridesIn(rec) : g.members.length,
          trace: rec?.trace ?? groupTrace(g),
        };
      })
      .filter((a) => a.rides >= 2);
    return [...saved, ...auto].sort(
      (a, b) =>
        Number(b.starred) - Number(a.starred) ||
        (b.rides ?? 0) - (a.rides ?? 0) ||
        a.name.localeCompare(b.name),
    );
  }, [store.segments, idx]);

  return {
    ...store,
    list,
    efforts: idx.efforts,
    status: idx.status,
    ridesAnalysed: idx.rides,
    lastSync: idx.lastSync,
  };
}
