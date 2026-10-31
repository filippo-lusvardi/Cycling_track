// Where segments cluster: the map opens on the busiest area instead of fitting every segment ever ridden.

type Path = { lat: number[]; lng: number[] };
export type Bounds = [[number, number], [number, number]];

/**
 * Bounds of the paths in the busiest area: each path counts once (at its middle point) in a grid of
 * `cellKm` squares, the square with the most paths in it and its 8 neighbours wins, and the result
 * covers every path counted there. Null when there are no paths.
 */
export function densestRegion(paths: Path[], cellKm = 15): Bounds | null {
  const items = paths.filter((p) => p.lat.length > 0);
  if (!items.length) return null;
  const midLat = items.reduce((s, p) => s + p.lat[0]!, 0) / items.length;
  const dLat = cellKm / 111;
  const dLng = cellKm / (111 * Math.max(0.2, Math.cos((midLat * Math.PI) / 180)));
  const cellOf = (p: Path) => {
    const m = Math.floor(p.lat.length / 2);
    return [Math.floor(p.lat[m]! / dLat), Math.floor(p.lng[m]! / dLng)] as const;
  };
  const cells = new Map<string, Path[]>();
  for (const p of items) {
    const [y, x] = cellOf(p);
    const k = `${y}:${x}`;
    cells.set(k, [...(cells.get(k) ?? []), p]);
  }
  const around = (y: number, x: number) =>
    [-1, 0, 1].flatMap((dy) => [-1, 0, 1].flatMap((dx) => cells.get(`${y + dy}:${x + dx}`) ?? []));
  let best: Path[] = [];
  for (const k of cells.keys()) {
    const [y, x] = k.split(":").map(Number);
    const here = around(y!, x!);
    if (here.length > best.length) best = here;
  }
  const lats = best.flatMap((p) => p.lat);
  const lngs = best.flatMap((p) => p.lng);
  return [
    [Math.min(...lats), Math.min(...lngs)],
    [Math.max(...lats), Math.max(...lngs)],
  ];
}
