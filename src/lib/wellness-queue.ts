// Wellness entries made offline wait in IndexedDB and are sent when the connection returns.
import { get, set } from "idb-keyval";
import type { WellnessEntry } from "./intervals";
import { saveWellnessEntry } from "./source";

const KEY = "pending-wellness";

const pending = async () => (await get<WellnessEntry[]>(KEY).catch(() => undefined)) ?? [];

export async function saveWellnessOrQueue(entry: WellnessEntry): Promise<"saved" | "queued"> {
  try {
    await saveWellnessEntry(entry);
    return "saved";
  } catch (e) {
    // fetch() rejects with TypeError on network failure; anything else (bad key, 4xx) is a real error.
    if (!(e instanceof TypeError)) throw e;
    // Two saves for one day while offline add up: a weight mustn't wipe a waiting check-in.
    const all = await pending();
    const same = all.find((p) => p.date === entry.date);
    await set(KEY, [...all.filter((p) => p.date !== entry.date), { ...same, ...entry }]);
    return "queued";
  }
}

/** Send queued entries; returns how many were delivered. */
export async function flushWellnessQueue(): Promise<number> {
  const q = await pending();
  let sent = 0;
  const left: WellnessEntry[] = [];
  for (const e of q) {
    try {
      await saveWellnessEntry(e);
      sent++;
    } catch {
      left.push(e);
    }
  }
  if (q.length) await set(KEY, left);
  return sent;
}
