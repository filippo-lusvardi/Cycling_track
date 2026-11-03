// Settings → Garden: which vegetable grows for which sport. Each sport shows its plant as it grows in the garden;
// tapping one opens every plant to choose from (picking one another sport grows swaps the two, so no two beds look
// alike).
import { useState } from "react";
import { Plant, type Look } from "@/components/garden/Crops";
import { ResponsiveDialog } from "@/components/ResponsiveDialog";
import { Panel } from "@/components/StatCard";
import { Button } from "@/components/ui/button";
import { useCropMap } from "@/hooks/use-crop-map";
import {
  assignCrop,
  CROP_NAME,
  CROPS,
  DEFAULT_CROPS,
  SPORT_NAME,
  SPORTS,
  type Crop,
  type Sport,
} from "@/lib/garden";
import { t } from "@/lib/i18n";
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
        fill="color-mix(in oklab, var(--bark) 55%, var(--background))"
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
  const changed = SPORTS.some((s) => map[s] !== DEFAULT_CROPS[s]);
  return (
    <Panel title={t("What grows for each sport", "Cosa cresce per ogni sport")}>
      <p className="text-sm text-muted-foreground">
        {t(
          "Each sport off the bike has its own bed in the garden. Choose what grows there.",
          "Ogni sport senza bici ha la sua aiuola nell'orto. Scegli cosa ci cresce.",
        )}
      </p>
      <ul className="-mx-2 mt-3 divide-y divide-border">
        {SPORTS.map((s) => (
          <li key={s}>
            <button
              type="button"
              onClick={() => setSport(s)}
              className="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-secondary/40"
            >
              <CropArt crop={map[s]} px={44} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm">{SPORT_NAME[s]()}</span>
                <span className="block text-xs text-muted-foreground">{CROP_NAME[map[s]]()}</span>
              </span>
              <span className="text-xs text-primary">{t("Change", "Cambia")}</span>
            </button>
          </li>
        ))}
      </ul>
      {changed && (
        <Button
          variant="ghost"
          size="sm"
          className="mt-2"
          onClick={() => setMap({ ...DEFAULT_CROPS })}
        >
          {t("Back to the usual garden", "Torna all'orto di sempre")}
        </Button>
      )}

      <ResponsiveDialog
        open={sport != null}
        onOpenChange={(o) => !o && setSport(null)}
        title={sport ? SPORT_NAME[sport]() : ""}
        description={t(
          "What grows in its bed. A plant another sport grows trades places with this one.",
          "Cosa cresce nella sua aiuola. Una pianta di un altro sport fa cambio con questa.",
        )}
      >
        {sport && (
          <div className="grid grid-cols-3 gap-2 pb-2 sm:grid-cols-4">
            {CROPS.map((c) => {
              const holder = SPORTS.find((s) => s !== sport && map[s] === c);
              const current = map[sport] === c;
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
                    {current ? t("Now", "Adesso") : holder ? SPORT_NAME[holder]() : ""}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </ResponsiveDialog>
    </Panel>
  );
}
