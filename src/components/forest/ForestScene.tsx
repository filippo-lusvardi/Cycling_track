import { useId, useMemo } from "react";
import { farRidge } from "@/lib/ridge";
import { SEASON_COLOR, rng, seedOf, type Season } from "@/lib/tree";
import type { TreeHeader } from "@/lib/forest/types";

export type SceneTree = { uid: string; name: string; header: TreeHeader | undefined };

/**
 * A forest as a night landscape: far ridges drawn from the forest's seed, a hillside, and one small tree per
 * member, its crown in their season today (bare and snowed in winter, a seedling until they've published). With
 * `labels`, names stand under the trees and each is a button.
 */
export function ForestScene({
  seed,
  trees,
  labels = false,
  onTree,
}: {
  seed: string;
  trees: SceneTree[];
  labels?: boolean;
  onTree?: (uid: string) => void;
}) {
  const uid = `forest${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const W = 360;
  const H = labels ? 190 : 140;
  const groundY = (x: number) => H * (labels ? 0.72 : 0.8) - Math.sin((x / W) * Math.PI) * 14;
  const stars = useMemo(() => {
    const r = rng(seedOf(`${seed}stars`));
    return Array.from({ length: 18 }, () => [r() * W, r() * H * 0.45, 0.25 + r() * 0.55] as const);
  }, [seed, H]);
  const ridge = (key: string, top: number, depth: number) => {
    const ys = farRidge(`${seed}${key}`, 32, 1.3);
    const pts = ys.map(
      (y, i) => `${((i / 32) * W).toFixed(1)},${(top + (1 - y) * depth).toFixed(1)}`,
    );
    return `0,${H} ${pts.join(" ")} ${W},${H}`;
  };
  const hill = Array.from({ length: 25 }, (_, i) => {
    const x = (i / 24) * W;
    return `L${x.toFixed(1)},${groundY(x).toFixed(1)}`;
  }).join(" ");
  // Fitter trees stand taller: rank by the crown's fitness among the forest's members.
  const ranked = [...trees].sort(
    (a, b) => (a.header?.crown?.ctl ?? 0) - (b.header?.crown?.ctl ?? 0),
  );
  const n = trees.length;
  const placed = trees.map((tr, i) => {
    const r = rng(seedOf(`${seed}${tr.uid}`));
    const x = n === 1 ? W / 2 : 34 + (i / (n - 1)) * (W - 68) + (r() - 0.5) * (labels ? 6 : 14);
    const back = !labels && i % 2 === 1;
    // Sizes vary by seed only: a tree's height says nothing about anyone's fitness.
    const size = (0.8 + r() * 0.35) * (back ? 0.8 : 1) * (n > 12 ? 0.75 : 1);
    return { tr, x, y: groundY(x) - (back ? 6 : 0), size, back };
  });
  const draw = (p: (typeof placed)[number]) => (
    <MiniTree key={p.tr.uid} tr={p.tr} x={p.x} y={p.y} size={p.size} seed={`${seed}${p.tr.uid}`} />
  );

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img">
      <defs>
        <linearGradient id={`${uid}sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--background)" />
          <stop
            offset="1"
            style={{ stopColor: "color-mix(in oklab, var(--primary) 12%, var(--card))" }}
          />
        </linearGradient>
        <linearGradient id={`${uid}hill`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--secondary)" />
          <stop offset="1" stopColor="var(--background)" />
        </linearGradient>
      </defs>
      <rect width={W} height={H} fill={`url(#${uid}sky)`} />
      {stars.map(([x, y, o], i) => (
        <circle key={i} cx={x} cy={y} r={0.7} fill="var(--snow)" opacity={o} />
      ))}
      <polygon points={ridge("far", H * 0.25, H * 0.3)} fill="var(--border)" opacity={0.45} />
      <polygon points={ridge("mid", H * 0.4, H * 0.25)} fill="var(--muted)" opacity={0.8} />
      <path d={`M0,${H} L0,${groundY(0)} ${hill} L${W},${H} Z`} fill={`url(#${uid}hill)`} />
      {placed.filter((p) => p.back).map(draw)}
      {placed.filter((p) => !p.back).map(draw)}
      {labels &&
        placed.map((p) => (
          <g
            key={`${p.tr.uid}-label`}
            role="button"
            tabIndex={0}
            aria-label={p.tr.name}
            className="cursor-pointer outline-none"
            onClick={() => onTree?.(p.tr.uid)}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onTree?.(p.tr.uid)}
          >
            {/* The whole column is the tap target, not just the drawing. */}
            <rect
              x={p.x - 20}
              y={p.y - 70 * p.size}
              width={40}
              height={70 * p.size + 26}
              fill="transparent"
            />
            <text
              x={p.x}
              y={p.y + 16}
              textAnchor="middle"
              fontSize={9}
              fill="var(--muted-foreground)"
            >
              {p.tr.name.length > 10 ? `${p.tr.name.slice(0, 9)}…` : p.tr.name}
            </text>
          </g>
        ))}
    </svg>
  );
}

