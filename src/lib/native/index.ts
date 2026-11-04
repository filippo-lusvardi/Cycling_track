// Cirmolo's own store, for accounts without intervals.icu: the same functions as ../intervals.ts, backed by
// Firestore, with the numbers intervals.icu would compute worked out by ../metrics.ts.
//   users/{uid}/activities/{id}   Stored (ActivityDetail + power curve)
//   users/{uid}/wellness/{date}   what the athlete logged that day
//   users/{uid}/events/{id}       races, sick/injured days
//   users/{uid}/streams/{id}      the ride's 1 Hz streams, gzipped JSON in ≤ 900 KB parts ({id}, {id}~1, …)
import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  getDocsFromServer,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  Bytes,
} from "firebase/firestore";
import { get as idbGet, set as idbSet } from "idb-keyval";
import { DUR } from "../analysis";
import { briochesIn } from "../brioches";
import { readProfile } from "../cloud";
import { auth, uid } from "../firebase";
import { db } from "../db";
import { t } from "../i18n";
import {
  OFF_KINDS,
  day,
  entrySchema,
  manualSchema,
  raceSchema,
  type Activity,
  type ActivityDetail,
  type ManualActivity,
  type OffKind,
  type PlannedEvent,
  type PowerCurve,
  type RaceEntry,
  type Range,
  type RideStreams,
  type RideZones,
  type Track,
  type Wellness,
  type WellnessEntry,
} from "../intervals";
import {
  bestCurve,
  estimateFtp,
  fitnessSeries,
  hrZoneTops,
  powerZoneTops,
  rideMetrics,
  type Thresholds,
} from "../metrics";
import type { RideRef } from "../segment-engine";
import { trackFromStreams } from "../segments";
import { GARMIN, readSetting, writeSetting } from "../settings";
import { emptyRide, type Stored } from "./ride";

export { emptyRide, type Origin, type Stored } from "./ride";
import { applyChanges, type RideDoc } from "./ride";
import { addDays, isoDate } from "../training";

const col = (name: "activities" | "wellness" | "events" | "streams") =>
  collection(db, "users", uid(), name);

// Every ride's summary, shared by all queries (fitness needs the whole history anyway). The list lives on the
// device; each refresh asks Firestore only for rides changed since the last one (each write stamps `updatedAt`
// with the server's clock, and a deleted ride leaves a marker), so a visit costs a handful of reads, not the
// whole history. Refreshed after a write here and every few minutes, so rides added on another device show up.
type Local = { rows: Stored[]; since: number };
const localKey = () => `native-rides:v1:${uid()}`;
let all: { at: number; rows: Promise<Stored[]> } | null = null;
export const forget = () => void (all = null);

function allRides(): Promise<Stored[]> {
  if (!all || Date.now() - all.at > 5 * 60_000) {
    const rows = refresh();
    rows.catch(() => (all = null));
    all = { at: Date.now(), rows };
  }
  return all.rows;
}

/** Ride documents as plain rides, and the newest server time among them. */
function read(docs: { data: () => Record<string, unknown> }[]) {
  let since = 0;
  const rows = docs.map((d) => {
    const { updatedAt, ...r } = d.data();
    if (updatedAt instanceof Timestamp) since = Math.max(since, updatedAt.toMillis());
    return r as RideDoc;
  });
  return { rows, since };
}

/** Give up on the network after a few seconds and show what the device has (a slow or flaky connection). */
const withTimeout = <T>(p: Promise<T>, ms: number) =>
  Promise.race([p, new Promise<never>((_, no) => setTimeout(() => no(new Error("timeout")), ms))]);

async function refresh(): Promise<Stored[]> {
  const key = localKey();
  const local = await idbGet<Local>(key).catch(() => undefined);
  if (!local) {
    // First time on this device: the whole list once.
    const got = read((await getDocs(col("activities"))).docs);
    const rows = applyChanges([], got.rows);
    await idbSet(key, { rows, since: got.since } satisfies Local).catch(() => {});
    return rows;
  }
  if (!navigator.onLine) return local.rows;
  try {
    // ≥, not >: two writes in the same millisecond mustn't be skipped (the newest is just read again).
    const q = query(col("activities"), where("updatedAt", ">=", Timestamp.fromMillis(local.since)));
    const got = read((await withTimeout(getDocsFromServer(q), 5000)).docs);
    const rows = applyChanges(local.rows, got.rows);
    await idbSet(key, { rows, since: Math.max(local.since, got.since) } satisfies Local).catch(
      () => {},
    );
    return rows;
  } catch {
    return local.rows;
  }
}

