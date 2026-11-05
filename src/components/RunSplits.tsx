import { useMemo } from "react";
import { Panel } from "@/components/StatCard";
import { t } from "@/lib/i18n";
import type { RideStreams } from "@/lib/intervals";
import { formatPace } from "@/lib/pace";
import { kmSplits, paceZoneTops, RUN_ZONE_NAMES, zoneIndex } from "@/lib/run-metrics";
import { cn } from "@/lib/utils";

const signed = (m: number) => (m < 0 ? `−${-m}` : `${m}`);
const kmLabel = (metres: number, i: number, last: boolean) =>
  last && metres < 950
    ? t((metres / 1000).toFixed(1), (metres / 1000).toFixed(1).replace(".", ","))
    : `${i + 1}`;

/**
 * A run kilometre by kilometre. Bars grow from zero with speed, the fastest filling its track; with a threshold
 * pace each takes the colour of its zone, on grade-adjusted pace like the zones panel.
 */
export function RunSplits({
  streams,
  threshold,
  tops,
}: {
  streams: RideStreams;
  threshold: number | null;
  tops: number[] | null | undefined;
}) {
  const rows = useMemo(() => kmSplits(streams), [streams]);
  if (!rows.length) return null;
  const fastest = Math.max(...rows.map((r) => r.speed ?? 0));
  const zoneTops = threshold ? paceZoneTops(threshold, tops) : null;
  const hasClimb = rows.some((r) => r.climb != null);
  const hasHr = rows.some((r) => r.hr != null);
  const grid = cn(
    "grid items-center gap-x-2",
    hasClimb && hasHr && "grid-cols-[2.25rem_2.25rem_minmax(0,1fr)_2.5rem_2rem]",
    hasClimb && !hasHr && "grid-cols-[2.25rem_2.25rem_minmax(0,1fr)_2.5rem]",
    !hasClimb && hasHr && "grid-cols-[2.25rem_minmax(0,1fr)_2.5rem_2rem]",
    !hasClimb && !hasHr && "grid-cols-[2.25rem_minmax(0,1fr)_2.5rem]",
  );
  return (
    <Panel title={t("Splits", "Parziali")}>
      <table className="block w-full text-sm">
        <thead className="block">
          <tr className={cn(grid, "pb-1.5 text-xs text-muted-foreground")}>
            <th className="text-left font-normal">Km</th>
            {hasClimb && <th className="text-right font-normal">m</th>}
            <th className="pl-1 text-left font-normal">{t("Pace", "Passo")}</th>
            <th className="text-right font-normal">/km</th>
            {hasHr && <th className="text-right font-normal">{t("HR", "FC")}</th>}
          </tr>
        </thead>
        <tbody className="block space-y-1">
          {rows.map((r, i) => {
            const zone = zoneTops && r.gap ? zoneIndex(r.gap, zoneTops) : null;
            return (
              <tr key={i} className={grid}>
                <td className="stat-num">{kmLabel(r.metres, i, i === rows.length - 1)}</td>
                {hasClimb && (
                  <td className="stat-num text-right text-xs text-muted-foreground">
                    {r.climb != null ? signed(r.climb) : "–"}
                  </td>
                )}
                <td className="pl-1">
                  <div className="h-4 overflow-hidden rounded-full bg-secondary">
                    <div
                      className="h-full rounded-full"
                      title={
                        zone != null ? `Z${zone + 1} ${RUN_ZONE_NAMES[zone] ?? ""}` : undefined
                      }
                      style={{
                        width: `${((r.speed ?? 0) / fastest) * 100}%`,
                        background: zone != null ? `var(--z${zone + 1})` : "var(--primary)",
                      }}
                    />
                  </div>
                </td>
                <td className="stat-num text-right">{formatPace(r.speed)}</td>
                {hasHr && (
                  <td className="stat-num text-right text-muted-foreground">{r.hr ?? "–"}</td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </Panel>
  );
}
