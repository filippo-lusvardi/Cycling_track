import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import type { Forest } from "@/lib/forest/forests";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export type Tab = "trees" | "climbs" | "members";
export const TABS: Tab[] = ["trees", "climbs", "members"];

export function Back() {
  return (
    <Link
      to="/forest"
      className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
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
      <Back />
      <div>
        <div className="eyebrow">{t("Forest", "Bosco")}</div>
        <h1 className="text-3xl font-bold tracking-tight">{forest.name}</h1>
      </div>
      <div className="flex gap-1 rounded-lg bg-secondary p-1">
        {TABS.map((k) => (
          <button
            key={k}
            onClick={() => onTab(k)}
            className={cn(
              "relative flex-1 rounded-md px-3 py-1.5 text-sm",
              tab === k ? "bg-background text-foreground" : "text-muted-foreground",
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
