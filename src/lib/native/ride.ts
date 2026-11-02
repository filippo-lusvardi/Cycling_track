// A ride as Cirmolo stores it for accounts without intervals.icu. Pure, so mappers and tests need no Firebase.
import type { ActivityDetail } from "../intervals";

export type Origin = "fit" | "manual";

/** A ride as stored: what the pages read, plus its power curve and where it came from. */
export type Stored = ActivityDetail & {
  curve: (number | null)[];
  origin: Origin;
  /** Outdoors with GPS: the Segments engine reads it. */
  outdoor: boolean;
  hasStreams: boolean;
};

/** A ride with no numbers yet, for the fields a source doesn't provide. */
export function emptyRide(id: string, name: string, type: string, start: string): Stored {
  return {
    id,
    name,
    type,
    start_date_local: start,
    distance: null,
    moving_time: null,
    total_elevation_gain: null,
    icu_training_load: null,
    icu_average_watts: null,
    icu_weighted_avg_watts: null,
    average_heartrate: null,
    max_heartrate: null,
    icu_intensity: null,
    calories: null,
    joules: null,
    average_speed: null,
    zoneTimes: [0, 0, 0, 0, 0, 0, 0],
    decoupling: null,
    efficiency: null,
    trainer: false,
    feel: null,
    brioches: 0,
    garmin: null,
    description: null,
    icu_ftp: null,
    max_speed: null,
    average_cadence: null,
    icu_intervals: [],
    curve: [],
    origin: "fit",
    outdoor: false,
    hasStreams: false,
  };
}

/** A ride document as read back: removed rides stay as a marker, so other devices learn to drop them. */
export type RideDoc = Stored | { id: string; deleted: true };

/** The device's copy of the ride list with the documents changed since its last refresh applied. */
export function applyChanges(rides: Stored[], changed: RideDoc[]): Stored[] {
  const byId = new Map(rides.map((r) => [r.id, r]));
  for (const c of changed) {
    if ("deleted" in c && c.deleted) byId.delete(c.id);
    else byId.set(c.id, c as Stored);
  }
  return [...byId.values()];
}
