import { describe, expect, it } from "vitest";
import { panRange } from "./use-x-zoom";

describe("panRange", () => {
  it("slides the window keeping its span", () => {
    expect(panRange([10, 20], 5, 100)).toEqual([15, 25]);
    expect(panRange([10, 20], -3.4, 100)).toEqual([7, 17]);
  });

  it("stops at either end", () => {
    expect(panRange([10, 20], -50, 100)).toEqual([0, 10]);
    expect(panRange([80, 90], 50, 100)).toEqual([89, 99]);
  });
});
