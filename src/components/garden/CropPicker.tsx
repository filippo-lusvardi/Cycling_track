// Settings → Garden: which vegetable grows for which sport. Each sport shows its plant as it grows in the garden;
// tapping one opens every plant to choose from (picking one another sport grows swaps the two, so no two beds look
// alike). Sports of the user's own get a bed here too, as long as there's a plant left for them.
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
  allSports,
  assignCrop,
  CROP_NAME,
  cropFor,
  CROPS,
  customSportCount,
  customSportId,
  customSports,
  DEFAULT_CROPS,
  freeCrops,
  isCustom,
  removeCustomSport,
  resetCrops,
  sportName,
  SPORTS,
  suggestedSports,
  type Crop,
  type CropMap,
  type Sport,
} from "@/lib/garden";
import { t } from "@/lib/i18n";
import { allActivitiesQuery } from "@/lib/queries";
import { cn } from "@/lib/utils";

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

/** The four plants no sport grows by default: new to choose. */
const EXTRA = new Set(CROPS.filter((c) => !Object.values(DEFAULT_CROPS).includes(c)));

export function CropPicker() {
  const [map, setMap] = useCropMap();
  const [sport, setSport] = useState<Sport | null>(null);
  const [adding, setAdding] = useState(false);
  const changed = SPORTS.some((s) => map[s] !== DEFAULT_CROPS[s]);
  const room = freeCrops(map).length > 0;
  return (
    <Panel title={t("What grows for each sport", "Cosa cresce per ogni sport")}>
      <p className="text-sm text-muted-foreground">
        {t(
          "Each sport off the bike has its own bed in the garden. Choose what grows there.",
          "Ogni sport senza bici ha la sua aiuola nell'orto. Scegli cosa ci cresce.",
        )}
      </p>
      <ul className="-mx-2 mt-3 divide-y divide-border">
        {allSports(map).map((s) => (
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
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" disabled={!room} onClick={() => setAdding(true)}>
          {t("Add a sport", "Aggiungi uno sport")}
        </Button>
        {changed && (
          <Button variant="ghost" size="sm" onClick={() => setMap(resetCrops(map))}>
            {t("Back to the usual garden", "Torna all'orto di sempre")}
          </Button>
        )}
      </div>
      {!room && (
        <p className="mt-2 text-xs text-muted-foreground">
          {t(
            "Every plant is taken: remove one of your sports to add another.",
            "Tutte le piante sono occupate: togli uno dei tuoi sport per aggiungerne un altro.",
          )}
        </p>
      )}
      <AddSport open={adding} map={map} onMap={setMap} onClose={() => setAdding(false)} />

      <ResponsiveDialog
        open={sport != null}
        onOpenChange={(o) => !o && setSport(null)}
        title={sport ? sportName(map, sport) : ""}
        description={t(
          "What grows in its bed. A plant another sport grows trades places with this one.",
          "Cosa cresce nella sua aiuola. Una pianta di un altro sport fa cambio con questa.",
        )}
      >
        {sport && (
          <div className="grid grid-cols-3 gap-2 pb-2 sm:grid-cols-4">
            {CROPS.map((c) => {
              const holder = allSports(map).find((s) => s !== sport && cropFor(map, s) === c);
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
                  {EXTRA.has(c) && (
                    <span className="absolute right-1.5 top-1.5 rounded-full bg-secondary px-1.5 text-[10px] text-muted-foreground">
                      {t("New", "Nuova")}
                    </span>
                  )}
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
        {sport && isCustom(sport) && (
          <Button
            variant="ghost"
            size="sm"
            className="mb-2 text-destructive"
            onClick={() => {
              setMap(removeCustomSport(map, sport));
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

/** A new sport: a name (one of what's landing in "Other sports", or anything), then a plant no sport grows yet. */
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
  const { data: acts = [] } = useQuery({ ...allActivitiesQuery(), enabled: open });
  const [name, setName] = useState("");
  const close = () => {
    setName("");
    onClose();
  };
  const id = customSportId(name);
  const taken = customSports(map).some((c) => c.id === id);
  const ready = id != null && !taken;
  const count = ready ? customSportCount(acts, map, name) : 0;
  const suggestions = suggestedSports(acts, map).slice(0, 8);
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(o) => !o && close()}
      title={t("Add a sport", "Aggiungi uno sport")}
      description={t(
        "Activities of this type get their own bed, and so do other sports with its name in the title.",
        "Le attività di questo tipo avranno la loro aiuola, e così gli altri sport con questo nome nel titolo.",
      )}
    >
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={30}
        placeholder={t("Padel, tennis, football…", "Padel, tennis, calcio…")}
        aria-label={t("The sport's name", "Il nome dello sport")}
      />
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
      <p className="mt-2 min-h-4 text-xs text-muted-foreground" role="status">
        {taken
          ? t("You already have this sport.", "Hai già questo sport.")
          : ready
            ? t(
                `${count} of your activities would grow here.`,
                `${count} delle tue attività crescerebbero qui.`,
              )
            : ""}
      </p>
      <p className="mt-3 text-sm">{t("What grows there", "Cosa ci cresce")}</p>
      <div className="mt-2 grid grid-cols-3 gap-2 pb-2 sm:grid-cols-4">
        {freeCrops(map).map((c) => (
          <button
            key={c}
            type="button"
            disabled={!ready}
            onClick={() => {
              onMap(addCustomSport(map, name, c));
              close();
            }}
            className="flex flex-col items-center gap-1 rounded-lg border border-border p-2 text-center transition-colors enabled:hover:bg-secondary/40 disabled:opacity-40"
          >
            <CropArt crop={c} px={64} />
            <span className="text-xs">{CROP_NAME[c]()}</span>
          </button>
        ))}
      </div>
    </ResponsiveDialog>
  );
}
