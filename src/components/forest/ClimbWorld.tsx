import { useId, useMemo } from "react";
import type { ForestClimb, ForestTime } from "@/lib/forest/leaderboard";
import { t } from "@/lib/i18n";
import { WildPines } from "@/components/forest/ForestScene";
import { useNow } from "@/hooks/use-now";
import { daylight, lit } from "@/lib/daylight";
import { ridgeAcross } from "@/lib/ridge";
import { formatClock } from "@/lib/training";
import { rng, seedOf } from "@/lib/tree";

export type WorldClimb = { climb: ForestClimb; leader: (ForestTime & { name: string }) | null };

const TOP = 70;
const ROW = 190;
/** Snow lies above this altitude (m), as on the summit book's cover. */
const SNOWLINE = 1800;

/**
 * The forest's climbs as a little mountain range at night: each climb a peak drawn from its own profile (taller for
 * more climbing, snow above the snowline, a cross on top), its name and leader below; two to a row on the phone, as
 * many as fit on a wide scene. Tap a peak for its page.
 */
export function ClimbWorld({
  climbs,
  onOpen,
  w: W = 360,
  fit = 0,
  clear = 0,
}: {
  climbs: WorldClimb[];
  onOpen: (sid: string) => void;
  w?: number;
  /** The height that fits on screen (see OpenScene): the range stands lower, down to it. */
  fit?: number;
  /** Room to keep free under the last row (see phoneFit). */
  clear?: number;
}) {
  const uid = `climbs${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  // Each peak is 160 wide; a slot is at least 176, so peaks never touch.
  const cols = Math.max(2, Math.floor((W - 40) / 176));
  const slot = (W - 40) / cols;
  const rows = Math.max(1, Math.ceil(climbs.length / cols));
  // A short range stands mid-field on a wide scene (the phone's two columns are always full width).
  const inset = W <= 360 ? 0 : (W - 40 - Math.min(climbs.length, cols) * slot) / 2;
  // The scene fills the window down to its bottom edge: the range stands low, nearer mountains and wild pines fill
  // the land behind it.
  const lift = Math.max(
    0,
    Math.round((W <= 360 ? fit : Math.min(fit, W * 0.5)) - (TOP + rows * ROW + clear)),
  );
  const H = TOP + rows * ROW + lift + clear;
  const mid = ridgeAcross("climb-mid", W, 1.2);
  // The nearer range darkens toward its foot, so the climbs stand out against it.
  const ridgeAt = (i: number) => TOP + 10 + (1 - mid[i]!) * lift * 0.35;
  const foot = TOP + lift - 16;
  const nearer = lift > 60;
  // With the nearer range in front, the far one reaches down behind it and fades out there.
  const farFoot = nearer ? TOP + 50 + lift * 0.35 : TOP + 40;
  const maxGain = Math.max(300, ...climbs.map((c) => c.climb.gain ?? 0));
  // Under the page's sky (components/sky/SkyPage): the land takes the light of the hour, and stands on ground.
  const d = daylight(useNow());
  const L = (c: string) => lit(c, d);
  const far = ridgeAcross("climb-world", W, 1.4);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="block h-auto w-full"
      role="group"
      aria-label={t("Climbs", "Salite")}
    >
      <defs>
        <linearGradient id={`${uid}rock`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: L("var(--scene-secondary)") }} />
          <stop offset="1" style={{ stopColor: L("var(--scene-background)") }} />
        </linearGradient>
      </defs>
      {/* The sky is the page's own (components/sky/SkyPage), behind this scene from the window's top. */}
      <polygon
        // Down to the scene's foot: land, never the page's sky, under the ranges and the climbs.
        points={`0,${H} 0,${farFoot} ${far.map((y, i) => `${((i / (far.length - 1)) * W).toFixed(1)},${(10 + (1 - y) * 50).toFixed(1)}`).join(" ")} ${W},${farFoot} ${W},${H}`}
        fill={L(
          "color-mix(in oklab, var(--scene-border) 70%, color-mix(in oklab, var(--primary) 20%, var(--scene-background)))",
        )}
      />
      {nearer && (
        <>
          <defs>
            <linearGradient
              id={`${uid}mid`}
              x1="0"
              y1={TOP + 10}
              x2="0"
              y2={H}
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0" style={{ stopColor: L("var(--scene-muted)") }} />
              <stop
                offset="1"
                style={{
                  stopColor: L(
                    "color-mix(in oklab, var(--scene-muted) 60%, var(--scene-background))",
                  ),
                }}
              />
            </linearGradient>
          </defs>
          <polygon
            points={`0,${H} 0,${foot} ${mid.map((_, i) => `${((i / (mid.length - 1)) * W).toFixed(1)},${ridgeAt(i).toFixed(1)}`).join(" ")} ${W},${foot} ${W},${H}`}
            fill={`url(#${uid}mid)`}
          />
          <WildPines
            seed="climb-world"
            w={W}
            count={Math.round(W / 9)}
            at={(r) => {
              const x = r() * W;
              // On the range's upper slopes only, where it's still solid.
              const ridge = ridgeAt(Math.round((x / W) * (mid.length - 1)));
              return [x, ridge + 12 + r() ** 1.5 * (foot - ridge) * 0.55];
            }}
            size={0.8}
            phone
            tone={L("color-mix(in oklab, var(--pine) 22%, var(--scene-background))")}
          />
        </>
      )}
      {climbs.map((c, i) => {
        const row = Math.floor(i / cols);
        const col = i % cols;
        const right = col % 2 === 1;
        return (
          <Peak
            key={c.climb.sid}
            c={c}
            x0={20 + inset + col * slot + (slot - 160) / 2}
            base={TOP + lift + row * ROW + 118 + (right ? 14 : 0)}
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
      <line x1={x0} y1={base} x2={x0 + w} y2={base} stroke="var(--scene-border)" />
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
