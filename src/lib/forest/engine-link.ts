// The forests' climbs, handed to this device's segment engine next to the user's saved ones, so each member's
// own rides are searched for efforts on them. Ids are prefixed, so they never mix with saved segments.
import type { Segment } from "../segments";

export const FOREST_PREFIX = "forest:";
let list: Segment[] = [];
const listeners = new Set<() => void>();

export const forestSegments = {
  get: () => list,
  set(next: Segment[]) {
    list = next;
    listeners.forEach((l) => l());
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => void listeners.delete(l);
  },
};

/** The engine id of a forest climb. */
export const forestKey = (fid: string, sid: string) => `${FOREST_PREFIX}${fid}:${sid}`;
