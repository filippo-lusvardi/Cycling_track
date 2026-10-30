import { formatDuration } from "@/lib/training";

type Iv = { id: number; type: string | null; label: string | null; start_time: number | null; end_time: number | null; average_watts: number | null; moving_time: number | null };

/** Power zone (1–7) from % of FTP, Coggan-style like intervals.icu. */
export function powerZone(watts: number, ftp: number): number {
  const p = watts / ftp;
  if (p < 0.55) return 1;
  if (p < 0.75) return 2;
  if (p < 0.9) return 3;
  if (p < 1.05) return 4;
  if (p < 1.2) return 5;
  if (p < 1.5) return 6;
  return 7;
}

/** Interval blocks like the intervals.icu calendar: width = duration, height = power, colour = zone. */
export function WorkoutBlocks({ intervals, ftp }: { intervals: Iv[]; ftp: number }) {
  const ivs = intervals.filter((i) => i.start_time != null && i.end_time != null && i.end_time > i.start_time && i.average_watts != null);
  if (!ivs.length) return <p className="text-sm text-muted-foreground">No interval data for this ride.</p>;
  const total = Math.max(...ivs.map((i) => i.end_time!)) - Math.min(...ivs.map((i) => i.start_time!));
  const t0 = Math.min(...ivs.map((i) => i.start_time!));
  const maxW = Math.max(ftp * 1.3, ...ivs.map((i) => i.average_watts!));
  return (
    <div>
      <div className="relative h-36 w-full rounded-md bg-background/60">
        <div className="absolute inset-x-0 border-t border-dashed border-muted-foreground/40" style={{ bottom: `${(ftp / maxW) * 100}%` }}>
          <span className="stat-num absolute -top-4 right-1 text-[10px] text-muted-foreground">FTP {ftp}W</span>
        </div>
        {ivs.map((i) => {
          const z = powerZone(i.average_watts!, ftp);
          return (
            <div
              key={i.id}
              title={`${i.label ?? i.type ?? "Interval"} · ${formatDuration(i.end_time! - i.start_time!)} · ${Math.round(i.average_watts!)}W · Z${z}`}
              className="absolute bottom-0 rounded-t-sm border-r border-background/70"
              style={{
                left: `${((i.start_time! - t0) / total) * 100}%`,
                width: `${((i.end_time! - i.start_time!) / total) * 100}%`,
                height: `${Math.max(4, (i.average_watts! / maxW) * 100)}%`,
                background: `var(--z${z})`,
              }}
            />
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
