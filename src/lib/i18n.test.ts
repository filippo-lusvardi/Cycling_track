import { afterEach, describe, expect, it, vi } from "vitest";
import { LANGUAGE } from "./settings";

// The language is fixed when the module loads, so each case loads it afresh.
async function load(saved?: string) {
  if (saved) localStorage.setItem(LANGUAGE, JSON.stringify(saved));
  vi.resetModules();
  return import("./i18n");
}

describe("i18n", () => {
  afterEach(() => localStorage.clear());

  it("follows the saved language", async () => {
    const it_ = await load("it");
    expect(it_.lang).toBe("it");
    expect(it_.t("Rides", "Attività")).toBe("Attività");
    const en = await load("en");
    expect(en.t("Rides", "Attività")).toBe("Rides");
  });

  it("formats dates in Italian, capitalised", async () => {
    const { format } = await load("it");
    expect(format(new Date(2026, 10, 2), "EEEE d MMMM")).toBe("Lunedì 2 novembre");
  });

  it("translates library text too", async () => {
    await load("it");
    const { advice } = await import("./readiness");
    expect(advice(80).title).toBe("Giornata da intensità");
  });
});