/** Write a whole ride, stamped so other devices' next refresh picks it up. */
const putRide = (r: Stored) =>
  setDoc(doc(col("activities"), r.id), {
    ...JSON.parse(JSON.stringify(r)),
    updatedAt: serverTimestamp(),
  });

const dayOf = (a: { start_date_local: string }) => a.start_date_local.slice(0, 10);
const inRange = (d: string, r: Range) => d >= r.oldest && d <= r.newest;

function toDetail(s: Stored): ActivityDetail {
  const { curve: _c, origin: _o, outdoor: _d, hasStreams: _h, totals: _t, parser: _p, ...a } = s;
  return { ...a, brioches: briochesIn(a.description) };
}

function toActivity(s: Stored): Activity {
  const {
    description: _d,
    icu_ftp: _f,
    max_speed: _m,
    average_cadence: _a,
    icu_intervals: _i,
    ...a
  } = toDetail(s);
  return a;
}

// --- Athlete and zones ---

export async function getAthlete() {
  const p = await readProfile();
  return { id: uid(), name: p.name ?? auth.currentUser?.email ?? "", weight: p.weight ?? null };
}

/** FTP and threshold heart rate from Settings; without an FTP, the estimate from the last 42 days' best efforts. */
export async function thresholds(): Promise<Thresholds> {
  const p = await readProfile();
  let ftp = p.ftp ?? null;
  if (!ftp) {
    const since = addDays(isoDate(new Date()), -42);
    ftp = estimateFtp(
      bestCurve((await allRides()).filter((a) => dayOf(a) >= since).map((a) => a.curve)),
    );
  }
  return { ftp, lthr: p.lthr ?? (p.maxHr ? Math.round(p.maxHr * 0.9) : null) };
}

export async function getRideZones(): Promise<RideZones> {
  const th = await thresholds();
  return { ftp: th.ftp, power: powerZoneTops(th.ftp), hr: hrZoneTops(th.lthr) };
}

// --- Activities ---

export async function getActivities(range: Range): Promise<Activity[]> {
  const rides = await allRides();
  if (rides.some((a) => a.garmin) && !readSetting<boolean>(GARMIN)) writeSetting(GARMIN, true);
  return rides
    .filter((a) => inRange(dayOf(a), range))
    .map(toActivity)
    .sort((a, b) => b.start_date_local.localeCompare(a.start_date_local));
}

export async function getActivity(id: string): Promise<ActivityDetail> {
  const ride = (await allRides()).find((a) => a.id === id);
  if (!ride) throw new Error(t("Activity not found", "Attività non trovata"));
  return toDetail(ride);
}

export async function setActivityDescription(id: string, description: string) {
  await updateDoc(doc(col("activities"), id), { description, updatedAt: serverTimestamp() });
  forget();
}

export async function createManualActivity(input: ManualActivity) {
  const d = manualSchema.parse(input);
  const id = `manual-${Date.now()}`;
  await putRide({
    ...emptyRide(id, d.name, d.type, `${d.date}T09:00:00`),
    moving_time: d.minutes * 60,
    distance: d.distanceKm ? d.distanceKm * 1000 : null,
    icu_training_load: d.load ?? null,
    origin: "manual",
  });
  forget();
  return { ok: true as const };
}

/**
 * Store a ride from its 1 Hz streams: numbers from ../metrics, summary and streams to Firestore.
 * `base` carries what the file knows (name, type, start, device, laps).
 */
export async function saveRide(base: Stored, streams: RideStreams) {
  const m = rideMetrics(streams, await thresholds(), base.totals);
  const type = base.type ?? "";
  const ride: Stored = {
    ...base,
    ...m,
    hasStreams: true,
    outdoor:
      type.includes("Ride") &&
      !type.startsWith("Virtual") &&
      !base.trainer &&
      streams.lat.length > 0 &&
      m.distance > 3000,
  };
  await saveStreams(base.id, streams);
  await putRide(ride);
  forget();
  return ride;
}

export const storedRide = async (id: string) => (await allRides()).find((a) => a.id === id);

