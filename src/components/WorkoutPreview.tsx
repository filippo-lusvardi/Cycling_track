// A planned workout as blocks, like the intervals.icu calendar: width = duration, height = intensity, colour = zone.
import { useQuery } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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
  stepWatts,
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

/** A step's length down to the second: these are often shorter than a minute. */
function stepTime(secs: number) {
  const s = Math.round(secs);
  if (s < 60) return `${s}s`;
  return s % 60 ? `${Math.floor(s / 60)}m${s % 60}s` : formatDuration(s);
}

function Step({ step, ftp }: { step: WorkoutBlock; ftp: number }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span
        className="h-2 w-2 shrink-0 rounded-sm"
        style={{ background: step.zone ? `var(--z${step.zone})` : "var(--muted-foreground)" }}
      />
      <span className="text-muted-foreground">{stepTime(step.seconds)}</span>
      {stepWatts(step, ftp)}
    </span>
  );
}

/** Every step's power from the FTP, folded away until asked for: repeats stay one row, as they were written. */
function StepWatts({ workout, ftp }: { workout: ParsedWorkout; ftp: number }) {
  return (
    <Collapsible className="mt-1">
      <CollapsibleTrigger className="group flex min-h-9 items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        {t("Power for each step", "Potenza di ogni passo")}
        <ChevronDown className="h-3.5 w-3.5 transition-transform group-data-[state=open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul className="stat-num space-y-1 pb-1 text-xs">
          {workout.sets.flatMap((set, i) =>
            set.reps > 1 ? (
              <li key={i} className="flex gap-2">
                <span className="w-7 shrink-0 font-semibold">{set.reps}×</span>
                <span className="flex flex-wrap gap-x-3 gap-y-1">
                  {set.steps.map((step, j) => (
                    <Step key={j} step={step} ftp={ftp} />
                  ))}
                </span>
              </li>
            ) : (
              set.steps.map((step, j) => (
                <li key={`${i}-${j}`} className="flex gap-2">
                  <span className="w-7 shrink-0" />
                  <Step step={step} ftp={ftp} />
                </li>
              ))
            ),
          )}
        </ul>
      </CollapsibleContent>
    </Collapsible>
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
  const th = useThresholds();
  const sport = workoutSport(type);
  const w = parseWorkout(text, sport, th);
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
          {sport === "run"
            ? t("line: threshold pace", "linea: passo di soglia")
            : `${t("line: FTP", "linea: FTP")}${th.ftp ? ` ${th.ftp}W` : ""}`}
        </span>
      </div>
      {sport === "ride" && th.ftp && w.blocks.some((b) => b.power) && (
        <StepWatts workout={w} ftp={th.ftp} />
      )}
    </div>
  );
}
