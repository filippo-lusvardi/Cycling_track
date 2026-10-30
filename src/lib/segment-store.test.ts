import { describe, expect, it } from "vitest";
import { liveSegments, mergeSegments, type SavedSegment } from "./segment-store";

const seg = (id: string, updatedAt: number, extra: Partial<SavedSegment> = {}): SavedSegment => ({
  id, name: id, source: "custom", lat1: 0, lng1: 0, lat2: 0, lng2: 0, length: 1000, starred: false, updatedAt, ...extra,
});

describe("segment store merge", () => {
  it("keeps segments that exist on only one side", () => {
    expect(mergeSegments([seg("a", 1)], [seg("b", 1)]).map((s) => s.id)).toEqual(["a", "b"]);
  });
  it("newest edit wins", () => {
    const m = mergeSegments([seg("a", 1, { starred: true })], [seg("a", 2, { starred: false })]);
    expect(m).toHaveLength(1);
    expect(m[0]!.starred).toBe(false);
  });
  it("a newer delete beats an older copy and is hidden", () => {
    const m = mergeSegments([seg("a", 1)], [seg("a", 5, { deleted: true })]);
    expect(liveSegments(m)).toHaveLength(0);
  });
});
