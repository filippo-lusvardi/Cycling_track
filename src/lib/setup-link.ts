// "Copy setup to phone": the keys travel in a link's #fragment, which browsers never send to any server.

export type SetupData = { apiKey: string; githubToken?: string; history?: number };

const API_KEY = /^[A-Za-z0-9]{8,128}$/;
const TOKEN = /^(github_pat_|ghp_)[A-Za-z0-9_]{10,255}$/;
const HISTORIES = new Set([0, 1, 2, 5]);

export function setupLink(origin: string, d: SetupData): string {
  const p = new URLSearchParams({ k: d.apiKey });
  if (d.githubToken) p.set("g", d.githubToken);
  if (d.history != null) p.set("h", String(d.history));
  return `${origin.replace(/\/$/, "")}/setup#${p.toString()}`;
}

/** The setup data in a `#k=…&g=…&h=…` fragment, or null if anything is missing or malformed. */
export function parseSetupHash(hash: string): SetupData | null {
  const p = new URLSearchParams(hash.replace(/^#/, ""));
  const apiKey = p.get("k") ?? "";
  if (!API_KEY.test(apiKey)) return null;
  const out: SetupData = { apiKey };
  const g = p.get("g");
  if (g != null) {
    if (!TOKEN.test(g)) return null;
    out.githubToken = g;
  }
  const h = p.get("h");
  if (h != null) {
    const n = Number(h);
    if (!HISTORIES.has(n) || h.trim() === "") return null;
    out.history = n;
  }
  return out;
}

/** The phone can only open the link if this page is served over HTTPS from a real address. */
export const canShareSetup = (loc: { protocol: string; hostname: string }) =>
  loc.protocol === "https:" && !["localhost", "127.0.0.1", "[::1]"].includes(loc.hostname);