/** Removed, leaving a marker so other devices drop it too (a new upload of the same file replaces the marker). */
export async function deleteRide(id: string) {
  await setDoc(doc(col("activities"), id), { id, deleted: true, updatedAt: serverTimestamp() });
  await deleteStreams(id);
  forget();
}

// --- Streams ---

// Firestore documents hold at most 1 MiB, so a long ride's compressed streams are split over a few.
const PART = 900_000;
const partId = (id: string, i: number) => (i ? `${id}~${i}` : id);

async function gzip(text: string) {
  const s = new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(s).arrayBuffer());
}

async function gunzip(bytes: ArrayBuffer) {
  const s = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(s).text();
}

async function saveStreams(id: string, s: RideStreams) {
  const gz = await gzip(JSON.stringify(s));
  const parts = Math.max(1, Math.ceil(gz.length / PART));
  for (let i = 0; i < parts; i++)
    await setDoc(doc(col("streams"), partId(id, i)), {
      ...(i ? {} : { parts }),
      gz: Bytes.fromUint8Array(gz.subarray(i * PART, (i + 1) * PART)),
    });
}

async function downloadStreams(id: string): Promise<RideStreams> {
  const first = await getDoc(doc(col("streams"), id));
  if (!first.exists()) throw new Error(`No streams for ${id}`);
  const parts = (first.get("parts") as number) ?? 1;
  const chunks = [(first.get("gz") as Bytes).toUint8Array()];
  for (let i = 1; i < parts; i++)
    chunks.push(
      ((await getDoc(doc(col("streams"), partId(id, i)))).get("gz") as Bytes).toUint8Array(),
    );
  const all = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const c of chunks) {
    all.set(c, at);
    at += c.length;
  }
  return JSON.parse(await gunzip(all.buffer)) as RideStreams;
}

async function deleteStreams(id: string) {
  const first = await getDoc(doc(col("streams"), id)).catch(() => null);
  const parts = (first?.get("parts") as number | undefined) ?? 1;
  for (let i = 0; i < parts; i++) await deleteDoc(doc(col("streams"), partId(id, i)));
}

const NO_STREAMS: RideStreams = {
  time: [],
  distance: [],
  altitude: [],
  watts: [],
  heartrate: [],
  cadence: [],
  lat: [],
  lng: [],
};

export async function getStreams(id: string): Promise<RideStreams> {
  const ride = (await allRides()).find((a) => a.id === id);
  // By parser version, so a ride re-parsed on another device isn't served from this one's old copy.
  const key = `streams:native:${id}${ride?.parser ? `:${ride.parser}` : ""}`;
  const hit = await idbGet<RideStreams>(key).catch(() => undefined);
  if (hit) return hit;
  if (!ride?.hasStreams) return NO_STREAMS;
  const s = await downloadStreams(id);
  idbSet(key, s).catch(() => {});
  return s;
}

export const getRideWatts = async (id: string) => (await getStreams(id)).watts;

export async function listOutdoorRides(from: string, to: string): Promise<RideRef[]> {
  return (await allRides())
    .filter((a) => a.outdoor && a.hasStreams && inRange(dayOf(a), { oldest: from, newest: to }))
    .map((a) => ({ id: a.id, name: a.name, date: a.start_date_local }));
}

export async function downloadRideTrack(r: RideRef): Promise<Track | null> {
  const s = await downloadStreams(r.id);
  return s.lat.length ? trackFromStreams(r, s) : null;
}

// --- Power curves and fitness ---

export async function getPowerCurves(): Promise<PowerCurve[]> {
  const rides = await allRides();
  const today = isoDate(new Date());
  const curve = (days: number) => {
    const since = addDays(today, -days);
    return bestCurve(rides.filter((a) => dayOf(a) >= since).map((a) => a.curve)).map((w) => w ?? 0);
  };
  return [
    { id: "42d", label: t("Last 42 days", "Ultimi 42 giorni"), secs: DUR, watts: curve(42) },
    { id: "1y", label: t("Last year", "Ultimo anno"), secs: DUR, watts: curve(365) },
  ];
}

type Entry = Partial<Omit<Wellness, "id">> & { date: string };

