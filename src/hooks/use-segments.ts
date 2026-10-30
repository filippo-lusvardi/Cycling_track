import { useCallback, useMemo } from "react";
import { useLocalStore } from "./use-local-store";
import { readGist, writeGist } from "@/lib/gist";
import { liveSegments, mergeSegments, type SavedSegment } from "@/lib/segment-store";
import { autoSegments, findAttempts, samePath, segmentTrace, type Segment, type TrackLike } from "@/lib/segments";
import { GITHUB_TOKEN, SEGMENTS, readSetting, writeSetting } from "@/lib/settings";

/** Merge this device's segments with the gist and write the result to both. No-op without a token. */
export async function syncSegments() {
  if (!readSetting<string>(GITHUB_TOKEN)) return;
  const local = readSetting<SavedSegment[]>(SEGMENTS) ?? [];
  const remote = (await readGist<SavedSegment[]>()) ?? [];
  const merged = mergeSegments(local, remote);
  writeSetting(SEGMENTS, merged);
  if (JSON.stringify(merged) !== JSON.stringify(mergeSegments(remote, []))) await writeGist(merged);
}

let pushTimer: ReturnType<typeof setTimeout> | undefined;
function schedulePush() {
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => syncSegments().catch((e) => console.warn("Segment sync failed", e)), 1500);
}

export function useSegments() {
  const [all, setAll] = useLocalStore<SavedSegment[]>(SEGMENTS, []);

  const upsert = useCallback(
    (s: Segment, patch: Partial<Pick<SavedSegment, "starred" | "name" | "deleted" | "renamed">> = {}) => {
      setAll((prev) => {
        const cur = prev.find((p) => p.id === s.id);
        const next: SavedSegment = { starred: false, ...cur, ...s, ...patch, updatedAt: Date.now() };
        if (!patch.deleted) delete next.deleted;
        return mergeSegments(prev, [next]);
      });
      schedulePush();
    },
    [setAll],
  );

  // Memoised: a new array on every render would make every page using segments recompute (and loop) forever.
  const segments = useMemo(() => liveSegments(all), [all]);

  return {
    segments,
    isStarred: (id: string) => all.some((s) => s.id === id && s.starred && !s.deleted),
    toggleStar: (s: Segment) => upsert(s, { starred: !all.some((p) => p.id === s.id && p.starred && !p.deleted) }),
    save: (s: Segment, named = false) => upsert(s, { starred: true, renamed: named }),
    /** A blank name goes back to the automatic (OpenStreetMap) one. */
    rename: (s: Segment, name: string) => upsert(s, name.trim() ? { name: name.trim(), renamed: true } : { renamed: false }),
    remove: (s: Segment) => upsert(s, { deleted: true, starred: false }),
  };
}

export type LibrarySegment = Segment & { starred: boolean; saved: boolean; rides: number | null; renamed?: boolean };

/** Saved segments plus climbs auto-detected in ≥ 2 rides; starred first, then by how often ridden. */
export function useSegmentLibrary(tracks: TrackLike[] | undefined) {
  const store = useSegments();
  const auto = useMemo(() => (tracks ? autoSegments(tracks).filter((s) => s.rides >= 2) : []), [tracks]);
  const list = useMemo<LibrarySegment[]>(() => {
    // Rides are counted with the same pass-through check the segment page uses, so the numbers always match.
    const ridesOf = (s: Segment) => (tracks ? tracks.filter((t) => findAttempts(t, s).length > 0).length : null);
    const traceOf = (s: Segment) => (tracks ? segmentTrace(tracks, s) : null);
    const savedTraces = store.segments.map(traceOf);
    const saved = store.segments.map((s) => ({ ...s, saved: true, rides: ridesOf(s) }));
    const extra = auto
      .filter((a) => {
        const ta = traceOf(a);
        return !store.segments.some((s, i) => (ta && savedTraces[i] ? samePath(ta, savedTraces[i]!) : false));
      })
      .map((a) => ({ ...a, starred: false, saved: false }));
    return [...saved, ...extra].sort(
      (a, b) => Number(b.starred) - Number(a.starred) || (b.rides ?? 0) - (a.rides ?? 0) || a.name.localeCompare(b.name),
    );
  }, [store.segments, auto, tracks]);
  return { ...store, list };
}
