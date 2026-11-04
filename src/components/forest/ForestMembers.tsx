import { useNavigate } from "@tanstack/react-router";
import { Copy, Share2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Panel } from "@/components/StatCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { auth } from "@/lib/firebase";
import {
  MAX_MEMBERS,
  forestSport,
  approve,
  decline,
  inviteLink,
  leaveForest,
  renewInvite,
  setMyForestPrefs,
  type Forest,
  type JoinRequest,
  type Member,
} from "@/lib/forest/forests";
import { sportWords } from "@/lib/sport";
import { republish } from "@/lib/forest/publish";
import { format, t } from "@/lib/i18n";

/** Inviting, approving, my settings for this forest, and leaving it. */
export function ForestMembers({
  forest,
  members,
  requests,
}: {
  forest: Forest;
  members: Member[];
  requests: JoinRequest[];
}) {
  const me = members.find((m) => m.uid === auth.currentUser?.uid);
  const full = forest.members.length >= MAX_MEMBERS;
  return (
    <div className="space-y-4">
      {requests.length > 0 && (
        <Panel title={t("Asking to join", "Chiedono di entrare")}>
          <ul className="divide-y divide-border">
            {requests.map((r) => (
              <li key={r.uid} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{r.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {format(r.at, "d MMM, HH:mm")}
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    disabled={full}
                    onClick={() =>
                      void approve(forest.id, r).catch((e) => {
                        console.warn("Couldn't let in", e);
                        toast.error(
                          t("Couldn't accept the request", "Impossibile accettare la richiesta"),
                        );
                      })
                    }
                  >
                    {t("Accept", "Accetta")}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      void decline(forest.id, r).catch(() =>
                        toast.error(t("Couldn't decline", "Impossibile rifiutare")),
                      )
                    }
                  >
                    {t("Decline", "Rifiuta")}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
          {full && (
            <p className="mt-2 text-xs text-muted-foreground">
              {t(
                `A forest holds up to ${MAX_MEMBERS} trees.`,
                `Un bosco contiene al massimo ${MAX_MEMBERS} alberi.`,
              )}
            </p>
          )}
        </Panel>
      )}
      <Invite forest={forest} />
      <Panel title={t("Members", "Membri")}>
        <ul className="divide-y divide-border">
          {[...members]
            .sort((a, b) => a.joinedAt - b.joinedAt)
            .map((m) => (
              <li key={m.uid} className="flex items-center justify-between gap-2 py-2 text-sm">
                <span className="truncate">
                  {m.name}
                  {m.uid === forest.createdBy && (
                    <span className="ml-1.5 text-xs text-muted-foreground">
                      {t("planted it", "l'ha piantato")}
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {t("since", "dal")} {format(m.joinedAt, "MMM yyyy")}
                </span>
              </li>
            ))}
        </ul>
      </Panel>
      {me && <MySettings forest={forest} me={me} />}
    </div>
  );
}

function Invite({ forest }: { forest: Forest }) {
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function get(renew = false) {
    setBusy(true);
    try {
      setLink(await (renew ? renewInvite(forest) : inviteLink(forest)));
    } catch {
      toast.error(t("Couldn't make the link", "Impossibile creare il link"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title={t("Invite", "Invita")}>
      <div className="space-y-3 text-sm">
        <p className="text-muted-foreground">
          {t(
            "Send this link to friends or teammates. Whoever opens it asks to join, and any member can accept.",
            "Manda questo link ad amici o compagni. Chi lo apre chiede di entrare, e qualsiasi membro può accettare.",
          )}
        </p>
        {link ? (
          <>
            <Input readOnly value={link} onFocus={(e) => e.target.select()} />
            <div className="flex flex-wrap gap-2">
              {typeof navigator.share === "function" && (
                <Button
                  onClick={() =>
                    void navigator
                      .share({
                        title: forest.name,
                        text: t(
                          `Join "${forest.name}" on Cirmolo`,
                          `Entra in "${forest.name}" su Cirmolo`,
                        ),
                        url: link,
                      })
                      .catch(() => {})
                  }
                >
                  <Share2 /> {t("Share", "Condividi")}
                </Button>
              )}
              <Button
                variant="outline"
                onClick={() =>
                  void navigator.clipboard
                    .writeText(link)
                    .then(() => toast.success(t("Link copied", "Link copiato")))
                }
              >
                <Copy /> {t("Copy", "Copia")}
              </Button>
              <Button variant="ghost" disabled={busy} onClick={() => void get(true)}>
                {t("New link", "Nuovo link")}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {t(
                "A new link stops the old one working.",
                "Il nuovo link disattiva quello vecchio.",
              )}
            </p>
          </>
        ) : (
          <Button disabled={busy} onClick={() => void get()}>
            {t("Show invite link", "Mostra il link di invito")}
          </Button>
        )}
      </div>
    </Panel>
  );
}

function MySettings({ forest, me }: { forest: Forest; me: Member }) {
  const w = sportWords(forestSport(forest));
  const navigate = useNavigate();
  const [name, setName] = useState(me.name);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <Panel title={t("You in this forest", "Tu in questo bosco")}>
      <div className="space-y-4 text-sm">
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) void setMyForestPrefs(forest.id, { name: name.trim().slice(0, 40) });
          }}
        >
          <div className="flex-1 space-y-1">
            <Label htmlFor="forest-my-name">{t("Your name here", "Il tuo nome qui")}</Label>
            <Input
              id="forest-my-name"
              maxLength={40}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <Button type="submit" variant="outline" disabled={!name.trim() || name === me.name}>
            {t("Save", "Salva")}
          </Button>
        </form>
        <label className="flex items-center justify-between gap-3">
          <span>
            <span className="block">
              {t(`Share new ${w.rides}`, `Condividi le nuove ${w.uscite}`)}
            </span>
            <span className="block text-xs text-muted-foreground">
              {t(
                `Off: new ${w.rides} stay hidden here until you show them from the ${w.ride}'s page.`,
                `Disattivato: le nuove ${w.uscite} restano nascoste qui finché non le mostri dalla pagina ${w.dellUscita}.`,
              )}
            </span>
          </span>
          <Switch
            checked={me.defaultShared}
            onCheckedChange={async (v) => {
              await setMyForestPrefs(forest.id, { defaultShared: v });
              republish();
            }}
          />
        </label>
        <label className="flex items-center justify-between gap-3">
          <span>
            <span className="block">
              {t(
                `Show ${w.rides} from before I joined`,
                `Mostra le ${w.uscite} di prima del mio ingresso`,
              )}
            </span>
            <span className="block text-xs text-muted-foreground">
              {t(
                `${w.Rides} before ${format(me.joinedAt, "d MMM yyyy")}. Off: your tree here starts that day.`,
                `${w.Uscite} prima del ${format(me.joinedAt, "d MMM yyyy")}. Disattivato: qui il tuo albero parte da quel giorno.`,
              )}
            </span>
          </span>
          <Switch
            checked={me.sharePast !== false}
            onCheckedChange={async (v) => {
              await setMyForestPrefs(forest.id, { sharePast: v });
              republish();
            }}
          />
        </label>
        <label className="flex items-center justify-between gap-3">
          <span>
            <span className="block">
              {t(`Show my ${w.ride} maps`, `Mostra le mappe delle mie ${w.uscite}`)}
            </span>
            <span className="block text-xs text-muted-foreground">
              {t(
                `Members can open your shared ${w.rides} of the last year: the route without its first and last kilometre, and its altitude profile.`,
                `I membri possono aprire le tue ${w.uscite} condivise dell'ultimo anno: il percorso senza il primo e l'ultimo chilometro, e l'altimetria.`,
              )}
            </span>
          </span>
          <Switch
            checked={me.shareRoutes === true}
            onCheckedChange={async (v) => {
              await setMyForestPrefs(forest.id, { shareRoutes: v });
              republish();
            }}
          />
        </label>
        <label className="flex items-center justify-between gap-3">
          <span>
            <span className="block">
              {t("Show my heart rate and power", "Mostra frequenza cardiaca e potenza")}
            </span>
            <span className="block text-xs text-muted-foreground">
              {t(
                `On your shared ${w.rides} of the last year: average and max heart rate, average and max power, normalized power.`,
                `Sulle tue ${w.uscite} condivise dell'ultimo anno: frequenza cardiaca media e massima, potenza media e massima, potenza normalizzata.`,
              )}
            </span>
          </span>
          <Switch
            checked={me.shareEffort === true}
            onCheckedChange={async (v) => {
              await setMyForestPrefs(forest.id, { shareEffort: v });
              republish();
            }}
          />
        </label>
        <div className="flex gap-2">
          {confirm && (
            <Button variant="ghost" onClick={() => setConfirm(false)}>
              {t("Cancel", "Annulla")}
            </Button>
          )}
          <Button
            variant={confirm ? "destructive" : "outline"}
            disabled={busy}
            onClick={async () => {
              if (!confirm) return setConfirm(true);
              setBusy(true);
              try {
                await leaveForest(forest);
                navigate({ to: "/forest" });
              } catch {
                toast.error(t("Couldn't leave the forest", "Impossibile lasciare il bosco"));
                setBusy(false);
              }
            }}
          >
            {confirm
              ? t("Leave for good", "Lascia definitivamente")
              : t("Leave forest", "Lascia il bosco")}
          </Button>
        </div>
        {confirm && (
          <p className="text-xs text-muted-foreground">
            {t(
              "Your tree and your times leave with you. You can come back with a new invite.",
              "Il tuo albero e i tuoi tempi se ne vanno con te. Puoi tornare con un nuovo invito.",
            )}
          </p>
        )}
      </div>
    </Panel>
  );
}
