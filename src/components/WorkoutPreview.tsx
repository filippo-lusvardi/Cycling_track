// A planned workout as blocks, like the intervals.icu calendar: width = duration, height = intensity, colour = zone.
import { useQuery } from "@tanstack/react-query";
import { t } from "@/lib/i18n";
import { rideZonesQuery } from "@/lib/queries";
import { hasSource } from "@/lib/source";
import { knownRunThreshold, sportOfActivity, type MainSport } from "@/lib/sport";
import { formatDuration } from "@/lib/training";
import { cn } from "@/lib/utils";
import {
  estimateLoad,
  hasBlocks,
  parseWorkout,
  type ParsedWorkout,
  type Thresholds,
  type WorkoutBlock,
} from "@/lib/workout";

/** What a workout's absolute targets are measured against. */
export function useThresholds(): Thresholds {
  const { data } = useQuery({ ...rideZonesQuery("ride"), enabled: hasSource() });
  return { ftp: data?.ftp ?? null, pace: knownRunThreshold() };
}

/** The sport a workout is drawn for: a run against threshold pace, anything else against FTP. */
export const workoutSport = (type: string | null | undefined): MainSport =>
  sportOfActivity({ type: type ?? null }) === "run" ? "run" : "ride";

export function useParsedWorkout(
  text: string | null | undefined,
  type: string | null | undefined,
): ParsedWorkout {
  return parseWorkout(text, workoutSport(type), useThresholds());
}

/** The blocks, drawn. `compact` is a thin strip for lists and calendar days. */
export function WorkoutBars({
  blocks,
  compact = false,
  className,
}: {
  blocks: WorkoutBlock[];
  compact?: boolean;
  className?: string;
}) {
  const total = blocks.reduce((s, b) => s + b.seconds, 0);
  if (!total) return null;
  const top = Math.max(1.3, ...blocks.flatMap((b) => [b.from, b.to]));
  const y = (f: number) => 100 - Math.max(4, (f / top) * 100);
  let at = 0;
  return (
    <div
      className={cn(
        "relative w-full",
        compact ? "h-4" : "h-28 rounded-md bg-background/60",
        className,
      )}
    >
      <svg
        viewBox="0 0 1000 100"
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full"
        aria-hidden
      >
        {blocks.map((b, i) => {
          const x0 = (at / total) * 1000;
          at += b.seconds;
          const x1 = (at / total) * 1000;
          return (
            <polygon
              key={i}
              points={`${x0},100 ${x0},${y(b.from)} ${x1},${y(b.to)} ${x1},100`}
              fill={b.zone ? `var(--z${b.zone})` : "var(--muted-foreground)"}
              opacity={b.zone ? 1 : 0.4}
              stroke="var(--background)"
              strokeOpacity={0.7}
              strokeWidth={compact ? 0.5 : 1}
              vectorEffect="non-scaling-stroke"
            />
          );
        })}
      </svg>
      {!compact && (
        <div
          className="pointer-events-none absolute inset-x-0 border-t border-dashed border-muted-foreground/50"
          style={{ bottom: `${(1 / top) * 100}%` }}
        />
      )}
    </div>
  );
}

/**
 * A workout's text as blocks, with its time and load; nothing when the text has no steps to draw, so the caller's plain
 * text is all there is.
 */
export function WorkoutPreview({
  text,
  type,
  compact = false,
  className,
}: {
  text: string | null | undefined;
  type: string | null | undefined;
  compact?: boolean;
  className?: string;
}) {
  const w = useParsedWorkout(text, type);
  if (!hasBlocks(w)) return null;
  if (compact)
    return <WorkoutBars blocks={w.blocks} compact {...(className ? { className } : {})} />;
  return (
    <div className={className}>
      <WorkoutBars blocks={w.blocks} />
      <div className="stat-num mt-1 flex justify-between text-[11px] text-muted-foreground">
        <span>
          {formatDuration(w.totalSeconds)} · {t("load", "carico")} ~{estimateLoad(w.blocks)}
        </span>
        <span>
          {workoutSport(type) === "run"
            ? t("line: threshold pace", "linea: passo di soglia")
            : t("line: FTP", "linea: FTP")}
        </span>
      </div>
    </div>
  );
}
