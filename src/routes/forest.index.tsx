import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { OpenScene } from "@/components/forest/ForestScene";
import { ForestWorld } from "@/components/forest/ForestWorld";
import { ZoomSwitch } from "@/components/tree/ZoomSwitch";
import { ResponsiveDialog } from "@/components/ResponsiveDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createForest,
  defaultName,
  watchMembers,
  watchMyForests,
  watchRequests,
  type Forest,
  type Member,
} from "@/lib/forest/forests";
import { watchHeaders } from "@/lib/forest/trees";
import type { TreeHeader } from "@/lib/forest/types";
import { t } from "@/lib/i18n";

export const Route = createFileRoute("/forest/")({
  head: () => ({ meta: [{ title: t("Forest — Cirmolo", "Bosco — Cirmolo") }] }),
  component: ForestPage,
});

function ForestPage() {
  const navigate = useNavigate();
  const [forests, setForests] = useState<Forest[] | null>(null);
  const [planting, setPlanting] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(
    () =>
      watchMyForests(
        (f) => {
          setForests(f);
          setFailed(false);
        },
        () => setFailed(true),
      ),
    [],
  );
  const live = useWoods(forests ?? []);

  return (
    // Room at the bottom for the floating Tree · Years · Forest switch, so the clearing never hides under it.
    <div className="space-y-4 pb-16">
      <div>
        <div className="eyebrow">{t("Friends & teammates", "Amici e compagni")}</div>
        <h1 className="text-3xl font-bold tracking-tight">{t("Forest", "Bosco")}</h1>
      </div>
      {failed && (
        <p className="mx-auto max-w-xl rounded-lg border border-border bg-card p-3 text-sm text-muted-foreground">
          {t(
            "Your forests couldn't be loaded right now. Check the connection and open this page again.",
            "Non è stato possibile caricare i tuoi boschi. Controlla la connessione e riapri questa pagina.",
          )}
        </p>
      )}
      {/* Always drawn, even before the forests arrive or with none: its clearing is where the first one is planted. */}
      <OpenScene>
        {(w) => (
          <ForestWorld
            w={w}
            woods={(forests ?? []).map((f) => ({
              forest: f,
              trees: f.members.map((uid) => ({
                uid,
                name: live[f.id]?.members.find((m) => m.uid === uid)?.name ?? "",
                header: live[f.id]?.headers[uid],
              })),
              waiting: live[f.id]?.waiting ?? 0,
            }))}
            onOpen={(fid) => navigate({ to: "/forest/$fid", params: { fid } })}
            onPlant={() => setPlanting(true)}
          />
        )}
      </OpenScene>

      {!forests?.length && (
        <p className="mx-auto max-w-xl text-sm text-muted-foreground">
          {t(
            "Trees grow better together. Plant a forest and invite friends or teammates with a link: you'll see each other's trees, choose which rides to show, and race on the forest's climbs.",
            "Gli alberi crescono meglio insieme. Pianta un bosco e invita amici o compagni con un link: vedrete gli alberi degli altri, sceglierete quali uscite mostrare e vi sfiderete sulle salite del bosco.",
          )}
        </p>
      )}
      <ZoomSwitch active="forest" />
      <ResponsiveDialog
        open={planting}
        onOpenChange={setPlanting}
        title={t("Plant a forest", "Pianta un bosco")}
        description={t(
          "A forest for friends or teammates. You'll get a link to invite them.",
          "Un bosco per amici o compagni di squadra. Riceverai un link per invitarli.",
        )}
      >
        <PlantForm onDone={() => setPlanting(false)} />
      </ResponsiveDialog>
    </div>
  );
}

type Live = { headers: Record<string, TreeHeader>; members: Member[]; waiting: number };

/** Every forest's crowns, member names and waiting requests, live. */
function useWoods(forests: Forest[]): Record<string, Live> {
  const [live, setLive] = useState<Record<string, Live>>({});
  const ids = forests.map((f) => f.id).join(",");
  useEffect(() => {
    const patch = (fid: string, p: Partial<Live>) =>
      setLive((l) => ({ ...l, [fid]: { headers: {}, members: [], waiting: 0, ...l[fid], ...p } }));
    const stops = forests.flatMap((f) => [
      watchHeaders(f.id, (headers) => patch(f.id, { headers })),
      watchMembers(f.id, (members) => patch(f.id, { members })),
      watchRequests(f.id, (r) => patch(f.id, { waiting: r.length })),
    ]);
    return () => stops.forEach((s) => s());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids]);
  return live;
}

function PlantForm({ onDone }: { onDone: () => void }) {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [me, setMe] = useState(defaultName);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          const fid = await createForest(name, me);
          onDone();
          navigate({ to: "/forest/$fid", params: { fid }, search: { tab: "members" } });
        } catch (err) {
          console.warn("Couldn't plant the forest", err);
          toast.error(t("Couldn't plant the forest", "Impossibile piantare il bosco"));
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="space-y-1">
        <Label htmlFor="forest-name">{t("Forest name", "Nome del bosco")}</Label>
        <Input
          id="forest-name"
          maxLength={40}
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("Tuesday rides", "Uscite del martedì")}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="forest-me">
          {t("Your name in this forest", "Il tuo nome in questo bosco")}
        </Label>
        <Input
          id="forest-me"
          maxLength={40}
          required
          value={me}
          onChange={(e) => setMe(e.target.value)}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {t(
          "Members see your tree: the rides you share, your fitness and today's crown (readiness and form).",
          "I membri vedono il tuo albero: le uscite che condividi, la tua forma e la chioma di oggi (prontezza e forma).",
        )}
      </p>
      <Button type="submit" className="w-full" disabled={busy || !name.trim() || !me.trim()}>
        {t("Plant", "Pianta")}
      </Button>
    </form>
  );
}
