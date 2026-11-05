import { Link } from "@tanstack/react-router";
import { useLocalStore } from "@/hooks/use-local-store";
import { t } from "@/lib/i18n";
import { CLASSIC_NAV } from "@/lib/settings";
import { cn } from "@/lib/utils";

export type Zoom = "tree" | "years";
export type View = Zoom | "forest";

const LABEL: Record<View, () => string> = {
  tree: () => t("Tree", "Albero"),
  years: () => t("Years", "Anni"),
  forest: () => t("Forest", "Bosco"),
};
const VIEWS: View[] = ["tree", "years", "forest"];

const pill = (on: boolean) =>
  cn(
    "flex min-h-10 items-center rounded-full px-4 text-sm text-muted-foreground transition-colors",
    on && "bg-secondary text-foreground",
  );

/**
 * The floating switch over the Tree: your tree, its rings by year, and the forest it grows in with friends. On the
 * Tree page `onZoom` switches between tree and years in place; elsewhere every option is a link.
 */
export function ZoomSwitch({ active, onZoom }: { active: View; onZoom?: (z: Zoom) => void }) {
  const [classic] = useLocalStore(CLASSIC_NAV, false);
  if (!classic) return null;
  return (
    <div className="fixed inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-10 flex justify-center lg:bottom-6">
      <div
        className="flex gap-1 rounded-full border border-border bg-card/85 p-1 shadow-lg backdrop-blur"
        role="tablist"
        aria-label={t("View", "Vista")}
      >
        {VIEWS.map((v) =>
          v !== "forest" && onZoom ? (
            <button
              key={v}
              role="tab"
              aria-selected={active === v}
              onClick={() => onZoom(v)}
              className={pill(active === v)}
            >
              {LABEL[v]()}
            </button>
          ) : (
            <Link
              key={v}
              role="tab"
              aria-selected={active === v}
              to={v === "forest" ? "/forest" : "/"}
              search={v === "years" ? { zoom: "years" } : {}}
              className={pill(active === v)}
            >
              {LABEL[v]()}
            </Link>
          ),
        )}
      </div>
    </div>
  );
}
