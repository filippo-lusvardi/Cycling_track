import { describe, expect, it } from "vitest";
import { deviceLabel, localIso, rideType } from "./fit";

describe("FIT helpers", () => {
  it("maps sports to intervals.icu activity types", () => {
    expect(rideType("cycling", "road")).toEqual({ type: "Ride", trainer: false });
    expect(rideType("cycling", "virtualActivity")).toEqual({ type: "VirtualRide", trainer: true });
    expect(rideType("cycling", "indoorCycling")).toEqual({ type: "Ride", trainer: true });
    expect(rideType("cycling", "mountain").type).toBe("MountainBikeRide");
    expect(rideType("running", "generic").type).toBe("Run");
    expect(rideType("crossCountrySkiing", "generic").type).toBe("NordicSki");
  });

  it("names Garmin devices the way Garmin writes them", () => {
    expect(deviceLabel("edge840")).toBe("Edge 840");
    expect(deviceLabel("fr965")).toBe("Forerunner 965");
    expect(deviceLabel("fenix7")).toBe("fēnix 7");
    expect(deviceLabel(undefined)).toBe("");
  });

  it("writes local start times without a zone", () => {
    expect(localIso(new Date(2026, 10, 2, 9, 5, 7))).toBe("2026-11-02T09:05:07");
  });
});
