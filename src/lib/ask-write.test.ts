import { describe, expect, it, vi } from "vitest";
import { lastSaved, loggedNow, rememberUndo, undoLast } from "./ask-write";
import type { ManualActivity } from "./intervals";

const entry: ManualActivity = {
  date: "2026-11-05",
  type: "WeightTraining",
  name: "Gym",
  minutes: 45,
};
const at = (h: number, m: number) => new Date(2026, 10, 5, h, m);

describe("when a logged activity started", () => {
  it("ended just now, today", () => {
    expect(loggedNow(entry, at(18, 30)).time).toBe("17:45");
  });
  it("doesn't start before midnight", () => {
    expect(loggedNow(entry, at(0, 10)).time).toBe("00:00");
  });
  it("keeps a time that was said, and other days' morning", () => {
    expect(loggedNow({ ...entry, time: "07:00" }, at(18, 30)).time).toBe("07:00");
    expect(loggedNow({ ...entry, date: "2026-11-04" }, at(18, 30)).time).toBeUndefined();
  });
});

describe("undo by typing", () => {
  it("runs once, by either way, and is then gone", async () => {
    const undo = vi.fn(async () => {});
    const run = rememberUndo("Registra: Gym", undo);
    expect(lastSaved()).toBe("Registra: Gym");
    await undoLast();
    expect(undo).toHaveBeenCalledTimes(1);
    expect(lastSaved()).toBeNull();
    await undoLast();
    expect(undo).toHaveBeenCalledTimes(1);
    rememberUndo("Peso", undo);
    expect(run).not.toBeUndefined();
    expect(lastSaved()).toBe("Peso");
  });
  it("stays when it fails, to try again", async () => {
    rememberUndo("Peso", async () => {
      throw new Error("offline");
    });
    await expect(undoLast()).rejects.toThrow();
    expect(lastSaved()).toBe("Peso");
  });
});
