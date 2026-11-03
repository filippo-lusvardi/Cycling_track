// The garden's plants, one drawing per crop (see lib/garden). Each stands with its foot at the origin, about 34 units
// tall at full size, and reads its session: height from duration, lushness from load, fruit from distance, climbing
// or time, fruit colour from ripeness (green the day it's done, ripe a week later), leaves tinted by intensity like
// the tree's, and the season of today's readiness on top (snow, blossom, autumn warmth). Colours are mixed from the
// theme so they read on the dark night.
import type { Critter, Crop } from "@/lib/garden";
import { LEVEL_COLOR, rng, type Level, type Season } from "@/lib/tree";

const mix = (a: string, pa: number, b: string) =>
  `color-mix(in oklab, ${a} ${Math.round(Math.min(100, Math.max(0, pa)))}%, ${b})`;

const FG = "var(--foreground)";
const BG = "var(--background)";
const BIRCH = "var(--birch)";
const BARK = "var(--bark)";
const AUTUMN = "var(--autumn)";
const LINGON = "var(--lingon)";
const SNOW = "var(--snow)";
const PINE = "var(--pine)";
const SUMMER = "var(--summer)";
const SPRING = "var(--spring)";
const BLOSSOM = "var(--blossom)";
const PRIMARY = "var(--primary)";

export type Look = {
  /** 0 → 1: height (duration). */
  size: number;
  /** 0 → 1: lushness (load). */
  vigor: number;
  fruit: number;
  /** 0 → 1: unripe → ripe. */
  ripeness: number;
  intensity: Level | null;
  seed: number;
  season: Season | null;
};

/** Leaf green, warmed in autumn, paler in spring, tinted a little by the session's intensity. */
function leafColor(l: Look, base = mix(SUMMER, 75, PINE)) {
  const seasonal =
    l.season === "autumn"
      ? mix(base, 55, AUTUMN)
      : l.season === "spring"
        ? mix(base, 70, SPRING)
        : l.season === "winter"
          ? mix(base, 70, mix(PINE, 60, BG))
          : base;
  return l.intensity ? mix(seasonal, 72, LEVEL_COLOR[l.intensity - 1]!) : seasonal;
}
const darker = (c: string, k = 30) => mix(c, 100 - k, "black");
/**
 * From the unripe colour through a turning one to the ripe colour, as fruit really ripens (a straight green → red
 * mix would pass through mud brown).
 */
const ripen = (unripe: string, ripe: string, r: number, turning = mix(BIRCH, 55, AUTUMN)) =>
  r < 0.5 ? mix(turning, r * 200, unripe) : mix(ripe, (r - 0.5) * 200, turning);

/** A few flakes of snow resting on a plant in a winter readiness. */
function SnowCaps({ pts, s = 1 }: { pts: [number, number][]; s?: number }) {
  return (
    <g fill={SNOW} opacity={0.92}>
      {pts.map(([x, y], i) => (
        <ellipse key={i} cx={x} cy={y - 0.6 * s} rx={1.7 * s} ry={0.8 * s} />
      ))}
    </g>
  );
}

const height = (l: Look, min = 12, max = 34) => min + (max - min) * l.size;

/** A run: a tomato plant tied to its cane, one tomato per 5 km. */
function Tomato({ l }: { l: Look }) {
  const r = rng(l.seed);
  const h = height(l, 14, 36);
  const leaf = leafColor(l);
  // The stem zigzags up beside the cane; leaves alternate; trusses of tomatoes hang from the nodes.
  const nodes = Array.from({ length: 5 }, (_, i) => {
    const y = -h * (0.18 + i * 0.18);
    return { x: (i % 2 ? 1.6 : -1.6) + (r() - 0.5), y };
  });
  const fruit = Array.from({ length: l.fruit }, (_, i) => {
    const n =
      nodes[Math.min(nodes.length - 1, Math.floor((i * nodes.length) / Math.max(1, l.fruit)))]!;
    return { x: n.x + (i % 2 ? 2.6 : -2.6) + (r() - 0.5) * 1.5, y: n.y + 3 + r() * 2.5 };
  });
  return (
    <g>
      <line
        x1={2.2}
        y1={0.5}
        x2={2.2}
        y2={-h - 3}
        stroke={mix(BARK, 70, BIRCH)}
        strokeWidth={1.1}
        strokeLinecap="round"
      />
      <polyline
        points={`0,0 ${nodes.map((n) => `${n.x},${n.y}`).join(" ")}`}
        fill="none"
        stroke={darker(leaf, 15)}
        strokeWidth={1.1 + l.vigor * 0.5}
        strokeLinejoin="round"
      />
      {nodes.map((n, i) => {
        // Leaves reach further on a heavier session.
        const d = (i % 2 ? 1 : -1) * (5.5 + l.vigor * 2.5);
        return (
          <path
            key={i}
            d={`M${n.x},${n.y} q${d * 0.6},-1 ${d},-4.5 q${-d * 0.45},0.5 ${-d},4.5 Z`}
            fill={leaf}
          />
        );
      })}
      {fruit.map((f, i) => (
        <g key={i}>
          <circle
            cx={f.x}
            cy={f.y}
            r={2.3}
            fill={ripen(mix(SPRING, 70, SUMMER), mix(LINGON, 85, AUTUMN), l.ripeness)}
          />
          <circle cx={f.x - 0.7} cy={f.y - 0.8} r={0.6} fill={FG} opacity={0.35} />
          <path
            d={`M${f.x - 1},${f.y - 2.1} l1,-0.8 l1,0.8`}
            stroke={PINE}
            strokeWidth={0.5}
            fill="none"
          />
        </g>
      ))}
      {l.season === "winter" && (
        <SnowCaps pts={nodes.map((n) => [n.x, n.y - 2] as [number, number])} />
      )}
    </g>
  );
}

