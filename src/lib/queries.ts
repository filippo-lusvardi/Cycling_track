import { queryOptions } from "@tanstack/react-query";
import {
  getActivities,
  getAthlete,
  getActivity,
  getEvents,
  getOffEvents,
  getRideZones,
  getThresholds,
  getWorkouts,
  getPowerCurveRange,
  getPowerCurves,
  getStreams,
  getWellness,
} from "./source";
import type { Range } from "./intervals";
import { getDurability } from "./durability-data";
import { getRunData } from "./run-data";
import type { MainSport } from "./sport";
import { addDays, isoDate } from "./training";

function range(days: number): Range {
  const newest = isoDate(new Date());
  return { oldest: addDays(newest, -days), newest };
}

export const wellnessQuery = (days: number) =>
  queryOptions({
    queryKey: ["wellness", days],
    queryFn: () => getWellness(range(days)),
    staleTime: 5 * 60_000,
  });

export const wellnessRangeQuery = (r: Range) =>
  queryOptions({
    queryKey: ["wellness", r.oldest, r.newest],
    queryFn: () => getWellness(r),
    staleTime: 5 * 60_000,
  });

export const activitiesQuery = (days: number) =>
  queryOptions({
    queryKey: ["activities", days],
    queryFn: () => getActivities(range(days)),
    staleTime: 5 * 60_000,
  });

/** Every activity on intervals.icu (the list rows are small; the Rides page shows them a page at a time). */
export const allActivitiesQuery = () =>
  queryOptions({
    queryKey: ["activities", "all"],
    queryFn: () => getActivities({ oldest: "2000-01-01", newest: isoDate(new Date()) }),
    staleTime: 5 * 60_000,
  });

export const activitiesRangeQuery = (r: Range) =>
  queryOptions({
    queryKey: ["activities", r.oldest, r.newest],
    queryFn: () => getActivities(r),
    staleTime: 5 * 60_000,
  });

export const eventsQuery = (r: Range) =>
  queryOptions({
    queryKey: ["events", r.oldest, r.newest],
    queryFn: () => getEvents(r),
    staleTime: 5 * 60_000,
  });

/** Sick and injured stretches: the knots in the tree. */
export const offEventsQuery = (r: Range) =>
  queryOptions({
    queryKey: ["events", "off", r.oldest, r.newest],
    queryFn: () => getOffEvents(r),
    staleTime: 5 * 60_000,
  });

/** Races from yesterday to about five months ahead: everything the training focus looks at. */
export const racesQuery = (today: string) =>
  queryOptions({
    queryKey: ["events", "races", today],
    queryFn: async () =>
      (await getEvents({ oldest: addDays(today, -1), newest: addDays(today, 150) })).filter((e) =>
        /^RACE_[ABC]$/.test(e.category),
      ),
    staleTime: 5 * 60_000,
  });

/** Thresholds as the account's source holds them, for editing: read fresh, not the day-old zones. */
export const thresholdsQuery = (sport: MainSport) =>
  queryOptions({
    queryKey: ["thresholds", sport],
    queryFn: () => getThresholds(sport),
    staleTime: 0,
  });

/** The workout library. */
export const workoutsQuery = () =>
  queryOptions({
    queryKey: ["workouts"],
    queryFn: () => getWorkouts(),
    staleTime: 5 * 60_000,
  });

/** The intervals.icu profile (name, profile weight), which rarely changes. */
export const athleteQuery = () =>
  queryOptions({
    queryKey: ["athlete"],
    queryFn: () => getAthlete(),
    staleTime: 24 * 60 * 60_000,
  });

/** Every run's pace numbers. The first time, runs are downloaded one by one (see run-data's progress). */
export const runDataQuery = () =>
  queryOptions({
    queryKey: ["run-data"],
    queryFn: () => getRunData(),
    staleTime: 5 * 60_000,
  });

export const rideZonesQuery = (sport: MainSport = "ride") =>
  queryOptions({
    queryKey: sport === "run" ? ["ride-zones", sport] : ["ride-zones"],
    queryFn: () => getRideZones(sport),
    staleTime: 24 * 60 * 60_000,
  });

export const activityQuery = (id: string) =>
  queryOptions({
    queryKey: ["activity", id],
    queryFn: () => getActivity(id),
    staleTime: 10 * 60_000,
  });

export const streamsQuery = (id: string) =>
  queryOptions({
    queryKey: ["streams", id],
    queryFn: () => getStreams(id),
    staleTime: Infinity,
  });

export const powerCurvesQuery = () =>
  queryOptions({
    // Versioned: the offline cache keeps results across releases, and this one has gained the all-time curve.
    queryKey: ["power-curves", 2],
    queryFn: () => getPowerCurves(),
    staleTime: 30 * 60_000,
  });

/** One stretch's best power, read only when a phrase asks for it. */
export const powerCurveRangeQuery = (from: string, to: string) =>
  queryOptions({
    queryKey: ["power-curve-range", from, to],
    queryFn: () => getPowerCurveRange(from, to),
    staleTime: 30 * 60_000,
  });

/** Power after 15/30/45 kJ/kg over the last 90 days of long rides (each ride's power is downloaded once). */
export const durabilityQuery = () =>
  queryOptions({
    // Versioned: the offline cache keeps results across releases, so a changed shape needs a new key.
    queryKey: ["durability", 3],
    queryFn: () => getDurability(),
    staleTime: 60 * 60_000,
  });
