// What a member publishes into a forest: enough to draw their tree, nothing more. Raw HRV, sleep, heart rate and
// power never leave their device; the crown arrives already computed.
//   forests/{fid}/trees/{uid}              TreeHeader
//   forests/{fid}/trees/{uid}/years/{yyyy} TreeYearDoc
import type { Crown } from "../tree";

/** Today's crown as the member's own app computed it (season = readiness, sky = form). */
export type SharedCrown = Pick<
  Crown,
  | "score"
  | "estimated"
  | "season"
  | "seasonPhase"
  | "seasonLabel"
  | "leaves"
  | "ctl"
  | "atl"
  | "form"
  | "formPct"
  | "weather"
  | "weatherPhase"
>;

export type TreeHeader = {
  crown: SharedCrown | null;
  /** The day the crown was computed (a member who hasn't opened the app lately shows an older crown). */
  day: string;
  /** Years with a published doc, oldest first. */
  years: string[];
  /** Sick / injured stretches, for knots in the bark. */
  off: { start: string; end: string; kind: "SICK" | "INJURED" }[];
  updatedAt: number;
};

/** The Activity fields the tree draws, and only those. */
export type SharedRide = {
  id: string;
  name: string | null;
  type: string | null;
  start_date_local: string;
  moving_time: number | null;
  distance: number | null;
  total_elevation_gain: number | null;
  icu_training_load: number | null;
  icu_intensity: number | null;
  trainer: boolean;
  brioches: number;
};

export type TreeYearDoc = {
  rides: SharedRide[];
  /** Fitness and fatigue for each day of the year from 1 January (null before the history starts). */
  ctl: (number | null)[];
  atl: (number | null)[];
};
