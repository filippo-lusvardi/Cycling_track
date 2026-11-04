// Settings → Garden: the sports in the garden, and which vegetable grows for each. Your activities fill it (a new sport
// gets a bed and a random vegetable, see growNewSports); "Add a sport" adds one by hand, from the list or by a name of
// your own. Tapping a sport changes its plant (picking one another sport grows swaps the two, so no two beds look
// alike) or removes it.
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Plant, type Look } from "@/components/garden/Crops";
import { ResponsiveDialog } from "@/components/ResponsiveDialog";
import { Panel } from "@/components/StatCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCropMap } from "@/hooks/use-crop-map";
import {
  addCustomSport,
  addSport,
  allSports,
  assignCrop,
  CROP_NAME,
  cropFor,
  CROPS,
  customSportCount,
  customSportId,
  customSports,
  freeCrops,
  removeSport,
  SPORT_NAME,
  sportCounts,
  sportName,
  sportsToAdd,
  suggestedSports,
  type BuiltinSport,
  type Crop,
  type CropMap,
  type Sport,
} from "@/lib/garden";
import { t } from "@/lib/i18n";
import { allActivitiesQuery } from "@/lib/queries";
import { hasSource } from "@/lib/source";
import { cn } from "@/lib/utils";
import { mainSport } from "@/lib/sport";

/** A plant at its best: grown, ripe, in summer. */
const SHOWN: Look = {
  size: 0.8,
  vigor: 0.7,
  fruit: 3,
  ripeness: 1,
  intensity: null,
  seed: 0.42,
  season: "summer",
};

/** One plant drawn on its patch of soil, `px` wide. */
function CropArt({ crop, px }: { crop: Crop; px: number }) {
  return (
    <svg viewBox="-22 -40 44 44" width={px} height={px} aria-hidden className="shrink-0">
      <ellipse
        cx={0}
        cy={1}
        rx={17}
        ry={3.2}
        fill="color-mix(in oklab, var(--bark) 55%, var(--scene-background))"
      />
      <Plant crop={crop} l={SHOWN} x={0} y={0} s={crop === "lily" ? 1.3 : 0.95} />
    </svg>
  );
}

