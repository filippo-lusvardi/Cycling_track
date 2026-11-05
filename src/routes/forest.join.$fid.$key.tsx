import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ForestScene, OpenScene } from "@/components/forest/ForestScene";
import { Panel } from "@/components/StatCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { auth } from "@/lib/firebase";
import {
  defaultName,
  readInvite,
  requestToJoin,
  watchForest,
  watchMyRequest,
} from "@/lib/forest/forests";
import { t } from "@/lib/i18n";
import { sportWords, type MainSport } from "@/lib/sport";

export const Route = createFileRoute("/forest/join/$fid/$key")({
  component: JoinForest,
});

/** Where an invite link lands: the forest's name, consent to share one's tree, and the request to join. */
function JoinForest() {
  const { fid, key } = Route.useParams();
  const [invite, setInvite] = useState<Awaited<ReturnType<typeof readInvite>> | undefined>(
    undefined,
  );
  const name = invite === undefined ? undefined : (invite?.name ?? null);
  const [member, setMember] = useState(false);
  const [pending, setPending] = useState(false);
  useEffect(() => void readInvite(fid, key).then(setInvite), [fid, key]);
  useEffect(
    () => watchForest(fid, (f) => setMember(!!f?.members.includes(auth.currentUser?.uid ?? ""))),
    [fid],
  );
  useEffect(() => watchMyRequest(fid, setPending), [fid]);

  return (
    <div className="mx-auto max-w-md space-y-5">
      <div>
        <div className="eyebrow">
          {t("Forest invite", "Invito a un bosco")}
          {invite && ` · ${sportWords(invite.sport).name}`}
        </div>
        <h1 className="text-3xl font-bold tracking-tight">
          {name ?? (name === null ? t("Invite expired", "Invito scaduto") : "…")}
        </h1>
      </div>
      <OpenScene>
        {(w) => (
          <ForestScene seed={fid} trees={[{ uid: "you", name: "", header: undefined }]} w={w} />
        )}
      </OpenScene>
      {name === null ? (
        <p className="text-sm text-muted-foreground">
          {t(
            "This link no longer works: ask a member of the forest for a new one.",
            "Questo link non funziona più: chiedine uno nuovo a un membro del bosco.",
          )}
        </p>
      ) : member ? (
        <Panel title={t("You're in", "Sei dentro")}>
          <Button asChild className="w-full">
            <Link to="/forest/$fid" params={{ fid }}>
              {t("Open the forest", "Apri il bosco")}
            </Link>
          </Button>
        </Panel>
      ) : pending ? (
        <Panel title={t("Request sent", "Richiesta inviata")}>
          <p className="text-sm text-muted-foreground">
            {t(
              "A member will accept you soon. The forest will appear on your Forest page.",
              "Un membro ti accetterà presto. Il bosco comparirà nella tua pagina Bosco.",
            )}
          </p>
        </Panel>
      ) : invite ? (
        <JoinForm fid={fid} forestKey={key} forest={invite.name} sport={invite.sport} />
      ) : null}
    </div>
  );
}

function JoinForm({
  fid,
  forestKey,
  forest,
  sport,
}: {
  fid: string;
  forestKey: string;
  forest: string;
  sport: MainSport;
}) {
  const w = sportWords(sport);
  const [me, setMe] = useState(defaultName);
  const [consent, setConsent] = useState(false);
  const [past, setPast] = useState(true);
  const [maps, setMaps] = useState(true);
  // Heart rate is health data: off until they turn it on.
  const [effort, setEffort] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <Panel title={t("Ask to join", "Chiedi di entrare")}>
      <form
        className="space-y-3 text-sm"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await requestToJoin(fid, forestKey, me, past, maps, effort);
          } catch {
            toast.error(t("Couldn't send the request", "Impossibile inviare la richiesta"));
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="space-y-1">
          <Label htmlFor="join-name">
            {t("Your name in this forest", "Il tuo nome in questo bosco")}
          </Label>
          <Input
            id="join-name"
            maxLength={40}
            required
            value={me}
            onChange={(e) => setMe(e.target.value)}
          />
        </div>
        <label className="flex items-center justify-between gap-3">
          <span>
            <span className="block">
              {t(`Show my ${w.rides} from before joining`, `Mostra le mie ${w.uscite} di prima`)}
            </span>
            <span className="block text-xs text-muted-foreground">
              {t(
                "Off: your tree here starts from the day you join. You can change it later.",
                "Disattivato: qui il tuo albero parte dal giorno in cui entri. Puoi cambiarlo dopo.",
              )}
            </span>
          </span>
          <Switch checked={past} onCheckedChange={setPast} />
        </label>
        <label className="flex items-center justify-between gap-3">
          <span>
            <span className="block">
              {t(`Show my ${w.ride} maps`, `Mostra le mappe delle mie ${w.uscite}`)}
            </span>
            <span className="block text-xs text-muted-foreground">
              {t(
                `Members can open your ${w.rides} of the last year: the route without its first and last kilometre, and its altitude profile.`,
                `I membri possono aprire le tue ${w.uscite} dell'ultimo anno: il percorso senza il primo e l'ultimo chilometro, e l'altimetria.`,
              )}
            </span>
          </span>
          <Switch checked={maps} onCheckedChange={setMaps} />
        </label>
        <label className="flex items-center justify-between gap-3">
          <span>
            <span className="block">
              {t("Show my heart rate and power", "Mostra frequenza cardiaca e potenza")}
            </span>
            <span className="block text-xs text-muted-foreground">
              {t(
                `On those ${w.rides}: average and max heart rate, average and max power, normalized power.`,
                `Su quelle ${w.uscite}: frequenza cardiaca media e massima, potenza media e massima, potenza normalizzata.`,
              )}
            </span>
          </span>
          <Switch checked={effort} onCheckedChange={setEffort} />
        </label>
        <label className="flex items-start gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
          />
          <span>
            {t(
              `I agree to share my tree with the members of "${forest}": the ${w.rides} I choose to show (with their maps, heart rate and power if I turn those on above), my fitness, and my crown each day, which reflects my readiness and form (from my check-in, HRV and sleep). I can hide ${w.rides}, and leaving the forest removes my tree from it. See the `,
              `Acconsento a condividere il mio albero con i membri di "${forest}": le ${w.uscite} che scelgo di mostrare (con mappe, frequenza cardiaca e potenza se le attivo qui sopra), il mio fitness e la mia chioma di ogni giorno, che riflette readiness e forma (da check-in, HRV e sonno). Posso nascondere le ${w.uscite}, e lasciando il bosco il mio albero viene rimosso. Vedi l'`,
            )}
            <Link to="/privacy" className="underline">
              {t("privacy notice", "informativa privacy")}
            </Link>
            .
          </span>
        </label>
        <Button type="submit" className="w-full" disabled={busy || !consent || !me.trim()}>
          {t("Ask to join", "Chiedi di entrare")}
        </Button>
      </form>
    </Panel>
  );
}
