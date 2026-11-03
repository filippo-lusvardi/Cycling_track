// Today, written over Home's sky: what the tree's crown says, gathered in one quiet block. The date and the
// training block; the season and its advice in the season's colour, beside a ring holding the readiness score; the
// ceiling on an easy day, a word when something is changing; fitness, fatigue and form with the sky's word; today's
// planned workouts as buds. Light text with a soft shadow, so it reads on a night sky and a noon one alike. Tapping it
// opens today's sheet (advice and check-in), as tapping the crown does; a bud opens its workout.
import { parseISO } from "date-fns";
import type { PlannedEvent } from "@/lib/intervals";
import { format, t } from "@/lib/i18n";
import { ceilingText } from "@/lib/readiness";
import { formatDuration } from "@/lib/training";
import { SEASON_COLOR, WEATHER_WORD, type Crown } from "@/lib/tree";
import { cn } from "@/lib/utils";

/** Over any sky: a soft dark halo behind light text. */
const SHADOW = { textShadow: "0 1px 2px rgb(0 0 0 / 0.55), 0 0 14px rgb(0 0 0 / 0.35)" };

/** The readiness score in a ring that fills with it, in the season's colour. */
function ScoreRing({
  score,
  color,
  estimated,
}: {
  score: number;
  color: string;
  estimated: boolean;
}) {
  const r = 21;
  const len = 2 * Math.PI * r;
  return (
    <svg width={52} height={52} viewBox="0 0 52 52" className="shrink-0" aria-hidden>
      <circle cx={26} cy={26} r={r + 4} fill="rgb(0 0 0 / 0.22)" />
      <circle
        cx={26}
        cy={26}
        r={r}
        fill="none"
        stroke="rgb(255 255 255 / 0.18)"
        strokeWidth={3.5}
      />
      <circle
        cx={26}
        cy={26}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={3.5}
        strokeLinecap="round"
        strokeDasharray={`${(len * score) / 100} ${len}`}
        strokeDashoffset={0}
        transform="rotate(-90 26 26)"
        opacity={estimated ? 0.7 : 1}
      />
      <text
        x={26}
        y={27}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={16}
        fontWeight={700}
        fill="var(--foreground)"
        className="stat-num"
      >
        {score}
      </text>
    </svg>
  );
}

export function TodayRecap({
  crown,
  today,
  block,
  limit,
  quiet,
  planned,
  onOpen,
  onPlan,
  className,
}: {
  crown: Crown;
  today: string;
  /** The current training block's focus, e.g. "VO2max". */
  block: string;
  /** Today's ceiling on an easy or endurance day. */
  limit: { watts: number | null; bpm: number | null } | null;
  /** Quiet tree: the words without the scores. */
  quiet: boolean;
  planned: PlannedEvent[];
  onOpen: () => void;
  onPlan: (e: PlannedEvent) => void;
  className?: string;
}) {
  const color = crown.season ? SEASON_COLOR[crown.season] : "var(--muted-foreground)";
  const heading = crown.seasonLabel
    ? crown.advice
      ? `${crown.seasonLabel} · ${crown.advice.toLowerCase()}`
      : crown.seasonLabel
    : t("Today", "Oggi");
  return (
    <div className={cn("text-foreground", className)} style={SHADOW}>
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-center gap-3 rounded-xl text-left focus-visible:outline-none"
        aria-label={`${t("Today", "Oggi")}: ${heading}`}
      >
        {!quiet && crown.score != null && (
          <ScoreRing score={crown.score} color={color} estimated={crown.estimated} />
        )}
        <span className="min-w-0 flex-1">
          <span className="eyebrow block text-foreground/80">
            {format(parseISO(today), "EEEE d MMMM")}
            {block && ` · ${t(`${block} block`, `blocco ${block}`)}`}
          </span>
          <span className="mt-0.5 block text-lg font-semibold leading-snug" style={{ color }}>
            {heading}
          </span>
          {limit && (
            <span className="stat-num block text-sm font-semibold" style={{ color }}>
              {ceilingText(limit)}
            </span>
          )}
          {crown.signals.length > 0 && (
            <span className="block text-sm text-birch">
              {t("Something is changing · tap to see", "Qualcosa sta cambiando · tocca per vedere")}
            </span>
          )}
          {!quiet && crown.score == null && (
            <span className="block text-sm text-foreground/80">
              {t(
                "Not enough data yet · tap to check in",
                "Dati ancora insufficienti · tocca per il check-in",
              )}
            </span>
          )}
          {!quiet && crown.score != null && crown.estimated && (
            <span className="block text-sm text-foreground/80">
              {t("Estimated · check in to refine", "Stimata · fai il check-in per affinarla")}
            </span>
          )}
        </span>
      </button>
      {!quiet && crown.ctl != null && (
        <div className="stat-num mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-sm">
          <span className="text-fitness">
            {t("Fitness", "Forma fisica")} {Math.round(crown.ctl)}
          </span>
          {crown.atl != null && (
            <span className="text-fatigue">
              {t("Fatigue", "Fatica")} {Math.round(crown.atl)}
            </span>
          )}
          {crown.form != null && (
            <span className="whitespace-nowrap text-form">
              {t("Form", "Forma")} {crown.form > 0 ? "+" : ""}
              {Math.round(crown.form)}
              {crown.weather && (
                <span className="text-foreground/75"> · {WEATHER_WORD[crown.weather]}</span>
              )}
            </span>
          )}
        </div>
      )}
      {planned.length > 0 && (
        <div className="mt-2 flex flex-col gap-1">
          {planned.map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => onPlan(e)}
              className="flex min-h-9 items-center gap-2 self-start rounded-full bg-black/25 py-1 pl-2 pr-3 text-left text-sm backdrop-blur-sm transition-colors hover:bg-black/35"
            >
              <svg width={12} height={16} aria-hidden className="shrink-0">
                <path d="M6,15 L6,8" stroke="var(--bark)" strokeWidth={1.4} />
                <ellipse cx={6} cy={5} rx={3.4} ry={4.6} fill="var(--birch)" />
              </svg>
              <span className="min-w-0 truncate">{e.name ?? e.category.toLowerCase()}</span>
              {e.moving_time ? (
                <span className="stat-num shrink-0 text-foreground/75">
                  {formatDuration(e.moving_time)}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
