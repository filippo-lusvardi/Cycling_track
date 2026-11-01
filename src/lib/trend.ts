// Trend line through noisy points: a robust polynomial whose degree (1–3) is picked by the data. Pure.

export type Trend = {
  degree: number;
  /** The fitted value at x. */
  at: (x: number) => number;
};

/** Least-squares polynomial of `degree` through (xs, ys) with per-point weights; null when it can't be solved. */
export function polyFit(
  xs: number[],
  ys: number[],
  degree: number,
  weights = xs.map(() => 1),
): number[] | null {
  const k = degree + 1;
  // Normal equations A·c = b, with A[i][j] = Σ w·x^(i+j) and b[i] = Σ w·y·x^i.
  const a = Array.from({ length: k }, () => Array<number>(k + 1).fill(0));
  xs.forEach((x, n) => {
    const w = weights[n]!;
    for (let i = 0; i < k; i++) {
      for (let j = 0; j < k; j++) a[i]![j]! += w * x ** (i + j);
      a[i]![k]! += w * ys[n]! * x ** i;
    }
  });
  // Gaussian elimination with partial pivoting.
  for (let c = 0; c < k; c++) {
    let p = c;
    for (let r = c + 1; r < k; r++) if (Math.abs(a[r]![c]!) > Math.abs(a[p]![c]!)) p = r;
    if (Math.abs(a[p]![c]!) < 1e-12) return null;
    [a[c], a[p]] = [a[p]!, a[c]!];
    for (let r = 0; r < k; r++) {
      if (r === c) continue;
      const f = a[r]![c]! / a[c]![c]!;
      for (let j = c; j <= k; j++) a[r]![j]! -= f * a[c]![j]!;
    }
  }
  return a.map((row, i) => row[k]! / row[i]!);
}

const evalPoly = (coef: number[], x: number) => coef.reduce((s, c, i) => s + c * x ** i, 0);

/**
 * Polynomial fit that a few odd points can't drag: iteratively reweighted least squares with Huber weights, so a
 * slow easy-day pass counts less than the efforts around it.
 */
function robustFit(xs: number[], ys: number[], degree: number) {
  let w = xs.map(() => 1);
  let coef = polyFit(xs, ys, degree, w);
  for (let it = 0; it < 10 && coef; it++) {
    const res = ys.map((y, i) => y - evalPoly(coef!, xs[i]!));
    // Scale from the median absolute residual; 1.345 is Huber's usual tuning constant.
    const mad = [...res.map(Math.abs)].sort((a, b) => a - b)[res.length >> 1]! / 0.6745 || 1e-9;
    w = res.map((r) => Math.min(1, (1.345 * mad) / Math.max(1e-12, Math.abs(r))));
    coef = polyFit(xs, ys, degree, w);
  }
  return coef && { coef, w };
}

/**
 * The trend through the points, or null with fewer than 4. Degree 1 unless the data clearly needs a curve: picked by
 * the Bayesian information criterion, up to 2 from 6 points and 3 from 10, so a few points never get a wiggle.
 */
export function fitTrend(xs: number[], ys: number[]): Trend | null {
  const n = xs.length;
  if (n < 4) return null;
  // Scaled to −1…1 so x³ stays well conditioned whatever the units.
  const [lo, hi] = [Math.min(...xs), Math.max(...xs)];
  if (hi === lo) return null;
  const scale = (x: number) => (2 * (x - lo)) / (hi - lo) - 1;
  const sx = xs.map(scale);
  const maxDegree = n >= 10 ? 3 : n >= 6 ? 2 : 1;
  let pick: { degree: number; coef: number[]; bic: number } | null = null;
  for (let degree = 1; degree <= maxDegree; degree++) {
    const fit = robustFit(sx, ys, degree);
    if (!fit) continue;
    const rss = ys.reduce((s, y, i) => s + fit.w[i]! * (y - evalPoly(fit.coef, sx[i]!)) ** 2, 0);
    const bic = n * Math.log(Math.max(rss, 1e-12) / n) + (degree + 1) * Math.log(n);
    if (!pick || bic < pick.bic) pick = { degree, coef: fit.coef, bic };
  }
  if (!pick) return null;
  const { degree, coef } = pick;
  return { degree, at: (x) => evalPoly(coef, scale(x)) };
}
