// A ride file (.fit from a Garmin, Wahoo, Zwift…) read in the browser with Garmin's FIT SDK.
import { Decoder, Stream } from "@garmin/fitsdk";
import { garminAttribution } from "../garmin";
import { t } from "../i18n";
import type { ActivityDetail, RideStreams } from "../intervals";
import { toOneHz, type FileTotals } from "../metrics";

type Rec = Record<string, unknown>;

/** Bump when parsing changes what a file yields: re-uploading a file stored by an older version then refreshes it. */
export const FIT_PARSER = 2;

export type ParsedRide = {
  id: string;
  name: string;
  type: string;
  start_date_local: string;
  trainer: boolean;
  garmin: string | null;
  calories: number | null;
  totals: FileTotals;
  streams: RideStreams;
  intervals: NonNullable<ActivityDetail["icu_intervals"]>;
};

const SEMI = 180 / 2 ** 31;
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** "2026-11-02T09:15:00" in this device's time zone, the way intervals.icu writes start_date_local. */
export function localIso(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** intervals.icu activity types from the FIT sport and sub-sport. */
export function rideType(sport: unknown, subSport: unknown): { type: string; trainer: boolean } {
  if (sport === "cycling" || sport === "eBiking") {
    if (subSport === "virtualActivity") return { type: "VirtualRide", trainer: true };
    if (subSport === "indoorCycling" || subSport === "spin") return { type: "Ride", trainer: true };
    if (subSport === "mountain" || subSport === "downhill")
      return { type: "MountainBikeRide", trainer: false };
    if (subSport === "gravelCycling" || subSport === "cyclocross")
      return { type: "GravelRide", trainer: false };
    return { type: sport === "eBiking" ? "EBikeRide" : "Ride", trainer: false };
  }
  if (sport === "running") return { type: "Run", trainer: subSport === "treadmill" };
  if (sport === "walking" || sport === "hiking") return { type: "Walk", trainer: false };
  if (sport === "swimming") return { type: "Swim", trainer: false };
  if (sport === "crossCountrySkiing") return { type: "NordicSki", trainer: false };
  if (sport === "training") return { type: "WeightTraining", trainer: true };
  return { type: "Other", trainer: false };
}

/** Garmin's own spelling of its device families, where the FIT product code abbreviates them. */
const FAMILY: Record<string, string> = {
  fr: "Forerunner",
  fenix: "fēnix",
  vivoactive: "vívoactive",
  epix: "epix",
};

/** "edge840" → "Edge 840", "fr965" → "Forerunner 965", for Garmin's "Garmin <device>" attribution. */
export const deviceLabel = (product: unknown) =>
  typeof product === "string"
    ? product
        .replace(/([a-z])(\d)/gi, "$1 $2")
        .replace(/_/g, " ")
        .replace(/\b[a-z]+/gi, (w) => FAMILY[w.toLowerCase()] ?? w[0]!.toUpperCase() + w.slice(1))
    : "";

function rideName(start: Date, type: string) {
  const h = start.getHours();
  const part =
    h < 11
      ? t("Morning", "Mattina")
      : h < 14
        ? t("Lunch", "Pranzo")
        : h < 18
          ? t("Afternoon", "Pomeriggio")
          : t("Evening", "Sera");
  const what = type.includes("Ride") ? t("ride", "uscita") : t("activity", "attività");
  return t(`${part} ${what}`, `${what[0]!.toUpperCase()}${what.slice(1)} · ${part.toLowerCase()}`);
}

/** One sample per timestamp: Strava's exports split each second over several records (distance, GPS, heart rate). */
export function mergeRecords(records: Rec[]): Rec[] {
  const out: Rec[] = [];
  let at = NaN;
  for (const r of records) {
    const time = (r["timestamp"] as Date).getTime();
    if (time === at) Object.assign(out[out.length - 1]!, r);
    else out.push({ ...r });
    at = time;
  }
  return out;
}

/**
 * Spreads a distance that repeats for a moment and then jumps (a phone updates it every other second) over those
 * seconds, so standing still isn't read between strides. A longer repeat is a real stop and stays.
 */
export function evenDistance(time: number[], distance: number[], maxSecs = 5) {
  for (let i = 0; i < distance.length; i++) {
    let next = i + 1;
    while (next < distance.length && distance[next] === distance[i]) next++;
    if (next >= distance.length || next === i + 1) continue;
    const span = time[next]! - time[i]!;
    if (span <= maxSecs)
      for (let k = i + 1; k < next; k++)
        distance[k] =
          distance[i]! + ((distance[next]! - distance[i]!) * (time[k]! - time[i]!)) / span;
    i = next - 1;
  }
}

/** The ride's real laps, cut to its end: Strava's exports add a phantom lap starting after the last sample. */
export function lapIntervals(laps: Rec[], t0: number, tEnd: number): ParsedRide["intervals"] {
  const real = laps.filter(
    (l) => l["startTime"] instanceof Date && (l["startTime"] as Date).getTime() < tEnd,
  );
  if (real.length < 2) return [];
  return real.map((l, i) => {
    const from = Math.round(((l["startTime"] as Date).getTime() - t0) / 1000);
    const secs = num(l["totalElapsedTime"]) ?? num(l["totalTimerTime"]) ?? 0;
    return {
      id: i + 1,
      label: t(`Lap ${i + 1}`, `Giro ${i + 1}`),
      type: null,
      moving_time: num(l["totalTimerTime"]),
      average_watts: num(l["avgPower"]),
      average_heartrate: num(l["avgHeartRate"]),
      start_time: from,
      end_time: Math.min(Math.round(from + secs), Math.round((tEnd - t0) / 1000)),
    };
  });
}

/** "Corsa_serale.fit" → "Corsa serale": Strava names its exports after the activity's title. */
const titleFromFile = (fileName: string) =>
  fileName
    .replace(/\.fit$/i, "")
    .replace(/_+/g, " ")
    .trim();

/** A sensor's last value through the odd second without a sample; a longer silence stays empty. */
const SENSOR_HOLD = 10;

export function parseFit(buf: ArrayBuffer, fileName = ""): ParsedRide {
  const decoder = new Decoder(Stream.fromArrayBuffer(buf));
  if (!decoder.isFIT()) throw new Error("not a FIT file");
  const { messages } = decoder.read();
  const records = mergeRecords(
    ((messages["recordMesgs"] as Rec[]) ?? []).filter((r) => r["timestamp"] instanceof Date),
  );
  if (!records.length) throw new Error("no samples");
  const session = ((messages["sessionMesgs"] as Rec[]) ?? [])[0] ?? {};
  const fileId = ((messages["fileIdMesgs"] as Rec[]) ?? [])[0] ?? {};
  const start = (session["startTime"] as Date) ?? (records[0]!["timestamp"] as Date);
  const t0 = (records[0]!["timestamp"] as Date).getTime();
  const tEnd = (records.at(-1)!["timestamp"] as Date).getTime();

  const hasGps = records.some((r) => num(r["positionLat"]) != null);
  let lastLat = 0;
  let lastLng = 0;
  const raw: RideStreams = {
    time: [],
    distance: [],
    altitude: [],
    watts: [],
    heartrate: [],
    cadence: [],
    lat: [],
    lng: [],
  };
  // Last seen per sensor, carried over the brief holes between its samples.
  const seen: Record<string, { at: number; value: number }> = {};
  const held = (key: string, value: number | null, at: number) => {
    if (value != null) seen[key] = { at, value };
    const s = seen[key];
    return s && at - s.at <= SENSOR_HOLD ? s.value : null;
  };
  const firstAltitude =
    records.map((r) => num(r["enhancedAltitude"]) ?? num(r["altitude"])).find((a) => a != null) ??
    0;
  for (const r of records) {
    const at = ((r["timestamp"] as Date).getTime() - t0) / 1000;
    raw.time.push(at);
    raw.distance.push(num(r["distance"]) ?? raw.distance.at(-1) ?? 0);
    // Before the first reading, the first reading: a 0 would count as a climb from sea level.
    raw.altitude.push(
      num(r["enhancedAltitude"]) ?? num(r["altitude"]) ?? raw.altitude.at(-1) ?? firstAltitude,
    );
    raw.watts.push(held("watts", num(r["power"]), at));
    raw.heartrate.push(held("hr", num(r["heartRate"]), at));
    raw.cadence.push(held("cadence", num(r["cadence"]), at));
    if (hasGps) {
      const la = num(r["positionLat"]);
      const lo = num(r["positionLong"]);
      if (la != null && lo != null) [lastLat, lastLng] = [la * SEMI, lo * SEMI];
      raw.lat.push(lastLat);
      raw.lng.push(lastLng);
    }
  }
  // Before the first fix, use the first fix so the track doesn't start at 0,0.
  const first = raw.lat.findIndex((v) => v !== 0);
  for (let i = 0; i < first; i++) [raw.lat[i], raw.lng[i]] = [raw.lat[first]!, raw.lng[first]!];
  evenDistance(raw.time, raw.distance);
  const streams = toOneHz(raw);

  // Zwift's own files: virtual whatever the sub-sport says (its GPS track is the game's map).
  const zwift = fileId["manufacturer"] === "zwift";
  const { type, trainer } = zwift
    ? { type: session["sport"] === "running" ? "VirtualRun" : "VirtualRide", trainer: true }
    : rideType(session["sport"], session["subSport"]);
  const intervals = lapIntervals((messages["lapMesgs"] as Rec[]) ?? [], t0, tEnd);
  // Strava titles its exports; anything else gets a name from the time of day.
  const title = fileId["manufacturer"] === "strava" ? titleFromFile(fileName) : "";

  return {
    id: `fit-${Math.round(start.getTime() / 1000)}`,
    name: title || rideName(start, type),
    type,
    start_date_local: localIso(start),
    trainer: trainer || (type.includes("Ride") && !hasGps),
    garmin:
      fileId["manufacturer"] === "garmin"
        ? garminAttribution(
            "GARMIN_CONNECT",
            deviceLabel(fileId["garminProduct"] ?? fileId["product"]),
          )
        : null,
    calories: num(session["totalCalories"]),
    totals: {
      moving: num(session["totalMovingTime"]) ?? num(session["totalTimerTime"]),
      distance: num(session["totalDistance"]),
      ascent: num(session["totalAscent"]),
    },
    streams,
    intervals,
  };
}
