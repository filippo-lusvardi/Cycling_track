import { queryOptions } from "@tanstack/react-query";
import {
  getActivities,
  getActivity,
  getEvents,
  getPowerCurves,
  getStreams,
  getTracks,
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

export const tracksQuery = (days: number) =>
  queryOptions({
    queryKey: ["tracks", days],
    queryFn: () => getTracks(days),
    staleTime: 30 * 60_000,
  });

export const powerCurvesQuery = () =>
  queryOptions({
    queryKey: ["power-curves"],
    queryFn: () => getPowerCurves(),
    staleTime: 30 * 60_000,
  });
