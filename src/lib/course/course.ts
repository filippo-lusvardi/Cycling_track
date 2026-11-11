// A saved route and how it is stored. In Firestore (users/{uid}/courses/{id}) the line goes as gzipped deltas, every
// 20 m: a 100 km route is some 15–30 KB, so even hundreds of them sit easily in the free plan. Pure.
import type { Climb } from "../climbs";
import { coverage } from "../segments";
import { cumulative, resample, type LatLng, type Line } from "./geo";
import type { PlanOptions } from "./plan";

export type Checkpoint = LatLng & { name?: string | undefined };

export type ClimbSummary = Pick<
  Climb,
  "startKm" | "endKm" | "length" | "gain" | "avgGrade" | "maxGrade" | "category"
> & { name?: string | undefined };

export type Ridden = { id: string; date: string };

export type Course = {
  id: string;
  name: string;
  /** Day it was made, YYYY-MM-DD. */
  created: string;
  updated: number;
  distance: number;
  gain: number;
  /** Estimated when it was planned, for the list; the page works it out again. */
  seconds: number;
  climbs: ClimbSummary[];
  checkpoints: Checkpoint[];
  options: PlanOptions;
  /** Share of it on your roads when planned. */
  own: number;
  /** Rides that went round it. */
  ridden?: Ridden[] | undefined;
  /** Rides up to this day have been looked at for it. */
  checkedTo?: string | undefined;
  line: Line;
};

export type StoredCourse = Omit<Course, "line">;

const STEP = 20;

/** The line as text that gzip shrinks well: whole-number deltas of lat/lng (×1e5, ~1 m) and altitude (×10). */
export function encodeLine(l: Line): string {
  const r = resample(l, STEP);
  const enc = (v: number[], k: number) => {
    let prev = 0;
    return v.map((x) => {
      const q = Math.round(x * k);
      const d = q - prev;
      prev = q;
      return d;
    });
  };
  return JSON.stringify({ v: 1, a: enc(r.lat, 1e5), o: enc(r.lng, 1e5), h: enc(r.alt, 10) });
}

export function decodeLine(text: string): Line {
  const j = JSON.parse(text) as { a: number[]; o: number[]; h: number[] };
  const dec = (v: number[], k: number) => {
    let s = 0;
    return v.map((d) => (s += d) / k);
  };
  const lat = dec(j.a, 1e5);
  const lng = dec(j.o, 1e5);
  return { lat, lng, alt: dec(j.h, 10), dist: cumulative(lat, lng) };
}

export const summarize = (c: Climb, name?: string): ClimbSummary => ({
  startKm: c.startKm,
  endKm: c.endKm,
  length: c.length,
  gain: c.gain,
  avgGrade: c.avgGrade,
  maxGrade: c.maxGrade,
  category: c.category,
  ...(name ? { name } : {}),
});

/** Did this ride go round the route? Most of the route along it (either way round). */
export function rodeIt(
  course: Pick<Line, "lat" | "lng">,
  ride: Pick<Line, "lat" | "lng">,
  min = 0.8,
): boolean {
  return coverage(course, ride, 40).frac >= min;
}

export const newCourseId = () =>
  `c${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
