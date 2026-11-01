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
import { t } from "@/lib/i18n";

export const Route = createFileRoute("/setup")({
  head: () => ({ meta: [{ title: t("Set up — Cirmolo", "Configurazione — Cirmolo") }] }),
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
        <div className="eyebrow">{t("This device", "Questo dispositivo")}</div>
        <h1 className="text-3xl font-bold tracking-tight">{t("Set up", "Configurazione")}</h1>
      </div>
      <Panel title={t("Copy setup from your PC", "Copia configurazione dal PC")}>
        {state.step === "working" && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> {t("Connecting to intervals.icu…", "Connessione a intervals.icu…")}
          </p>
        )}
        {state.step === "done" && (
          <div className="space-y-3 text-sm">
            <p className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-pine" />
              {state.athlete
                ? t(`Connected to intervals.icu as ${state.athlete}.`, `Connesso a intervals.icu come ${state.athlete}.`)
                : t("Connected to intervals.icu.", "Connesso a intervals.icu.")}
            </p>
            {state.github && <p className="text-muted-foreground">{t("Segment sync on", "Sincronizzazione segmenti attiva")} (GitHub: {state.github}).</p>}
            {state.github === false && (
              <p className="text-muted-foreground">{t("The GitHub token didn't work; add it later in Settings.", "Il token GitHub non ha funzionato; aggiungilo poi nelle Impostazioni.")}</p>
            )}
            <p className="text-muted-foreground">
              {t("Install Cirmolo from the browser menu:", "Installa Cirmolo dal menu del browser:")}{" "}
              <b>{t("Add to Home screen", "Aggiungi a schermata Home")}</b>.{" "}
              {t(
                "On iPhone, Home Screen apps keep their own storage: open the installed app and enter the keys in Settings there.",
                "Su iPhone le app della schermata Home hanno un archivio proprio: apri l'app installata e inserisci lì le chiavi nelle Impostazioni.",
              )}
            </p>
            <Button asChild className="w-full">
              <Link to="/">{t("Continue", "Continua")}</Link>
            </Button>
          </div>
        )}
        {(state.step === "bad" || state.step === "rejected") && (
          <div className="space-y-3 text-sm">
            <p className="flex items-center gap-2">
              <CircleAlert className="h-5 w-5 text-lingon" />
              {state.step === "bad"
                ? t(
                    "This link doesn't contain a valid setup. Show the QR again on your PC and rescan.",
                    "Questo link non contiene una configurazione valida. Mostra di nuovo il QR sul PC e riscansiona.",
                  )
                : t("intervals.icu didn't accept the key from the QR.", "intervals.icu non ha accettato la chiave del QR.")}
            </p>
            <Button asChild variant="outline" className="w-full">
              <Link to="/settings">{t("Enter the keys in Settings", "Inserisci le chiavi nelle Impostazioni")}</Link>
            </Button>
          </div>
        )}
      </Panel>
    </div>
  );
}
