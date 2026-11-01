import { describe, expect, it } from "vitest";
import {
  cleanName,
  composeName,
  dedupeNames,
  mergeNames,
  nearestNamed,
  pickTown,
  placeKey,
} from "./places";

describe("segment naming", () => {
  it("keeps the first of bilingual names", () => {
    expect(cleanName("Passo dello Stelvio - Stilfser Joch")).toBe("Passo dello Stelvio");
    expect(cleanName("Monte Baldo")).toBe("Monte Baldo");
  });
  it("prefers the village over the hamlet, unless asked for the local name", () => {
    const a = { hamlet: "Brustolotti", village: "Ala", city: "Ala" };
    expect(pickTown(a)).toBe("Ala");
    expect(pickTown(a, "local")).toBe("Brustolotti");
  });
  it("only accepts a landmark close to the top", () => {
    const places = [
      { lat: 46.5291, lon: 10.4535, name: "Passo dello Stelvio - Stilfser Joch", type: "yes" },
      { lat: 46.5308, lon: 10.4531, name: "Cima Garibaldi", type: "peak" },
    ];
    expect(nearestNamed(places, 46.5287, 10.4531)).toBe("Passo dello Stelvio");
    expect(
      nearestNamed(
        [{ lat: 46.086, lon: 10.33, name: "Valle Camonica", type: "valley" }],
        46.2589,
        10.5838,
      ),
    ).toBeNull();
    expect(nearestNamed(places, 46.5287, 10.4531, 400, ["peak"])).toBe("Cima Garibaldi");
  });
  it("composes landmark, towns, or a single-town name", () => {
    expect(composeName({ landmark: "Passo Coe", from: "Folgaria", to: "Folgaria" }, "auto")).toBe(
      "Passo Coe",
    );
    expect(composeName({ from: "Avio", to: "Ala" }, "auto")).toBe("Avio → Ala");
    expect(composeName({ from: "Ala", to: "Ala", toLocal: "Brustolotti" }, "auto")).toBe(
      "Ala → Brustolotti",
    );
    expect(composeName({ from: "Ala", to: "Ala", toLocal: "Ala" }, "auto")).toBe("Ala climb");
    expect(composeName({ from: "Ala", to: null }, "custom")).toBe("Ala segment");
    expect(composeName({}, "auto")).toBeNull();
  });
  it("appends the length when two segments share a name", () => {
    const m = dedupeNames([
      { id: "a", name: "Avio → Ala", length: 3700 },
      { id: "b", name: "Avio → Ala", length: 5200 },
      { id: "c", name: "Passo Coe", length: 9400 },
    ]);
    expect(m.get("a")).toBe("Avio → Ala · 3.7 km");
    expect(m.get("c")).toBe("Passo Coe");
  });
  it("keys names by where the segment runs, to ~10 m", () => {
    const a = { lat1: 45.889912, lng1: 11.040081, lat2: 45.93031, lng2: 11.00544 };
    expect(placeKey(a)).toBe("45.8899,11.0401,45.9303,11.0054");
    expect(placeKey({ ...a, lat1: 45.889934 })).toBe(placeKey(a));
  });
  it("merges names from two devices, keeping found names over nulls", () => {
    expect(
      mergeNames({ a: "Mine", b: null, c: null }, { a: "Theirs", b: "Found", d: "Other" }),
    ).toEqual({
      a: "Mine",
      b: "Found",
      c: null,
      d: "Other",
    });
  });
});