/** Strength: a pumpkin on its vine, as big as the session was heavy. */
function Pumpkin({ l }: { l: Look }) {
  const r = rng(l.seed);
  const leaf = leafColor(l);
  const R = 4.5 + l.vigor * 6.5;
  const color = ripen(mix(SPRING, 55, mix(SUMMER, 60, SNOW)), mix(AUTUMN, 90, LINGON), l.ripeness);
  const leaves = [
    { x: -R - 4, y: -3, s: 1 },
    { x: R + 5, y: -4.5, s: 0.85 },
    { x: R * 0.7, y: -R * 1.1, s: 0.7 + l.size * 0.3 },
  ];
  return (
    <g>
      <path
        d={`M${-R - 9},-1 C${-R - 4},-6 ${-R},2 0,-1 C${R},-4 ${R + 6},1 ${R + 10},-2`}
        fill="none"
        stroke={darker(leaf, 20)}
        strokeWidth={1}
      />
      {leaves.map((v, i) => (
        <g key={i} transform={`translate(${v.x} ${v.y}) scale(${v.s})`}>
          <path
            d="M0,0 C-5,-1 -6,-6 -3,-8 C-2,-10 2,-10 3,-8 C6,-6 5,-1 0,0 Z"
            fill={leaf}
            transform={`rotate(${(r() - 0.5) * 40})`}
          />
        </g>
      ))}
      {/* Ribs: three overlapping lobes, the middle one in front. */}
      <ellipse cx={-R * 0.42} cy={-R * 0.78} rx={R * 0.62} ry={R * 0.8} fill={darker(color, 18)} />
      <ellipse cx={R * 0.42} cy={-R * 0.78} rx={R * 0.62} ry={R * 0.8} fill={darker(color, 18)} />
      <ellipse cx={0} cy={-R * 0.8} rx={R * 0.58} ry={R * 0.82} fill={color} />
      <ellipse cx={-R * 0.2} cy={-R * 1.15} rx={R * 0.18} ry={R * 0.3} fill={FG} opacity={0.18} />
      <path
        d={`M0,${-R * 1.55} q0.6,-2.4 2.4,-3`}
        stroke={mix(BARK, 60, PINE)}
        strokeWidth={1.4}
        strokeLinecap="round"
        fill="none"
      />
      {l.season === "winter" && (
        <SnowCaps
          pts={[
            [0, -R * 1.6],
            [-R - 4, -10],
            [R + 5, -10],
          ]}
        />
      )}
    </g>
  );
}

const FLOWER_COLORS = [
  BLOSSOM,
  BIRCH,
  LINGON,
  mix(PRIMARY, 70, SNOW),
  SNOW,
  mix(BLOSSOM, 60, PRIMARY),
];

