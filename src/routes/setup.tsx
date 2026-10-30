import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, CircleAlert, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Panel } from "@/components/StatCard";
import { Button } from "@/components/ui/button";
import { syncSegments } from "@/hooks/use-segments";
import { githubUser } from "@/lib/gist";
import { getAthlete } from "@/lib/intervals";
import { API_KEY, GITHUB_TOKEN, SEGMENT_HISTORY, writeSetting } from "@/lib/settings";
import { parseSetupHash } from "@/lib/setup-link";

export const Route = createFileRoute("/setup")({
  head: () => ({ meta: [{ title: "Set up — Ora" }] }),
  component: SetupPage,
});

type State =
  | { step: "working" }
  | { step: "bad" }
  | { step: "done"; athlete: string | null; github: string | null | false }
  | { step: "rejected" };

/** Landing page of the "Copy setup to phone" QR: stores the keys from the #fragment and checks them. */
function SetupPage() {
  const qc = useQueryClient();
  // Read once on first render (effects may run twice in development, after the hash is already gone).
  const [data] = useState(() => parseSetupHash(window.location.hash));
  const [state, setState] = useState<State>({ step: "working" });

  useEffect(() => {
    // Drop the keys from the address bar and history straight away.
    if (window.location.hash) window.history.replaceState(null, "", window.location.pathname);
    if (!data) {
      setState({ step: "bad" });
      return;
    }
    writeSetting(API_KEY, data.apiKey);
    if (data.githubToken) writeSetting(GITHUB_TOKEN, data.githubToken);
    if (data.history != null) writeSetting(SEGMENT_HISTORY, data.history);
    void (async () => {
      try {
        const a = await getAthlete();
        let github: string | null | false = null;
        if (data.githubToken) {
          try {
            github = (await githubUser()).login;
            await syncSegments();
          } catch {
            github = false;
          }
        }
        await qc.invalidateQueries();
        setState({ step: "done", athlete: a.name, github });
      } catch {
        writeSetting(API_KEY, null);
        setState({ step: "rejected" });
      }
    })();
  }, [qc, data]);

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div>
        <div className="eyebrow">This device</div>
        <h1 className="text-3xl font-bold tracking-tight">Set up</h1>
      </div>
      <Panel title="Copy setup from your PC">
        {state.step === "working" && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Connecting to intervals.icu…
          </p>
        )}
        {state.step === "done" && (
          <div className="space-y-3 text-sm">
            <p className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-pine" />
              Connected to intervals.icu{state.athlete ? ` as ${state.athlete}` : ""}.
            </p>
            {state.github && <p className="text-muted-foreground">Segment sync on (GitHub: {state.github}).</p>}
            {state.github === false && (
              <p className="text-muted-foreground">The GitHub token didn't work; add it later in Settings.</p>
            )}
            <p className="text-muted-foreground">
              Install Ora from the browser menu: <b>Add to Home screen</b>. On iPhone, Home Screen apps keep their
              own storage: open the installed app and enter the keys in Settings there.
            </p>
            <Button asChild className="w-full">
              <Link to="/">Continue</Link>
            </Button>
          </div>
        )}
        {(state.step === "bad" || state.step === "rejected") && (
          <div className="space-y-3 text-sm">
            <p className="flex items-center gap-2">
              <CircleAlert className="h-5 w-5 text-lingon" />
              {state.step === "bad"
                ? "This link doesn't contain a valid setup. Show the QR again on your PC and rescan."
                : "intervals.icu didn't accept the key from the QR."}
            </p>
            <Button asChild variant="outline" className="w-full">
              <Link to="/settings">Enter the keys in Settings</Link>
            </Button>
          </div>
        )}
      </Panel>
    </div>
  );
}
