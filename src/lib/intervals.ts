// intervals.icu API, called straight from the browser (the API allows CORS).
import { del as idbDel, get as idbGet, set as idbSet } from "idb-keyval";
import { z } from "zod";
import { API_KEY, readSetting } from "./settings";
import type { RideRef } from "./segment-engine";
import { trackFromStreams, type TrackLike } from "./segments";

/** Missing or rejected API key: the UI sends the user to Settings. */
export class AuthError extends Error {
  constructor(message = "intervals.icu API key missing or rejected") {
    super(message);
    this.name = "AuthError";
  }
}

async function icu<T>(path: string, init?: RequestInit): Promise<T> {
  const key = readSetting<string>(API_KEY);
  if (!key) throw new AuthError();
  const res = await fetch(`https://intervals.icu/api/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Basic ${btoa(`API_KEY:${key}`)}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (res.status === 401 || res.status === 403) throw new AuthError();
  if (!res.ok) {
    console.error("intervals.icu error", res.status, await res.text());
    throw new Error(`Could not reach intervals.icu (${res.status})`);
  }
  return (await res.json()) as T;
}

export type Wellness = {
  id: string;
  ctl: number | null;
  atl: number | null;
  rampRate: number | null;
  weight: number | null;
  bodyFat: number | null;
  hrv: number | null;
  sleepSecs: number | null;
  sleepQuality: number | null;
  soreness: number | null;
  fatigue: number | null;
  stress: number | null;
  mood: number | null;
  motivation: number | null;
  eftp: number | null;
  wPrime: number | null;
  pMax: number | null;
  comments: string | null;
};

export type Activity = {
  id: string;
  name: string | null;
  type: string | null;
  start_date_local: string;
  distance: number | null;
  moving_time: number | null;
  total_elevation_gain: number | null;
  icu_training_load: number | null;
  icu_average_watts: number | null;
  icu_weighted_avg_watts: number | null;
  average_heartrate: number | null;
  max_heartrate: number | null;
  icu_intensity: number | null;
  calories: number | null;
  average_speed: number | null;
  zoneTimes: number[];
  decoupling: number | null;
  efficiency: number | null;
  /** Recorded on a home trainer (indoor), even when the type says Ride. */
  trainer: boolean;
};

export type ActivityDetail = Activity & {
  description: string | null;
  icu_ftp: number | null;
  max_speed: number | null;
  average_cadence: number | null;
  icu_intervals?: {
    id: number;
    label: string | null;
    type: string | null;
    moving_time: number | null;
    average_watts: number | null;
    average_heartrate: number | null;
    start_time: number | null;
    end_time: number | null;
  }[];
  zoneTimes: number[];
};

function sport(w: Record<string, unknown>) {
  const info = Array.isArray(w["sportInfo"]) ? (w["sportInfo"] as Record<string, unknown>[]) : [];
  const ride = info.find((i) => i["type"] === "Ride") ?? info[0];
  return {
    eftp: (ride?.["eftp"] as number) ?? null,
    wPrime: (ride?.["wPrime"] as number) ?? null,
    pMax: (ride?.["pMax"] as number) ?? null,
  };
}

const pickWellness = (w: Record<string, unknown>): Wellness => ({
  id: String(w["id"]),
  ctl: (w["ctl"] as number) ?? null,
  atl: (w["atl"] as number) ?? null,
  rampRate: (w["rampRate"] as number) ?? null,
  weight: (w["weight"] as number) ?? null,
  bodyFat: (w["bodyFat"] as number) ?? null,
  hrv: (w["hrv"] as number) ?? null,
  sleepSecs: (w["sleepSecs"] as number) ?? null,
  sleepQuality: (w["sleepQuality"] as number) ?? null,
  soreness: (w["soreness"] as number) ?? null,
  fatigue: (w["fatigue"] as number) ?? null,
  stress: (w["stress"] as number) ?? null,
  mood: (w["mood"] as number) ?? null,
  motivation: (w["motivation"] as number) ?? null,
  ...sport(w),
  comments: (w["comments"] as string) ?? null,
});

const pickActivity = (a: Record<string, unknown>): Activity => ({
  id: String(a["id"]),
  name: (a["name"] as string) ?? null,
  type: (a["type"] as string) ?? null,
  start_date_local: String(a["start_date_local"] ?? ""),
  distance: (a["distance"] as number) ?? null,
  moving_time: (a["moving_time"] as number) ?? null,
  total_elevation_gain: (a["total_elevation_gain"] as number) ?? null,
  icu_training_load: (a["icu_training_load"] as number) ?? null,
  icu_average_watts: (a["icu_average_watts"] as number) ?? null,
  icu_weighted_avg_watts: (a["icu_weighted_avg_watts"] as number) ?? null,
  average_heartrate: (a["average_heartrate"] as number) ?? null,
  max_heartrate: (a["max_heartrate"] as number) ?? null,
  icu_intensity: (a["icu_intensity"] as number) ?? null,
  calories: (a["calories"] as number) ?? null,
  average_speed: (a["average_speed"] as number) ?? null,
  zoneTimes: zoneSecs(a),
  decoupling: (a["decoupling"] as number) ?? null,
  efficiency: (a["icu_efficiency_factor"] as number) ?? null,
  trainer: !!a["trainer"],
});

function zoneSecs(a: Record<string, unknown>): number[] {
  const z = Array.isArray(a["icu_zone_times"]) ? (a["icu_zone_times"] as { id: string; secs: number }[]) : [];
  return ["Z1", "Z2", "Z3", "Z4", "Z5", "Z6", "Z7"].map((id) => z.find((x) => x.id === id)?.secs ?? 0);
}

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const rangeSchema = z.object({ oldest: day, newest: day });
const idSchema = z.string().regex(/^[\w-]+$/);

export type Range = z.infer<typeof rangeSchema>;

export async function getAthlete() {
  const a = await icu<Record<string, unknown>>(`/athlete/0`);
  return { id: String(a["id"]), name: (a["name"] as string) ?? null };
}

export async function getWellness(range: Range) {
  const { oldest, newest } = rangeSchema.parse(range);
  const rows = await icu<Record<string, unknown>[]>(`/athlete/0/wellness?oldest=${oldest}&newest=${newest}`);
  return rows.map(pickWellness);
}

export async function getActivities(range: Range) {
  const { oldest, newest } = rangeSchema.parse(range);
  const rows = await icu<Record<string, unknown>[]>(`/athlete/0/activities?oldest=${oldest}&newest=${newest}`);
  return rows
    .map(pickActivity)
    .sort((a, b) => b.start_date_local.localeCompare(a["start_date_local"]));
}

export async function getActivity(id: string) {
  const a = await icu<Record<string, unknown>>(`/activity/${idSchema.parse(id)}?intervals=true`);
  const intervals = Array.isArray(a["icu_intervals"])
    ? (a["icu_intervals"] as Record<string, unknown>[]).map((i) => ({
        id: Number(i["id"]),
        label: (i["label"] as string) ?? null,
        type: (i["type"] as string) ?? null,
        moving_time: (i["moving_time"] as number) ?? null,
        average_watts: (i["average_watts"] as number) ?? null,
        average_heartrate: (i["average_heartrate"] as number) ?? null,
        start_time: (i["start_time"] as number) ?? null,
        end_time: (i["end_time"] as number) ?? null,
      }))
    : [];
  const detail: ActivityDetail = {
    ...pickActivity(a),
    description: (a["description"] as string) ?? null,
    icu_ftp: (a["icu_ftp"] as number) ?? null,
    max_speed: (a["max_speed"] as number) ?? null,
    average_cadence: (a["average_cadence"] as number) ?? null,
    icu_intervals: intervals,
    zoneTimes: zoneSecs(a),
  };
  return detail;
}

const entrySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  weight: z.number().min(20).max(300).optional(),
  bodyFat: z.number().min(1).max(70).optional(),
  sleepSecs: z.number().int().min(0).max(86400).optional(),
  sleepQuality: z.number().int().min(1).max(4).optional(),
  soreness: z.number().int().min(1).max(4).optional(),
  fatigue: z.number().int().min(1).max(4).optional(),
  stress: z.number().int().min(1).max(4).optional(),
  mood: z.number().int().min(1).max(4).optional(),
  motivation: z.number().int().min(1).max(4).optional(),
  comments: z.string().max(1000).optional(),
});

export type WellnessEntry = z.infer<typeof entrySchema>;

export async function saveWellnessEntry(entry: WellnessEntry) {
  const { date, ...fields } = entrySchema.parse(entry);
  const body: Record<string, unknown> = { id: date };
  for (const [k, v] of Object.entries(fields)) if (v !== undefined && v !== "") body[k] = v;
  await icu(`/athlete/0/wellness/${date}`, { method: "PUT", body: JSON.stringify(body) });
  return { ok: true as const };
}

export type Track = Required<TrackLike>;

type StreamRow = { type: string; data?: (number | null)[]; data2?: (number | null)[] };

export type RideStreams = Awaited<ReturnType<typeof downloadStreams>>;

// Full-resolution streams are big (~400 KB a ride), so only the most recently opened rides keep them.
const STREAMS_KEPT = 50;
const LRU = "streams-lru";

async function fetchStreams(id: string): Promise<RideStreams> {
  const key = `streams:v2:${id}`;
  try {
    const hit = await idbGet<RideStreams>(key);
    if (hit) {
      void touchStreams(id);
      return hit;
    }
  } catch {
    /* IndexedDB unavailable: fall through to the network */
  }
  const s = await downloadStreams(id);
  idbSet(key, s)
    .then(() => touchStreams(id))
    .catch(() => {});
  return s;
}

/** Mark a ride's streams as just used, dropping the least recently used beyond the limit. */
async function touchStreams(id: string) {
  const order = [id, ...((await idbGet<string[]>(LRU)) ?? []).filter((x) => x !== id)];
  for (const old of order.slice(STREAMS_KEPT)) await idbDel(`streams:v2:${old}`);
  await idbSet(LRU, order.slice(0, STREAMS_KEPT));
}

async function downloadStreams(id: string) {
  const rows = await icu<StreamRow[]>(
    `/activity/${id}/streams.json?types=time,distance,altitude,watts,heartrate,cadence,latlng`,
  );
  const get = (t: string) => rows.find((r) => r.type === t);
  return {
    time: (get("time")?.data ?? []) as number[],
    distance: (get("distance")?.data ?? []) as number[],
    altitude: (get("altitude")?.data ?? []) as number[],
    watts: get("watts")?.data ?? [],
    heartrate: get("heartrate")?.data ?? [],
    cadence: get("cadence")?.data ?? [],
    lat: (get("latlng")?.data ?? []) as number[],
    lng: (get("latlng")?.data2 ?? []) as number[],
  };
}

/** Full-resolution streams for one ride (for climbs and the custom-segment tool). */
export async function getStreams(id: string) {
  return fetchStreams(idSchema.parse(id));
}

/** Outdoor rides (GPS, not trainer or virtual) in a date range, for the segment engine. */
export async function listOutdoorRides(from: string, to: string): Promise<RideRef[]> {
  const { oldest, newest } = rangeSchema.parse({ oldest: from, newest: to });
  const acts = await icu<Record<string, unknown>[]>(`/athlete/0/activities?oldest=${oldest}&newest=${newest}`);
  return acts
    .filter((a) => {
      const type = String(a["type"] ?? "");
      return type.includes("Ride") && !type.startsWith("Virtual") && !a["trainer"] && Number(a["distance"]) > 3000;
    })
    .map((a) => ({ id: String(a["id"]), name: (a["name"] as string) ?? null, date: String(a["start_date_local"] ?? "") }));
}

/** A ride's 20 m track straight from its streams (not kept in the streams cache), or null without GPS. */
export async function downloadRideTrack(ref: RideRef): Promise<Track | null> {
  const s = await downloadStreams(idSchema.parse(ref.id));
  return s.lat.length ? trackFromStreams(ref, s) : null;
}

export type PowerCurve = { id: string; label: string; secs: number[]; watts: number[] };

export async function getPowerCurves() {
  const r = await icu<{ list: Record<string, unknown>[] }>(`/athlete/0/power-curves.json?curves=42d,1y&type=Ride`);
  return r.list.map((c) => ({
    id: String(c["id"]),
    label: String(c["label"] ?? c["id"]),
    secs: (c["secs"] as number[]) ?? [],
    watts: (c["watts"] as number[]) ?? (c["values"] as number[]) ?? [],
  })) as PowerCurve[];
}

const manualSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  type: z.enum(["Ride", "VirtualRide", "Run", "Walk", "WeightTraining", "Swim", "Other"]),
  name: z.string().min(1).max(120),
  minutes: z.number().int().min(1).max(1440),
  distanceKm: z.number().min(0).max(1000).optional(),
  load: z.number().int().min(0).max(1000).optional(),
  rpe: z.number().int().min(1).max(10).optional(),
});

export type ManualActivity = z.infer<typeof manualSchema>;

export async function createManualActivity(input: ManualActivity) {
  const data = manualSchema.parse(input);
  await icu(`/athlete/0/activities/manual`, {
    method: "POST",
    body: JSON.stringify({
      start_date_local: `${data.date}T09:00:00`,
      type: data.type,
      name: data.name,
      moving_time: data.minutes * 60,
      elapsed_time: data.minutes * 60,
      distance: data.distanceKm ? data.distanceKm * 1000 : undefined,
      icu_training_load: data.load,
      icu_rpe: data.rpe,
    }),
  });
  return { ok: true as const };
}

export type PlannedEvent = {
  id: string;
  date: string;
  category: string;
  type: string | null;
  name: string | null;
  description: string | null;
  moving_time: number | null;
  icu_training_load: number | null;
};

/** Calendar events (planned workouts, notes, races) in a date range. */
export async function getEvents(range: Range): Promise<PlannedEvent[]> {
  const { oldest, newest } = rangeSchema.parse(range);
  const rows = await icu<Record<string, unknown>[]>(`/athlete/0/events.json?oldest=${oldest}&newest=${newest}`);
  return rows.map((e) => ({
    id: String(e["id"]),
    date: String(e["start_date_local"] ?? "").slice(0, 10),
    category: String(e["category"] ?? ""),
    type: (e["type"] as string) ?? null,
    name: (e["name"] as string) ?? null,
    description: (e["description"] as string) ?? null,
    moving_time: (e["moving_time"] as number) ?? null,
    icu_training_load: (e["icu_training_load"] as number) ?? null,
  }));
}
