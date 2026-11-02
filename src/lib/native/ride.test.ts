import { describe, expect, it } from "vitest";
import { applyChanges, emptyRide } from "./ride";

const ride = (id: string, name = id) => emptyRide(id, name, "Ride", "2026-11-01T09:00:00");

describe("applyChanges", () => {
  it("adds new rides, replaces edited ones and drops deleted ones", () => {
    const out = applyChanges(
      [ride("a"), ride("b"), ride("c")],
      [ride("b", "renamed"), { id: "c", deleted: true }, ride("d")],
    );
    expect(out.map((r) => [r.id, r.name])).toEqual([
      ["a", "a"],
      ["b", "renamed"],
      ["d", "d"],
    ]);
  });

  it("ignores a deletion of a ride this device never had", () => {
    expect(applyChanges([ride("a")], [{ id: "zz", deleted: true }])).toHaveLength(1);
  });
});
