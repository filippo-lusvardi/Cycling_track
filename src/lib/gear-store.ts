// The account's gear, live on this device. Firestore's own cache keeps it offline and queues what is written, so a
// change shows at once here and goes out when it can. Started with the session (lib/account).
import { useSyncExternalStore } from "react";
import type { Gear, Overrides } from "./gear";

export type GearState = { gears: Gear[]; overrides: Overrides; ready: boolean };

let state: GearState = { gears: [], overrides: {}, ready: false };
const listeners = new Set<() => void>();

function set(next: Partial<GearState>) {
  state = { ...state, ...next };
  for (const l of listeners) l();
}

export const gearState = () => state;
export const subscribeGear = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export const useGearState = () => useSyncExternalStore(subscribeGear, gearState, gearState);

const sorted = (gears: Gear[]) => [...gears].sort((a, b) => a.name.localeCompare(b.name));
const warn = (e: unknown) => console.warn("Gear sync failed", e);

/** Follow the account's gear; returns the unsubscribe. */
export async function followGear(): Promise<() => void> {
  const { watchGear, watchGearRides } = await import("./cloud");
  const a = watchGear((gears) => set({ gears: sorted(gears), ready: true }));
  const b = watchGearRides((overrides) => set({ overrides }));
  return () => {
    a();
    b();
  };
}

/** Save gear (several at once when a default moves). Shown at once; Firestore sends it when it can. */
export async function saveGear(...gears: Gear[]) {
  const ids = new Set(gears.map((g) => g.id));
  set({ gears: sorted([...state.gears.filter((g) => !ids.has(g.id)), ...gears]) });
  const { writeGear } = await import("./cloud");
  for (const g of gears) writeGear(g).catch(warn);
}

export async function removeGear(id: string) {
  set({ gears: state.gears.filter((g) => g.id !== id) });
  const { deleteGear } = await import("./cloud");
  deleteGear(id).catch(warn);
}

/** An activity onto a gear (id), onto none (null), or back to its default (undefined). */
export async function setRideGear(activityId: string, gear: string | null | undefined) {
  const overrides = { ...state.overrides };
  if (gear === undefined) delete overrides[activityId];
  else overrides[activityId] = gear;
  set({ overrides });
  const { writeGearRide } = await import("./cloud");
  writeGearRide(activityId, gear).catch(warn);
}

/** For tests: start from a known state. */
export const resetGearState = (next: Partial<GearState> = {}) =>
  set({ gears: [], overrides: {}, ready: false, ...next });
