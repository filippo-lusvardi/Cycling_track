import { describe, expect, it } from "vitest";
import { canShareSetup, parseSetupHash, setupLink } from "./setup-link";

const KEY = "abc123def456ghi789jkl0mn";
const TOKEN = "github_pat_11ABCDEFG0123456789_abcdefXYZ";

describe("setup link", () => {
  it("round-trips the key, token and history through the fragment", () => {
    const link = setupLink("https://cadence.pages.dev/", { apiKey: KEY, githubToken: TOKEN, history: 5 });
    expect(link.startsWith("https://cadence.pages.dev/setup#")).toBe(true);
    expect(parseSetupHash(new URL(link).hash)).toEqual({ apiKey: KEY, githubToken: TOKEN, history: 5 });
  });
  it("leaves out what isn't set", () => {
    const link = setupLink("https://x.dev", { apiKey: KEY });
    expect(new URL(link).hash).toBe(`#k=${KEY}`);
    expect(parseSetupHash(new URL(link).hash)).toEqual({ apiKey: KEY });
  });
  it("keeps everything after # (never sent to the server)", () => {
    const u = new URL(setupLink("https://x.dev", { apiKey: KEY, githubToken: TOKEN }));
    expect(u.search).toBe("");
    expect(u.pathname).toBe("/setup");
  });
  it("rejects junk and tampered input", () => {
    expect(parseSetupHash("")).toBeNull();
    expect(parseSetupHash("#k=")).toBeNull();
    expect(parseSetupHash(`#k=${KEY}<script>`)).toBeNull();
    expect(parseSetupHash(`#k=${KEY}&g=not-a-token`)).toBeNull();
    expect(parseSetupHash(`#k=${KEY}&h=3`)).toBeNull();
    expect(parseSetupHash(`#k=${KEY}&h=`)).toBeNull();
  });
  it("only offers the QR from a real HTTPS address", () => {
    expect(canShareSetup({ protocol: "https:", hostname: "cadence.pages.dev" })).toBe(true);
    expect(canShareSetup({ protocol: "http:", hostname: "localhost" })).toBe(false);
    expect(canShareSetup({ protocol: "https:", hostname: "localhost" })).toBe(false);
  });
});