/** Yoga, pilates, stretching: a clump of flowers, one bloom per 10 minutes, colours of its own. */
function Flowers({ l }: { l: Look }) {
  const r = rng(l.seed);
  const leaf = leafColor(l, mix(SUMMER, 70, SPRING));
  const n = Math.max(1, l.fruit);
  const base = Math.floor(r() * FLOWER_COLORS.length);
  const blooms = Array.from({ length: n }, (_, i) => {
    const x = (i - (n - 1) / 2) * 3.2 + (r() - 0.5) * 2;
    const y = -height(l, 9, 22) * (0.65 + r() * 0.35);
    return {
      x,
      y,
      c: FLOWER_COLORS[(base + (i % 2)) % FLOWER_COLORS.length]!,
      s: 0.85 + r() * 0.35,
    };
  });
  // Buds the day it's done, open the day after: blooms open as they "ripen" (faster than fruit).
  const open = Math.min(1, 0.45 + l.ripeness * 2);
  return (
    <g>
      {blooms.map((b, i) => (
        <path
          key={`s${i}`}
          d={`M${b.x * 0.3},0 Q${b.x * 0.6},${b.y * 0.5} ${b.x},${b.y}`}
          stroke={leaf}
          strokeWidth={0.8}
          fill="none"
        />
      ))}
      <path d="M-3,0 q-2,-4 -1,-7 q1.5,3 1,7 Z M3,0 q2,-4 1,-7 q-1.5,3 -1,7 Z" fill={leaf} />
      {blooms.map((b, i) => (
        <g key={i} transform={`translate(${b.x} ${b.y}) scale(${b.s * open})`}>
          {[0, 72, 144, 216, 288].map((a) => (
            <ellipse
              key={a}
              cx={0}
              cy={-1.7}
              rx={1.15}
              ry={1.7}
              fill={b.c}
              transform={`rotate(${a})`}
            />
          ))}
          <circle r={0.95} fill={b.c === BIRCH ? AUTUMN : BIRCH} />
        </g>
      ))}
      {l.season === "winter" && (
        <SnowCaps pts={blooms.slice(0, 3).map((b) => [b.x, b.y - 2] as [number, number])} s={0.7} />
      )}
    </g>
  );
}

/** Walks and hikes: a rosemary bush, blue flowers for every 100 m climbed. */
function Herbs({ l }: { l: Look }) {
  const r = rng(l.seed);
  const leaf = leafColor(l, mix(PINE, 55, mix(FG, 45, SUMMER)));
  const h = height(l, 10, 26);
  const count = 7 + Math.round(l.vigor * 5);
  const stems = Array.from({ length: count }, (_, i) => {
    const a = -Math.PI / 2 + (i / (count - 1) - 0.5) * 1.6 + (r() - 0.5) * 0.2;
    const len = h * (0.65 + r() * 0.35) * (1 - Math.abs(a + Math.PI / 2) * 0.25);
    return { a, len };
  });
  const flowers = Array.from({ length: l.fruit }, (_, i) => stems[(i * 3) % stems.length]!);
  return (
    <g>
      {stems.map(({ a, len }, i) => {
        const [ex, ey] = [Math.cos(a) * len, Math.sin(a) * len];
        return (
          <g key={i}>
            <line x1={0} y1={0} x2={ex} y2={ey} stroke={darker(leaf, 25)} strokeWidth={0.7} />
            {Array.from({ length: 5 }, (_, k) => {
              const f = 0.25 + k * 0.17;
              return (
                <path
                  key={k}
                  d={`M${ex * f},${ey * f} l${k % 2 ? 2.2 : -2.2},-1.4`}
                  stroke={leaf}
                  strokeWidth={1}
                  strokeLinecap="round"
                />
              );
            })}
          </g>
        );
      })}
      {flowers.map(({ a, len }, i) => (
        <circle
          key={i}
          cx={Math.cos(a) * len * 0.9}
          cy={Math.sin(a) * len * 0.9}
          r={1.1}
          fill={mix(PRIMARY, 55, BLOSSOM)}
        />
      ))}
      {l.season === "winter" && (
        <SnowCaps
          pts={stems
            .filter((_, i) => i % 2)
            .map(({ a, len }) => [Math.cos(a) * len, Math.sin(a) * len])}
          s={0.8}
        />
      )}
    </g>
  );
}

/** Swimming: a water lily on the pond, a flower for every 500 m. Drawn flat, as seen across the water. */
function Lily({ l }: { l: Look }) {
  const r = rng(l.seed);
  const R = 5 + l.size * 5;
  const pad = leafColor(l, mix(SUMMER, 60, PINE));
  const n = Math.min(4, l.fruit);
  const open = Math.min(1, 0.4 + l.ripeness * 2);
  return (
    <g>
      <path
        d={`M0,0 m${-R},0 a${R},${R * 0.38} 0 1,0 ${2 * R},0 a${R},${R * 0.38} 0 0,0 ${-R * 0.9},${-R * 0.37} L0,0 Z`}
        fill={pad}
      />
      <path d={`M0,0 L${R * 0.95},${-R * 0.1}`} stroke={darker(pad, 25)} strokeWidth={0.5} />
      {Array.from({ length: n }, (_, i) => {
        const x = (i - (n - 1) / 2) * R * 0.5 + (r() - 0.5);
        const y = -1.5 - (i % 2) * 1.2;
        const c = i % 2 ? SNOW : mix(BLOSSOM, 80, SNOW);
        return (
          <g key={i} transform={`translate(${x} ${y}) scale(${open})`}>
            {[-50, -25, 0, 25, 50].map((a) => (
              <ellipse
                key={a}
                cx={0}
                cy={-2.2}
                rx={0.95}
                ry={2.3}
                fill={c}
                transform={`rotate(${a})`}
              />
            ))}
            <circle cy={-0.6} r={0.9} fill={BIRCH} />
          </g>
        );
      })}
    </g>
  );
}

