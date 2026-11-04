import { describe, expect, it } from "vitest";
import { activityKind } from "./activity-kind";

describe("activity kinds", () => {
  it("tells ride kinds apart, indoor first", () => {
    expect(activityKind({ type: "Ride" })).toBe("road");
    expect(activityKind({ type: "Ride", trainer: true })).toBe("indoor");
    expect(activityKind({ type: "VirtualRide" })).toBe("indoor");
    expect(activityKind({ type: "GravelRide" })).toBe("gravel");
    expect(activityKind({ type: "MountainBikeRide" })).toBe("mtb");
    expect(activityKind({ type: "EBikeRide" })).toBe("ebike");
  });
  it("covers other sports", () => {
    expect(activityKind({ type: "TrailRun" })).toBe("run");
    expect(activityKind({ type: "VirtualRun" })).toBe("run");
    expect(activityKind({ type: "Run", trainer: true })).toBe("run");
    expect(activityKind({ type: "Hike" })).toBe("walk");
    expect(activityKind({ type: "WeightTraining" })).toBe("gym");
    expect(activityKind({ type: null })).toBe("other");
  });
});
