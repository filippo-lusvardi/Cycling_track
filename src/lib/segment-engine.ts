// Segment engine: keeps the segment index up to date one ride at a time.
// Storage and downloads are injected, so the same code runs in the browser (IndexedDB + intervals.icu),
// in tests (in-memory), or later in a scheduled job.
import { packTrack, unpackTrack, type PackedTrack } from "./compact";
import {
  addRideToGroups,
  groupForSaved,
  groupSegment,
  mayPass,
  segSig,
  summarizeRide,
  traceOf,
  type EffortRec,
  type Group,
} from "./segment-index";
import { findAttempts, type Segment, type TrackLike } from "./segments";

/** How far back each sync re-lists rides, to catch late uploads (one request; known rides aren't re-downloaded). */
const RELIST_DAYS = 60;

/** Bump when the analysis changes: the index is rebuilt from stored tracks (no downloads). */
export const ANALYSIS_VERSION = 1;

export type KV = {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  del(key: string): Promise<void>;
  keys(): Promise<string[]>;
};

export type RideRef = { id: string; name: string | null; date: string };

export type EngineDeps = {
  meta: KV;
  tracks: KV;
  /** Outdoor rides with GPS in a date range (inclusive, YYYY-MM-DD). */
  listRides(from: string, to: string): Promise<RideRef[]>;
  /** The ride's 20 m track, or null if it has no GPS. */
  downloadTrack(ref: RideRef): Promise<TrackLike | null>;
  historyFrom(): string;
  today(): string;
};

export type Status = { phase: "idle" | "listing" | "downloading" | "analysing" | "error"; done: number; total: number; message?: string };

type RideMeta = RideRef & { seq: number; cells: number[] | null };
type StoredGroup = Omit<Group, "climb"> & { climb: { lat: Float32Array; lng: Float32Array; dist: Float32Array; alt: Float32Array } };

type State = {
  seq: number;
  rides: Map<string, RideMeta>;
  pending: Map<string, RideRef>;
  listed: { from: string; to: string } | null;
  groups: Group[];
  efforts: Record<string, EffortRec>;
};

export type Snapshot = {
  status: Status;
  rev: number;
  groups: Group[];
  efforts: Record<string, EffortRec>;
  /** Saved segment id → group it follows (climbs starred from auto-detection). */
  links: Record<string, string>;
  rides: number;
  lastSync: number | null;
};

const toStored = (g: Group): StoredGroup => ({
  ...g,
  climb: { lat: Float32Array.from(g.climb.lat), lng: Float32Array.from(g.climb.lng), dist: Float32Array.from(g.climb.dist), alt: Float32Array.from(g.climb.alt) },
});
const fromStored = (g: StoredGroup): Group => ({
  ...g,
  climb: { lat: Array.from(g.climb.lat), lng: Array.from(g.climb.lng), dist: Array.from(g.climb.dist), alt: Array.from(g.climb.alt) },
});

const yieldToUi = () => new Promise((r) => setTimeout(r, 0));

/** Add a track's efforts on a segment to its record; the map trace follows the fastest effort. */
function addAttempts(rec: EffortRec, t: TrackLike, seg: Segment) {
  for (const a of findAttempts(t, seg)) {
    const best = rec.attempts.reduce((m, x) => Math.min(m, x.duration), Infinity);
    rec.attempts.push(a);
    if (a.duration < best) rec.trace = traceOf(t, a);
  }
}

