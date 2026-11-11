// Your roads on this device: the graph is built from the outdoor rides the segment analysis has stored (their 20 m
// tracks), kept in IndexedDB, and grown by the rides added since. Cycling only.
import { createStore, get, set } from "idb-keyval";
import { useEffect, useState, useSyncExternalStore } from "react";
import { segmentEngine, startSegments, storedTrack } from "../segment-app";
import type { RideRef } from "../segment-engine";
import { calibrate, type Rider } from "./estimate";
import {
  addRide,
  emptyRoads,
  packRoads,
  unpackRoads,
  type PackedRoads,
  type Roads,
} from "./my-roads";

const store = createStore("cadence-roads", "graph");
const KEY = "roads";
const FACTOR_KEY = "factor";

const cyclingRefs = async (): Promise<RideRef[]> =>
  (await segmentEngine.rideRefs()).filter((r) => r.sport !== "run");

let current: { roads: Roads; rides: number } | null = null;
let running: Promise<Roads> | null = null;

const yieldToUi = () => new Promise((r) => setTimeout(r, 0));

async function build(): Promise<Roads> {
  await startSegments(false);
  const refs = await cyclingRefs();
  const ids = new Set(refs.map((r) => r.id));
  const packed = current ? null : await get<PackedRoads>(KEY, store).catch(() => undefined);
  let roads = current?.roads ?? (packed?.v === 1 ? unpackRoads(packed) : emptyRoads());
  // Rides gone from the analysis (a shorter history, a cleared index): start again without them.
  if ([...roads.rides].some((id) => !ids.has(id))) roads = emptyRoads();
  let added = 0;
  for (const r of refs) {
    if (roads.rides.has(r.id)) continue;
    const t = await storedTrack(r.id);
    if (t) addRide(roads, r.id, t.lat, t.lng);
    else roads.rides.add(r.id);
    if (++added % 10 === 0) await yieldToUi();
  }
  if (added || !packed) await set(KEY, packRoads(roads), store).catch(() => {});
  current = { roads, rides: refs.length };
  return roads;
}

/** Your roads, brought up to date with the rides analysed so far. */
export function loadRoads(): Promise<Roads> {
  running ??= build().finally(() => (running = null));
  return running;
}

/** Your roads for a page; rebuilt when the segment analysis has taken in new rides. */
export function useRoads(): Roads | null {
  const snap = useSyncExternalStore(segmentEngine.subscribe, segmentEngine.getSnapshot);
  const [roads, setRoads] = useState<Roads | null>(current?.roads ?? null);
  const rides = snap.rides;
  useEffect(() => {
    let live = true;
    loadRoads()
      .then((r) => live && setRoads(r))
      .catch((e) => console.warn("Roads unavailable", e));
    return () => {
      live = false;
    };
  }, [rides]);
  return roads;
}

/**
 * How your rides compare with the time model, from your last 15 outdoor rides of 10 km or more. Kept per ride set, so
 * it is worked out again only after a new ride.
 */
export async function riderFactor(r: Pick<Rider, "watts" | "kg">): Promise<number> {
  const refs = (await cyclingRefs()).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 15);
  const sig = `${refs.map((x) => x.id).join(",")}|${r.watts}|${r.kg}`;
  const kept = await get<{ sig: string; factor: number }>(FACTOR_KEY, store).catch(() => undefined);
  if (kept?.sig === sig) return kept.factor;
  const tracks = (await Promise.all(refs.map((x) => storedTrack(x.id)))).flatMap((t) =>
    t ? [t] : [],
  );
  const factor = calibrate(tracks, r);
  await set(FACTOR_KEY, { sig, factor }, store).catch(() => {});
  return factor;
}

/** The cycling rides analysed since a day (inclusive), for matching them with saved routes. */
export const ridesSince = async (day: string) =>
  (await cyclingRefs()).filter((r) => r.date >= day).sort((a, b) => a.date.localeCompare(b.date));
