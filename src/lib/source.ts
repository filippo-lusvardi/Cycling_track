// Where an account's training data comes from: intervals.icu, or Cirmolo itself (rides from uploaded FIT files, computed on the device and stored in the account). Both expose the same functions, so pages don't
// care which one an account uses. Types stay in ./intervals.
import * as intervals from "./intervals";
import * as native from "./native";
import { API_KEY, readSetting, SOURCE } from "./settings";

export type SourceKind = "intervals" | "native";

type Source = Pick<
  typeof intervals,
  | "getAthlete"
  | "getRideZones"
  | "getWellness"
  | "getActivities"
  | "getActivity"
  | "saveWellnessEntry"
  | "getStreams"
  | "getRideWatts"
  | "listOutdoorRides"
  | "downloadRideTrack"
  | "getPowerCurves"
  | "createManualActivity"
  | "getEvents"
  | "getOffEvents"
  | "createOffEvent"
  | "updateOffEvent"
  | "deleteEvent"
  | "createRace"
  | "updateRace"
  | "setActivityDescription"
>;

export const sourceKind = (): SourceKind =>
  readSetting<SourceKind>(SOURCE) === "native" ? "native" : "intervals";

const impl = (): Source => (sourceKind() === "native" ? native : intervals);

/** The function `k` of the account's source, looked up at call time (the source can change in Settings). */
function via<K extends keyof Source>(k: K): Source[K] {
  return ((...args: unknown[]) =>
    (impl()[k] as (...a: unknown[]) => unknown)(...args)) as Source[K];
}

export const getAthlete = via("getAthlete");
export const getRideZones = via("getRideZones");
export const getWellness = via("getWellness");
export const getActivities = via("getActivities");
export const getActivity = via("getActivity");
export const saveWellnessEntry = via("saveWellnessEntry");
export const getStreams = via("getStreams");
export const getRideWatts = via("getRideWatts");
export const listOutdoorRides = via("listOutdoorRides");
export const downloadRideTrack = via("downloadRideTrack");
export const getPowerCurves = via("getPowerCurves");
export const createManualActivity = via("createManualActivity");
export const getEvents = via("getEvents");
export const getOffEvents = via("getOffEvents");
export const createOffEvent = via("createOffEvent");
export const updateOffEvent = via("updateOffEvent");
export const deleteEvent = via("deleteEvent");
export const createRace = via("createRace");
export const updateRace = via("updateRace");
export const setActivityDescription = via("setActivityDescription");

/** Signed in and either holding an intervals.icu key or using Cirmolo's own store. */
export const hasSource = () => sourceKind() === "native" || !!readSetting<string>(API_KEY);
