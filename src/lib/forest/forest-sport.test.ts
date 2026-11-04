import { describe, expect, it } from "vitest";
import { forestSport } from "./forests";
import { sportWords } from "../sport";

describe("a forest's sport", () => {
  it("is cycling unless planted for running, so older forests stay cycling", () => {
    expect(forestSport({})).toBe("ride");
    expect(forestSport({ sport: "run" })).toBe("run");
  });
  it("names its sessions in its own sport's words", () => {
    expect(sportWords("ride").rides).toBe("rides");
    expect(sportWords("run")).toMatchObject({ rides: "runs", uscite: "corse" });
  });
});
