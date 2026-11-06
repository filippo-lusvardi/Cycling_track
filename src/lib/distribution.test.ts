import { describe, expect, it } from "vitest";
import {
  drawnBuckets,
  histogramOf,
  mergeHistograms,
  apartCoasting,
  streamBuckets,
  topZones,
  sumZones,
  zonesOfBuckets,
} from "./distribution";

describe("distribution", () => {
  it("buckets values, leaving out zeros and gaps", () => {
    expect(histogramOf([0, null, 10, 24, 25, 60], 25)).toEqual([
      { start: 0, secs: 2 },
      { start: 25, secs: 1 },
      { start: 50, secs: 1 },
    ]);
  });

  it("keeps coasting apart from the chart, whichever way the buckets came", () => {
    const b = streamBuckets([0, 0, 10, 100, null], "power");
    expect(b).toEqual([
      { start: 0, secs: 3 },
      { start: 100, secs: 1 },
    ]);
    expect(apartCoasting(b, "power")).toEqual({ buckets: [{ start: 100, secs: 1 }], coasting: 3 });
    const hr = streamBuckets([0, 120], "hr");
    expect(hr).toEqual([{ start: 120, secs: 1 }]);
    expect(apartCoasting(hr, "hr").coasting).toBe(0);
  });

  it("says the biggest zones", () => {
    expect(topZones([10, 50, 0, 40])).toBe("Z2 50% · Z4 40% · Z1 10%");
    expect(topZones([0, 0])).toBe("");
  });

  it("merges histograms", () => {
    expect(
      mergeHistograms([
        [{ start: 100, secs: 5 }],
        [
          { start: 50, secs: 1 },
          { start: 100, secs: 2 },
        ],
      ]),
    ).toEqual([
      { start: 50, secs: 1 },
      { start: 100, secs: 7 },
    ]);
  });

  it("keeps the axis even and folds the thin tail", () => {
    const drawn = drawnBuckets(
      [
        { start: 100, secs: 500 },
        { start: 150, secs: 500 },
        { start: 900, secs: 1 },
      ],
      25,
    );
    expect(drawn.open).toBe(true);
    expect(drawn.buckets.map((b) => b.start)).toEqual([100, 125, 150, 175]);
    expect(drawn.buckets.at(-1)!.secs).toBe(1);
    expect(drawnBuckets([], 25)).toEqual({ buckets: [], open: false });
  });

  it("sums into zones", () => {
    expect(
      zonesOfBuckets(
        [
          { start: 100, secs: 10 },
          { start: 150, secs: 5 },
          { start: 400, secs: 1 },
        ],
        25,
        [120, 200, 999],
      ),
    ).toEqual([10, 5, 1]);
    expect(sumZones([[1, 2], undefined, [1, 1, 1]])).toEqual([2, 3, 1]);
  });
});
