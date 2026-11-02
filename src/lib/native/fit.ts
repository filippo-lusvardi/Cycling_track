// A ride file (.fit from a Garmin, Wahoo, Zwift…) read in the browser with Garmin's FIT SDK.
import { Decoder, Stream } from "@garmin/fitsdk";
import { garminAttribution } from "../garmin";
import { t } from "../i18n";
import type { ActivityDetail, RideStreams } from "../intervals";
import { toOneHz } from "../metrics";

type Rec = Record<string, unknown>;

export type ParsedRide = {
  id: string;
  name: string;
  type: string;
  start_date_local: string;
  trainer: boolean;
  garmin: string | null;
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

export function parseFit(buf: ArrayBuffer): ParsedRide {
  const decoder = new Decoder(Stream.fromArrayBuffer(buf));
  if (!decoder.isFIT()) throw new Error("not a FIT file");
  const { messages } = decoder.read();
  const records = ((messages["recordMesgs"] as Rec[]) ?? []).filter(
    (r) => r["timestamp"] instanceof Date,
  );
  if (!records.length) throw new Error("no samples");
  const session = ((messages["sessionMesgs"] as Rec[]) ?? [])[0] ?? {};
  const fileId = ((messages["fileIdMesgs"] as Rec[]) ?? [])[0] ?? {};
  const start = (session["startTime"] as Date) ?? (records[0]!["timestamp"] as Date);
  const t0 = (records[0]!["timestamp"] as Date).getTime();

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
  for (const r of records) {
    raw.time.push(((r["timestamp"] as Date).getTime() - t0) / 1000);
    raw.distance.push(num(r["distance"]) ?? raw.distance.at(-1) ?? 0);
    raw.altitude.push(num(r["enhancedAltitude"]) ?? num(r["altitude"]) ?? raw.altitude.at(-1) ?? 0);
    raw.watts.push(num(r["power"]));
    raw.heartrate.push(num(r["heartRate"]));
    raw.cadence.push(num(r["cadence"]));
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
  const streams = toOneHz(raw);

  // Zwift's own files: a virtual ride whatever the sub-sport says (its GPS track is the game's map).
  const zwift = fileId["manufacturer"] === "zwift";
  const { type, trainer } = zwift
    ? { type: "VirtualRide", trainer: true }
    : rideType(session["sport"], session["subSport"]);
  const laps = ((messages["lapMesgs"] as Rec[]) ?? []).filter(
    (l) => l["startTime"] instanceof Date,
  );
  const intervals =
    laps.length > 1
      ? laps.map((l, i) => {
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
            end_time: Math.round(from + secs),
          };
        })
      : [];

  return {
    id: `fit-${Math.round(start.getTime() / 1000)}`,
    name: rideName(start, type),
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
    streams,
    intervals,
  };
}