/** Skiing: winter kale, a ruffled blue-green rosette that doesn't mind the snow, as big as the outing was long. */
function Kale({ l }: { l: Look }) {
  const r = rng(l.seed);
  // Hardy: it keeps its blue-green whatever the season.
  const leaf = leafColor(
    { ...l, season: l.season === "autumn" ? "summer" : l.season },
    mix(PINE, 60, mix(PRIMARY, 50, BG)),
  );
  const s = 0.6 + l.size * 0.6;
  const leaves = Array.from({ length: 7 }, (_, i) => (i / 6 - 0.5) * 140 + (r() - 0.5) * 10);
  return (
    <g transform={`scale(${s})`}>
      {leaves.map((a, i) => (
        <g key={i} transform={`rotate(${a})`}>
          <path
            d="M0,0 C-3,-4 -3.4,-10 -1.4,-15 C-0.6,-14 0.6,-14 1.4,-15 C3.4,-10 3,-4 0,0 Z"
            fill={i % 2 ? leaf : darker(leaf, 15)}
          />
          <path d="M0,-1 L0,-13" stroke={mix(leaf, 60, SNOW)} strokeWidth={0.5} />
        </g>
      ))}
      {/* Frost-tolerant: always a little snow on it, more in a winter readiness. */}
      <SnowCaps
        pts={
          l.season === "winter"
            ? [
                [-8, -9],
                [0, -14],
                [8, -9],
                [-4, -12],
              ]
            : [[0, -14]]
        }
      />
    </g>
  );
}

/** Rowing and paddling: reeds at the pond's edge, a cattail for every 3 km. */
function Reeds({ l }: { l: Look }) {
  const r = rng(l.seed);
  const leaf = leafColor(l, mix(SUMMER, 50, mix(BIRCH, 40, PINE)));
  const h = height(l, 16, 36);
  const blades = Array.from({ length: 6 }, (_, i) => ({
    x: (i - 2.5) * 1.6,
    lean: (r() - 0.5) * 8,
    hh: h * (0.6 + r() * 0.35),
  }));
  const heads = Array.from(
    { length: Math.min(5, l.fruit) },
    (_, i) => blades[(i * 2 + 1) % blades.length]!,
  );
  return (
    <g>
      {blades.map((b, i) => (
        <path
          key={i}
          d={`M${b.x},0 Q${b.x + b.lean * 0.3},${-b.hh * 0.6} ${b.x + b.lean},${-b.hh}`}
          stroke={leaf}
          strokeWidth={1.1}
          fill="none"
          strokeLinecap="round"
        />
      ))}
      {heads.map((b, i) => {
        const [x, y] = [b.x + b.lean * 0.75, -b.hh * 0.82];
        return (
          <rect
            key={i}
            x={x - 1.1}
            y={y - 3.5}
            width={2.2}
            height={6}
            rx={1.1}
            fill={ripen(mix(BIRCH, 50, PINE), mix(BARK, 80, "black"), l.ripeness)}
          />
        );
      })}
    </g>
  );
}

/** Climbing: runner beans winding up a pole as tall as the session was long, pods by load, red flowers. */
function Beans({ l }: { l: Look }) {
  const r = rng(l.seed);
  const leaf = leafColor(l);
  const h = height(l, 18, 40);
  const turns = Array.from({ length: 9 }, (_, i) => {
    const y = -h * (i / 8);
    return `${(i % 2 ? 2.4 : -2.4) + (r() - 0.5)},${y}`;
  });
  const leaves = Array.from({ length: 6 }, (_, i) => ({
    x: i % 2 ? 3 : -3,
    y: -h * (0.15 + i * 0.14),
  }));
  // Pods hang from the upper leaves, never from the ground.
  const pods = Array.from(
    { length: Math.min(5, l.fruit) },
    (_, i) => leaves[1 + (i % (leaves.length - 1))]!,
  );
  return (
    <g>
      <line
        x1={0}
        y1={1}
        x2={0}
        y2={-h - 2}
        stroke={mix(BARK, 85, BIRCH)}
        strokeWidth={1.4}
        strokeLinecap="round"
      />
      <polyline
        points={`0,0 ${turns.join(" ")}`}
        fill="none"
        stroke={darker(leaf, 15)}
        strokeWidth={0.8}
      />
      {leaves.map((v, i) => (
        <path
          key={i}
          d={`M${v.x},${v.y} c${v.x > 0 ? 3 : -3},-1 ${v.x > 0 ? 4 : -4},-4 ${v.x > 0 ? 2 : -2},-5.5 c${v.x > 0 ? -1.2 : 1.2},1 ${v.x > 0 ? -2.5 : 2.5},2.5 ${v.x > 0 ? -2 : 2},5.5 Z`}
          fill={leaf}
        />
      ))}
      {pods.map((v, i) => (
        <path
          key={`p${i}`}
          d={`M${v.x * 0.6},${v.y + 1} q${v.x > 0 ? 1.8 : -1.8},3 ${v.x > 0 ? 0.8 : -0.8},6.5`}
          stroke={ripen(SPRING, mix(SUMMER, 80, PINE), l.ripeness)}
          strokeWidth={1.4}
          strokeLinecap="round"
          fill="none"
        />
      ))}
      {leaves.slice(1, 4).map((v, i) => (
        <circle key={`f${i}`} cx={-v.x * 0.5} cy={v.y - 2} r={0.9} fill={LINGON} />
      ))}
      {l.season === "winter" && <SnowCaps pts={[[0, -h - 2]]} />}
    </g>
  );
}