/** Split [from, to] into ≤ 1-year chunks, newest first (the activity list is fetched per chunk). */
export function yearChunks(from: string, to: string): [string, string][] {
  const out: [string, string][] = [];
  let end = to;
  while (end >= from) {
    const y = Number(end.slice(0, 4)) - 1;
    const start = `${y}${end.slice(4)}` < from ? from : `${y}${end.slice(4)}`;
    out.push([start, end]);
    if (start === from) break;
    const d = new Date(`${start}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    end = d.toISOString().slice(0, 10);
  }
  return out;
}

export function createSegmentEngine(deps: EngineDeps) {
  let state: State | null = null;
  let saved: Segment[] = [];
  let status: Status = { phase: "idle", done: 0, total: 0 };
  let lastSync: number | null = null;
  let rev = 0;
  let snapshot: Snapshot | null = null;
  const listeners = new Set<() => void>();
  let running: Promise<void> | null = null;
  let emitTimer: ReturnType<typeof setTimeout> | undefined;

  /** Notify the UI: immediately, or at most every 300 ms during long loops. */
  function emit(now = false) {
    const fire = () => {
      clearTimeout(emitTimer);
      emitTimer = undefined;
      rev++;
      snapshot = null;
      listeners.forEach((l) => l());
    };
    if (now) fire();
    else emitTimer ??= setTimeout(fire, 300);
  }
  const setStatus = (s: Status, now = true) => {
    status = s;
    emit(now);
  };

  async function load(): Promise<State> {
    if (state) return state;
    const { meta } = deps;
    const version = await meta.get<number>("version");
    const rides = (await meta.get<RideMeta[]>("rides")) ?? [];
    const s: State = {
      seq: (await meta.get<number>("seq")) ?? 0,
      rides: new Map(rides.map((r) => [r.id, r])),
      pending: new Map(((await meta.get<RideRef[]>("pending")) ?? []).map((r) => [r.id, r])),
      listed: (await meta.get<State["listed"]>("listed")) ?? null,
      groups: ((await meta.get<StoredGroup[]>("groups")) ?? []).map(fromStored),
      efforts: (await meta.get<Record<string, EffortRec>>("efforts")) ?? {},
    };
    lastSync = (await meta.get<number>("lastSync")) ?? null;
    if (version !== ANALYSIS_VERSION && (rides.length || s.groups.length)) {
      // Analysis changed: forget results, keep downloaded tracks, and re-process them locally.
      for (const r of rides) if (r.cells) s.pending.set(r.id, { id: r.id, name: r.name, date: r.date });
      s.seq = 0;
      s.rides = new Map();
      s.groups = [];
      s.efforts = {};
    }
    await meta.set("version", ANALYSIS_VERSION);
    state = s;
    return s;
  }

  async function persist() {
    const s = state!;
    const { meta } = deps;
    await meta.set("seq", s.seq);
    await meta.set("rides", [...s.rides.values()]);
    await meta.set("pending", [...s.pending.values()]);
    await meta.set("listed", s.listed);
    await meta.set("groups", s.groups.map(toStored));
    await meta.set("efforts", s.efforts);
  }

  /** The segments whose efforts are kept: every group, plus saved segments that don't follow a group. */
  function trackedSegments(s: State): { key: string; seg: Segment }[] {
    const out = s.groups.map((g) => ({ key: g.id, seg: groupSegment(g) }));
    for (const sv of saved) if (!groupForSaved(sv, s.groups)) out.push({ key: sv.id, seg: sv });
    return out;
  }

  /** Add one ride: group its climbs and add its efforts to every up-to-date segment it may pass. */
  function processRide(s: State, ref: RideRef, t: TrackLike | null) {
    s.pending.delete(ref.id);
    if (!t || t.lat.length < 2) {
      s.rides.set(ref.id, { ...ref, seq: s.seq, cells: null });
      return;
    }
    const seq = ++s.seq;
    const summary = summarizeRide(t);
    s.rides.set(ref.id, { ...ref, seq, cells: summary.cells });
    for (const id of addRideToGroups(s.groups, summary)) delete s.efforts[id];
    const cells = new Set(summary.cells);
    for (const { key, seg } of trackedSegments(s)) {
      const rec = s.efforts[key];
      if (!rec || rec.sig !== segSig(seg) || rec.upTo >= seq) continue;
      if (mayPass(cells, seg)) addAttempts(rec, t, seg);
      rec.upTo = seq;
    }
  }

  async function loadTrack(id: string): Promise<Required<TrackLike> | null> {
    const p = await deps.tracks.get<PackedTrack>(id);
    return p ? unpackTrack(p) : null;
  }

  /** Compute efforts for segments that have none (new) or stale ones (pins moved). Each ride is read once. */
  async function refreshEfforts(s: State) {
    const need = trackedSegments(s).filter(({ key, seg }) => s.efforts[key]?.sig !== segSig(seg));
    if (!need.length) return;
    const byRide = new Map<string, { key: string; seg: Segment }[]>();
    const cellSets = [...s.rides.values()].filter((r) => r.cells).map((r) => ({ id: r.id, cells: new Set(r.cells) }));
    for (const n of need) {
      for (const r of cellSets) {
        if (!mayPass(r.cells, n.seg)) continue;
        (byRide.get(r.id) ?? byRide.set(r.id, []).get(r.id)!).push(n);
      }
    }
    const fresh: Record<string, EffortRec> = {};
    for (const n of need) fresh[n.key] = { sig: segSig(n.seg), upTo: s.seq, attempts: [], trace: null };
    let done = 0;
    setStatus({ phase: "analysing", done, total: byRide.size });
    for (const [rideId, list] of byRide) {
      const t = await loadTrack(rideId);
      if (t) for (const { key, seg } of list) addAttempts(fresh[key]!, t, seg);
      setStatus({ phase: "analysing", done: ++done, total: byRide.size }, false);
      await yieldToUi();
    }
    Object.assign(s.efforts, fresh);
  }

  async function listNew(s: State) {
    const from = deps.historyFrom();
    const to = deps.today();
    const ranges: [string, string][] = [];
    if (!s.listed) ranges.push(...yearChunks(from, to));
    else {
      if (from < s.listed.from) ranges.push(...yearChunks(from, s.listed.from));
      // Re-check a wide recent window: rides often reach intervals.icu days after they were ridden (a second
      // device, a delayed upload), and one listed only by date would otherwise be skipped for good.
      ranges.push([backDays(s.listed.to < to ? s.listed.to : to, RELIST_DAYS), to]);
    }
    setStatus({ phase: "listing", done: 0, total: ranges.length });
    for (const [a, b] of ranges) {
      for (const r of await deps.listRides(a, b)) if (!s.rides.has(r.id)) s.pending.set(r.id, r);
      setStatus({ phase: "listing", done: status.done + 1, total: ranges.length });
    }
    s.listed = { from: s.listed && s.listed.from < from ? s.listed.from : from, to };
  }

  async function run() {
    const s = await load();
    try {
      try {
        await listNew(s);
      } catch (e) {
        // Offline or intervals.icu unreachable: still work through rides already listed.
        console.warn("Ride list unavailable", e);
      }
      const queue = [...s.pending.values()].sort((a, b) => b.date.localeCompare(a.date));
      let done = 0;
      let failures = 0;
      setStatus({ phase: "downloading", done, total: queue.length });
      for (let i = 0; i < queue.length && failures < 3; i += 2) {
        const batch = queue.slice(i, i + 2);
        const got = await Promise.all(
          batch.map(async (ref) => {
            const local = await deps.tracks.get<PackedTrack>(ref.id);
            if (local) return { ref, t: unpackTrack(local) as TrackLike | null };
            try {
              const t = await deps.downloadTrack(ref);
              if (t) await deps.tracks.set(ref.id, packTrack(t));
              return { ref, t };
            } catch {
              return null;
            }
          }),
        );
        for (const g of got) {
          if (!g) {
            failures++;
            continue;
          }
          failures = 0;
          processRide(s, g.ref, g.t);
          done++;
        }
        setStatus({ phase: "downloading", done, total: queue.length }, false);
        if (done % 20 < 2) await persist();
        await yieldToUi();
      }
      await refreshEfforts(s);
      lastSync = Date.now();
      await deps.meta.set("lastSync", lastSync);
      await persist();
      setStatus(failures >= 3 ? { phase: "error", done, total: queue.length, message: "Couldn't download some rides; will retry." } : { phase: "idle", done: 0, total: 0 });
    } catch (e) {
      await persist().catch(() => {});
      setStatus({ phase: "error", done: 0, total: 0, message: e instanceof Error ? e.message : String(e) });
    }
  }

  function sync(): Promise<void> {
    running ??= run().finally(() => (running = null));
    return running;
  }

  return {
    /** List new rides, download and analyse them, refresh efforts. Calls while running share the same run. */
    sync,
    /**
     * Make sure one ride is in the index (it's open on screen): if it was never analysed, analyse it now, so the
     * ride page and the segment standings always agree. Does nothing until the index exists (first sync done).
     */
    async ensureRide(ref: RideRef) {
      const s = await load();
      if (!s.listed || s.rides.has(ref.id)) return;
      s.pending.set(ref.id, ref);
      await running; // a run already past its queue won't see it: run again
      if (!s.rides.has(ref.id)) await sync();
    },
    /** Saved segments (stars, manual ones). Their efforts are computed in the background. */
    setSaved(list: Segment[]) {
      saved = list;
      emit(true);
      if (state && !running) running = refreshEfforts(state).then(persist).then(() => setStatus({ phase: "idle", done: 0, total: 0 })).finally(() => (running = null));
    },
    subscribe(l: () => void) {
      listeners.add(l);
      return () => void listeners.delete(l);
    },
    getSnapshot(): Snapshot {
      if (!snapshot) {
        const s = state;
        const links: Record<string, string> = {};
        if (s) for (const sv of saved) {
          const g = groupForSaved(sv, s.groups);
          if (g) links[sv.id] = g.id;
        }
        snapshot = {
          status,
          rev,
          groups: s?.groups ?? [],
          efforts: s?.efforts ?? {},
          links,
          rides: s ? [...s.rides.values()].filter((r) => r.cells).length : 0,
          lastSync,
        };
      }
      return snapshot;
    },
    loadTrack,
    /** Forget the analysis and redo it from stored tracks (no downloads). */
    async rebuild() {
      await running;
      await deps.meta.set("version", -1);
      state = null;
      await load();
      emit(true);
      return sync();
    },
    /** Delete everything: stored tracks and analysis. */
    async clear() {
      await running;
      for (const k of await deps.tracks.keys()) await deps.tracks.del(k);
      for (const k of await deps.meta.keys()) await deps.meta.del(k);
      state = null;
      lastSync = null;
      await load();
      emit(true);
    },
    /** Read the stored index (no network) and show it. */
    async load() {
      await load();
      emit(true);
    },
  };
}

function backDays(date: string, n: number) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}
