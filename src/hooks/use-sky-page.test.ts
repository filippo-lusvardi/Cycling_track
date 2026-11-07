import { describe, expect, it } from "vitest";
import { SKY_PAGE } from "./use-sky-page";

describe("the sky", () => {
  it("is over both plan pages", () => {
    for (const path of ["/plan", "/plan/", "/plan/settings"])
      expect(SKY_PAGE.test(path)).toBe(true);
    expect(SKY_PAGE.test("/planner")).toBe(false);
  });

  it("is over a typed chart", () => {
    for (const path of ["/chart", "/chart/"]) expect(SKY_PAGE.test(path)).toBe(true);
    expect(SKY_PAGE.test("/charts")).toBe(false);
  });
});
