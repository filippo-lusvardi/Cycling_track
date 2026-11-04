// How a ride's streams are packed for Firestore: each one rounded to what its sensor can tell (GPS to about a metre)
// and stored as the change from the sample before, which gzip shrinks far better than long decimals. Pure.
import type { RideStreams } from "../intervals";

/** Steps per unit of each stream. Nothing reads finer than these. */
const SCALE: Record<keyof RideStreams, number> = {
  time: 1,
  distance: 10,
  altitude: 10,
  watts: 1,
  heartrate: 1,
  cadence: 1,
  lat: 1e5,
  lng: 1e5,
};

const KEYS = Object.keys(SCALE) as (keyof RideStreams)[];

/** A missing sample stays null (no sensor reading is not a reading of 0), and the next change counts from the last one seen. */
function pack(a: readonly (number | null)[], scale: number): (number | null)[] {
  let last = 0;
  return a.map((v) => {
    if (v == null || !Number.isFinite(v)) return null;
    const n = Math.round(v * scale);
    const d = n - last;
    last = n;
    return d;
  });
}

function unpack(a: readonly (number | null)[], scale: number): (number | null)[] {
  let last = 0;
  return a.map((d) => {
    if (d == null) return null;
    last += d;
    return last / scale;
  });
}

export function encodeStreams(s: RideStreams): RideStreams {
  return Object.fromEntries(KEYS.map((k) => [k, pack(s[k], SCALE[k])])) as RideStreams;
}

export function decodeStreams(s: RideStreams): RideStreams {
  return Object.fromEntries(KEYS.map((k) => [k, unpack(s[k], SCALE[k])])) as RideStreams;
}

/** Do two rides' streams agree, to within the rounding? Old rides are converted only if this holds. */
export function sameStreams(a: RideStreams, b: RideStreams): boolean {
  return KEYS.every((k) => {
    const x = a[k];
    const y = b[k];
    const tol = 0.51 / SCALE[k];
    return (
      x.length === y.length &&
      x.every((v, i) => {
        const w = y[i] ?? null;
        const u = v != null && Number.isFinite(v) ? v : null;
        return u == null || w == null ? u === w : Math.abs(u - w) <= tol;
      })
    );
  });
}
