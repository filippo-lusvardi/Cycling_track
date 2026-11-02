import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ForestScene } from "@/components/forest/ForestScene";
import { Panel } from "@/components/StatCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { auth } from "@/lib/firebase";
import {
  defaultName,
  readInvite,
  requestToJoin,
  watchForest,
  watchMyRequest,
} from "@/lib/forest/forests";
import { t } from "@/lib/i18n";

export const Route = createFileRoute("/forest/join/$fid/$key")({
  head: () => ({ meta: [{ title: t("Join a forest — Cirmolo", "Entra in un bosco — Cirmolo") }] }),
  component: JoinForest,
});

/** Where an invite link lands: the forest's name, consent to share one's tree, and the request to join. */
function JoinForest() {
  const { fid, key } = Route.useParams();
  const [name, setName] = useState<string | null | undefined>(undefined);
  const [member, setMember] = useState(false);
  const [pending, setPending] = useState(false);
  useEffect(() => void readInvite(fid, key).then(setName), [fid, key]);
  useEffect(
    () => watchForest(fid, (f) => setMember(!!f?.members.includes(auth.currentUser?.uid ?? ""))),
    [fid],
  );
  useEffect(() => watchMyRequest(fid, setPending), [fid]);

  return (
    <div className="mx-auto max-w-md space-y-5">
      <div>
        <div className="eyebrow">{t("Forest invite", "Invito a un bosco")}</div>
        <h1 className="text-3xl font-bold tracking-tight">
          {name ?? (name === null ? t("Invite expired", "Invito scaduto") : "…")}
        </h1>
      </div>
      <div className="-mx-4 overflow-hidden sm:mx-0 sm:rounded-xl sm:border sm:border-border">
        <ForestScene seed={fid} trees={[{ uid: "you", name: "", header: undefined }]} />
      </div>
      {name === null ? (
        <p className="text-sm text-muted-foreground">
          {t(
            "This link no longer works: ask a member of the forest for a new one.",
            "Questo link non funziona più: chiedine uno nuovo a un membro del bosco.",
          )}
        </p>
      ) : member ? (
        <Panel title={t("You're in", "Ci sei")}>
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
              "A member will let you in soon. The forest will appear on your Forest page.",
              "Un membro ti accoglierà presto. Il bosco comparirà nella tua pagina Bosco.",
            )}
          </p>
        </Panel>
      ) : name ? (
        <JoinForm fid={fid} forestKey={key} forest={name} />
      ) : null}
    </div>
  );
}

function JoinForm({ fid, forestKey, forest }: { fid: string; forestKey: string; forest: string }) {
  const [me, setMe] = useState(defaultName);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <Panel title={t("Ask to join", "Chiedi di entrare")}>
      <form
        className="space-y-3 text-sm"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await requestToJoin(fid, forestKey, me);
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
        <label className="flex items-start gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
          />
          <span>
            {t(
              `I agree to share my tree with the members of "${forest}": the rides I choose to show, my fitness, and my crown each day, which reflects my readiness and form (from my check-in, HRV and sleep). I can hide rides, and leaving the forest removes my tree from it. See the`,
              `Acconsento a condividere il mio albero con i membri di "${forest}": le uscite che scelgo di mostrare, la mia forma fisica e la mia chioma di ogni giorno, che riflette prontezza e forma (da check-in, HRV e sonno). Posso nascondere le uscite, e lasciando il bosco il mio albero viene rimosso. Vedi l'`,
            )}{" "}
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
