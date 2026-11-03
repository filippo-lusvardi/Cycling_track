import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import type { Forest } from "@/lib/forest/forests";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { SkyLand } from "@/components/sky/SkyPage";

export type Tab = "trees" | "climbs" | "members";
export const TABS: Tab[] = ["trees", "climbs", "members"];

export function Back() {
  return (
    <Link
      to="/forest"
      className="on-sky inline-flex items-center gap-1 text-sm text-foreground/85 hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" /> {t("Forest", "Bosco")}
    </Link>
  );
}

/** The forest's page around its tabs. */
export function ForestLayout({
  forest,
  tab,
  waiting,
  onTab,
  children,
}: {
  forest: Forest;
  tab: Tab;
  waiting: number;
  onTab: (t: Tab) => void;
  children: ReactNode;
}) {
  const label: Record<Tab, string> = {
    trees: t("Trees", "Alberi"),
    climbs: t("Climbs", "Salite"),
    members: t("Members", "Membri"),
  };
  return (
    <div className="space-y-5">
      {/* Trees and climbs draw their own land under the page's sky; members float over a landscape. */}
      {tab === "members" && <SkyLand />}
      <Back />
      <div className="on-sky">
        <div className="eyebrow text-foreground/75">{t("Forest", "Bosco")}</div>
        <h1 className="text-3xl font-bold tracking-tight">{forest.name}</h1>
      </div>
      <div className="glass flex gap-1 rounded-lg p-1">
        {TABS.map((k) => (
          <button
            key={k}
            onClick={() => onTab(k)}
            className={cn(
              "relative flex-1 rounded-md px-3 py-1.5 text-sm",
              tab === k
                ? "bg-background/70 text-foreground shadow-sm"
                : "text-foreground/70 hover:text-foreground",
            )}
          >
            {label[k]}
            {k === "members" && waiting > 0 && (
              <span className="absolute right-2 top-1.5 h-2 w-2 rounded-full bg-primary" />
            )}
          </button>
        ))}
      </div>
      {children}
    </div>
  );
}
