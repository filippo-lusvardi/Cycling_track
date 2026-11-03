import { useId, useMemo } from "react";
import { MiniTree, WildPines, type SceneTree } from "@/components/forest/ForestScene";
import { auth } from "@/lib/firebase";
import { treeGrowth } from "@/lib/forest/age";
import { t } from "@/lib/i18n";
import { ridgeAcross } from "@/lib/ridge";
import { isoDate } from "@/lib/training";
import { rng, seedOf } from "@/lib/tree";

const TOP = 74;
const ROW = 128;
/** Room each tree takes in a row. */
const GAP = 120;

/**
 * A forest's members as a grove at night: their trees stand in rows on rolling hills under the mountains, each in
 * its season, with only a name beneath; a wide scene has longer rows and wild pines around them. Tap a tree to see it
 * whole.
 */
export function ForestGrove({
  seed,
  trees,
  onTree,
  me = auth.currentUser?.uid,
  w: W = 360,
  fit = 0,
}: {
  seed: string;
  trees: SceneTree[];
  onTree: (uid: string) => void;
  me?: string;
  w?: number;
  /** The height that fits on screen (see OpenScene): a wide grove grows wild hills behind up to it. */
  fit?: number;
}) {
  // Three to a row on the phone, as many as fit (with a margin) on a wide scene.
  // On a wide scene the members' trees are drawn twice as big (easier to see and to click), so rows are taller and
  // the trees further apart; the wild hills behind keep the phone's size.
  const big = W > 360 ? 2 : 1;
  const gap = big > 1 ? GAP * 1.3 : GAP;
  // Rows leave room for the oldest, tallest trees (see lib/forest/age) to clear the names in the row behind.
  const mrow = big > 1 ? ROW * 1.8 : ROW * 1.1;
  const perRow = W <= 360 ? 3 : Math.floor(W / gap) - 1;
  const uid = `grove${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const today = isoDate(new Date());
  // Me first, then by name.
  const sorted = [...trees].sort(
    (a, b) => Number(b.uid === me) - Number(a.uid === me) || a.name.localeCompare(b.name),
  );
  const rows = Math.max(1, Math.ceil(sorted.length / perRow));
  // A wide scene fills the window down to its bottom edge: wild hills behind, the members in front.
  // Whole hills first; what's left over (less than a hill) spreads out between the wild hills (or, with none, between
  // the mountains and the first row).
  const spare = W <= 360 ? 0 : Math.max(0, Math.min(fit, W * 0.5) - (TOP + rows * mrow + 10));
  const back = Math.floor(spare / ROW);
  const pad = spare - back * ROW;
  const all = back + rows;
  const H = TOP + pad + back * ROW + rows * mrow + 10;
  // The mountains' flat foot hides behind the first hill (on the phone, where it always has, just above it).
  const ridgeFoot = W <= 360 ? TOP + 50 : back ? TOP + 96 : TOP + pad + mrow - 30;
  const stars = useMemo(() => {
    const r = rng(seedOf(`${seed}grove-stars`));
    return Array.from(
      { length: Math.round((24 * W) / 360) },
      () => [r() * W, r() * TOP, 0.25 + r() * 0.55] as const,
    );
  }, [seed, W]);
  const far = ridgeAcross(`${seed}grove`, W, 1.3);
  // Each row its own gentle hill, a little lighter toward you; trees stand on its line.
  const hillY = (row: number, x: number) => {
    const phase = rng(seedOf(`${seed}hill${row}`))() * Math.PI * 2;
    const top =
      row < back
        ? TOP + row * ROW + (row * pad) / back
        : TOP + back * ROW + pad + (row - back) * mrow;
    // A members' row puts its hill line lower, under the taller trees.
    return (
      top + (row < back ? 86 : mrow - 42) - 10 * Math.sin((x / 360) * Math.PI * 1.3 + phase) - 6
    );
  };
  // Rows alternate their offset, so the grove doesn't read as a grid; on a wide scene they stand mid-field.
  const left = W <= 360 ? 0 : (W - Math.min(sorted.length, perRow) * gap) / 2;
  const spots = sorted.map((tr, i) => {
    const row = Math.floor(i / perRow);
    const k = i % perRow;
    const r = rng(seedOf(`${seed}${tr.uid}`));
    return {
      tr,
      row: back + row,
      x: left + gap / 2 + k * gap + (row % 2 ? 22 : -8) + (r() - 0.5) * 14,
    };
  });
  // Lighter toward you; the wild hills behind stay darker, in the distance.
  const shade = (row: number) =>
    row < back
      ? 25 + (row / Math.max(1, back)) * 30
      : 60 + ((row - back) / Math.max(1, rows - 1)) * 40;
  const hill = (row: number) => {
    const steps = Math.round((24 * W) / 360);
    const pts = Array.from({ length: steps + 1 }, (_, i) => {
      const x = (i / steps) * W;
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
        points={`0,${ridgeFoot} ${far.map((y, i) => `${((i / (far.length - 1)) * W).toFixed(1)},${(14 + (1 - y) * 52).toFixed(1)}`).join(" ")} ${W},${ridgeFoot}`}
        fill="var(--border)"
        opacity={0.45}
      />
      {Array.from({ length: all }, (_, row) => (
        <g key={row}>
          <path
            d={hill(row)}
            style={{
              fill: `color-mix(in oklab, var(--secondary) ${shade(row)}%, var(--background))`,
            }}
          />
          <WildPines
            seed={`${seed}${row}`}
            w={W}
            count={Math.round((W - 360) / (row < back ? 9 : 30))}
            at={(r) => {
              const x = r() * W;
              if (spots.some((p) => p.row === row && Math.abs(p.x - x) < 52 * big)) return null;
              // On the wild hills they crowd the crest, thinning down the slope.
              return [x, hillY(row, x) - 4 + (row < back ? r() ** 2 * 50 : r() * 8)];
            }}
            size={row < back ? 0.75 + (row / Math.max(1, back)) * 0.25 : 1}
          />
          {spots
            .filter((p) => p.row === row)
            .map(({ tr, x }) => {
              const r = rng(seedOf(`${seed}${tr.uid}`));
              r(); // the offset, taken in spots
              const y = hillY(row, x) + 3;
              const grow = treeGrowth(tr.header, today);
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
                  <MiniTree
                    tr={tr}
                    x={x}
                    y={y}
                    // Only a touch of randomness: height is for age and kilometres to tell.
                    size={(1.3 + r() * 0.05) * big}
                    seed={`${seed}${tr.uid}`}
                    growth={grow}
                  />
                  <text
                    x={x}
                    y={y + 20 + (big - 1) * 4}
                    textAnchor="middle"
                    fontSize={big > 1 ? 15 : 12}
                    fontWeight={tr.uid === me ? 600 : 400}
                    fill="var(--foreground)"
                  >
                    {tr.name.length > 14 ? `${tr.name.slice(0, 13)}…` : tr.name}
                  </text>
                  <rect
                    x={x - 48 * big}
                    y={y - 82 * big * Math.max(0.8, grow)}
                    width={96 * big}
                    height={82 * big * Math.max(0.8, grow) + 28 + (big - 1) * 6}
                    fill="transparent"
                  />
                </g>
              );
            })}
        </g>
      ))}
    </svg>
  );
}
