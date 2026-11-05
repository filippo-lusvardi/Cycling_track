// What the Garden draws of my own tree, beyond its fence: the same header my forests get (crown, age and kilometres), built on the device.
import { lifetime } from "./forest/age";
import { toSharedCrown } from "./forest/snapshot";
import type { TreeHeader } from "./forest/types";
import type { Activity } from "./intervals";
import type { MainSport } from "./sport";
import type { Crown } from "./tree";

export function myTreeHeader(
  crown: Crown,
  acts: Activity[],
  today: string,
  sport: MainSport = "ride",
): TreeHeader {
  const { since, km } = lifetime(acts, sport);
  return {
    crown: toSharedCrown(crown),
    day: today,
    years: since ? [since.slice(0, 4)] : [],
    off: [],
    since,
    km,
    ...(sport === "run" ? { sport } : {}),
    updatedAt: 0,
  };
}