export async function getWellness(range: Range): Promise<Wellness[]> {
  const [rides, snap] = await Promise.all([
    allRides(),
    getDocs(
      query(col("wellness"), where("date", ">=", range.oldest), where("date", "<=", range.newest)),
    ),
  ]);
  const entries = new Map(snap.docs.map((d) => [d.id, d.data() as Entry]));
  const loads = new Map<string, number>();
  for (const a of rides)
    loads.set(dayOf(a), (loads.get(dayOf(a)) ?? 0) + (a.icu_training_load ?? 0));
  const fit = fitnessSeries(loads, range.oldest, range.newest);
  // eFTP day by day from the best efforts of the 42 days up to it.
  const withCurve = rides
    .filter((a) => a.curve.length)
    .sort((a, b) => dayOf(a).localeCompare(dayOf(b)));
  const out: Wellness[] = [];
  for (let d = range.oldest; d <= range.newest; d = addDays(d, 1)) {
    const e = entries.get(d);
    const f = fit.get(d);
    const since = addDays(d, -41);
    const window = withCurve.filter((a) => dayOf(a) >= since && dayOf(a) <= d);
    out.push({
      id: d,
      ctl: f?.ctl ?? null,
      atl: f?.atl ?? null,
      rampRate: f?.rampRate ?? null,
      weight: e?.weight ?? null,
      bodyFat: e?.bodyFat ?? null,
      hrv: e?.hrv ?? null,
      sleepSecs: e?.sleepSecs ?? null,
      sleepQuality: e?.sleepQuality ?? null,
      soreness: e?.soreness ?? null,
      fatigue: e?.fatigue ?? null,
      stress: e?.stress ?? null,
      mood: e?.mood ?? null,
      motivation: e?.motivation ?? null,
      eftp: window.length ? estimateFtp(bestCurve(window.map((a) => a.curve))) : null,
      wPrime: null,
      pMax: null,
      comments: e?.comments ?? null,
    });
  }
  return out;
}

export async function saveWellnessEntry(entry: WellnessEntry) {
  const { date, ...fields } = entrySchema.parse(entry);
  const patch: Record<string, unknown> = { date };
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined || v === "") continue;
    patch[k] = v === null ? deleteField() : v;
  }
  await setDoc(doc(col("wellness"), date), patch, { merge: true });
  return { ok: true as const };
}

// --- Calendar ---

export async function getEvents(range: Range): Promise<PlannedEvent[]> {
  const snap = await getDocs(query(col("events"), where("date", "<=", range.newest)));
  return snap.docs
    .map((d) => ({ ...(d.data() as Omit<PlannedEvent, "id">), id: d.id }))
    .filter((e) => (e.end ?? e.date) >= range.oldest);
}

export const getOffEvents = async (range: Range) =>
  (await getEvents(range)).filter((e) => (OFF_KINDS as string[]).includes(e.category));

const event = (
  p: Partial<PlannedEvent> & { date: string; category: string },
): Omit<PlannedEvent, "id"> => ({
  end: null,
  type: null,
  name: null,
  description: null,
  moving_time: null,
  icu_training_load: null,
  ...p,
});

export async function createOffEvent(kind: OffKind, start: string, last: string) {
  day.parse(start);
  day.parse(last);
  await addDoc(
    col("events"),
    event({
      date: start,
      end: last > start ? last : null,
      category: kind,
      name: kind === "SICK" ? "Sick" : "Injured",
    }),
  );
}

export async function updateOffEvent(id: string, start: string, last: string) {
  day.parse(start);
  day.parse(last);
  await updateDoc(doc(col("events"), id), { date: start, end: last > start ? last : null });
}

export const deleteEvent = (id: string) => deleteDoc(doc(col("events"), id));

const race = (r: RaceEntry) => {
  const v = raceSchema.parse(r);
  return event({
    date: v.date,
    category: `RACE_${v.priority}`,
    name: v.name,
    type: v.type,
    description: v.description,
  });
};

export async function createRace(r: RaceEntry) {
  await addDoc(col("events"), race(r));
}

export async function updateRace(id: string, r: RaceEntry) {
  await setDoc(doc(col("events"), id), race(r));
}

/** Recompute every stored ride's numbers (after FTP or threshold heart rate changed in Settings). */
export async function recomputeRides(onProgress?: (done: number, total: number) => void) {
  const th = await thresholds();
  const rides = (await allRides()).filter((a) => a.hasStreams);
  for (const [i, a] of rides.entries()) {
    const m = rideMetrics(await downloadStreams(a.id), th, a.totals);
    await putRide({ ...a, ...m });
    onProgress?.(i + 1, rides.length);
  }
  forget();
}
