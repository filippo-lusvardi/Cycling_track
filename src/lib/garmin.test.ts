import { describe, expect, it } from "vitest";
import { garminAttribution } from "./garmin";

describe("garminAttribution", () => {
  it("keeps a device name that already says Garmin", () => {
    expect(garminAttribution("GARMIN_CONNECT", "Garmin Edge 840")).toBe("Garmin Edge 840");
    expect(garminAttribution("UPLOAD", "GARMIN Edge 1040")).toBe("Garmin Edge 1040");
  });

  it("prefixes the model for activities synced from Garmin Connect", () => {
    expect(garminAttribution("GARMIN_CONNECT", "Edge 540")).toBe("Garmin Edge 540");
    expect(garminAttribution("GARMIN_CONNECT", null)).toBe("Garmin");
  });

  it("leaves other devices and sources alone", () => {
    expect(garminAttribution("UPLOAD", "Wahoo ELEMNT BOLT")).toBeNull();
    expect(garminAttribution("OAUTH_CLIENT", "Zwift")).toBeNull();
    expect(garminAttribution("MANUAL", undefined)).toBeNull();
    expect(garminAttribution("UPLOAD", "Garminator 3000")).toBeNull();
  });
});
