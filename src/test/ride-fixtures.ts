// Synthetic rides over the same roads: a loop with 4 climbs, ridden with GPS jitter, altitude noise and different lead-ins.
import type { TrackLike } from "@/lib/segments";

function rng(seed: number) { return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32); }

/** A winding road: a heading that turns gently, so the geometry isn't a straight line. */
export function road(km: number, seed = 1) {
  const r = rng(seed);
  const lat = [45.7], lng = [11.0];
  let h = 0;
  for (let d = 20; d <= km * 1000; d += 20) {
    h += (r() - 0.5) * 0.25;
    lat.push(lat.at(-1)! + (Math.cos(h) * 20) / 111320);
    lng.push(lng.at(-1)! + (Math.sin(h) * 20) / (111320 * Math.cos((45.7 * Math.PI) / 180)));
  }
  return { lat, lng };
}

/** Altitude: flats with climbs at the given km ranges and grades. */
export function profile(km: number, climbs: [number, number, number][]) {
  const alt: number[] = [];
  let a = 200;
  for (let d = 0; d <= km * 1000; d += 20) {
    const c = climbs.find(([s, e]) => d >= s * 1000 && d < e * 1000);
    const desc = climbs.find(([, e]) => d >= e * 1000 && d < e * 1000 + 3000);
    a += c ? 20 * c[2] / 100 : desc ? -20 * 0.04 : 0;
    alt.push(Math.max(50, a));
  }
  return alt;
}

export function ride(id: string, seed: number, base: { lat: number[]; lng: number[] }, alt: number[], opts: { jitter?: number; altNoise?: number } = {}): TrackLike {
  const r = rng(seed);
  const j = opts.jitter ?? 4, an = opts.altNoise ?? 1.5;
  const t: TrackLike = { id, name: id, date: `2026-10-${String(1 + (seed % 28)).padStart(2, "0")}`, lat: [], lng: [], dist: [], time: [], alt: [], watts: [], hr: [], cad: [] };
  const off = r() * 10; // sampling phase offset, so points don't coincide between rides
  for (let i = 0; i < base.lat.length; i++) {
    const d = i * 20 + off;
    t.lat.push(base.lat[i]! + ((r() - 0.5) * j) / 111320);
    t.lng.push(base.lng[i]! + ((r() - 0.5) * j) / 78000);
    t.dist.push(d); t.time.push(d / 7);
    t.alt.push(alt[i]! + (r() - 0.5) * an);
    t.watts.push(220); t.hr.push(140); t.cad!.push(88);
  }
  return t;
}

/** The same road up to `atKm`, then a different road (turning off), `km` long in total. */
export function branch(base: { lat: number[]; lng: number[] }, atKm: number, km: number, seed = 2) {
  const r = rng(seed);
  const n = Math.round((atKm * 1000) / 20);
  const lat = base.lat.slice(0, n + 1), lng = base.lng.slice(0, n + 1);
  let h = Math.atan2(lng[n]! - lng[n - 1]!, lat[n]! - lat[n - 1]!) + Math.PI / 2; // turn right
  for (let d = (n + 1) * 20; d <= km * 1000; d += 20) {
    h += (r() - 0.5) * 0.25;
    lat.push(lat.at(-1)! + (Math.cos(h) * 20) / 111320);
    lng.push(lng.at(-1)! + (Math.sin(h) * 20) / (111320 * Math.cos((45.7 * Math.PI) / 180)));
  }
  return { lat, lng };
}

/** Arrives on a different road and joins `base` at `atKm`, then follows it (the mirror of `branch`). */
export function join(base: { lat: number[]; lng: number[] }, atKm: number, seed = 4) {
  const r = rng(seed);
  const n = Math.round((atKm * 1000) / 20);
  let h = Math.atan2(base.lng[n]! - base.lng[n + 1]!, base.lat[n]! - base.lat[n + 1]!) - Math.PI / 2; // back along a side road
  const lat = [base.lat[n]!], lng = [base.lng[n]!];
  for (let i = 0; i < n; i++) {
    h += (r() - 0.5) * 0.25;
    lat.push(lat.at(-1)! + (Math.cos(h) * 20) / 111320);
    lng.push(lng.at(-1)! + (Math.sin(h) * 20) / (111320 * Math.cos((45.7 * Math.PI) / 180)));
  }
  lat.reverse(); lng.reverse();
  return { lat: [...lat.slice(0, -1), ...base.lat.slice(n)], lng: [...lng.slice(0, -1), ...base.lng.slice(n)] };
}
