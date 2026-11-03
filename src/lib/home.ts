// What Home draws of my own tree: the same header my forests get (crown, age and kilometres), built on the device.
import { lifetime } from "./forest/age";
import { toSharedCrown } from "./forest/snapshot";
import type { TreeHeader } from "./forest/types";
import type { Activity } from "./intervals";
import type { Crown } from "./tree";

export function myTreeHeader(crown: Crown, acts: Activity[], today: string): TreeHeader {
  const { since, km } = lifetime(acts);
  return {
    crown: toSharedCrown(crown),
    day: today,
    years: since ? [since.slice(0, 4)] : [],
    off: [],
    since,
    km,
    updatedAt: 0,
  };
}
