// Compact binary form of a 20 m track for IndexedDB: ~24 bytes per point instead of ~70 as plain arrays.
// Float32 keeps positions to ~0.3 m, plenty for 40 m segment pins.
import type { TrackLike } from "./segments";

export type PackedTrack = {
  id: string;
  name: string | null;
  date: string;
  lat: Float32Array;
  lng: Float32Array;
  dist: Float32Array;
  time: Uint32Array;
  alt: Float32Array;
  watts: Uint16Array; // 0 = no data
  hr: Uint8Array;
  cad: Uint8Array;
};

const clampInt = (v: number | null | undefined, max: number) => (v == null || !(v > 0) ? 0 : Math.min(max, Math.round(v)));

export function packTrack(t: TrackLike): PackedTrack {
  const n = t.lat.length;
  const p: PackedTrack = {
    id: t.id,
    name: t.name,
    date: t.date,
    lat: Float32Array.from(t.lat),
    lng: Float32Array.from(t.lng),
    dist: Float32Array.from(t.dist),
    time: Uint32Array.from(t.time, (v) => Math.max(0, Math.round(v))),
    alt: Float32Array.from(t.alt),
    watts: new Uint16Array(n),
    hr: new Uint8Array(n),
    cad: new Uint8Array(n),
  };
  for (let i = 0; i < n; i++) {
    p.watts[i] = clampInt(t.watts[i], 65535);
    p.hr[i] = clampInt(t.hr[i], 255);
    p.cad[i] = clampInt(t.cad?.[i], 255);
  }
  return p;
}

const orNull = (a: ArrayLike<number>) => Array.from(a, (v) => (v > 0 ? v : null));

/** Back to plain arrays for the matching code; only a handful of tracks are unpacked at a time. */
export function unpackTrack(p: PackedTrack): Required<TrackLike> {
  return {
    id: p.id,
    name: p.name,
    date: p.date,
    lat: Array.from(p.lat),
    lng: Array.from(p.lng),
    dist: Array.from(p.dist),
    time: Array.from(p.time),
    alt: Array.from(p.alt),
    watts: orNull(p.watts),
    hr: orNull(p.hr),
    cad: orNull(p.cad),
  };
}
