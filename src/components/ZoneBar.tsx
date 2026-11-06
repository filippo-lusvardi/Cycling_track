import { formatDuration } from "@/lib/training";
import { ZONE_NAMES } from "@/lib/analysis";
import { t } from "@/lib/i18n";

/** Time in zones Z1–Z7 as one stacked bar with a legend: power unless told otherwise. */
export function ZoneBar({
  secs,
  names = ZONE_NAMES,
  empty = t("No power-zone data.", "Nessun dato sulle zone di potenza."),
  legend = true,
}: {
  secs: number[];
  names?: string[];
  empty?: string;
  /** Off where there's no room: each part still names itself on hover. */
  legend?: boolean;
}) {
  const total = secs.reduce((a, b) => a + b, 0);
  if (!total) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <div>
      <div className="flex h-4 w-full overflow-hidden rounded-full bg-secondary">
        {secs.map((s, i) =>
          s > 0 ? (
            <div
              key={i}
              title={`Z${i + 1} ${names[i] ?? ""} · ${formatDuration(s)}`}
              style={{ width: `${(s / total) * 100}%`, background: `var(--z${i + 1})` }}
            />
          ) : null,
        )}
      </div>
      {legend && (
        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
          {secs.map((s, i) => (
            <div key={i} className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <span className="h-2 w-2 rounded-sm" style={{ background: `var(--z${i + 1})` }} />Z
                {i + 1} {names[i]}
              </span>
              <span className="stat-num">{Math.round((s / total) * 100)}%</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
