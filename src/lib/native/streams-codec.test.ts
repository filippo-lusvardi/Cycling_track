import { describe, expect, it } from "vitest";
import type { RideStreams } from "../intervals";
import { decodeStreams, encodeStreams, sameStreams } from "./streams-codec";

const streams = (): RideStreams => ({
  time: [0, 1, 2, 3],
  distance: [0, 5.26, 11.04, 16.5],
  altitude: [212, 212.2, 212.4, 212.2],
  watts: [null, 0, 250, null],
  heartrate: [120, 121, null, 122],
  cadence: [],
  lat: [46.06013439595699, 46.06014, 46.06016, 46.06019],
  lng: [11.131573263555765, 11.13158, 11.1316, 11.13163],
});

describe("packed streams", () => {
  it("come back the same, to within the rounding", () => {
    const back = decodeStreams(encodeStreams(streams()));
    expect(sameStreams(streams(), back)).toBe(true);
    expect(back.lat[0]).toBe(46.06013);
    expect(back.distance[1]).toBe(5.3);
  });

  it("keep a missing reading apart from a reading of 0", () => {
    const back = decodeStreams(encodeStreams(streams()));
    expect(back.watts).toEqual([null, 0, 250, null]);
    expect(back.heartrate).toEqual([120, 121, null, 122]);
    expect(back.cadence).toEqual([]);
  });

  it("store changes between samples", () => {
    expect(encodeStreams(streams()).time).toEqual([0, 1, 1, 1]);
  });

  it("tell streams apart when a sample really differs", () => {
    const moved = streams();
    moved.lat[2] = 46.1;
    expect(sameStreams(streams(), moved)).toBe(false);
    const gap = streams();
    gap.watts[1] = null;
    expect(sameStreams(streams(), gap)).toBe(false);
    expect(sameStreams(streams(), { ...streams(), time: [0, 1] })).toBe(false);
  });
});
