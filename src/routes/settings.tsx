import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { clear as clearIdb } from "idb-keyval";
import { useEffect, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { Panel } from "@/components/StatCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { syncSegments } from "@/hooks/use-segments";
import { githubUser } from "@/lib/gist";
import { getAthlete } from "@/lib/intervals";
import QRCode from "qrcode";
import { historyYears, segmentEngine, startSegments } from "@/lib/segment-app";
import { canShareSetup, setupLink } from "@/lib/setup-link";
import {
  API_KEY,
  GIST_ID,
  GITHUB_TOKEN,
  SEGMENT_HISTORY,
  readSetting,
  writeSetting,
} from "@/lib/settings";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Settings — Ora" }] }),
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
        <SegmentAnalysis />
        <PhoneSetup />
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
    if (saved)
      githubUser().then(
        (u) => setUser(u.login),
        () => setUser(null),
      );
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
          Saved segments and stars sync between devices through a secret gist on your GitHub account
          (free). Create a{" "}
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

const HISTORY_OPTIONS = [
  [1, "1 year"],
  [2, "2 years"],
  [5, "5 years"],
  [0, "All"],
] as const;

function SegmentAnalysis() {
  const snap = useSyncExternalStore(segmentEngine.subscribe, segmentEngine.getSnapshot);
  const [years, setYears] = useState(historyYears);
  const [usage, setUsage] = useState<number | null>(null);
  const busy = snap.status.phase !== "idle" && snap.status.phase !== "error";
  useEffect(() => void startSegments(false), []);
  useEffect(() => {
    navigator.storage?.estimate?.().then(
      (e) => setUsage(e.usage ?? null),
      () => setUsage(null),
    );
  }, [snap.rides]);

  return (
    <Panel title="Segment analysis">
      <div className="space-y-3 text-sm">
        <p className="text-muted-foreground">
          Each outdoor ride is downloaded once and analysed on this device; after that only new
          rides are. More history finds more recurring climbs but takes longer the first time (and
          uses mobile data on the phone).
        </p>
        <div className="space-y-1">
          <Label>History to analyse</Label>
          <div className="flex gap-1 rounded-lg bg-secondary p-1">
            {HISTORY_OPTIONS.map(([y, label]) => (
              <button
                key={y}
                onClick={() => {
                  setYears(y);
                  writeSetting(SEGMENT_HISTORY, y);
                }}
                className={`flex-1 rounded-md px-3 py-1.5 text-xs ${years === y ? "bg-background text-foreground" : "text-muted-foreground"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <p className="stat-num text-xs text-muted-foreground">
          {snap.rides} rides analysed · {snap.groups.length} climbs found
          {usage != null && ` · ${(usage / 1e6).toFixed(0)} MB stored by Ora`}
          {snap.lastSync && ` · last sync ${new Date(snap.lastSync).toLocaleString()}`}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button disabled={busy} onClick={() => void segmentEngine.sync()}>
            {busy ? "Working…" : "Sync now"}
          </Button>
          <Button variant="outline" disabled={busy} onClick={() => void segmentEngine.rebuild()}>
            Re-analyse
          </Button>
          <Button
            variant="outline"
            disabled={busy}
            onClick={async () => {
              await segmentEngine.clear();
              toast.success("Downloaded rides deleted; they'll be fetched again on the next sync");
            }}
          >
            Delete downloaded rides
          </Button>
        </div>
      </div>
    </Panel>
  );
}

const QR_SECONDS = 60;

/** QR with a setup link (keys in the #fragment) so the phone needs no typing. Shown only on request. */
function PhoneSetup() {
  const [svg, setSvg] = useState<string | null>(null);
  const [left, setLeft] = useState(0);
  const key = readSetting<string>(API_KEY);
  const token = readSetting<string>(GITHUB_TOKEN);
  const shareable = canShareSetup(window.location);

  useEffect(() => {
    if (!svg) return;
    if (left <= 0) {
      setSvg(null);
      return;
    }
    const id = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [svg, left]);

  async function show() {
    if (!key) return;
    const link = setupLink(window.location.origin, {
      apiKey: key,
      ...(token ? { githubToken: token } : {}),
      history: historyYears(),
    });
    setSvg(
      await QRCode.toString(link, {
        type: "svg",
        margin: 1,
        errorCorrectionLevel: "M",
        color: { dark: "#0b1220", light: "#ffffff" },
      }),
    );
    setLeft(QR_SECONDS);
  }

  return (
    <Panel title="Copy setup to phone">
      <div className="space-y-3 text-sm">
        <p className="text-muted-foreground">
          Scan with the phone's camera to open Ora there with your intervals.icu key
          {token ? ", GitHub token" : ""} and history setting already filled in.
        </p>
        {!shareable ? (
          <p className="rounded-lg bg-secondary/60 p-3 text-xs text-muted-foreground">
            The phone can't open this page's address ({window.location.host}). Open Ora from its
            hosted https address, then come back here.
          </p>
        ) : !key ? (
          <p className="text-xs text-muted-foreground">Connect intervals.icu above first.</p>
        ) : svg ? (
          <div className="space-y-2">
            <div
              className="mx-auto w-56 rounded-lg bg-white p-2 [&_svg]:h-auto [&_svg]:w-full"
              aria-label="Setup QR code"
              // Generated locally by the qrcode library from our own link.
              dangerouslySetInnerHTML={{ __html: svg }}
            />
            <p className="text-center text-xs text-muted-foreground">
              Contains: intervals.icu key{token ? " · GitHub token" : ""} · history setting. Hides
              in {left} s.
            </p>
            <Button variant="outline" className="w-full" onClick={() => setSvg(null)}>
              Hide
            </Button>
          </div>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              Anyone who photographs the code gets your keys: show it only to your own phone.
            </p>
            <Button onClick={show}>Show QR</Button>
          </>
        )}
      </div>
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
          <span className="stat-num">
            {persisted == null ? "unknown" : persisted ? "yes" : "no"}
          </span>
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
        <p className="stat-num text-xs text-muted-foreground">Ora v{__APP_VERSION__}</p>
      </div>
    </Panel>
  );
}
