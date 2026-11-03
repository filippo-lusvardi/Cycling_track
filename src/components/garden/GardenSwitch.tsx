import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export type GardenView = "garden" | "pantry";

const LABEL: Record<GardenView, () => string> = {
  garden: () => t("Garden", "Orto"),
  pantry: () => t("Pantry", "Dispensa"),
};

/** The floating switch over the Garden, like the tree's: what's growing, and the pantry of past harvests. */
export function GardenSwitch({
  active,
  onView,
}: {
  active: GardenView;
  onView: (v: GardenView) => void;
}) {
  return (
    <div className="fixed inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-10 flex justify-center lg:bottom-6">
      <div
        className="flex gap-1 rounded-full border border-border bg-card/85 p-1 shadow-lg backdrop-blur"
        role="tablist"
        aria-label={t("View", "Vista")}
      >
        {(["garden", "pantry"] as const).map((v) => (
          <button
            key={v}
            role="tab"
            aria-selected={active === v}
            onClick={() => onView(v)}
            className={cn(
              "flex min-h-10 items-center rounded-full px-4 text-sm text-muted-foreground transition-colors",
              active === v && "bg-secondary text-foreground",
            )}
          >
            {LABEL[v]()}
          </button>
        ))}
      </div>
    </div>
  );
}
