// Private GitHub Gist used as a tiny sync store between devices (no backend of our own).
import { GIST_ID, GITHUB_TOKEN, readSetting, writeSetting } from "./settings";

const FILE = "cadence-segments.json";
/** OpenStreetMap segment names, shared so each climb is looked up once across devices. */
export const NAMES_FILE = "ora-names.json";

async function gh<T>(path: string, init?: RequestInit): Promise<T> {
  const token = readSetting<string>(GITHUB_TOKEN);
  if (!token) throw new Error("No GitHub token");
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) throw new Error(`GitHub ${res.status}`);
  return (await res.json()) as T;
}

type Gist = { id: string; files: Record<string, { content?: string; truncated?: boolean; raw_url?: string }> };

/** The gist holding Cirmolo data: remembered id, else found by file name, else created (secret). */
async function gistId(): Promise<string> {
  const known = readSetting<string>(GIST_ID);
  if (known) return known;
  const mine = await gh<Gist[]>(`/gists?per_page=100`);
  const found = mine.find((g) => FILE in g.files);
  const id =
    found?.id ??
    (
      await gh<Gist>(`/gists`, {
        method: "POST",
        body: JSON.stringify({ public: false, description: "Cirmolo — saved segments", files: { [FILE]: { content: "[]" } } }),
      })
    ).id;
  writeSetting(GIST_ID, id);
  return id;
}

export async function readGist<T>(file = FILE): Promise<T | null> {
  const g = await gh<Gist>(`/gists/${await gistId()}`);
  const f = g.files[file];
  if (!f) return null;
  const text = f.truncated && f.raw_url ? await (await fetch(f.raw_url)).text() : (f.content ?? "");
  return text ? (JSON.parse(text) as T) : null;
}

export async function writeGist(data: unknown, file = FILE) {
  await gh(`/gists/${await gistId()}`, {
    method: "PATCH",
    body: JSON.stringify({ files: { [file]: { content: JSON.stringify(data) } } }),
  });
}

/** Who the token belongs to, for the Settings "Test" button. */
export const githubUser = () => gh<{ login: string }>(`/user`);
