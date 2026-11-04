// Mountain ridges for the night scenes (summit book cover, forest landscapes). Pure.
import { rng, seedOf } from "./tree";

/** The scenes' width in drawing units: the phone's 360; wider screens get more land, drawn a little larger. */
export const worldWidth = (px: number) => (px < 640 ? 360 : Math.round(px / 1.5));

/** A ridge for the far range: midpoint displacement from a seed, so each place keeps its own mountains. */
export function farRidge(seed: string, n: number, rough: number): number[] {
  const r = rng(seedOf(seed));
  const ys = new Array<number>(n + 1).fill(0);
  ys[0] = r();
  ys[n] = r();
  for (let step = n; step > 1; step = Math.floor(step / 2)) {
    const half = Math.floor(step / 2);
    for (let i = half; i < n; i += step)
      ys[i] = (ys[i - half]! + ys[Math.min(n, i + half)]!) / 2 + (r() - 0.5) * rough * (step / n);
  }
  const lo = Math.min(...ys);
  const hi = Math.max(...ys);
  return ys.map((y) => (y - lo) / (hi - lo || 1));
}

/**
 * A far ridge across a scene `w` wide: one farRidge per 360 units (the phone's width), each picking up where the
 * last left off, so a wider scene gets more mountains rather than the same ones stretched. 32 points per 360.
 */
export function ridgeAcross(seed: string, w: number, rough: number): number[] {
  const tiles = Math.max(1, Math.round(w / 360));
  const ys: number[] = [];
  for (let k = 0; k < tiles; k++) {
    const tile = farRidge(k ? `${seed}${k}` : seed, 32, rough);
    const shift = k ? ys.at(-1)! - tile[0]! : 0;
    // Bend the new range's start onto the previous one's end, easing back to its own shape.
    const bent = tile.map((y, j) => y + shift * (1 - j / 32));
    ys.push(...(k ? bent.slice(1) : bent));
  }
  if (tiles === 1) return ys;
  const lo = Math.min(...ys);
  const hi = Math.max(...ys);
  return ys.map((y) => (y - lo) / (hi - lo || 1));
}
