import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

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
  return (
    <section className={cn("rounded-xl border border-border bg-card p-4", className)}>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
