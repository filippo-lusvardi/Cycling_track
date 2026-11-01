// Gradient profile of a stretch of road (segment or climb). Pure and browser-safe.

export type Chunk = { from: number; to: number; altFrom: number; altTo: number; grade: number; i0: number; i1: number };

/**
 * Grade colour ramp for maps and profiles, cool to hot like a Giro climb profile: colours blend between
 * these stops (grade %, colour), so 7.9% and 8.1% look alike. Flat and downhill are the first colour,
 * the last one covers everything steeper.
 */
export const GRADE_STOPS: [number, string][] = [
  [0, "var(--z1)"],
  [3, "var(--z2)"],
  [6, "var(--z4)"],
  [9, "var(--z5)"],
  [12, "var(--z6)"],
  [15, "var(--z7)"],
];

export function gradeColor(g: number): string {
  const hi = GRADE_STOPS.findIndex(([max]) => g < max);
  if (hi === 0) return GRADE_STOPS[0]![1];
  if (hi < 0) return GRADE_STOPS.at(-1)![1];
  const [g0, c0] = GRADE_STOPS[hi - 1]!;
  const [g1, c1] = GRADE_STOPS[hi]!;
  const p = Math.round(((g - g0) / (g1 - g0)) * 100);
  return p === 0 ? c0 : `color-mix(in oklch, ${c1} ${p}%, ${c0})`;
}

/** CSS background drawing the whole ramp, for a legend bar from 0% to the last stop. */
export const gradeRampCss = () => {
  const top = GRADE_STOPS.at(-1)![0];
  return `linear-gradient(to right in oklch, ${GRADE_STOPS.map(([g, c]) => `${c} ${(g / top) * 100}%`).join(", ")})`;
};

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
