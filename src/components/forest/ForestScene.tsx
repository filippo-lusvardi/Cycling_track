import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { useWidth } from "@/components/tree/TreeBody";
import { ridgeAcross } from "@/lib/ridge";
import { SEASON_COLOR, rng, seedOf, type Season } from "@/lib/tree";
import type { TreeHeader } from "@/lib/forest/types";

export type SceneTree = { uid: string; name: string; header: TreeHeader | undefined };

/** The scenes' width in drawing units: the phone's 360; wider screens get more land, drawn a little larger. */
const worldWidth = (px: number) => (px < 640 ? 360 : Math.round(px / 1.5));

/**
 * A night scene across the whole window, drawn as wide as the window allows (see worldWidth). `fit` is the height,
 * in the same units, from the scene's top to the bottom of the window: how tall it can be and still end on screen.
 */
export function OpenScene({ children }: { children: (w: number, fit: number) => ReactNode }) {
  const [ref, px] = useWidth();
  const [room, setRoom] = useState(0);
  useEffect(() => {
    const measure = () => {
      const el = ref.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top + window.scrollY;
      setRoom(Math.max(0, window.innerHeight - top - 24));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [ref, px]);
  const w = worldWidth(px);
  return (
    <div ref={ref} className="open-scene">
      {px > 0 && children(w, (room * w) / px)}
    </div>
  );
}

/**
 * Wild conifers nobody owns, filling the land a wide scene adds: `at` gives each one's foot, or null to leave a
 * spot empty (where a member's tree or a wood stands). None at the phone's width, where there's no spare land.
 */
export function WildPines({
  seed,
  w,
  count,
  at,
  size = 1,
}: {
  seed: string;
  w: number;
  count: number;
  at: (r: () => number) => readonly [number, number] | null;
  size?: number;
}) {
  if (w <= 360) return null;
  const r = rng(seedOf(`${seed}pines`));
  const pines = Array.from({ length: count }, () => {
    const p = at(r);
    return p && ([p[0], p[1], (0.7 + r() * 0.6) * size] as const);
  })
    .filter((p) => p != null)
    .sort((a, b) => a[1] - b[1]);
  return (
    <g aria-hidden>
      {pines.map(([x, y, s], i) => (
        <g
          key={i}
          style={{ fill: "color-mix(in oklab, var(--pine) 22%, var(--background))" }}
          opacity={0.55 + 0.4 * Math.min(1, s / 1.3)}
        >
          <rect x={x - 0.6 * s} y={y - 3 * s} width={1.2 * s} height={3 * s} />
          <polygon
            points={`${x - 6 * s},${y - 3 * s} ${x},${y - 13 * s} ${x + 6 * s},${y - 3 * s}`}
          />
          <polygon
            points={`${x - 4.5 * s},${y - 9 * s} ${x},${y - 18 * s} ${x + 4.5 * s},${y - 9 * s}`}
          />
        </g>
      ))}
    </g>
  );
}

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
  w: W = 360,
}: {
  seed: string;
  trees: SceneTree[];
  labels?: boolean;
  onTree?: (uid: string) => void;
  w?: number;
}) {
  const uid = `forest${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const H = labels ? 190 : 140;
  const groundY = (x: number) => H * (labels ? 0.72 : 0.8) - Math.sin((x / W) * Math.PI) * 14;
  const stars = useMemo(() => {
    const r = rng(seedOf(`${seed}stars`));
    return Array.from(
      { length: Math.round((18 * W) / 360) },
      () => [r() * W, r() * H * 0.45, 0.25 + r() * 0.55] as const,
    );
  }, [seed, H, W]);
  const ridge = (key: string, top: number, depth: number) => {
    const ys = ridgeAcross(`${seed}${key}`, W, 1.3);
    const pts = ys.map(
      (y, i) => `${((i / (ys.length - 1)) * W).toFixed(1)},${(top + (1 - y) * depth).toFixed(1)}`,
    );
    return `0,${H} ${pts.join(" ")} ${W},${H}`;
  };
  const steps = Math.round((24 * W) / 360);
  const hill = Array.from({ length: steps + 1 }, (_, i) => {
    const x = (i / steps) * W;
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
      <WildPines
        seed={seed}
        w={W}
        count={Math.round((W - 360) / 22)}
        at={(r) => {
          const x = r() * W;
          // Clear of the members' trees, on the hillside.
          if (placed.some((p) => Math.abs(p.x - x) < 26)) return null;
          return [x, groundY(x) - 2 + r() * 10];
        }}
      />
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

/** Canopy slots, filled from the middle out: a thin crown is a small clump on its boughs, never loose dots. */
const SLOTS = 18;
const GOLDEN = Math.PI * (3 - Math.sqrt(5));

/**
 * One member's small tree: a leaning, tapered trunk that forks into limbs, then a rounded canopy in their season,
 * shaded underneath and lit on top (a seedling before they've published). `growth` (see lib/forest/age) makes an
 * old tree taller, with a somewhat broader crown and a thicker trunk.
 */
export function MiniTree({
  tr,
  x,
  y,
  size,
  seed,
  growth = 1,
}: {
  tr: SceneTree;
  x: number;
  y: number;
  size: number;
  seed: string;
  growth?: number;
}) {
  const crown = tr.header?.crown ?? null;
  const shadow = (
    <ellipse cx={x} cy={y + 0.5} rx={9 * size} ry={1.8 * size} fill="black" opacity={0.22} />
  );
  if (!crown) {
    // The seedling grows with the desktop grove's doubled trees; everywhere else it keeps its size.
    const k = size > 2 ? size / 1.3 : 1;
    return (
      <g opacity={0.85}>
        {shadow}
        <path
          d={`M${x},${y} Q${x - 1 * k},${y - 6 * k} ${x},${y - 11 * k}`}
          fill="none"
          stroke="var(--bark)"
          strokeWidth={1.4 * k}
          strokeLinecap="round"
        />
        <ellipse
          cx={x - 3.5 * k}
          cy={y - 10 * k}
          rx={4 * k}
          ry={2 * k}
          fill="var(--spring)"
          transform={`rotate(-25 ${x - 3.5 * k} ${y - 10 * k})`}
        />
        <ellipse
          cx={x + 3.5 * k}
          cy={y - 12 * k}
          rx={4 * k}
          ry={2 * k}
          fill="var(--spring)"
          transform={`rotate(25 ${x + 3.5 * k} ${y - 12 * k})`}
        />
      </g>
    );
  }
  const season: Season | null = crown.season;
  const r = rng(seedOf(seed));
  // Height follows age fully; width only partly, so old trees read as taller rather than just bigger.
  const broad = 0.7 + 0.3 * growth;
  const h = 46 * size * growth;
  const lean = (r() - 0.5) * 4 * size;
  const trunkW = (2.4 + 2.2 * size) * broad;
  const forkY = y - h * 0.46;
  const forkX = x + lean;
  const cx = forkX + lean * 0.4;
  const cy = y - h * 0.72;
  const rx = 17 * size * broad;
  const ry = 13.5 * size * broad;
  const color = season ? SEASON_COLOR[season] : "var(--muted-foreground)";
  const dark = `color-mix(in oklab, ${color} 62%, black)`;
  const light = `color-mix(in oklab, ${color} 60%, white)`;

  // Limbs curve up and out from the fork, ending inside the canopy; a twig off each outer one.
  const limbs = [-0.85, -0.3, 0.3, 0.85].map((s, i) => {
    const ex = cx + s * rx * (0.75 + r() * 0.2);
    const ey = cy - ry * (0.15 + (1 - Math.abs(s)) * 0.55) + (r() - 0.5) * 4 * size;
    const qx = forkX + (ex - forkX) * 0.25;
    const qy = forkY - (forkY - ey) * 0.6;
    const outer = i === 0 || i === 3;
    return { ex, ey, qx, qy, outer, w: (outer ? 0.5 : 0.4) * trunkW };
  });
  const twigs = limbs
    .filter((l) => l.outer)
    .map((l) => {
      const mx = (l.qx + l.ex) / 2;
      const my = (l.qy + l.ey) / 2;
      return { mx, my, tx: mx + Math.sign(l.ex - cx) * 5 * size, ty: my - 5 * size };
    });

  // Leaves follow the member's own crown: full in summer, thinner in spring and autumn, none in winter.
  const filled =
    crown.leaves > 0 ? Math.max(3, Math.round(SLOTS * Math.min(1, crown.leaves / 64))) : 0;
  const phase = r() * Math.PI * 2;
  const blobs = Array.from({ length: filled }, (_, i) => {
    const d = Math.sqrt((i + 0.5) / SLOTS) * 0.82;
    const a = phase + i * GOLDEN;
    return {
      bx: cx + Math.cos(a) * rx * d,
      by: cy + Math.sin(a) * ry * d,
      br: (4.6 + r() * 1.8) * size * broad,
    };
  });
  const blossom =
    season === "spring"
      ? blobs.filter((_, i) => i % 4 === 1).map((b) => [b.bx + r() * 2, b.by - b.br * 0.4] as const)
      : [];
  // Autumn drops a few leaves at the foot of the tree, more as the crown thins.
  const fallen =
    season === "autumn"
      ? Array.from(
          { length: Math.max(1, 5 - Math.round(filled / 4)) },
          () => [x + (r() - 0.5) * 18 * size, y + (r() - 0.3) * 1.6 * size, r() * 180] as const,
        )
      : [];

  return (
    <g>
      {shadow}
      {fallen.map(([fx, fy, rot], i) => (
        <ellipse
          key={`f${i}`}
          cx={fx}
          cy={fy}
          rx={1.6 * size}
          ry={0.8 * size}
          fill={color}
          opacity={0.75}
          transform={`rotate(${rot.toFixed(0)} ${fx.toFixed(1)} ${fy.toFixed(1)})`}
        />
      ))}
      <path
        d={`M${x - trunkW / 2},${y} Q${x - trunkW * 0.35 + lean * 0.3},${(y + forkY) / 2} ${forkX - trunkW * 0.22},${forkY} L${forkX + trunkW * 0.22},${forkY} Q${x + trunkW * 0.35 + lean * 0.3},${(y + forkY) / 2} ${x + trunkW / 2},${y} Z`}
        fill="var(--bark)"
      />
      <g stroke="var(--bark)" fill="none" strokeLinecap="round">
        {limbs.map((l, i) => (
          <path
            key={i}
            d={`M${forkX},${forkY + 1} Q${l.qx},${l.qy} ${l.ex},${l.ey}`}
            strokeWidth={l.w}
          />
        ))}
        {twigs.map((tw, i) => (
          <line key={`t${i}`} x1={tw.mx} y1={tw.my} x2={tw.tx} y2={tw.ty} strokeWidth={0.8} />
        ))}
      </g>
      {season === "winter" && (
        <g fill="var(--snow)">
          {limbs.map((l, i) => (
            <ellipse key={`s${i}`} cx={l.ex} cy={l.ey - 0.6} rx={1.8 * size} ry={0.9 * size} />
          ))}
          {twigs.map((tw, i) => (
            <circle key={`st${i}`} cx={tw.tx} cy={tw.ty - 0.4} r={0.9 * size} />
          ))}
        </g>
      )}
      {blobs.map((b, i) => (
        <circle key={`d${i}`} cx={b.bx} cy={b.by + 1.4 * size} r={b.br} fill={dark} />
      ))}
      {blobs.map((b, i) => (
        <circle key={`l${i}`} cx={b.bx} cy={b.by} r={b.br * 0.92} fill={color} />
      ))}
      {blobs
        .filter((b, i) => i % 2 === 0 && b.by < cy - ry * 0.15)
        .map((b, i) => (
          <circle
            key={`h${i}`}
            cx={b.bx - b.br * 0.3}
            cy={b.by - b.br * 0.35}
            r={b.br * 0.42}
            fill={light}
            opacity={0.35}
          />
        ))}
      {blossom.map(([bx, by], i) => (
        <circle key={`b${i}`} cx={bx} cy={by} r={1.3 * size} fill="var(--blossom)" />
      ))}
    </g>
  );
}
