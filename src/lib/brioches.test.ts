import { describe, expect, it } from "vitest";
import { briochesIn, withBrioches, withoutBrioches } from "./brioches";

describe("brioches", () => {
  it("reads the count, or 0 without a line", () => {
    expect(briochesIn("Nice loop\n\nBrioches: 3")).toBe(3);
    expect(briochesIn("brioche: 1")).toBe(1);
    expect(briochesIn("Ate 2 brioches at the top")).toBe(0);
    expect(briochesIn(null)).toBe(0);
  });
  it("sets, replaces and removes the line, keeping the rest", () => {
    expect(withBrioches("Nice loop", 2)).toBe("Nice loop\n\nBrioches: 2");
    expect(withBrioches("Nice loop\n\nBrioches: 2", 3)).toBe("Nice loop\n\nBrioches: 3");
    expect(withBrioches("Nice loop\n\nBrioches: 2", 0)).toBe("Nice loop");
    expect(withBrioches(null, 1)).toBe("Brioches: 1");
    expect(withoutBrioches("Brioches: 4")).toBe("");
  });
});