/** Any other sport: a sunflower, its head as big as the session's load, turned toward the light. */
function Sunflower({ l }: { l: Look }) {
  const leaf = leafColor(l);
  const h = height(l, 18, 40);
  const R = 2.6 + l.vigor * 2.6;
  const petal = l.season === "autumn" ? mix(BIRCH, 70, AUTUMN) : BIRCH;
  return (
    <g>
      <path
        d={`M0,0 Q1.5,${-h * 0.5} 1,${-h}`}
        stroke={darker(leaf, 15)}
        strokeWidth={1.3}
        fill="none"
      />
      <path
        d={`M0.8,${-h * 0.35} c4,-1 6,-4 6,-6 c-3,0 -5,2 -6,6 Z M0.6,${-h * 0.55} c-4,-1 -6,-4 -6,-6 c3,0 5,2 6,6 Z`}
        fill={leaf}
      />
      <g transform={`translate(1.5 ${-h}) rotate(15)`}>
        {Array.from({ length: 12 }, (_, i) => (
          <ellipse
            key={i}
            cx={0}
            cy={-R - 1.4}
            rx={0.9}
            ry={2}
            fill={petal}
            transform={`rotate(${i * 30})`}
          />
        ))}
        <circle r={R} fill={mix(BARK, 60, "black")} />
        <circle r={R * 0.55} fill={mix(BARK, 45, AUTUMN)} opacity={0.6} />
      </g>
      {l.season === "winter" && <SnowCaps pts={[[1.5, -h - R - 2]]} />}
    </g>
  );
}

/** Carrots: feathery tops over orange shoulders peeking from the soil, one per fruit, deeper orange as they ripen. */
function Carrot({ l }: { l: Look }) {
  const r = rng(l.seed);
  const leaf = leafColor(l, mix(SUMMER, 70, SPRING));
  const h = height(l, 10, 24);
  const n = Math.max(1, Math.min(4, l.fruit || 1));
  const orange = ripen(mix(BIRCH, 70, AUTUMN), mix(AUTUMN, 85, LINGON), l.ripeness);
  const roots = Array.from({ length: n }, (_, i) => (i - (n - 1) / 2) * 4.2 + (r() - 0.5));
  return (
    <g>
      {roots.map((x, i) => (
        <g key={i}>
          {/* The fronds: a few stems, each with fine leaflets along it. */}
          {[-0.5, -0.15, 0.2, 0.55].map((a, k) => {
            const len = h * (0.75 + r() * 0.3);
            const ex = x + Math.sin(a) * len * 0.5;
            const ey = -len;
            return (
              <g key={k}>
                <path
                  d={`M${x},-1 Q${x + (ex - x) * 0.3},${ey * 0.6} ${ex},${ey}`}
                  stroke={darker(leaf, 15)}
                  strokeWidth={0.6}
                  fill="none"
                />
                {[0.45, 0.65, 0.85].map((f) => (
                  <path
                    key={f}
                    d={`M${x + (ex - x) * f},${ey * f} l-1.4,-1.2 M${x + (ex - x) * f},${ey * f} l1.4,-1.2`}
                    stroke={leaf}
                    strokeWidth={0.7}
                    strokeLinecap="round"
                  />
                ))}
              </g>
            );
          })}
          <path d={`M${x - 1.8},0.4 C${x - 2},-1.6 ${x + 2},-1.6 ${x + 1.8},0.4 Z`} fill={orange} />
        </g>
      ))}
      {l.season === "winter" && (
        <SnowCaps pts={roots.map((x) => [x, -h * 0.85] as [number, number])} s={0.7} />
      )}
    </g>
  );
}

