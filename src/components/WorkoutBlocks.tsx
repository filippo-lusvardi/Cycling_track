import { formatDuration } from "@/lib/training";
import { t } from "@/lib/i18n";
import { powerZone } from "@/lib/workout";

type Iv = {
  id: number;
  type: string | null;
  label: string | null;
  start_time: number | null;
  end_time: number | null;
  average_watts: number | null;
  moving_time: number | null;
};

/**
 * Interval blocks like the intervals.icu calendar: width = duration, height = power, colour = zone.
 * Tapping a block selects it (again to clear), so the map and charts can show just that work.
 */
export function WorkoutBlocks({
  intervals,
  ftp,
  selected,
  onSelect,
}: {
  intervals: Iv[];
  ftp: number;
  selected?: number | null;
  onSelect?: (id: number | null) => void;
}) {
  const ivs = intervals.filter(
    (i) =>
      i.start_time != null &&
      i.end_time != null &&
      i.end_time > i.start_time &&
      i.average_watts != null,
  );
  if (!ivs.length)
    return (
      <p className="text-sm text-muted-foreground">
        {t(
          "No interval data for this activity.",
          "Nessun dato sugli intervalli per questa attività.",
        )}
      </p>
    );
  const total =
    Math.max(...ivs.map((i) => i.end_time!)) - Math.min(...ivs.map((i) => i.start_time!));
  const t0 = Math.min(...ivs.map((i) => i.start_time!));
  const maxW = Math.max(ftp * 1.3, ...ivs.map((i) => i.average_watts!));
  return (
    <div>
      <div className="relative h-36 w-full rounded-md bg-background/60">
        <div
          className="absolute inset-x-0 border-t border-dashed border-muted-foreground/40"
          style={{ bottom: `${(ftp / maxW) * 100}%` }}
        >
          <span className="stat-num absolute -top-4 right-1 text-[10px] text-muted-foreground">
            FTP {ftp}W
          </span>
        </div>
        {ivs.map((i) => {
          const z = powerZone(i.average_watts!, ftp);
          const label = `${i.label ?? i.type ?? t("Interval", "Intervallo")} · ${formatDuration(i.end_time! - i.start_time!)} · ${Math.round(i.average_watts!)}W · Z${z}`;
          // The whole column is the tap target, so even a short, easy block is easy to hit.
          return (
            <button
              key={i.id}
              type="button"
              title={label}
              aria-label={label}
              aria-pressed={selected === i.id}
              onClick={() => onSelect?.(selected === i.id ? null : i.id)}
              className="absolute inset-y-0 border-r border-background/70"
              style={{
                left: `${((i.start_time! - t0) / total) * 100}%`,
                width: `${((i.end_time! - i.start_time!) / total) * 100}%`,
                opacity: selected != null && selected !== i.id ? 0.35 : 1,
              }}
            >
              <span
                className="absolute inset-x-0 bottom-0 rounded-t-sm"
                style={{
                  height: `${Math.max(4, (i.average_watts! / maxW) * 100)}%`,
                  background: `var(--z${z})`,
                  boxShadow: selected === i.id ? "inset 0 0 0 2px var(--foreground)" : undefined,
                }}
              />
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
        {[1, 2, 3, 4, 5, 6, 7].map((z) => (
          <span key={z} className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm" style={{ background: `var(--z${z})` }} /> Z{z}
          </span>
        ))}
      </div>
    </div>
  );
}
