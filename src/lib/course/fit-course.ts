// A route as a file to ride with: a FIT course (Garmin's own format, read by Edge and watches, with ClimbPro working off
// its altitude) and a GPX for anything else. Checkpoints and each climb's foot and summit go in as course points.
import { Encoder } from "@garmin/fitsdk";
import type { Climb, ClimbCategory } from "../climbs";
import { resample, type LatLng, type Line } from "./geo";

export type CoursePoint = {
  dist: number;
  name: string;
  kind: "checkpoint" | "climb" | "summit";
  category?: ClimbCategory;
};

export type CourseFile = {
  name: string;
  line: Line;
  /** Seconds from the start at each point of `line`. */
  times: number[];
  points: CoursePoint[];
};

const SEMI = 2 ** 31 / 180;

/** FIT message numbers (Profile.MesgNum) used here. */
const M = { FILE_ID: 0, LAP: 19, RECORD: 20, EVENT: 21, COURSE: 31, COURSE_POINT: 32 } as const;
const semi = (deg: number) => Math.round(deg * SEMI);

const CATEGORY_POINT: Record<ClimbCategory, string> = {
  HC: "horsCategory",
  "1": "firstCategory",
  "2": "secondCategory",
  "3": "thirdCategory",
  "4": "fourthCategory",
  Uncat: "generic",
};

/** Course points from the checkpoints (their distances on the line) and the climbs. */
export function coursePoints(
  stops: { dist: number; name: string }[],
  climbs: Climb[],
  climbName: (c: Climb, i: number) => string,
): CoursePoint[] {
  const pts: CoursePoint[] = stops.map((s) => ({ dist: s.dist, name: s.name, kind: "checkpoint" }));
  climbs.forEach((c, i) => {
    const name = climbName(c, i);
    pts.push({ dist: c.startKm * 1000, name, kind: "climb", category: c.category });
    pts.push({ dist: c.endKm * 1000, name, kind: "summit" });
  });
  const rank = { climb: 0, summit: 1, checkpoint: 2 } as const;
  return pts.sort((a, b) => a.dist - b.dist || rank[a.kind] - rank[b.kind]);
}

/** Device names are short; Garmin cuts course point names at about 16 characters. */
const short = (s: string, n = 15) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function at(l: Line, times: number[], d: number) {
  let i = l.dist.findIndex((x) => x >= d);
  if (i < 0) i = l.dist.length - 1;
  return { lat: l.lat[i]!, lng: l.lng[i]!, time: times[i] ?? 0, dist: l.dist[i]! };
}

/** Times at the points of a resampled line, from the line they were estimated on. */
function timesOn(src: Line, times: number[], to: Line): number[] {
  let j = 0;
  return to.dist.map((d) => {
    while (j < src.dist.length - 2 && src.dist[j + 1]! < d) j++;
    const span = src.dist[j + 1]! - src.dist[j]!;
    const f = span > 0 ? Math.min(1, Math.max(0, (d - src.dist[j]!) / span)) : 0;
    return times[j]! + ((times[j + 1] ?? times[j]!) - times[j]!) * f;
  });
}

export function fitCourse(c: CourseFile, now = new Date()): Uint8Array {
  // Every 25 m: plenty for turn-by-turn on the device, and a 200 km route stays well under the devices' limits.
  const line = resample(c.line, 25);
  const times = timesOn(c.line, c.times, line);
  const t0 = new Date(Math.floor(now.getTime() / 1000) * 1000);
  const ts = (s: number) => new Date(t0.getTime() + Math.round(s) * 1000);
  const total = line.dist.at(-1) ?? 0;
  const secs = times.at(-1) ?? 0;
  let up = 0,
    down = 0;
  for (let i = 1; i < line.alt.length; i++) {
    const d = line.alt[i]! - line.alt[i - 1]!;
    if (d > 0) up += d;
    else down -= d;
  }
  const e = new Encoder();
  // Fields are checked against Garmin's profile when encoding; the SDK's types only know the message envelope.
  const put = (num: number, mesg: Record<string, unknown>) => e.onMesg(num as never, mesg as never);
  put(M.FILE_ID, {
    type: "course",
    manufacturer: "development",
    product: 0,
    timeCreated: t0,
    serialNumber: 1,
  });
  put(M.COURSE, { sport: "cycling", name: short(c.name, 30) });
  put(M.LAP, {
    timestamp: ts(secs),
    startTime: t0,
    startPositionLat: semi(line.lat[0]!),
    startPositionLong: semi(line.lng[0]!),
    endPositionLat: semi(line.lat.at(-1)!),
    endPositionLong: semi(line.lng.at(-1)!),
    totalElapsedTime: secs,
    totalTimerTime: secs,
    totalDistance: total,
    totalAscent: Math.round(up),
    totalDescent: Math.round(down),
  });
  put(M.EVENT, { timestamp: t0, event: "timer", eventType: "start", eventGroup: 0 });
  const points = c.points.map((p) => ({ p, ...at(c.line, c.times, p.dist) }));
  let k = 0;
  for (let i = 0; i < line.lat.length; i++) {
    // Course points go in time order among the records.
    while (k < points.length && points[k]!.dist <= line.dist[i]!) {
      const q = points[k++]!;
      put(M.COURSE_POINT, {
        timestamp: ts(q.time),
        positionLat: semi(q.lat),
        positionLong: semi(q.lng),
        distance: q.dist,
        type:
          q.p.kind === "checkpoint"
            ? "checkpoint"
            : q.p.kind === "summit"
              ? "summit"
              : CATEGORY_POINT[q.p.category ?? "Uncat"],
        name: short(q.p.name),
      });
    }
    put(M.RECORD, {
      timestamp: ts(times[i]!),
      positionLat: semi(line.lat[i]!),
      positionLong: semi(line.lng[i]!),
      altitude: line.alt[i]!,
      distance: line.dist[i]!,
    });
  }
  for (; k < points.length; k++) {
    const q = points[k]!;
    put(M.COURSE_POINT, {
      timestamp: ts(q.time),
      positionLat: semi(q.lat),
      positionLong: semi(q.lng),
      distance: q.dist,
      type: q.p.kind === "summit" ? "summit" : "checkpoint",
      name: short(q.p.name),
    });
  }
  put(M.EVENT, { timestamp: ts(secs), event: "timer", eventType: "stopDisableAll", eventGroup: 0 });
  return e.close();
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function gpxCourse(
  name: string,
  line: Line,
  waypoints: (LatLng & { name: string })[],
): string {
  const l = resample(line, 20);
  const wpt = waypoints
    .map(
      (w) =>
        `  <wpt lat="${w.lat.toFixed(6)}" lon="${w.lng.toFixed(6)}"><name>${esc(w.name)}</name></wpt>`,
    )
    .join("\n");
  const pts = l.lat
    .map(
      (la, i) =>
        `      <trkpt lat="${la.toFixed(6)}" lon="${l.lng[i]!.toFixed(6)}"><ele>${l.alt[i]!.toFixed(1)}</ele></trkpt>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Cirmolo" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>${esc(name)}</name></metadata>
${wpt}
  <trk>
    <name>${esc(name)}</name>
    <trkseg>
${pts}
    </trkseg>
  </trk>
</gpx>
`;
}

/** A file name from the route's name. */
export const fileName = (name: string, ext: string) =>
  `${
    name
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^A-Za-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "percorso"
  }.${ext}`;
