import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { get as idbGet, set as idbSet } from "idb-keyval";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { OpenScene, switchFit } from "@/components/forest/ForestScene";
import { ForestWorld } from "@/components/forest/ForestWorld";
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
import { uid } from "@/lib/firebase";
import { t } from "@/lib/i18n";
import { useScreenTrace } from "@/lib/perf";
import { mainSport, sportWords, type MainSport } from "@/lib/sport";

export const Route = createFileRoute("/forest/")({
  component: ForestPage,
});

function ForestPage() {
  const navigate = useNavigate();
  const [forests, setForests] = useState<Forest[] | null>(null);
  const [planting, setPlanting] = useState(false);
  const [failed, setFailed] = useState(false);
  /** Firestore has answered (otherwise what's drawn is the saved view). */
  const fresh = useRef(false);
  useEffect(
    () =>
      watchMyForests(
        (f) => {
          fresh.current = true;
          setForests(f);
          setFailed(false);
        },
        () => setFailed(true),
      ),
    [],
  );
  const [live, seedLive] = useWoods(forests ?? []);
  useScreenTrace("forest_open", forests !== null, !fresh.current);

  // The last view this device saw, drawn at once while the live listeners catch up; saved again as they report.
  const viewKey = `forest-view:${uid()}`;
  useEffect(() => {
    void idbGet<CachedView>(viewKey)
      .then((v) => {
        if (!v) return;
        setForests((f) => f ?? v.forests);
        seedLive(v.live);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewKey]);
  useEffect(() => {
    if (!forests) return;
    const t = setTimeout(() => void idbSet(viewKey, { forests, live }).catch(() => {}), 1000);
    return () => clearTimeout(t);
  }, [viewKey, forests, live]);

  return (
    // The scene runs to the window's foot behind the bottom bar, with nothing below it: the page's padding isn't wanted.
    <div className="-mb-32 space-y-4 lg:mb-0">
      <div className="on-sky">
        <div className="eyebrow text-foreground/75">
          {t("People you train with", "Chi si allena con te")}
        </div>
        <h1 className="text-3xl font-bold tracking-tight">{t("Forest", "Bosco")}</h1>
      </div>
      {failed && (
        <p className="mx-auto max-w-xl rounded-lg border border-border bg-card p-3 text-sm text-muted-foreground">
          {t(
            "Couldn't load your forests. Check the connection and open this page again.",
            "Impossibile caricare i tuoi boschi. Controlla la connessione e riapri questa pagina.",
          )}
        </p>
      )}
      {!forests?.length && (
        <p className="on-sky mx-auto max-w-xl text-sm text-foreground/85">
          {t(
            "Trees grow better together. Plant a forest and invite people you train with by link: you'll see each other's trees, choose which activities to show, and race on the forest's climbs.",
            "Gli alberi crescono meglio insieme. Pianta un bosco e invita con un link chi si allena con te: vedrete gli alberi degli altri, sceglierete quali attività mostrare e vi sfiderete sulle salite del bosco.",
          )}
        </p>
      )}
      {/* Always drawn, even before the forests arrive or with none: its clearing is where the first one is planted.
          Keyed on what stands above it, which moves its top and so the height that fits. */}
      <OpenScene key={`${failed}${!forests?.length}`}>
        {(w, fit) => (
          <ForestWorld
            w={w}
            {...switchFit(w, fit)}
            woods={(forests ?? []).map((f) => ({
              forest: f,
              trees: f.members.map((uid) => ({
                uid,
                name: live[f.id]?.members?.find((m) => m.uid === uid)?.name ?? "",
                header: live[f.id]?.headers?.[uid],
              })),
              waiting: live[f.id]?.waiting ?? 0,
            }))}
            onOpen={(fid) => navigate({ to: "/forest/$fid", params: { fid } })}
            onPlant={() => setPlanting(true)}
          />
        )}
      </OpenScene>
      <ResponsiveDialog
        open={planting}
        onOpenChange={setPlanting}
        title={t("Plant a forest", "Pianta un bosco")}
        description={t(
          "A forest for people you train with. You'll get a link to invite them.",
          "Un bosco per chi si allena con te. Riceverai un link da condividere.",
        )}
      >
        <PlantForm onDone={() => setPlanting(false)} />
      </ResponsiveDialog>
    </div>
  );
}

/** What the listeners (or the saved view) have reported so far for one forest. */
type Live = Partial<{ headers: Record<string, TreeHeader>; members: Member[]; waiting: number }>;
type CachedView = { forests: Forest[]; live: Record<string, Live> };

/**
 * Every forest's crowns, member names and waiting requests, live, and a way to seed them from a saved view (what the
 * listeners have already reported wins).
 */
function useWoods(
  forests: Forest[],
): [Record<string, Live>, (saved: Record<string, Live>) => void] {
  const [live, setLive] = useState<Record<string, Live>>({});
  const ids = forests.map((f) => f.id).join(",");
  useEffect(() => {
    const patch = (fid: string, p: Partial<Live>) =>
      setLive((l) => ({ ...l, [fid]: { ...l[fid], ...p } }));
    const stops = forests.flatMap((f) => [
      watchHeaders(f.id, (headers) => patch(f.id, { headers })),
      watchMembers(f.id, (members) => patch(f.id, { members })),
      watchRequests(f.id, (r) => patch(f.id, { waiting: r.length })),
    ]);
    return () => stops.forEach((s) => s());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids]);
  const seed = (saved: Record<string, Live>) =>
    setLive((l) =>
      Object.fromEntries(
        [...new Set([...Object.keys(saved), ...Object.keys(l)])].map((fid) => [
          fid,
          { ...saved[fid], ...l[fid] },
        ]),
      ),
    );
  return [live, seed];
}

function PlantForm({ onDone }: { onDone: () => void }) {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [me, setMe] = useState(defaultName);
  const [sport, setSport] = useState<MainSport>(mainSport);
  const [busy, setBusy] = useState(false);
  const w = sportWords(sport);
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          const fid = await createForest(name, me, sport);
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
        <Label>{t("Sport", "Sport")}</Label>
        <div className="flex gap-1 rounded-lg bg-secondary p-1">
          {(["ride", "run"] as const).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={sport === s}
              onClick={() => setSport(s)}
              className={`flex-1 rounded-md px-3 py-1.5 text-xs ${sport === s ? "bg-background text-foreground" : "text-muted-foreground"}`}
            >
              {sportWords(s).name}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          {t(
            `Everyone's tree and times here come from their ${w.rides}. It can't be changed later.`,
            `Qui l'albero e i tempi di tutti vengono dalle loro ${w.uscite}. Non si può cambiare dopo.`,
          )}
        </p>
      </div>
      <div className="space-y-1">
        <Label htmlFor="forest-name">{t("Forest name", "Nome del bosco")}</Label>
        <Input
          id="forest-name"
          maxLength={40}
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t(`Tuesday ${w.rides}`, `${w.Uscite} del martedì`)}
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
          `Members see your tree: the ${w.rides} you share, your fitness and today's crown (readiness and form).`,
          `I membri vedono il tuo albero: le ${w.uscite} che condividi, il tuo fitness e la chioma di oggi (readiness e forma).`,
        )}
      </p>
      <Button type="submit" className="w-full" disabled={busy || !name.trim() || !me.trim()}>
        {t("Plant", "Pianta")}
      </Button>
    </form>
  );
}
