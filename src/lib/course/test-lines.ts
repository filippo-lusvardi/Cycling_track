// Lines to test with: straight roads near Trento at a set grade. Test helper only.
import { cumulative, offset, type LatLng, type Line } from "./geo";

/** From `from`, on a bearing, `meters` long, a point every `step` m, climbing at `grade` (fraction). */
export function road(
  from: LatLng,
  bearing: number,
  meters: number,
  grade = 0,
  step = 20,
  alt0 = 200,
): Line {
  const lat: number[] = [],
    lng: number[] = [],
    alt: number[] = [];
  for (let d = 0; d <= meters; d += step) {
    const p = offset(from, bearing, d);
    lat.push(p.lat);
    lng.push(p.lng);
    alt.push(alt0 + d * grade);
  }
  return { lat, lng, alt, dist: cumulative(lat, lng) };
}

export const TRENTO: LatLng = { lat: 46.0679, lng: 11.1217 };

/** A fake router: straight lines between the points, flat unless a grade is given. */
export const straightRouter =
  (grade = 0) =>
  async (points: LatLng[]): Promise<Line> => {
    const lat: number[] = [],
      lng: number[] = [];
    points.forEach((p, i) => {
      if (!i) {
        lat.push(p.lat);
        lng.push(p.lng);
        return;
      }
      const a = points[i - 1]!;
      for (let k = 1; k <= 20; k++) {
        lat.push(a.lat + ((p.lat - a.lat) * k) / 20);
        lng.push(a.lng + ((p.lng - a.lng) * k) / 20);
      }
    });
    const dist = cumulative(lat, lng);
    return { lat, lng, alt: dist.map((d) => 200 + d * grade), dist };
  };