/** Lettuce: a ruffled rosette, outer leaves darker, the heart pale, as big as the session was long. */
function Lettuce({ l }: { l: Look }) {
  const r = rng(l.seed);
  const outer = leafColor(l, mix(SUMMER, 60, SPRING));
  const inner = mix(SPRING, 70, SNOW);
  const s = 0.55 + l.size * 0.6;
  const ring = (n: number, rad: number, color: string, lift: number) =>
    Array.from({ length: n }, (_, i) => {
      const a = Math.PI + (i / (n - 1)) * Math.PI;
      return (
        <ellipse
          key={`${rad}-${i}`}
          cx={Math.cos(a) * rad}
          cy={-lift + Math.sin(a) * rad * 0.45}
          rx={4.6 + r() * 1.2}
          ry={3.6 + r()}
          fill={color}
          stroke={darker(color, 22)}
          strokeWidth={0.4}
        />
      );
    });
  return (
    <g transform={`scale(${s})`}>
      {ring(6, 7.5, outer, 3)}
      {ring(5, 4.5, mix(outer, 55, inner), 5)}
      {ring(3, 2, inner, 7)}
      <ellipse cx={0} cy={-8} rx={2.6} ry={2} fill={inner} />
      {l.season === "winter" && (
        <SnowCaps
          pts={[
            [-5, -7],
            [0, -10],
            [5, -7],
          ]}
        />
      )}
    </g>
  );
}

/** Strawberries: a low plant of trefoil leaves, white flowers, and a berry per fruit ripening green → white → red. */
function Strawberry({ l }: { l: Look }) {
  const r = rng(l.seed);
  const leaf = leafColor(l);
  const s = 0.6 + l.size * 0.5;
  const berry = ripen(
    mix(SPRING, 70, SUMMER),
    mix(LINGON, 90, BLOSSOM),
    l.ripeness,
    mix(SNOW, 80, SPRING),
  );
  const n = Math.max(1, Math.min(6, l.fruit || 1));
  return (
    <g transform={`scale(${s})`}>
      {/* Trefoil leaves on short stems. */}
      {[-7, -2.5, 2.5, 7].map((x, i) => {
        const y = -6 - (i % 2) * 3;
        return (
          <g key={i}>
            <path
              d={`M0,0 Q${x * 0.5},${y * 0.6} ${x},${y}`}
              stroke={darker(leaf, 20)}
              strokeWidth={0.6}
              fill="none"
            />
            {[-55, 0, 55].map((a) => (
              <ellipse
                key={a}
                cx={x}
                cy={y - 2.2}
                rx={1.6}
                ry={2.4}
                fill={a === 0 ? leaf : darker(leaf, 10)}
                transform={`rotate(${a} ${x} ${y})`}
              />
            ))}
          </g>
        );
      })}
      {/* A flower or two. */}
      {[-4, 5].slice(0, l.ripeness < 0.6 ? 2 : 1).map((x) => (
        <g key={x} transform={`translate(${x} -11)`}>
          {[0, 72, 144, 216, 288].map((a) => (
            <circle key={a} cx={0} cy={-1.1} r={0.9} fill={SNOW} transform={`rotate(${a})`} />
          ))}
          <circle r={0.6} fill={BIRCH} />
        </g>
      ))}
      {/* Berries hanging over the edge, seeds dotted on. */}
      {Array.from({ length: n }, (_, i) => {
        const x = (i - (n - 1) / 2) * 3.4 + (r() - 0.5);
        const y = -1.5 - (i % 2) * 1.2;
        return (
          <g key={`b${i}`}>
            <path
              d={`M${x},${y - 2.4} q${x > 0 ? 1 : -1},-2 ${x > 0 ? 2 : -2},-3`}
              stroke={leaf}
              strokeWidth={0.5}
              fill="none"
            />
            <path
              d={`M${x - 1.6},${y - 2.2} Q${x - 1.8},${y + 0.6} ${x},${y + 1.4} Q${x + 1.8},${y + 0.6} ${x + 1.6},${y - 2.2} Q${x},${y - 3} ${x - 1.6},${y - 2.2} Z`}
              fill={berry}
            />
            <path
              d={`M${x - 1.2},${y - 2.5} l1.2,-0.8 l1.2,0.8`}
              stroke={PINE}
              strokeWidth={0.6}
              fill="none"
            />
            {[
              [-0.6, -1],
              [0.6, -0.4],
              [0, 0.3],
            ].map(([dx, dy], k) => (
              <circle key={k} cx={x + dx!} cy={y + dy!} r={0.2} fill={BIRCH} opacity={0.9} />
            ))}
          </g>
        );
      })}
      {l.season === "winter" && (
        <SnowCaps
          pts={[
            [-7, -10],
            [2.5, -10],
          ]}
          s={0.7}
        />
      )}
    </g>
  );
}

