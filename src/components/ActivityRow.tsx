import { Link } from "@tanstack/react-router";
import { format, parseISO } from "date-fns";
import type { Activity } from "@/lib/intervals";
import { formatDuration, formatKm } from "@/lib/training";

export function ActivityRow({ a }: { a: Activity }) {
  const power = a.icu_weighted_avg_watts ?? a.icu_average_watts;
  return (
    <Link
      to="/rides/$id"
      params={{ id: a.id }}
      className="flex items-center justify-between gap-4 rounded-lg px-3 py-3 transition-colors hover:bg-secondary"
    >
      <div className="min-w-0">
        <div className="truncate font-medium">{a.name ?? a.type ?? "Activity"}</div>
        <div className="text-xs text-muted-foreground">
          {a.start_date_local ? format(parseISO(a.start_date_local), "EEE d MMM") : ""} · {a.type}
        </div>
      </div>
      <div className="stat-num flex shrink-0 gap-4 text-right text-sm">
        <span className="hidden sm:inline">{formatKm(a.distance)}</span>
        <span>{formatDuration(a.moving_time)}</span>
        <span className="hidden w-14 sm:inline">{power ? `${Math.round(power)}W` : "–"}</span>
        <span className="w-12 text-primary">{a.icu_training_load ?? "–"}</span>
      </div>
    </Link>
  );
}
