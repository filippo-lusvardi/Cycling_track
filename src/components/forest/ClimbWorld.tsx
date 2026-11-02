import { useId, useMemo } from "react";
import type { ForestClimb, ForestTime } from "@/lib/forest/leaderboard";
import { t } from "@/lib/i18n";
import { farRidge } from "@/lib/ridge";
import { formatClock } from "@/lib/training";
import { rng, seedOf } from "@/lib/tree";

export type WorldClimb = { climb: ForestClimb; leader: (ForestTime & { name: string }) | null };

const W = 360;
const TOP = 70;
const ROW = 190;
/** Snow lies above this altitude (m), as on the summit book's cover. */
const SNOWLINE = 1800;

/**
 * The forest's climbs as a little mountain range at night: each climb a peak drawn from its own profile (taller for
 * more climbing, snow above the snowline, a cross on top), its name and leader below. Tap a peak for its page.
 */
export function ClimbWorld({
  climbs,
  onOpen,
}: {
  climbs: WorldClimb[];
  onOpen: (sid: string) => void;
}) {
  const uid = `climbs${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const rows = Math.max(1, Math.ceil(climbs.length / 2));
  const H = TOP + rows * ROW;
  const maxGain = Math.max(300, ...climbs.map((c) => c.climb.gain ?? 0));
  const stars = useMemo(() => {
    const r = rng(seedOf("climb-stars"));
    return Array.from({ length: 26 }, () => [r() * W, r() * H * 0.9, 0.2 + r() * 0.5] as const);
  }, [H]);
  const far = farRidge("climb-world", 32, 1.4);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="block h-auto w-full"
      role="group"
      aria-label={t("Climbs", "Salite")}
    >
      <defs>
        <linearGradient id={`${uid}sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--background)" />
          <stop
            offset="1"
            style={{ stopColor: "color-mix(in oklab, var(--primary) 8%, var(--card))" }}
          />
        </linearGradient>
        <linearGradient id={`${uid}rock`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--secondary)" />
          <stop offset="1" stopColor="var(--background)" />
        </linearGradient>
      </defs>
      <rect width={W} height={H} fill={`url(#${uid}sky)`} />
      {stars.map(([x, y, o], i) => (
        <circle key={i} cx={x} cy={y} r={0.7} fill="var(--snow)" opacity={o} />
      ))}
      <polygon
        points={`0,${TOP + 40} ${far.map((y, i) => `${((i / 32) * W).toFixed(1)},${(10 + (1 - y) * 50).toFixed(1)}`).join(" ")} ${W},${TOP + 40}`}
        fill="var(--border)"
        opacity={0.4}
      />
      {climbs.map((c, i) => {
        const row = Math.floor(i / 2);
        const right = i % 2 === 1;
        return (
          <Peak
            key={c.climb.sid}
            c={c}
            x0={right ? 188 : 12}
            base={TOP + row * ROW + 118 + (right ? 14 : 0)}
            height={34 + 74 * Math.min(1, (c.climb.gain ?? 0) / maxGain)}
            fill={`url(#${uid}rock)`}
            onOpen={onOpen}
          />
        );
      })}
    </svg>
  );
}

function Peak({
  c,
  x0,
  base,
  height,
  fill,
  onOpen,
}: {
  c: WorldClimb;
  x0: number;
  base: number;
  height: number;
  fill: string;
  onOpen: (sid: string) => void;
}) {
  const { climb, leader } = c;
  const w = 160;
  const tr = climb.trace;
  const alt = tr?.alt.length ? tr.alt : [0, 1];
  const dist = tr?.dist.length ? tr.dist : [0, 1];
  const lo = Math.min(...alt);
  const hi = Math.max(...alt);
  const span = hi - lo || 1;
  const total = dist.at(-1) || 1;
  // The climb's profile on the near side, then a steeper fall on the far side of its summit.
  const up = dist.map(
    (d, i) => [x0 + (d / total) * w * 0.78, base - ((alt[i]! - lo) / span) * height] as const,
  );
  const [tx, ty] = up.at(-1)!;
  const crest = [...up, [x0 + w, base - height * 0.25] as const];
  const line = crest.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const snow = tr && hi > SNOWLINE ? snowCap(up, alt, hi) : "";
  const open = () => onOpen(climb.sid);
  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={climb.name}
      className="cursor-pointer outline-none [&:hover_.peak-name]:fill-[var(--primary)] [&:focus-visible_.peak-name]:underline"
      onClick={open}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && open()}
    >
      <polygon points={`${x0},${base} ${line} ${x0 + w},${base}`} fill={fill} />
      {snow && <polygon points={snow} fill="var(--snow)" opacity={0.85} />}
      <polyline
        points={up.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ")}
        fill="none"
        stroke="var(--primary)"
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
      <g stroke="var(--foreground)" strokeWidth={1.2} strokeLinecap="round">
        <line x1={tx} y1={ty} x2={tx} y2={ty - 12} />
        <line x1={tx - 3.5} y1={ty - 8.5} x2={tx + 3.5} y2={ty - 8.5} />
      </g>
      <line x1={x0} y1={base} x2={x0 + w} y2={base} stroke="var(--border)" />
      <text
        x={x0 + 2}
        y={base + 18}
        fontSize={12.5}
        fontWeight={600}
        fill="var(--foreground)"
        className="peak-name"
      >
        {climb.name.length > 22 ? `${climb.name.slice(0, 21)}…` : climb.name}
      </text>
      <text
        x={x0 + 2}
        y={base + 32}
        fontSize={9.5}
        fill="var(--muted-foreground)"
        className="stat-num"
      >
        {(climb.length / 1000).toFixed(1)} km
        {climb.grade != null ? ` · ${climb.grade.toFixed(1)}%` : ""}
        {tr ? ` · ${Math.round(hi)} m` : ""}
      </text>
      <text
        x={x0 + 2}
        y={base + 47}
        fontSize={10.5}
        fill={leader ? "var(--birch)" : "var(--muted-foreground)"}
        className="stat-num"
      >
        {leader
          ? `${formatClock(leader.duration)} · ${leader.name.length > 12 ? `${leader.name.slice(0, 11)}…` : leader.name}`
          : t("no times yet", "nessun tempo")}
      </text>
      <rect x={x0} y={base - height - 18} width={w} height={height + 70} fill="transparent" />
    </g>
  );
}

/** Snow draped over the crest above the snowline, deepest at the summit (as on the summit book's cover). */
function snowCap(up: (readonly [number, number])[], alt: number[], hi: number): string {
  const upper: string[] = [];
  const lower: string[] = [];
  up.forEach(([x, y], i) => {
    const above = (alt[i]! - SNOWLINE) / (hi - SNOWLINE || 1);
    if (above <= 0) return;
    upper.push(`${x.toFixed(1)},${(y - 0.5).toFixed(1)}`);
    lower.push(`${x.toFixed(1)},${(y + 12 * above ** 0.85).toFixed(1)}`);
  });
  return upper.length > 1 ? `${upper.join(" ")} ${lower.reverse().join(" ")}` : "";
}
