import { useId, useMemo } from "react";
import { MiniTree, type SceneTree } from "@/components/forest/ForestScene";
import { auth } from "@/lib/firebase";
import { t } from "@/lib/i18n";
import { farRidge } from "@/lib/ridge";
import { rng, seedOf } from "@/lib/tree";

const W = 360;
const TOP = 74;
const ROW = 128;
const PER_ROW = 3;

/**
 * A forest's members as a grove at night: their trees stand in rows on rolling hills under the mountains, each in
 * its season, with only a name beneath. Tap a tree to see it whole.
 */
export function ForestGrove({
  seed,
  trees,
  onTree,
  me = auth.currentUser?.uid,
}: {
  seed: string;
  trees: SceneTree[];
  onTree: (uid: string) => void;
  me?: string;
}) {
  const uid = `grove${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  // Me first, then by name.
  const sorted = [...trees].sort(
    (a, b) => Number(b.uid === me) - Number(a.uid === me) || a.name.localeCompare(b.name),
  );
  const rows = Math.max(1, Math.ceil(sorted.length / PER_ROW));
  const H = TOP + rows * ROW + 10;
  const stars = useMemo(() => {
    const r = rng(seedOf(`${seed}grove-stars`));
    return Array.from({ length: 24 }, () => [r() * W, r() * TOP, 0.25 + r() * 0.55] as const);
  }, [seed]);
  const far = farRidge(`${seed}grove`, 32, 1.3);
  // Each row its own gentle hill, a little lighter toward you; trees stand on its line.
  const hillY = (row: number, x: number) => {
    const phase = rng(seedOf(`${seed}hill${row}`))() * Math.PI * 2;
    return TOP + row * ROW + 86 - 10 * Math.sin((x / W) * Math.PI * 1.3 + phase) - 6;
  };
  const hill = (row: number) => {
    const pts = Array.from({ length: 25 }, (_, i) => {
      const x = (i / 24) * W;
      return `L${x.toFixed(1)},${hillY(row, x).toFixed(1)}`;
    }).join(" ");
    return `M0,${H} L0,${hillY(row, 0)} ${pts} L${W},${H} Z`;
  };

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="block h-auto w-full"
      role="group"
      aria-label={t("Trees", "Alberi")}
    >
      <defs>
        <linearGradient id={`${uid}sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--background)" />
          <stop
            offset="1"
            style={{ stopColor: "color-mix(in oklab, var(--primary) 8%, var(--card))" }}
          />
        </linearGradient>
      </defs>
      <rect width={W} height={H} fill={`url(#${uid}sky)`} />
      {stars.map(([x, y, o], i) => (
        <circle key={i} cx={x} cy={y} r={0.7} fill="var(--snow)" opacity={o} />
      ))}
      <polygon
        points={`0,${TOP + 50} ${far.map((y, i) => `${((i / 32) * W).toFixed(1)},${(14 + (1 - y) * 52).toFixed(1)}`).join(" ")} ${W},${TOP + 50}`}
        fill="var(--border)"
        opacity={0.45}
      />
      {Array.from({ length: rows }, (_, row) => (
        <g key={row}>
          <path
            d={hill(row)}
            style={{
              fill: `color-mix(in oklab, var(--secondary) ${55 + (row / Math.max(1, rows - 1)) * 45}%, var(--background))`,
            }}
          />
          {sorted.slice(row * PER_ROW, row * PER_ROW + PER_ROW).map((tr, k) => {
            const r = rng(seedOf(`${seed}${tr.uid}`));
            // Rows alternate their offset, so the grove doesn't read as a grid.
            const x = 60 + k * 120 + (row % 2 ? 22 : -8) + (r() - 0.5) * 14;
            const y = hillY(row, x) + 3;
            const open = () => onTree(tr.uid);
            return (
              <g
                key={tr.uid}
                role="button"
                tabIndex={0}
                aria-label={tr.name}
                className="cursor-pointer outline-none [&:hover_text]:fill-[var(--primary)] [&:focus-visible_text]:underline"
                onClick={open}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && open()}
              >
                <MiniTree tr={tr} x={x} y={y} size={1.25 + r() * 0.15} seed={`${seed}${tr.uid}`} />
                <text
                  x={x}
                  y={y + 20}
                  textAnchor="middle"
                  fontSize={12}
                  fontWeight={tr.uid === me ? 600 : 400}
                  fill="var(--foreground)"
                >
                  {tr.name.length > 14 ? `${tr.name.slice(0, 13)}…` : tr.name}
                </text>
                <rect x={x - 48} y={y - 82} width={96} height={110} fill="transparent" />
              </g>
            );
          })}
        </g>
      ))}
    </svg>
  );
}
