// On an activity: the bike or shoes it counts on, and a sheet to choose another. Hidden for activities no gear takes
// (swims, gym) and while there's no gear of that kind at all, so nobody is asked about gear they never added.
import { Check, ChevronRight, RotateCcw, X } from "lucide-react";
import { useState } from "react";
import { GearIcon } from "@/components/gear/GearDrawing";
import { ResponsiveDialog } from "@/components/ResponsiveDialog";
import { gearKindOf, gearOf, kmText, gearUseOf, type Gear } from "@/lib/gear";
import { setRideGear, useGearState } from "@/lib/gear-store";
import type { Activity } from "@/lib/intervals";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function RideGear({ a }: { a: Activity }) {
  const { gears, overrides } = useGearState();
  const [open, setOpen] = useState(false);
  const use = gearUseOf(a);
  if (!use) return null;
  const kind = gearKindOf(use);
  const choices = gears.filter((g) => g.kind === kind && !g.retired);
  if (!gears.some((g) => g.kind === kind)) return null;
  const on = gearOf(a, gears, overrides);
  const overridden = a.id in overrides;
  const km = (a.distance ?? 0) / 1000;
  const choose = (g: Gear | null | undefined) => {
    void setRideGear(a.id, g === undefined ? undefined : (g?.id ?? null));
    setOpen(false);
  };
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 inline-flex min-h-9 items-center gap-2 rounded-full border border-border bg-card px-3 text-sm"
      >
        {on ? (
          <GearIcon kind={on.kind} frame={on.frame} className="h-6 w-9" />
        ) : (
          <GearIcon kind={kind} className="h-6 w-9 opacity-40" />
        )}
        {on
          ? on.name
          : kind === "shoes"
            ? t("No shoes", "Nessuna scarpa")
            : t("No bike", "Nessuna bici")}
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
      </button>
      {open && (
        <ResponsiveDialog
          open
          onOpenChange={setOpen}
          title={
            kind === "shoes"
              ? t("Which shoes?", "Con quali scarpe?")
              : t("Which bike?", "Con quale bici?")
          }
        >
          <div>
            {choices.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => choose(g)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-secondary",
                  on?.id === g.id && "bg-secondary",
                )}
              >
                <GearIcon kind={g.kind} frame={g.frame} className="h-8 w-12 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{g.name}</span>
                  {g.uses.includes(use) && (
                    <span className="block text-xs text-muted-foreground">
                      {kind === "shoes"
                        ? t("The usual ones", "Quelle di sempre")
                        : t("The usual one", "Quella di sempre")}
                    </span>
                  )}
                </span>
                {on?.id === g.id && <Check className="h-4 w-4 text-primary" />}
              </button>
            ))}
            <button
              type="button"
              onClick={() => choose(null)}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-muted-foreground hover:bg-secondary",
                !on && "bg-secondary",
              )}
            >
              <X className="h-4 w-4" />
              {t("None", "Nessuna")}
            </button>
            {overridden && (
              <button
                type="button"
                onClick={() => choose(undefined)}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-muted-foreground hover:bg-secondary"
              >
                <RotateCcw className="h-4 w-4" />
                {kind === "shoes"
                  ? t("Back to the usual ones", "Torna a quelle di sempre")
                  : t("Back to the usual one", "Torna a quella di sempre")}
              </button>
            )}
          </div>
          {km > 0 && (
            <p className="mt-2 px-3 text-xs text-muted-foreground">
              {kind === "shoes"
                ? t(
                    `${kmText(km)} go on the pair you choose.`,
                    `${kmText(km)} passano sul paio scelto.`,
                  )
                : t(
                    `${kmText(km)} go on the bike you choose, chain and tyres included.`,
                    `${kmText(km)} passano sulla bici scelta, anche per catena e copertoni.`,
                  )}
            </p>
          )}
        </ResponsiveDialog>
      )}
    </>
  );
}