/** One member's small tree: trunk and boughs, then a canopy in their season (a seedling before they've published). */
export function MiniTree({
  tr,
  x,
  y,
  size,
  seed,
}: {
  tr: SceneTree;
  x: number;
  y: number;
  size: number;
  seed: string;
}) {
  const crown = tr.header?.crown ?? null;
  if (!crown)
    return (
      <g opacity={0.8}>
        <line x1={x} y1={y} x2={x} y2={y - 10} stroke="var(--bark)" strokeWidth={1.5} />
        <ellipse cx={x - 3} cy={y - 10} rx={3.5} ry={2} fill="var(--pine)" opacity={0.7} />
        <ellipse cx={x + 3} cy={y - 12} rx={3.5} ry={2} fill="var(--pine)" opacity={0.7} />
      </g>
    );
  const season: Season | null = crown.season;
  const r = rng(seedOf(seed));
  const h = 46 * size;
  const trunkW = 3 + 3 * size;
  const top = y - h;
  // Leaves follow the member's own crown: full in summer, thinner in spring and autumn, none in winter.
  const blobs = Math.round(Math.min(14, Math.max(0, crown.leaves) / 5));
  const color = season ? SEASON_COLOR[season] : "var(--muted-foreground)";
  const boughs = [-1, 1, -0.5, 0.6].map(
    (s) => [x + s * 14 * size, top + 6 + r() * 10 * size] as const,
  );
  const leaves = Array.from({ length: blobs }, () => {
    const a = r() * Math.PI * 2;
    const d = r() * 13 * size;
    return [x + Math.cos(a) * d, top + 10 + Math.sin(a) * d * 0.75, (4 + r() * 3) * size] as const;
  });
  const blossom =
    season === "spring"
      ? Array.from(
          { length: 3 },
          () => [x + (r() - 0.5) * 22 * size, top + 6 + r() * 12 * size] as const,
        )
      : [];
  return (
    <g>
      <path
        d={`M${x - trunkW / 2},${y} L${x - trunkW / 4},${top + 8} L${x + trunkW / 4},${top + 8} L${x + trunkW / 2},${y} Z`}
        fill="var(--bark)"
      />
      {boughs.map(([bx, by], i) => (
        <line
          key={i}
          x1={x}
          y1={top + 14 + i * 3}
          x2={bx}
          y2={by}
          stroke="var(--bark)"
          strokeWidth={1.2}
          strokeLinecap="round"
        />
      ))}
      {season === "winter" &&
        boughs.map(([bx, by], i) => (
          <circle key={`s${i}`} cx={bx} cy={by - 1} r={1.6} fill="var(--snow)" />
        ))}
      {leaves.map(([lx, ly, lr], i) => (
        <circle key={i} cx={lx} cy={ly} r={lr} fill={color} opacity={0.85} />
      ))}
      {blossom.map(([bx, by], i) => (
        <circle key={`b${i}`} cx={bx} cy={by} r={1.4} fill="var(--blossom)" />
      ))}
    </g>
  );
}
