// Where an account's training data comes from: intervals.icu, or Cirmolo itself (rides from uploaded FIT files, computed on the device and stored in the account). Both expose the same functions, so pages don't
// care which one an account uses. Types stay in ./intervals.
import * as intervals from "./intervals";
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
  | "getRunSummary"
  | "fillRunLoads"
  | "listOutdoorRides"
  | "downloadRideTrack"
  | "getPowerCurves"
  | "getPowerCurveRange"
  | "getHrCurves"
  | "getHistograms"
  | "getHrCurveRange"
  | "createManualActivity"
  | "deleteActivity"
  | "getEvents"
  | "getOffEvents"
  | "createOffEvent"
  | "updateOffEvent"
  | "deleteEvent"
  | "createRace"
  | "updateRace"
  | "setActivityDescription"
  | "setActivityFeel"
  | "getThresholds"
  | "saveThresholds"
  | "getWorkouts"
  | "createWorkout"
  | "updateWorkout"
  | "deleteWorkout"
  | "scheduleWorkout"
  | "planFreeRide"
  | "movePlanned"
  | "replacePlanned"
  | "createNote"
  | "updateNote"
>;

export const sourceKind = (): SourceKind =>
  readSetting<SourceKind>(SOURCE) === "native" ? "native" : "intervals";

// Cirmolo's own store needs Firestore, so it's loaded only by accounts that use it (every Source function is async).
const impl = async (): Promise<Source> =>
  sourceKind() === "native" ? await import("./native") : intervals;

/** The function `k` of the account's source, looked up at call time (the source can change in Settings). */
function via<K extends keyof Source>(k: K): Source[K] {
  return (async (...args: unknown[]) =>
    ((await impl())[k] as (...a: unknown[]) => unknown)(...args)) as Source[K];
}

export const getAthlete = via("getAthlete");
export const getRideZones = via("getRideZones");
export const getWellness = via("getWellness");
export const getActivities = via("getActivities");
export const getActivity = via("getActivity");
export const saveWellnessEntry = via("saveWellnessEntry");
export const getStreams = via("getStreams");
export const getRideWatts = via("getRideWatts");
export const getRunSummary = via("getRunSummary");
export const fillRunLoads = via("fillRunLoads");
export const listOutdoorRides = via("listOutdoorRides");
export const downloadRideTrack = via("downloadRideTrack");
export const getPowerCurves = via("getPowerCurves");
export const getPowerCurveRange = via("getPowerCurveRange");
export const getHrCurves = via("getHrCurves");
export const getHistograms = via("getHistograms");
export const getHrCurveRange = via("getHrCurveRange");
export const createManualActivity = via("createManualActivity");
export const deleteActivity = via("deleteActivity");
export const getEvents = via("getEvents");
export const getOffEvents = via("getOffEvents");
export const createOffEvent = via("createOffEvent");
export const updateOffEvent = via("updateOffEvent");
export const deleteEvent = via("deleteEvent");
export const createRace = via("createRace");
export const updateRace = via("updateRace");
export const setActivityDescription = via("setActivityDescription");
export const setActivityFeel = via("setActivityFeel");
export const getThresholds = via("getThresholds");
export const saveThresholds = via("saveThresholds");
export const getWorkouts = via("getWorkouts");
export const createWorkout = via("createWorkout");
export const updateWorkout = via("updateWorkout");
export const deleteWorkout = via("deleteWorkout");
export const scheduleWorkout = via("scheduleWorkout");
export const replacePlanned = via("replacePlanned");
export const createNote = via("createNote");
export const updateNote = via("updateNote");
export const planFreeRide = via("planFreeRide");
export const movePlanned = via("movePlanned");

/** Signed in and either holding an intervals.icu key or using Cirmolo's own store. */
export const hasSource = () => sourceKind() === "native" || !!readSetting<string>(API_KEY);
