import { ChevronDown } from "lucide-react";
import { createContext, useContext, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Inside an arranged page, a Panel's header closes it (see components/layout/Customizable). */
export const FoldContext = createContext<{ toggle: () => void } | null>(null);

export function StatCard({
  label,
  value,
  unit,
  hint,
  tone,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  hint?: ReactNode;
  tone?: "fitness" | "fatigue" | "form" | "weight";
}) {
  const toneClass = {
    fitness: "text-fitness",
    fatigue: "text-fatigue",
    form: "text-form",
    weight: "text-weight",
  }[tone ?? "weight"];
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="eyebrow">{label}</div>
      <div className={cn("stat-num mt-1 text-3xl font-semibold", tone && toneClass)}>
        {value}
        {unit && <span className="ml-1 text-sm text-muted-foreground">{unit}</span>}
      </div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

export function Panel({
  title,
  children,
  action,
  className,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const fold = useContext(FoldContext);
  return (
    <section className={cn("rounded-xl border border-border bg-card p-4", className)}>
      <div className="mb-3 flex items-center justify-between gap-2">
        {fold ? (
          <button
            type="button"
            onClick={fold.toggle}
            aria-expanded
            className="flex min-h-8 min-w-0 flex-1 items-center justify-between gap-2 text-left"
          >
            <h2 className="text-sm font-semibold">{title}</h2>
            {!action && <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />}
          </button>
        ) : (
          <h2 className="text-sm font-semibold">{title}</h2>
        )}
        {action}
        {fold && action && (
          <button
            type="button"
            onClick={fold.toggle}
            aria-label={title}
            aria-expanded
            className="flex h-8 w-8 shrink-0 items-center justify-center text-muted-foreground"
          >
            <ChevronDown className="h-4 w-4" />
          </button>
        )}
      </div>
      {/* Only the outermost Panel of a section folds. */}
      <FoldContext.Provider value={null}>{children}</FoldContext.Provider>
    </section>
  );
}
