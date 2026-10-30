import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { clear as clearIdb } from "idb-keyval";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Panel } from "@/components/StatCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { syncSegments } from "@/hooks/use-segments";
import { githubUser } from "@/lib/gist";
import { getAthlete } from "@/lib/intervals";
import { API_KEY, GIST_ID, GITHUB_TOKEN, readSetting, writeSetting } from "@/lib/settings";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Settings — Cadence" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <div className="eyebrow">This device</div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <IntervalsKey />
        <GithubSync />
        <Storage />
      </div>
    </div>
  );
}

function IntervalsKey() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [key, setKey] = useState(() => readSetting<string>(API_KEY) ?? "");
  const [busy, setBusy] = useState(false);
  const saved = !!readSetting<string>(API_KEY);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    writeSetting(API_KEY, key.trim());
    setBusy(true);
    try {
      const a = await getAthlete();
      toast.success(`Connected to intervals.icu${a.name ? ` as ${a.name}` : ""}`);
      await qc.invalidateQueries();
      navigate({ to: "/" });
    } catch {
      writeSetting(API_KEY, null);
      toast.error("intervals.icu rejected that key");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="intervals.icu">
      <form onSubmit={onSubmit} className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="apikey">API key</Label>
          <Input
            id="apikey"
            type="password"
            autoComplete="off"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="From intervals.icu → Settings → Developer"
            required
          />
        </div>
        <div className="flex gap-2">
          <Button type="submit" disabled={busy || !key.trim()}>
            {busy ? "Checking…" : "Save & connect"}
          </Button>
          {saved && (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                writeSetting(API_KEY, null);
                setKey("");
                qc.clear();
              }}
            >
              Forget key
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Stored only in this browser. Each device (Zen on Ubuntu, the phone) needs it once.
        </p>
      </form>
    </Panel>
  );
}

function GithubSync() {
  const [token, setToken] = useState(() => readSetting<string>(GITHUB_TOKEN) ?? "");
  const [user, setUser] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const saved = !!readSetting<string>(GITHUB_TOKEN);

  useEffect(() => {
    if (saved) githubUser().then((u) => setUser(u.login), () => setUser(null));
  }, [saved]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    writeSetting(GITHUB_TOKEN, token.trim());
    setBusy(true);
    try {
      const u = await githubUser();
      setUser(u.login);
      await syncSegments();
      toast.success("Segments synced with your private gist");
    } catch {
      toast.error("GitHub rejected that token, or it lacks the Gists permission");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="Segment sync (GitHub Gist)">
      <form onSubmit={onSubmit} className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Saved segments and stars sync between devices through a secret gist on your GitHub account (free).
          Create a{" "}
          <a
            className="text-primary underline"
            href="https://github.com/settings/personal-access-tokens/new"
            target="_blank"
            rel="noreferrer"
          >
            fine-grained token
          </a>{" "}
          with only <span className="font-medium text-foreground">Gists: Read and write</span>.
        </p>
        <div className="space-y-1">
          <Label htmlFor="ghtoken">GitHub token</Label>
          <Input
            id="ghtoken"
            type="password"
            autoComplete="off"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="github_pat_…"
            required
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" disabled={busy || !token.trim()}>
            {busy ? "Syncing…" : "Save & sync"}
          </Button>
          {saved && (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                writeSetting(GITHUB_TOKEN, null);
                writeSetting(GIST_ID, null);
                setToken("");
                setUser(null);
              }}
            >
              Disconnect
            </Button>
          )}
          {user && <span className="text-xs text-muted-foreground">Connected as {user}</span>}
        </div>
      </form>
    </Panel>
  );
}

function Storage() {
  const qc = useQueryClient();
  const [persisted, setPersisted] = useState<boolean | null>(null);
  useEffect(() => {
    navigator.storage?.persisted?.().then(setPersisted, () => setPersisted(null));
  }, []);

  return (
    <Panel title="Offline storage">
      <div className="space-y-3 text-sm">
        <p className="text-muted-foreground">
          The latest data and every ride's streams are kept on this device so the app opens offline.
        </p>
        <p>
          Protected from browser clean-up:{" "}
          <span className="stat-num">{persisted == null ? "unknown" : persisted ? "yes" : "no"}</span>
        </p>
        <Button
          variant="outline"
          onClick={async () => {
            await clearIdb();
            qc.clear();
            toast.success("Cached data cleared");
          }}
        >
          Clear cached data
        </Button>
        <p className="stat-num text-xs text-muted-foreground">Cadence v{__APP_VERSION__}</p>
      </div>
    </Panel>
  );
}
