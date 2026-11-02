// The segment engine wired to this browser: IndexedDB storage and intervals.icu downloads.
import { createStore, del, get, keys, set, type UseStore } from "idb-keyval";
import { packTrack } from "./compact";
import type { Track } from "./intervals";
import { downloadRideTrack, listOutdoorRides } from "./source";
import { createSegmentEngine, type KV } from "./segment-engine";
import { readSetting, SEGMENT_HISTORY } from "./settings";
import { addDays, isoDate } from "./training";

const kv = (store: UseStore): KV => ({
  get: (k) => get(k, store),
  set: (k, v) => set(k, v, store),
  del: (k) => del(k, store),
  keys: async () => (await keys(store)).map(String),
});

const trackStore = createStore("cadence-tracks", "tracks");

export const historyYears = () => readSetting<number>(SEGMENT_HISTORY) ?? 2;

export const segmentEngine = createSegmentEngine({
  meta: kv(createStore("cadence-segments", "meta")),
  tracks: kv(trackStore),
  listRides: listOutdoorRides,
  downloadTrack: downloadRideTrack,
  historyFrom: () => {
    const y = historyYears();
    return y ? addDays(isoDate(new Date()), -365 * y) : "2005-01-01";
  },
  today: () => isoDate(new Date()),
});

/** One-off move from the old layout: keep 20 m tracks already downloaded, drop the never-evicted full streams. */
async function migrateLegacy() {
  for (const k of (await keys()).map(String)) {
    if (k.startsWith("track:v1:")) {
      const t = await get<Track | 0>(k);
      if (t) await set(t.id, packTrack(t), trackStore);
      await del(k);
    } else if (k.startsWith("streams:v1:")) await del(k);
  }
}

let started: Promise<void> | null = null;

/** Load the stored index once per session; with `sync`, also fetch new rides if the last sync is > 15 min old. */
export function startSegments(sync: boolean) {
  started ??= migrateLegacy()
    .catch((e) => console.warn("Segment migration failed", e))
    .then(() => segmentEngine.load());
  return started.then(() => {
    const last = segmentEngine.getSnapshot().lastSync;
    if (sync && (!last || Date.now() - last > 15 * 60_000)) void segmentEngine.sync();
  });
}
