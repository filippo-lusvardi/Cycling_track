// Small pieces of the Routes pages: chips, a route's drawn shape, a profile sparkline, a stat.
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Chip({
  on,
  children,
  icon: Icon,
  onClick,
  disabled,
}: {
  on?: boolean;
  children: ReactNode;
  icon?: LucideIcon;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={on}
      className={cn(
        "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors disabled:opacity-50",
        on
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-secondary text-foreground hover:bg-secondary/70",
      )}
    >
      {Icon && <Icon className="h-3.5 w-3.5" />}
      {children}
    </button>
  );
}

export function Stat({ v, u, l }: { v: string; u?: string; l: string }) {
  return (
    <div className="min-w-0">
      <div className="stat-num truncate text-lg font-semibold sm:text-xl">
        {v}
        {u && <span className="ml-1 text-xs text-muted-foreground">{u}</span>}
      </div>
      <div className="truncate text-xs text-muted-foreground">{l}</div>
    </div>
  );
}

/** The route as a small drawing, north up. */
export function Shape({
  lat,
  lng,
  className,
  color = "currentColor",
}: {
  lat: number[];
  lng: number[];
  className?: string;
  color?: string;
}) {
  if (lat.length < 2) return <svg viewBox="0 0 100 100" className={className} />;
  const la0 = Math.min(...lat),
    la1 = Math.max(...lat),
    lo0 = Math.min(...lng),
    lo1 = Math.max(...lng);
  const k = Math.cos((((la0 + la1) / 2) * Math.PI) / 180);
  const sx = (lo1 - lo0) * k,
    sy = la1 - la0,
    s = Math.max(sx, sy, 1e-6);
  const step = Math.max(1, Math.floor(lat.length / 150));
  const pts: string[] = [];
  for (let i = 0; i < lat.length; i += step)
    pts.push(
      `${(4 + (((lng[i]! - lo0) * k + (s - sx) / 2) / s) * 92).toFixed(1)},${(4 + ((la1 - lat[i]! + (s - sy) / 2) / s) * 92).toFixed(1)}`,
    );
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden>
      <polyline
        points={pts.join(" ")}
        fill="none"
        stroke={color}
        strokeWidth={3.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Altitude along the route, filled. */
export function Spark({
  dist,
  alt,
  className,
}: {
  dist: number[];
  alt: number[];
  className?: string;
}) {
  if (dist.length < 2) return null;
  const lo = Math.min(...alt),
    hi = Math.max(...alt),
    D = dist.at(-1)! || 1;
  const step = Math.max(1, Math.floor(dist.length / 200));
  const pts: string[] = [];
  for (let i = 0; i < dist.length; i += step)
    pts.push(
      `${((dist[i]! / D) * 100).toFixed(1)},${(28 - ((alt[i]! - lo) / (hi - lo || 1)) * 26).toFixed(1)}`,
    );
  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" className={className} aria-hidden>
      <polygon points={`0,30 ${pts.join(" ")} 100,30`} fill="var(--primary)" opacity={0.25} />
      <polyline
        points={pts.join(" ")}
        fill="none"
        stroke="var(--primary)"
        strokeWidth={1.2}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
