// Place names for segments from OpenStreetMap (Nominatim). Pure helpers first, then rate-limited lookups.
import { haversine, type Segment } from "./segments";

const NEAR = 400; // m: how close a pass or peak must be to the segment's top

/** "Passo dello Stelvio - Stilfser Joch" → "Passo dello Stelvio" (first of bilingual names). */
export const cleanName = (n: string) => n.split(/\s+[-/]\s+/)[0]!.trim();

type Address = Partial<Record<"village" | "town" | "city" | "hamlet" | "suburb" | "municipality", string>>;

/** The settlement a rider would name: village or town before city, hamlet or suburb. */
export function pickTown(a: Address | undefined, prefer: "town" | "local" = "town"): string | null {
  if (!a) return null;
  const order = prefer === "local" ? (["hamlet", "village", "town", "suburb", "city"] as const) : (["village", "town", "city", "hamlet", "suburb", "municipality"] as const);
  for (const k of order) if (a[k]) return cleanName(a[k]!);
  return null;
}

type Place = { lat: string | number; lon: string | number; name?: string; category?: string; type?: string };

/** Nearest named place within `max` metres, optionally only of the given OSM types. */
export function nearestNamed(places: Place[], lat: number, lng: number, max = NEAR, types?: string[]): string | null {
  let best: { d: number; name: string } | null = null;
  for (const p of places) {
    if (!p.name || (types && !types.includes(p.type ?? ""))) continue;
    const d = haversine(lat, lng, Number(p.lat), Number(p.lon));
    if (d <= max && (!best || d < best.d)) best = { d, name: cleanName(p.name) };
  }
  return best?.name ?? null;
}

/** Landmark at the top wins; otherwise "From → To", or "<Town> climb" when both ends are in the same place. */
export function composeName(p: { landmark?: string | null; from?: string | null; to?: string | null; toLocal?: string | null }, source: Segment["source"]): string | null {
  if (p.landmark) return p.landmark;
  const to = p.to && p.to === p.from && p.toLocal && p.toLocal !== p.from ? p.toLocal : p.to;
  if (p.from && to && p.from !== to) return `${p.from} → ${to}`;
  const one = p.from ?? to;
  return one ? `${one} ${source === "auto" ? "climb" : "segment"}` : null;
}

/** Same name on different segments gets its length appended, so the list stays unambiguous. */
export function dedupeNames(items: { id: string; name: string; length: number }[]): Map<string, string> {
  const count = new Map<string, number>();
  for (const i of items) count.set(i.name, (count.get(i.name) ?? 0) + 1);
  return new Map(items.map((i) => [i.id, count.get(i.name)! > 1 ? `${i.name} · ${(i.length / 1000).toFixed(1)} km` : i.name]));
}

/** Where a segment runs, as its name's key: the same climb gets the same key on every device, whatever its id. */
export const placeKey = (s: Pick<Segment, "lat1" | "lng1" | "lat2" | "lng2">) =>
  [s.lat1, s.lng1, s.lat2, s.lng2].map((v) => v.toFixed(4)).join(",");

/** Two devices' name lists: `mine` wins, except that a found name beats "OSM had nothing" (null). */
export function mergeNames(mine: Record<string, string | null>, theirs: Record<string, string | null>) {
  const out = { ...theirs, ...mine };
  for (const [k, v] of Object.entries(theirs)) if (v && !out[k]) out[k] = v;
  return out;
}

// --- Nominatim lookups (max 1 request per second, as its usage policy asks) ---

const API = "https://nominatim.openstreetmap.org";
let last = Promise.resolve();
function nominatim<T>(path: string): Promise<T> {
  const run = last.then(async () => {
    const res = await fetch(`${API}${path}${path.includes("?") ? "&" : "?"}format=jsonv2`);
    if (!res.ok) throw new Error(`Nominatim ${res.status}`);
    return (await res.json()) as T;
  });
  last = run.then(
    () => new Promise((r) => setTimeout(r, 1100)),
    () => new Promise((r) => setTimeout(r, 1100)),
  );
  return run;
}

function box(lat: number, lng: number, m = NEAR) {
  const dLat = m / 111320;
  const dLng = m / (111320 * Math.cos((lat * Math.PI) / 180));
  return `${lng - dLng},${lat + dLat},${lng + dLng},${lat - dLat}`;
}

/** Name for a segment, or null if OSM has nothing useful. Throws on network errors (so it's retried later). */
export async function lookupSegmentName(s: Segment): Promise<string | null> {
  const passes = await nominatim<Place[]>(`/search?q=${encodeURIComponent("[mountain_pass=yes]")}&viewbox=${box(s.lat2, s.lng2)}&bounded=1&limit=5`);
  let landmark = nearestNamed(passes, s.lat2, s.lng2);
  if (!landmark) {
    const nat = await nominatim<Place>(`/reverse?lat=${s.lat2}&lon=${s.lng2}&zoom=17&layer=natural`);
    landmark = nearestNamed([nat], s.lat2, s.lng2, NEAR, ["saddle", "peak", "volcano"]);
  }
  if (landmark) return landmark;
  const a = await nominatim<{ address?: Address }>(`/reverse?lat=${s.lat1}&lon=${s.lng1}&zoom=14`);
  const b = await nominatim<{ address?: Address }>(`/reverse?lat=${s.lat2}&lon=${s.lng2}&zoom=16`);
  return composeName({ from: pickTown(a.address), to: pickTown(b.address), toLocal: pickTown(b.address, "local") }, s.source);
}