/** Aubergines: a soft-leaved bush with a glossy fruit per fruit, green → deep purple as they ripen. */
function Aubergine({ l }: { l: Look }) {
  const r = rng(l.seed);
  const leaf = leafColor(l, mix(SUMMER, 70, PINE));
  const h = height(l, 14, 30);
  const purple = ripen(
    mix(SPRING, 60, SUMMER),
    "oklch(0.4 0.13 310)",
    l.ripeness,
    "oklch(0.6 0.1 330)",
  );
  const n = Math.max(1, Math.min(4, l.fruit || 1));
  const leaves = Array.from({ length: 6 }, (_, i) => ({
    x: (i % 2 ? 1 : -1) * (3 + r() * 2),
    y: -h * (0.3 + i * 0.12),
    a: (i % 2 ? 1 : -1) * (25 + r() * 20),
  }));
  return (
    <g>
      <path
        d={`M0,0 Q-1,${-h * 0.5} 0.5,${-h}`}
        stroke={darker(leaf, 25)}
        strokeWidth={1.2}
        fill="none"
      />
      {leaves.map((v, i) => (
        <ellipse
          key={i}
          cx={v.x}
          cy={v.y}
          rx={4.4 + l.vigor * 1.6}
          ry={2.4}
          fill={i % 2 ? leaf : darker(leaf, 10)}
          transform={`rotate(${v.a} ${v.x} ${v.y})`}
        />
      ))}
      {Array.from({ length: n }, (_, i) => {
        const x = (i % 2 ? 1 : -1) * (2.2 + Math.floor(i / 2) * 2.4);
        const y = -h * (0.2 + (i % 3) * 0.12);
        return (
          <g key={`f${i}`} transform={`rotate(${x > 0 ? -12 : 12} ${x} ${y})`}>
            <ellipse cx={x} cy={y + 3.6} rx={1.9} ry={3.6} fill={purple} />
            <ellipse cx={x - 0.6} cy={y + 2.6} rx={0.5} ry={1.4} fill={SNOW} opacity={0.35} />
            <path
              d={`M${x - 1.6},${y + 0.6} L${x},${y - 0.6} L${x + 1.6},${y + 0.6} L${x},${y + 1.4} Z`}
              fill={PINE}
            />
          </g>
        );
      })}
      {l.season === "winter" && (
        <SnowCaps pts={leaves.slice(3).map((v) => [v.x, v.y - 2] as [number, number])} />
      )}
    </g>
  );
}

const DRAW: Record<Crop, (p: { l: Look }) => React.JSX.Element> = {
  tomato: Tomato,
  pumpkin: Pumpkin,
  flowers: Flowers,
  herbs: Herbs,
  lily: Lily,
  kale: Kale,
  reeds: Reeds,
  beans: Beans,
  sunflower: Sunflower,
  carrot: Carrot,
  lettuce: Lettuce,
  strawberry: Strawberry,
  aubergine: Aubergine,
};

/** One plant at (x, y), its feet on the soil, scaled by `s`. */
export function Plant({
  crop,
  l,
  x,
  y,
  s = 1,
}: {
  crop: Crop;
  l: Look;
  x: number;
  y: number;
  s?: number;
}) {
  const Draw = DRAW[crop];
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <Draw l={l} />
    </g>
  );
}

/** The record animals, sitting at the foot of their plant (feet at the origin, facing right). */
export function GardenCritter({
  kind,
  x,
  y,
  s = 1,
}: {
  kind: Critter;
  x: number;
  y: number;
  s?: number;
}) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      {kind === "hedgehog" && <Hedgehog />}
      {kind === "frog" && <Frog />}
      {kind === "snail" && <Snail />}
    </g>
  );
}

/** The longest run: a hedgehog snuffling under the tomatoes. */
function Hedgehog() {
  const spines = mix(BARK, 70, "black");
  return (
    <g>
      <path d="M-8,0 C-9,-5 -5,-9 0,-9 C4,-9 7,-6 7.5,-3 L7.6,0 Z" fill={spines} />
      {Array.from({ length: 11 }, (_, i) => {
        const a = Math.PI + (i / 10) * Math.PI * 0.95;
        const [x, y] = [Math.cos(a) * 8, Math.sin(a) * 8.5];
        return (
          <path
            key={i}
            d={`M${x * 0.8},${y * 0.8 - 0.5} l${Math.cos(a) * 2.6},${Math.sin(a) * 2.6}`}
            stroke={mix(spines, 70, BIRCH)}
            strokeWidth={0.8}
            strokeLinecap="round"
          />
        );
      })}
      <path
        d="M4,-1 C4,-4.5 7,-5.5 9,-4 L12,-2.4 C11,-1 8,0 4,-1 Z"
        fill={mix(AUTUMN, 35, mix(FG, 50, BARK))}
      />
      <circle cx={12} cy={-2.3} r={0.8} fill={BG} />
      <circle cx={8.6} cy={-3.6} r={0.6} fill={BG} />
      <path d="M-4,0 l0,0.8 M2,0 l0,0.8" stroke={BG} strokeWidth={1} strokeLinecap="round" />
    </g>
  );
}

