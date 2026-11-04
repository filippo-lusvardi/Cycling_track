import { doc, onSnapshot } from "firebase/firestore";
import { get as idbGet, set as idbSet } from "idb-keyval";
import { useEffect } from "react";
import { forestKey, forestSegments } from "@/lib/forest/engine-link";
import { forestSport, watchMyForests, type Forest } from "@/lib/forest/forests";
import { bestShared, publishTime, readClimbs, type ForestClimb } from "@/lib/forest/leaderboard";
import { fingerprint } from "@/lib/forest/snapshot";
import {
  isShared,
  prefsOf,
  watchOverrides,
  type Overrides,
  type SharePrefs,
} from "@/lib/forest/visibility";
import { effortSeries, toSplits, type Splits } from "@/lib/ghost";
import { uid } from "@/lib/firebase";
import { db } from "@/lib/db";
import { segmentEngine, startSegments } from "@/lib/segment-app";
import { liveSegments, type SavedSegment } from "@/lib/segment-store";
import { readSetting, SEGMENTS } from "@/lib/settings";
import { attemptsIn } from "@/lib/segment-index";

/**
 * In the background while the app is open: hand my forests' climbs to the segment engine (so my rides are searched
 * for efforts on them), and publish my best time on each from the rides I share with that forest. Draws nothing.
 */
export function ForestSync() {
  useEffect(() => {
    const me = uid();
    let forests: Forest[] = [];
    const climbs = new Map<string, ForestClimb[]>();
    const prefs = new Map<string, SharePrefs>();
    let overrides: Overrides = {};
    const stops = new Map<string, (() => void)[]>();
    /** The `climbsAt` stamp each forest's climbs were last read at. */
    const stamps = new Map<string, number>();
    let stopped = false;
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
        const p = prefs.get(f.id);
        if (!p) continue;
        for (const c of climbs.get(f.id) ?? []) {
          const id = forestKey(f.id, c.sid);
          const rec = snap.efforts[snap.links[id] ?? id];
          if (!rec) continue;
          // Only the forest's sport is shared: a bike time never lands on a board of runs.
          const best = bestShared(attemptsIn(rec, forestSport(f)), (a) =>
            isShared({ id: a.trackId, day: a.date.slice(0, 10) }, f.id, p, overrides),
          );
          const key = `forest-time:${me}:${f.id}:${c.sid}`;
          const before = await idbGet<string>(key).catch(() => undefined);
          // Times published before splits existed go out again once, now with them.
          const full = fingerprint(best && [best.trackId, best.duration, "splits"]);
          if (before === full) continue;
          const track = best && (await segmentEngine.loadTrack(best.trackId).catch(() => null));
          const splits: Splits | null = best && track ? toSplits(effortSeries(track, best)) : null;
          const fp = splits || !best ? full : fingerprint([best.trackId, best.duration]);
          if (before === fp) continue;
          await publishTime(f.id, c.sid, best, splits).catch((e) =>
            console.warn("Time not published", e),
          );
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
          stamps.delete(fid);
        }
      for (const f of next) {
        // Climbs are read again only when the forest's stamp moves (someone added or removed one).
        const at = f.climbsAt ?? 0;
        if (stamps.get(f.id) !== at) {
          stamps.set(f.id, at);
          void readClimbs(f.id, at).then(
            (c) => {
              if (stopped || stamps.get(f.id) !== at) return;
              climbs.set(f.id, c);
              register();
            },
            (e) => {
              console.warn("Forest climbs unavailable", e);
              stamps.delete(f.id);
            },
          );
        }
        if (!stops.has(f.id))
          stops.set(f.id, [
            onSnapshot(
              doc(db, "forests", f.id, "members", me),
              (m) => {
                prefs.set(f.id, prefsOf(m.data()));
                schedule();
              },
              () => {},
            ),
          ]);
      }
      register();
    });
    const stopOverrides = watchOverrides((o) => {
      overrides = o;
      schedule();
    });
    const stopEngine = segmentEngine.subscribe(schedule);
    void startSegments(false);

    return () => {
      stopped = true;
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
