// Gradient profile of a stretch of road (segment or climb). Pure and browser-safe.

export type Chunk = { from: number; to: number; altFrom: number; altTo: number; grade: number; i0: number; i1: number };

/** Grade bands for maps and profiles, like the pink/red/orange of a Giro climb profile. */
const BANDS: [number, string][] = [
  [2, "var(--z1)"],
  [4, "var(--z2)"],
  [6, "var(--z3)"],
  [8, "var(--z4)"],
  [10, "var(--z5)"],
  [12, "var(--z6)"],
  [Infinity, "var(--z7)"],
];
export const GRADE_LEGEND = ["< 2%", "2–4%", "4–6%", "6–8%", "8–10%", "10–12%", "> 12%"];

export const gradeColor = (g: number) => BANDS.find(([max]) => g < max)![1];

/** Altitude smoothed over ±`window` metres, to tame GPS / barometer noise before taking grades. */
export function smoothAltitude(dist: number[], alt: number[], window = 50): number[] {
  return alt.map((_, i) => {
    let s = 0, n = 0;
    for (let j = i; j >= 0 && dist[i]! - dist[j]! <= window; j--) { s += alt[j]!; n++; }
    for (let j = i + 1; j < alt.length && dist[j]! - dist[i]! <= window; j++) { s += alt[j]!; n++; }
    return s / n;
  });
}

/** Split a profile into `size`-metre chunks with their average grade (%). Indices point into the input. */
export function gradeChunks(dist: number[], alt: number[], size = 100): Chunk[] {
  if (dist.length < 2) return [];
  const sm = smoothAltitude(dist, alt);
  const out: Chunk[] = [];
  let i0 = 0;
  for (let i = 1; i < dist.length; i++) {
    const last = i === dist.length - 1;
    if (dist[i]! - dist[i0]! < size && !last) continue;
    const len = dist[i]! - dist[i0]!;
    if (len > 0) out.push({ from: dist[i0]!, to: dist[i]!, altFrom: sm[i0]!, altTo: sm[i]!, grade: ((sm[i]! - sm[i0]!) / len) * 100, i0, i1: i });
    i0 = i;
  }
  return out;
}

/** Steepest grade over any chunk of the profile. */
export const maxGrade = (chunks: Chunk[]) => chunks.reduce((m, c) => Math.max(m, c.grade), 0);
