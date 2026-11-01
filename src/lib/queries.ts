import { queryOptions } from "@tanstack/react-query";
import {
  getActivities,
  getActivity,
  getEvents,
  getOffEvents,
  getRideZones,
  getPowerCurves,
  getStreams,
  getWellness,
  type Range,
} from "./intervals";
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
    queryFn: async () => (await getEvents({ oldest: addDays(today, -1), newest: addDays(today, 150) })).filter((e) => /^RACE_[ABC]$/.test(e.category)),
    staleTime: 5 * 60_000,
  });

export const rideZonesQuery = () =>
  queryOptions({
    queryKey: ["ride-zones"],
    queryFn: () => getRideZones(),
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
    queryKey: ["power-curves"],
    queryFn: () => getPowerCurves(),
    staleTime: 30 * 60_000,
  });