/** The longest swim: a frog sitting on its lily pad. */
function Frog() {
  const skin = mix(SPRING, 60, SUMMER);
  return (
    <g>
      <path d="M-6,0 C-7,-4 -4,-7 0,-7 C4,-7 7,-4 6,0 Z" fill={skin} />
      <path
        d="M-6,0 c-2,0 -3,-1.5 -2,-2.5 M6,0 c2,0 3,-1.5 2,-2.5"
        stroke={darker(skin, 25)}
        strokeWidth={1.3}
        strokeLinecap="round"
        fill="none"
      />
      <circle cx={-3} cy={-7} r={2} fill={skin} />
      <circle cx={3} cy={-7} r={2} fill={skin} />
      <circle cx={-3} cy={-7.2} r={1} fill={BG} />
      <circle cx={3} cy={-7.2} r={1} fill={BG} />
      <path d="M-2.5,-3.6 q2.5,1.6 5,0" stroke={darker(skin, 35)} strokeWidth={0.6} fill="none" />
      <ellipse cx={0} cy={-1.6} rx={3} ry={1.4} fill={mix(SNOW, 70, SPRING)} opacity={0.7} />
    </g>
  );
}

/** The longest walk or hike: a snail, slow and sure, among the herbs. */
function Snail() {
  const shell = mix(AUTUMN, 55, BARK);
  const body = mix(FG, 55, BIRCH);
  return (
    <g>
      <path
        d="M-7.5,0 C-7.5,-1.6 2,-2.4 6.6,-2 C7.8,-2.6 8.2,-4.2 8,-5.4 C9,-5.6 9.8,-4.4 9.6,-3 C9.4,-1 8,0 6,0 Z"
        fill={body}
      />
      <path
        d="M8.2,-5.2 L8.8,-8.2 M8.8,-5.4 L10.4,-7.8"
        stroke={body}
        strokeWidth={0.7}
        strokeLinecap="round"
      />
      <circle cx={8.8} cy={-8.3} r={0.55} fill={body} />
      <circle cx={10.4} cy={-7.9} r={0.55} fill={body} />
      <circle cx={-0.6} cy={-5.6} r={4.8} fill={shell} />
      <path
        d="M-0.6,-5.6 m-3,0 a3,3 0 1,1 3,3 a1.9,1.9 0 1,1 -1.7,-2.3"
        stroke={darker(shell, 30)}
        strokeWidth={0.8}
        fill="none"
      />
    </g>
  );
}

/** The empty garden's scarecrow, keeping the freshly tilled beds company. */
export function Scarecrow({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  const wood = mix(BARK, 80, BIRCH);
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <line x1={0} y1={0} x2={0} y2={-30} stroke={wood} strokeWidth={1.6} />
      <line x1={-11} y1={-21} x2={11} y2={-21} stroke={wood} strokeWidth={1.4} />
      <path d="M-6,-22 L6,-22 L5,-11 L-5,-11 Z" fill={mix(LINGON, 55, BARK)} />
      <path d="M-11,-21 L-6,-22 L-6,-19 Z M11,-21 L6,-22 L6,-19 Z" fill={mix(LINGON, 55, BARK)} />
      <path
        d="M-1,-11 l-1,4 M1,-11 l1,4 M-11,-21 l-1.5,2 M11,-21 l1.5,2"
        stroke={BIRCH}
        strokeWidth={0.8}
      />
      <circle cx={0} cy={-26} r={3.6} fill={mix(BIRCH, 60, BARK)} />
      <path
        d="M-6,-28 L6,-28 L3.4,-29 L2.6,-33 L-2.6,-33 L-3.4,-29 Z"
        fill={mix(BARK, 70, "black")}
      />
      <circle cx={-1.2} cy={-26.4} r={0.5} fill={BG} />
      <circle cx={1.2} cy={-26.4} r={0.5} fill={BG} />
      <path d="M-1.4,-24.6 q1.4,0.8 2.8,0" stroke={BG} strokeWidth={0.5} fill="none" />
    </g>
  );
}
