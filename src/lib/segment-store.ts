// Saved segments (starred climbs and manual segments). Pure merge logic; IO lives in use-segments.
import type { Segment } from "./segments";

export type SavedSegment = Segment & {
  starred: boolean;
  updatedAt: number;
  /** Named by hand; otherwise the display name comes from OpenStreetMap. */
  renamed?: boolean;
  /** Tombstone, so a delete on one device wins over an older copy on another. */
  deleted?: boolean;
};

/** Union by id; the copy with the newest updatedAt wins. */
export function mergeSegments(a: SavedSegment[], b: SavedSegment[]): SavedSegment[] {
  const map = new Map<string, SavedSegment>();
  for (const s of [...a, ...b]) {
    const cur = map.get(s.id);
    if (!cur || s.updatedAt > cur.updatedAt) map.set(s.id, s);
  }
  return [...map.values()].sort((x, y) => x.name.localeCompare(y.name));
}

export const liveSegments = (all: SavedSegment[]) => all.filter((s) => !s.deleted);
