import { doc, onSnapshot } from "firebase/firestore";
import { get as idbGet, set as idbSet } from "idb-keyval";
import { useEffect } from "react";
import { forestKey, forestSegments } from "@/lib/forest/engine-link";
import { watchMyForests, type Forest } from "@/lib/forest/forests";
import { bestShared, publishTime, watchClimbs, type ForestClimb } from "@/lib/forest/leaderboard";
import { fingerprint } from "@/lib/forest/snapshot";
import { isShared, watchOverrides, type Overrides } from "@/lib/forest/visibility";
import { db, uid } from "@/lib/firebase";
import { segmentEngine, startSegments } from "@/lib/segment-app";
import { liveSegments, type SavedSegment } from "@/lib/segment-store";
import { readSetting, SEGMENTS } from "@/lib/settings";

/**
 * In the background while the app is open: hand my forests' climbs to the segment engine (so my rides are searched
 * for efforts on them), and publish my best time on each from the rides I share with that forest. Draws nothing.
 */
export function ForestSync() {
  useEffect(() => {
    const me = uid();
    let forests: Forest[] = [];
    const climbs = new Map<string, ForestClimb[]>();
    const shareByDefault = new Map<string, boolean>();
    let overrides: Overrides = {};
    const stops = new Map<string, (() => void)[]>();
    let timer: ReturnType<typeof setTimeout> | undefined;

    const register = () => {
      const list = forests.flatMap((f) =>
        (climbs.get(f.id) ?? []).map((c) => ({ ...c, id: forestKey(f.id, c.sid) })),
      );
      forestSegments.set(list);
      // Off the Segments page nobody else tells the engine; on it, use-segments merges the same list.
      const saved = liveSegments(readSetting<SavedSegment[]>(SEGMENTS) ?? []);
      segmentEngine.setSaved([...saved, ...list]);
      schedule();
    };

    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void publishAll(), 5000);
    };

    async function publishAll() {
      const snap = segmentEngine.getSnapshot();
      for (const f of forests) {
        const byDefault = shareByDefault.get(f.id);
        if (byDefault == null) continue;
        for (const c of climbs.get(f.id) ?? []) {
          const id = forestKey(f.id, c.sid);
          const rec = snap.efforts[snap.links[id] ?? id];
          if (!rec) continue;
          const best = bestShared(rec.attempts, (ride) =>
            isShared(ride, f.id, byDefault, overrides),
          );
          const key = `forest-time:${me}:${f.id}:${c.sid}`;
          const fp = fingerprint(best && [best.trackId, best.duration]);
          if ((await idbGet<string>(key).catch(() => undefined)) === fp) continue;
          await publishTime(f.id, c.sid, best).catch((e) => console.warn("Time not published", e));
          await idbSet(key, fp).catch(() => {});
        }
      }
    }

    const stopForests = watchMyForests((next) => {
      forests = next;
      for (const [fid, s] of stops)
        if (!next.some((f) => f.id === fid)) {
          s.forEach((stop) => stop());
          stops.delete(fid);
          climbs.delete(fid);
        }
      for (const f of next)
        if (!stops.has(f.id))
          stops.set(f.id, [
            watchClimbs(f.id, (c) => {
              climbs.set(f.id, c);
              register();
            }),
            onSnapshot(
              doc(db, "forests", f.id, "members", me),
              (m) => {
                shareByDefault.set(f.id, m.get("defaultShared") !== false);
                schedule();
              },
              () => {},
            ),
          ]);
      register();
    });
    const stopOverrides = watchOverrides((o) => {
      overrides = o;
      schedule();
    });
    const stopEngine = segmentEngine.subscribe(schedule);
    void startSegments(false);

    return () => {
      clearTimeout(timer);
      stopForests();
      stopOverrides();
      stopEngine();
      for (const s of stops.values()) s.forEach((stop) => stop());
      forestSegments.set([]);
    };
  }, []);
  return null;
}
