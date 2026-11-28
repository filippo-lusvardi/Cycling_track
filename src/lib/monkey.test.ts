import { describe, expect, it } from "vitest";
import { withBrioches, briochesIn } from "./brioches";
import { monkeyIn, withMonkey, withoutMonkey } from "./monkey";

describe("the monkey's line in a description", () => {
  it("is found whatever the case and spacing", () => {
    expect(monkeyIn("Hard day\n\n  monkey: YES ")).toBe(true);
    expect(monkeyIn("Monkey: no")).toBe(false);
    expect(monkeyIn(null)).toBe(false);
  });
  it("is added once, removed cleanly, and leaves the rest alone", () => {
    const on = withMonkey("Stelvio", true);
    expect(on).toBe("Stelvio\n\nMonkey: yes");
    expect(withMonkey(on, true)).toBe(on);
    expect(withMonkey(on, false)).toBe("Stelvio");
    expect(withMonkey(null, true)).toBe("Monkey: yes");
    expect(withoutMonkey(on)).toBe("Stelvio");
  });
  it("lives beside the brioches without either losing the other", () => {
    const both = withMonkey(withBrioches("Stelvio", 2), true);
    expect(briochesIn(both)).toBe(2);
    expect(monkeyIn(withBrioches(both, 3))).toBe(true);
    expect(briochesIn(withMonkey(both, false))).toBe(2);
  });
});
