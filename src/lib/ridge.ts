// Mountain ridges for the night scenes (summit book cover, forest landscapes). Pure.
import { rng, seedOf } from "./tree";

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
