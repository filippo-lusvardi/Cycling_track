import { describe, expect, it } from "vitest";
import { stepMinutes } from "./parts";

describe("a day's time", () => {
  it("goes by quarters of an hour", () => {
    expect(stepMinutes(60, 1)).toBe(75);
    expect(stepMinutes(60, -1)).toBe(45);
  });
  it("rest is one tap from the shortest session", () => {
    expect(stepMinutes(0, 1)).toBe(30);
    expect(stepMinutes(30, -1)).toBe(0);
  });
  it("stops at eight hours", () => {
    expect(stepMinutes(480, 1)).toBe(480);
  });
});
