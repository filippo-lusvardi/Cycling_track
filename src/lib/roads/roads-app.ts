// Your roads on this device: the graph is built from the outdoor rides the segment analysis has stored (their 20 m
// tracks), kept in IndexedDB, and grown by the rides added since. Cycling only. Each ride counts for the bike it was
// ridden on, read from the activity list (road, gravel, MTB; e-bike and anything else count as road); a ride whose kind
// has changed since sends the graph to be built again.
import { useQuery } from "@tanstack/react-query";
import { createStore, get, set } from "idb-keyval";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { activityKind } from "../activity-kind";
import { allActivitiesQuery } from "../queries";
import { segmentEngine, startSegments, storedTrack } from "../segment-app";
import type { RideRef } from "../segment-engine";
import {
  addRide,
  emptyRoads,
  packRoads,
  unpackRoads,
  type PackedRoads,
  type RideBike,
  type Roads,
} from "./my-roads";

/** Which bike each ride was on, by id. */
export type RideBikes = Map<string, RideBike>;

export function rideBikes(
  acts: { id: string; type: string | null; trainer?: boolean }[],
): RideBikes {
  const out: RideBikes = new Map();
  for (const a of acts) {
    const k = activityKind(a);
    if (k === "gravel" || k === "mtb") out.set(a.id, k);
  }
  return out;
}

const store = createStore("cadence-roads", "graph");
const KEY = "roads";
/** The bike of each ride, as the activity list last said: the graph is built from it without waiting for the list. */
const BIKES_KEY = "bikes";

const cyclingRefs = async (): Promise<RideRef[]> =>
  (await segmentEngine.rideRefs()).filter((r) => r.sport !== "run");

let current: { roads: Roads; rides: number } | null = null;
let running: Promise<Roads> | null = null;

const yieldToUi = () => new Promise((r) => setTimeout(r, 0));

async function build(bikes: RideBikes): Promise<Roads> {
  await startSegments(false);
  const refs = await cyclingRefs();
  const ids = new Set(refs.map((r) => r.id));
  const packed = current ? null : await get<PackedRoads>(KEY, store).catch(() => undefined);
  let roads = current?.roads ?? (packed?.v === 2 ? unpackRoads(packed) : emptyRoads());
  const bikeOf = (id: string): RideBike => bikes.get(id) ?? "road";
  // Rides gone from the analysis (a shorter history, a cleared index), or now on another bike: start again.
  if ([...roads.rides].some(([id, bike]) => !ids.has(id) || bikeOf(id) !== bike))
    roads = emptyRoads();
  let added = 0;
  for (const r of refs) {
    if (roads.rides.has(r.id)) continue;
    const t = await storedTrack(r.id);
    if (t) addRide(roads, r.id, t.lat, t.lng, bikeOf(r.id));
    else roads.rides.set(r.id, bikeOf(r.id));
    if (++added % 10 === 0) await yieldToUi();
  }
  if (added || !packed) await set(KEY, packRoads(roads), store).catch(() => {});
  current = { roads, rides: refs.length };
  return roads;
}

/** Your roads, brought up to date with the rides analysed so far. */
export function loadRoads(bikes: RideBikes): Promise<Roads> {
  // One build at a time: a later call (the activity list just came) waits for the one under way, then catches up,
  // which costs nothing when no ride is new and none changed bike.
  const next: Promise<Roads> = (running ?? Promise.resolve())
    .catch(() => {})
    .then(() => build(bikes))
    .finally(() => {
      if (running === next) running = null;
    });
  running = next;
  return next;
}

let keptBikes: Promise<RideBikes | null> | null = null;
const loadKeptBikes = () =>
  (keptBikes ??= get<[string, RideBike][]>(BIKES_KEY, store)
    .then((x) => (x ? new Map(x) : null))
    .catch(() => null));

/**
 * Your roads for a page; rebuilt when the segment analysis has taken in new rides. Each ride is laid down under its
 * own bike: from the bikes kept on this device at once (the activity list can take seconds to come), then from the
 * list once it is here, which rebuilds the graph only if a ride's bike changed. The first time ever, it waits for the
 * list; without it (offline, no account), every ride counts as a road one.
 */
export function useRoads(): Roads | null {
  const snap = useSyncExternalStore(segmentEngine.subscribe, segmentEngine.getSnapshot);
  const { data: acts, isError } = useQuery(allActivitiesQuery());
  const [kept, setKept] = useState<RideBikes | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    void loadKeptBikes().then((b) => live && setKept(b));
    return () => {
      live = false;
    };
  }, []);
  const fresh = useMemo(() => (acts ? rideBikes(acts) : null), [acts]);
  useEffect(() => {
    if (!fresh) return;
    keptBikes = Promise.resolve(fresh);
    void set(BIKES_KEY, [...fresh], store).catch(() => {});
  }, [fresh]);
  const bikes: RideBikes | null = fresh ?? kept ?? (isError ? new Map() : null);
  const sig = bikes ? [...bikes].map(([id, b]) => id + b).join() : null;
  const [roads, setRoads] = useState<Roads | null>(current?.roads ?? null);
  const rides = snap.rides;
  useEffect(() => {
    if (!bikes) return;
    let live = true;
    loadRoads(bikes)
      .then((r) => live && setRoads(r))
      .catch((e) => console.warn("Roads unavailable", e));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rides, sig]);
  return roads;
}