export function CropPicker() {
  const { data: acts } = useQuery({ ...allActivitiesQuery(), enabled: hasSource() });
  const [map, setMap] = useCropMap(acts);
  const [sport, setSport] = useState<Sport | null>(null);
  const [adding, setAdding] = useState(false);
  const main = mainSport();
  const sports = allSports(map, main);
  const room = freeCrops(map).length > 0;
  return (
    <Panel title={t("What grows in the garden", "Cosa cresce nell'orto")}>
      <p className="text-sm text-muted-foreground">
        {t(
          "Each sport you do gets its own bed, with a vegetable picked at random the first time. Change it, or remove the sport, whenever you like.",
          "Ogni sport che fai ha la sua aiuola, con un ortaggio scelto a caso la prima volta. Puoi cambiarlo, o togliere lo sport, quando vuoi.",
        )}
      </p>
      {sports.length > 0 && (
        <ul className="-mx-2 mt-3 divide-y divide-border">
          {sports.map((s) => (
            <li key={s}>
              <button
                type="button"
                onClick={() => setSport(s)}
                className="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-secondary/40"
              >
                <CropArt crop={cropFor(map, s)} px={44} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm">{sportName(map, s)}</span>
                  <span className="block text-xs text-muted-foreground">
                    {CROP_NAME[cropFor(map, s)]()}
                  </span>
                </span>
                <span className="text-xs text-primary">{t("Change", "Cambia")}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3">
        <Button variant="outline" size="sm" disabled={!room} onClick={() => setAdding(true)}>
          {t("Add a sport", "Aggiungi uno sport")}
        </Button>
      </div>
      {!room && (
        <p className="mt-2 text-xs text-muted-foreground">
          {t(
            "Every plant is taken: remove a sport to add another.",
            "Tutte le piante sono occupate: togli uno sport per aggiungerne un altro.",
          )}
        </p>
      )}
      <AddSport open={adding} map={map} onMap={setMap} onClose={() => setAdding(false)} />

      <ResponsiveDialog
        open={sport != null}
        onOpenChange={(o) => !o && setSport(null)}
        title={sport ? sportName(map, sport) : ""}
        description={t(
          "What grows in its bed. A plant another sport grows trades places with this one. Removed, the sport stays out of the garden until you add it again.",
          "Cosa cresce nella sua aiuola. Una pianta di un altro sport fa cambio con questa. Se lo togli, lo sport resta fuori dall'orto finché non lo aggiungi di nuovo.",
        )}
      >
        {sport && (
          <div className="grid grid-cols-3 gap-2 pb-2 sm:grid-cols-4">
            {CROPS.map((c) => {
              const holder = sports.find((s) => s !== sport && cropFor(map, s) === c);
              const current = cropFor(map, sport) === c;
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => {
                    setMap(assignCrop(map, sport, c));
                    setSport(null);
                  }}
                  aria-pressed={current}
                  className={cn(
                    "relative flex flex-col items-center gap-1 rounded-lg border p-2 text-center transition-colors",
                    current
                      ? "border-primary bg-primary/10"
                      : "border-border hover:bg-secondary/40",
                  )}
                >
                  <CropArt crop={c} px={64} />
                  <span className="text-xs">{CROP_NAME[c]()}</span>
                  <span className="min-h-4 text-[10px] leading-tight text-muted-foreground">
                    {current ? t("Now", "Adesso") : holder ? sportName(map, holder) : ""}
                  </span>
                </button>
              );
            })}
          </div>
        )}
        {sport && (
          <Button
            variant="ghost"
            size="sm"
            className="mb-2 text-destructive"
            onClick={() => {
              setMap(removeSport(map, sport));
              setSport(null);
            }}
          >
            {t("Remove this sport", "Togli questo sport")}
          </Button>
        )}
      </ResponsiveDialog>
    </Panel>
  );
}

/** A new bed: a sport from the list, or a name of your own (what's in "Other sports", or anything); then its plant. */
function AddSport({
  open,
  map,
  onMap,
  onClose,
}: {
  open: boolean;
  map: CropMap;
  onMap: (next: CropMap) => void;
  onClose: () => void;
}) {
  const { data: acts = [] } = useQuery({ ...allActivitiesQuery(), enabled: open && hasSource() });
  const [name, setName] = useState("");
  /** The sport picked, going on to its plant: one from the list, or the name written. */
  const [picked, setPicked] = useState<BuiltinSport | "own" | null>(null);
  const close = () => {
    setName("");
    setPicked(null);
    onClose();
  };
  const main = mainSport();
  const id = customSportId(name);
  const taken = customSports(map).some((c) => c.id === id);
  const ready = id != null && !taken;
  const count = ready ? customSportCount(acts, map, name) : 0;
  const suggestions = suggestedSports(acts, map).slice(0, 8);
  const counts = sportCounts(acts, map, main);
  // What you've done most comes first, then the usual order.
  const known = sportsToAdd(map, main).sort((a, b) => (counts[b] ?? 0) - (counts[a] ?? 0));
  const title =
    picked === "own"
      ? name.trim()
      : picked
        ? SPORT_NAME[picked]()
        : t("Add a sport", "Aggiungi uno sport");
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(o) => !o && close()}
      title={title}
      description={
        picked
          ? t("What grows in its bed.", "Cosa cresce nella sua aiuola.")
          : t(
              "Choose one from the list, or name your own. Then choose what grows for it.",
              "Scegline uno dall'elenco o dagli un nome tuo. Poi scegli cosa ci cresce.",
            )
      }
    >
      {picked ? (
        <>
          <div className="grid grid-cols-3 gap-2 pb-2 sm:grid-cols-4">
            {freeCrops(map).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => {
                  onMap(picked === "own" ? addCustomSport(map, name, c) : addSport(map, picked, c));
                  close();
                }}
                className="flex flex-col items-center gap-1 rounded-lg border border-border p-2 text-center transition-colors hover:bg-secondary/40"
              >
                <CropArt crop={c} px={64} />
                <span className="text-xs">{CROP_NAME[c]()}</span>
              </button>
            ))}
          </div>
          <Button variant="ghost" size="sm" className="mb-2" onClick={() => setPicked(null)}>
            {t("Back", "Indietro")}
          </Button>
        </>
      ) : (
        <>
          <ul className="-mx-2 divide-y divide-border">
            {known.map((s) => (
              <li key={s}>
                <button
                  type="button"
                  onClick={() => setPicked(s)}
                  className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-2.5 text-left text-sm transition-colors hover:bg-secondary/40"
                >
                  <span className="min-w-0">
                    <span className="block">{SPORT_NAME[s]()}</span>
                    {s === "other" && (
                      <span className="block text-xs text-muted-foreground">
                        {t(
                          "Activities with no sport of their own",
                          "Le attività senza uno sport proprio",
                        )}
                      </span>
                    )}
                  </span>
                  {(counts[s] ?? 0) > 0 && (
                    <span className="stat-num shrink-0 text-xs text-muted-foreground">
                      {t(
                        `${counts[s]} ${counts[s] === 1 ? "activity" : "activities"}`,
                        `${counts[s]} attività`,
                      )}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm">{t("Or a sport of your own", "Oppure uno sport tuo")}</p>
          <form
            className="mt-2 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (ready) setPicked("own");
            }}
          >
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={30}
              placeholder={t("Padel, tennis, football…", "Padel, tennis, calcio…")}
              aria-label={t("The sport's name", "Il nome dello sport")}
            />
            <Button type="submit" variant="secondary" disabled={!ready}>
              {t("Next", "Avanti")}
            </Button>
          </form>
          {suggestions.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {suggestions.map((s) => (
                <button
                  key={s.name}
                  type="button"
                  onClick={() => setName(s.name)}
                  className="rounded-full border border-border px-2.5 py-1 text-xs transition-colors hover:bg-secondary/40"
                >
                  {s.name} <span className="text-muted-foreground">{s.count}</span>
                </button>
              ))}
            </div>
          )}
          <p className="mt-2 min-h-4 pb-2 text-xs text-muted-foreground" role="status">
            {taken
              ? t("You already have this sport.", "Hai già questo sport.")
              : ready
                ? t(
                    `${count} of your activities would grow here.`,
                    `${count} delle tue attività crescerebbero qui.`,
                  )
                : ""}
          </p>
        </>
      )}
    </ResponsiveDialog>
  );
}
