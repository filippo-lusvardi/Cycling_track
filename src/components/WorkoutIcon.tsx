// The plant or animal each workout is named after (see lib/workout-species). Flat fills mixed from the theme, like Critters.tsx
// and Crops.tsx. Feet at the origin, facing right, in one box: as an icon every species is the same size.
import { memo, type ComponentType } from "react";
import { speciesOf, type SpeciesKey } from "@/lib/workout-species";
const mix = (a: string, pa: number, b: string) => `color-mix(in oklab, ${a} ${pa}%, ${b})`;
const FG = "var(--foreground)",
  BG = "var(--scene-background)",
  BIRCH = "var(--birch)",
  BARK = "var(--bark)",
  AUTUMN = "var(--autumn)",
  LINGON = "var(--lingon)",
  SNOW = "var(--snow)",
  PINE = "var(--pine)",
  SUMMER = "var(--summer)",
  SPRING = "var(--spring)",
  BLOSSOM = "var(--blossom)",
  PRIMARY = "var(--primary)";
const dark = (c: string, k = 30) => mix(c, 100 - k, "black");
const leaf = mix(SUMMER, 75, PINE);
const stone = mix(BARK, 45, mix(FG, 45, BG));
const inkB = mix(BG, 70, "black");

function rng(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}
const Eye = ({ x, y, r = 0.75, ring }: { x: number; y: number; r?: number; ring?: string }) => (
  <>
    {ring && <circle cx={x} cy={y} r={r * 1.5} fill={ring} />}
    <circle cx={x} cy={y} r={r} fill={BG} />
    <circle cx={x + r * 0.3} cy={y - r * 0.3} r={r * 0.3} fill={FG} opacity={0.85} />
  </>
);
const Line = ({ d, c, w = 1 }: { d: string; c: string; w?: number }) => (
  <path d={d} stroke={c} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" fill="none" />
);
const Ground = ({ w = 16, c = stone }: { w?: number; c?: string }) => (
  <path d={`M${-w},1.6 C${-w * 0.6},-0.8 ${w * 0.6},-0.8 ${w},1.6 Z`} fill={c} />
);
/** Round masses of leaves, with a darker under layer and a lit top. */
function Crown({
  blobs,
  c,
  seed = 3,
  lit = 0.2,
}: {
  blobs: [number, number, number][];
  c: string;
  seed?: number;
  lit?: number;
}) {
  const r = rng(seed);
  return (
    <>
      {blobs.map(([x, y, s], i) => (
        <circle key={`u${i}`} cx={x} cy={y + s * 0.18} r={s} fill={dark(c, 26)} />
      ))}
      {blobs.map(([x, y, s], i) => (
        <circle key={`m${i}`} cx={x - s * 0.08} cy={y - s * 0.08} r={s * 0.84} fill={c} />
      ))}
      {blobs.map(([x, y, s], i) => (
        <circle
          key={`t${i}`}
          cx={x - s * 0.22 + r() * 0.5}
          cy={y - s * 0.32}
          r={s * 0.42}
          fill={mix(c, 100 - lit * 100, BIRCH)}
          opacity={0.75}
        />
      ))}
    </>
  );
}
function Trunk({ d, c = BARK }: { d: string; c?: string }) {
  return <path d={d} fill={c} />;
}
/** Stacked boughs of a conifer. */
function Tiers({
  n,
  top,
  base,
  w,
  c,
  droop = 1.5,
  gap = 0,
}: {
  n: number;
  top: number;
  base: number;
  w: number;
  c: string;
  droop?: number;
  gap?: number;
}) {
  const h = (base - top) / n;
  return (
    <>
      {Array.from({ length: n }, (_, i) => {
        const y0 = top + i * h - (i ? h * 0.75 : 0);
        const y1 = top + (i + 1) * h - gap;
        const half = w * ((i + 1.2) / (n + 0.2));
        return (
          <g key={i}>
            <path
              d={`M0,${y0} C${half * 0.45},${y0 + (y1 - y0) * 0.5} ${half * 0.7},${y1 - 1} ${half},${y1 + droop} C${half * 0.5},${y1 - 0.4} ${-half * 0.5},${y1 - 0.4} ${-half},${y1 + droop} C${-half * 0.7},${y1 - 1} ${-half * 0.45},${y0 + (y1 - y0) * 0.5} 0,${y0} Z`}
              fill={i % 2 ? c : dark(c, 12)}
            />
            <path
              d={`M0,${y0} C${-half * 0.45},${y0 + (y1 - y0) * 0.5} ${-half * 0.7},${y1 - 1} ${-half},${y1 + droop} C${-half * 0.55},${y1 - 0.3} ${-half * 0.2},${y1 - 0.5} 0,${y1 - 0.6} Z`}
              fill={mix(c, 82, BIRCH)}
              opacity={0.55}
            />
          </g>
        );
      })}
    </>
  );
}
/** A compound leaf, leaflets in pairs along a stalk. */
function Pinnate({
  x,
  y,
  a,
  len,
  n,
  s,
  c,
}: {
  x: number;
  y: number;
  a: number;
  len: number;
  n: number;
  s: number;
  c: string;
}) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${a})`}>
      <path
        d={`M0,0 Q${len * 0.5},${-len * 0.1} ${len},${len * 0.05}`}
        stroke={dark(c, 25)}
        strokeWidth={0.45}
        fill="none"
      />
      {Array.from({ length: n }, (_, i) => {
        const u = (i + 0.7) / n,
          px = len * u,
          py = -len * 0.1 * 4 * u * (1 - u) * 0.5,
          k = s * (1 - u * 0.65);
        return (
          <g key={i}>
            <ellipse
              cx={px}
              cy={py - k * 0.8}
              rx={k * 0.42}
              ry={k}
              transform={`rotate(24 ${px} ${py})`}
              fill={c}
            />
            <ellipse
              cx={px}
              cy={py + k * 0.8}
              rx={k * 0.42}
              ry={k}
              transform={`rotate(-24 ${px} ${py})`}
              fill={dark(c, 14)}
            />
          </g>
        );
      })}
    </g>
  );
}
const Moss = () => {
  const c = mix(SPRING, 45, leaf),
    r = rng(11);
  return (
    <>
      <path d="M-15,1.6 C-13,-5 -6,-8.5 1,-8 C8,-7.5 13,-5 15,1.6 Z" fill={stone} />
      <path
        d="M-16,1.6 C-15,-3 -11,-3.4 -9,-5.6 C-7,-8.6 -3,-7.8 -1,-9.4 C2,-11 5,-8.6 7,-8 C10,-7.4 11,-4.6 13,-3.8 C15,-3 16,-0.8 16,1.6 Z"
        fill={dark(c, 22)}
      />
      {Array.from({ length: 34 }, (_, i) => {
        const x = -14 + r() * 28,
          top = -8.4 * (1 - (x / 16) ** 2);
        return (
          <circle
            key={i}
            cx={x}
            cy={top + r() * 7.5}
            r={0.8 + r() * 1.1}
            fill={i % 3 ? c : mix(c, 70, BIRCH)}
          />
        );
      })}
      {[
        [-7, -6.4, -12.6],
        [-3.6, -8, -15.4],
        [1, -9, -14.6],
        [4, -8, -16.6],
        [8, -6.4, -11.8],
      ].map(([x, y0, y1], i) => (
        <g key={i}>
          <Line
            d={`M${x},${y0} C${x! + 0.3},${(y0! + y1!) / 2} ${x! - 0.2},${y1! + 2} ${x! + 0.3},${y1}`}
            c={mix(AUTUMN, 60, BARK)}
            w={0.35}
          />
          <ellipse
            cx={x! + 0.55}
            cy={y1! - 0.2}
            rx={0.65}
            ry={0.42}
            transform={`rotate(-30 ${x} ${y1})`}
            fill={mix(AUTUMN, 70, BARK)}
          />
        </g>
      ))}
    </>
  );
};
const Frond = ({ a, len, flip, c }: { a: number; len: number; flip: number; c: string }) => {
  const n = 12;
  return (
    <g transform={`scale(${flip} 1) rotate(${a})`}>
      <path
        d={`M0,0 C${len * 0.35},${-len * 0.28} ${len * 0.7},${-len * 0.25} ${len},${len * 0.14}`}
        stroke={dark(c, 28)}
        strokeWidth={0.55}
        fill="none"
      />
      {Array.from({ length: n }, (_, i) => {
        const u = (i + 1.2) / (n + 1),
          t = u;
        const px =
          3 * (1 - t) * (1 - t) * t * len * 0.35 +
          3 * (1 - t) * t * t * len * 0.7 +
          t * t * t * len;
        const py =
          3 * (1 - t) * (1 - t) * t * -len * 0.28 +
          3 * (1 - t) * t * t * -len * 0.25 +
          t * t * t * len * 0.14;
        const k = 4.8 * Math.sin(Math.PI * (u * 0.82 + 0.12)) * (1 - u * 0.4);
        return (
          <g key={i}>
            <ellipse
              cx={px - 0.3}
              cy={py - k * 0.55}
              rx={0.62}
              ry={k * 0.6}
              transform={`rotate(32 ${px} ${py})`}
              fill={c}
            />
            <ellipse
              cx={px - 0.3}
              cy={py + k * 0.5}
              rx={0.6}
              ry={k * 0.55}
              transform={`rotate(-32 ${px} ${py})`}
              fill={dark(c, 14)}
            />
          </g>
        );
      })}
    </g>
  );
};
const Fern = () => {
  const c = mix(SUMMER, 80, SPRING);
  return (
    <>
      <Ground w={10} c={mix(BARK, 70, BG)} />
      <Frond a={-8} len={18} flip={-1} c={dark(c, 16)} />
      <Frond a={-8} len={18} flip={1} c={dark(c, 16)} />
      <Frond a={-42} len={21} flip={-1} c={c} />
      <Frond a={-42} len={21} flip={1} c={c} />
      <Frond a={-72} len={20} flip={1} c={mix(c, 85, SPRING)} />
      <path d="M-1.6,0 C-1.8,-2 -0.6,-3 0,-3 C0.8,-3 1.8,-2 1.6,0 Z" fill={BARK} />
    </>
  );
};
const Beech = () => {
  const c = mix(SUMMER, 70, SPRING);
  return (
    <>
      <Ground w={10} c={mix(BARK, 70, BG)} />
      <Trunk
        c={mix(FG, 45, BARK)}
        d="M-2.2,0.4 C-1.6,-5 -1.6,-10 -1.4,-15 L1.6,-15 C1.6,-10 1.8,-5 2.8,0.4 Z"
      />
      <Line
        d="M0,-11 C-3,-14 -5,-15 -7,-18 M0.4,-12 C3,-15 5,-16 7,-19"
        c={mix(FG, 45, BARK)}
        w={0.9}
      />
      <Crown
        c={c}
        seed={5}
        blobs={[
          [-10, -17, 6],
          [10, -18, 6.4],
          [-4, -16, 6],
          [4, -15.6, 6],
          [-7, -24, 6.6],
          [6.6, -25, 6.8],
          [0, -29, 6.4],
        ]}
      />
    </>
  );
};
const Oak = () => {
  const c = mix(leaf, 80, BARK);
  return (
    <>
      <Ground w={13} c={mix(BARK, 70, BG)} />
      <Trunk d="M-4.8,0.6 C-3.4,-3 -3.2,-7 -3.6,-10 C-6,-12 -8,-13 -10,-16 L-7,-16.6 C-5,-14 -3,-13 -1,-12.6 L1.6,-12.6 C3.4,-13 6,-14.6 7.6,-17 L10.4,-16 C8.6,-13 6,-11 3.8,-9.6 C3.4,-6 3.8,-3 5.6,0.6 Z" />
      <Line d="M-1.5,-1 L-1.2,-8 M1.4,-2 L1,-9" c={dark(BARK, 30)} w={0.5} />
      <Crown
        c={c}
        seed={9}
        blobs={[
          [-14, -16.5, 4.8],
          [14, -16.5, 4.8],
          [-11, -22, 5.6],
          [11, -22, 5.6],
          [-5, -18, 5],
          [5, -18, 5],
          [-5, -26, 5.8],
          [5, -26, 5.8],
          [0, -22, 5],
        ]}
      />
      {[
        [-9, -14.4],
        [8, -15],
        [-1, -16],
      ].map(([x, y], i) => (
        <g key={i}>
          <ellipse cx={x} cy={y} rx={0.8} ry={1.1} fill={mix(AUTUMN, 50, SPRING)} />
          <path
            d={`M${x! - 0.95},${y! - 0.7} C${x! - 0.5},${y! - 1.6} ${x! + 0.5},${y! - 1.6} ${x! + 0.95},${y! - 0.7} Z`}
            fill={BARK}
          />
        </g>
      ))}
    </>
  );
};
const Fir = () => {
  const c = mix(PINE, 72, "oklch(0.45 0.05 215)");
  return (
    <>
      <Ground w={8} c={mix(BARK, 70, BG)} />
      <rect x={-1.1} y={-5} width={2.2} height={5.4} fill={BARK} />
      <Tiers n={7} top={-36} base={-3} w={11} c={c} droop={0.2} />
      {[
        [-1.2, -29.4],
        [1.3, -24],
        [-2.6, -19],
        [3, -13],
        [-4.2, -9.6],
      ].map(([x, y], i) => (
        <rect
          key={i}
          x={x! - 0.5}
          y={y! - 2.4}
          width={1}
          height={2.6}
          rx={0.5}
          fill={mix(BARK, 60, BIRCH)}
        />
      ))}
    </>
  );
};
const Birch = () => {
  const c = mix(SPRING, 60, SUMMER),
    r = rng(21),
    w = SNOW;
  return (
    <>
      <Ground w={8} c={mix(BARK, 70, BG)} />
      <Crown
        c={c}
        seed={2}
        lit={0.15}
        blobs={[
          [-5, -29, 4.2],
          [2, -32, 4],
          [7, -27, 4],
          [-1, -24, 4.4],
          [-7, -21, 3.6],
          [8, -20, 3.6],
        ]}
      />
      <Line
        d="M-0.4,-16 C-2,-18 -5,-19 -8,-17 M-1,-20 C1,-23 5,-24 9,-22"
        c={mix(BARK, 70, BG)}
        w={0.5}
      />
      <path d="M-1.7,0.4 C-1.4,-8 -1.4,-16 0.2,-28 L1,-28 C0.4,-16 1.2,-8 1.8,0.4 Z" fill={w} />
      {[
        [-1.2, -2.5, 1.5],
        [0.2, -5.6, 1.4],
        [-1.2, -8.8, 1.2],
        [0.1, -12, 1.2],
        [-1, -15, 1],
        [0, -18, 0.9],
        [-0.1, -21.5, 0.8],
      ].map(([x, y, l], i) => (
        <path key={i} d={`M${x},${y} l${l},-0.3 l-0.1,0.6 Z`} fill={inkB} />
      ))}
      {Array.from({ length: 22 }, (_, i) => {
        const x = -13 + r() * 26;
        return (
          <line
            key={i}
            x1={x}
            y1={-27 + r() * 15}
            x2={x + (x > 0 ? 0.6 : -0.6)}
            y2={-12 - r() * 5}
            stroke={c}
            strokeWidth={0.3}
            opacity={0.9}
          />
        );
      })}
    </>
  );
};
const Maple = () => {
  const c = mix(AUTUMN, 72, LINGON);
  return (
    <>
      <Ground w={10} c={mix(BARK, 70, BG)} />
      <Trunk d="M-2.4,0.4 C-1.8,-5 -1.6,-9 -1.6,-13 L1.6,-13 C1.6,-9 2,-5 3,0.4 Z" />
      <Crown
        c={c}
        seed={13}
        blobs={[
          [-9, -15, 5],
          [9, -15, 5],
          [-4, -15, 5],
          [4, -14, 5],
          [-10, -22, 5.6],
          [10, -22, 5.6],
          [0, -21, 6],
          [-5, -28, 5.4],
          [5, -28, 5.4],
          [0, -32, 3.6],
        ]}
      />
      <g fill={mix(BIRCH, 55, AUTUMN)}>
        {[
          [-11, -24],
          [-4, -30],
          [6, -24],
          [10, -17],
          [-6, -18],
          [1, -14],
        ].map(([x, y], i) => (
          <path
            key={i}
            transform={`translate(${x} ${y}) rotate(${i * 40}) scale(0.5)`}
            d="M0,-3 L0.9,-1.4 L2.6,-1.9 L1.8,0 L2.8,0.6 L0.5,1.6 L0.4,3 L-0.4,3 L-0.5,1.6 L-2.8,0.6 L-1.8,0 L-2.6,-1.9 L-0.9,-1.4 Z"
          />
        ))}
      </g>
      <g fill={c}>
        {[
          [-9, -3],
          [7, -5.2],
          [12, -2],
          [-14, -1.6],
        ].map(([x, y], i) => (
          <ellipse
            key={i}
            cx={x}
            cy={y}
            rx={0.9}
            ry={0.5}
            transform={`rotate(${i * 50} ${x} ${y})`}
          />
        ))}
      </g>
    </>
  );
};
const Chestnut = () => {
  const c = mix(leaf, 85, SPRING),
    r = rng(31);
  return (
    <>
      <Ground w={13} c={mix(BARK, 70, BG)} />
      <Trunk d="M-5.6,0.6 C-3.6,-3 -3.8,-7 -3.6,-11 L3.4,-11 C3.8,-7 3.8,-3 6,0.6 Z" />
      <Line
        d="M-2.2,-1 C-2.6,-4 -1.6,-6 -2,-10 M0,-1 C0.8,-4 -0.4,-7 0.4,-10 M2.2,-1 C1.6,-4 2.6,-6 2,-10"
        c={dark(BARK, 34)}
        w={0.55}
      />
      <Crown
        c={c}
        seed={17}
        blobs={[
          [-12, -14.5, 5.4],
          [12, -14.5, 5.4],
          [-5, -13, 5.2],
          [5, -13, 5.2],
          [-10, -22, 6],
          [10, -22, 6],
          [0, -20, 6.4],
          [-4, -28, 5.8],
          [5, -28, 5.8],
        ]}
      />
      {[
        [-11, -14],
        [-3, -21],
        [8, -21],
        [2, -13],
        [12, -13],
        [-7, -27],
      ].map(([x, y], i) => (
        <g key={i}>
          {Array.from({ length: 12 }, (_, k) => {
            const a = (k / 12) * Math.PI * 2 + r();
            return (
              <line
                key={k}
                x1={x}
                y1={y}
                x2={x! + Math.cos(a) * 1.75}
                y2={y! + Math.sin(a) * 1.75}
                stroke={mix(SPRING, 70, BIRCH)}
                strokeWidth={0.2}
              />
            );
          })}
          <circle cx={x} cy={y} r={1.15} fill={mix(SPRING, 75, BIRCH)} />
          <circle cx={x! + 0.1} cy={y! + 0.2} r={0.55} fill={mix(AUTUMN, 40, BARK)} />
        </g>
      ))}
    </>
  );
};
const Spruce = () => {
  const c = mix(PINE, 85, BG);
  return (
    <>
      <Ground w={6} c={mix(BARK, 70, BG)} />
      <rect x={-0.9} y={-4} width={1.8} height={4.4} fill={BARK} />
      <Tiers n={9} top={-36} base={-3.4} w={7} c={c} droop={1.6} />
      <g fill={SNOW} opacity={0.9}>
        {[
          [-2, -24],
          [3, -18.4],
          [-4, -13],
          [4.8, -8.2],
          [-1, -29.6],
        ].map(([x, y], i) => (
          <ellipse key={i} cx={x} cy={y} rx={1.3} ry={0.48} />
        ))}
      </g>
    </>
  );
};
const Aspen = () => {
  const c = mix(SPRING, 70, BIRCH),
    r = rng(41);
  return (
    <>
      <Ground w={8} c={mix(BARK, 70, BG)} />
      <path
        d="M-1.5,0.4 C-1.1,-8 -1,-16 -0.5,-27 L0.5,-27 C1,-16 1.1,-8 1.6,0.4 Z"
        fill={mix(FG, 65, SPRING)}
      />
      <Line
        d="M0,-15 C-3,-18 -5,-19 -7,-22 M0,-18 C3,-20 5,-22 7,-25 M0,-24 C-1,-26 -2,-28 -3,-30"
        c={mix(BARK, 60, FG)}
        w={0.5}
      />
      <g>
        {Array.from({ length: 95 }, (_, i) => {
          const a = r() * Math.PI * 2,
            u = Math.sqrt(r()),
            x = Math.cos(a) * u * 12,
            y = -23 + Math.sin(a) * u * 12.5,
            t = r();
          return (
            <ellipse
              key={i}
              cx={x}
              cy={y}
              rx={1.05}
              ry={t > 0.5 ? 0.9 : 0.42}
              transform={`rotate(${r() * 180} ${x} ${y})`}
              fill={t > 0.75 ? mix(c, 45, SNOW) : t > 0.3 ? c : dark(c, 22)}
            />
          );
        })}
      </g>
    </>
  );
};
const Hazel = () => {
  const c = mix(SUMMER, 80, SPRING),
    r = rng(51);
  return (
    <>
      <Ground w={11} c={mix(BARK, 70, BG)} />
      <Line
        d="M-1,0 C-3,-8 -6,-14 -10,-20 M0,0 C0,-8 -1,-16 -1,-26 M1,0 C3,-8 6,-14 11,-21 M-0.4,0 C-1,-6 -3,-10 -4,-13 M0.6,0 C1,-6 3,-12 4,-17"
        c={mix(BARK, 75, FG)}
        w={1}
      />
      {Array.from({ length: 34 }, (_, i) => {
        const x = -14 + r() * 28,
          y = -28 + r() * 19 + Math.abs(x) * 0.3,
          a = r() * 180;
        return (
          <ellipse
            key={i}
            cx={x}
            cy={y}
            rx={2.4}
            ry={1.8}
            transform={`rotate(${a} ${x} ${y})`}
            fill={i % 3 === 0 ? dark(c, 20) : i % 3 === 1 ? c : mix(c, 80, BIRCH)}
          />
        );
      })}
      {[
        [-9, -14],
        [7, -13],
        [-3, -19],
        [2, -9],
      ].map(([x, y], i) => (
        <g key={i}>
          <path
            d={`M${x! - 1.3},${y! - 0.6} L${x! + 1.3},${y! - 0.6} L${x! + 0.9},${y! + 0.5} L${x! - 0.9},${y! + 0.5} Z`}
            fill={SPRING}
          />
          <circle cx={x} cy={y! + 1} r={1.05} fill={mix(AUTUMN, 50, BARK)} />
        </g>
      ))}
    </>
  );
};
/** A tuft of pine needles. */
const Tuft = ({ x, y, s, c }: { x: number; y: number; s: number; c: string }) => (
  <g>
    <ellipse cx={x} cy={y + s * 0.2} rx={s * 1.35} ry={s * 0.72} fill={dark(c, 28)} />
    <ellipse cx={x - s * 0.1} cy={y - s * 0.1} rx={s * 1.2} ry={s * 0.58} fill={c} />
    <ellipse
      cx={x - s * 0.3}
      cy={y - s * 0.32}
      rx={s * 0.7}
      ry={s * 0.24}
      fill={mix(c, 74, "oklch(0.8 0.08 200)")}
    />
  </g>
);
const Cirmolo = () => {
  const c = mix(PINE, 78, SUMMER);
  return (
    <>
      <path d="M-15,1.6 C-11,-1.8 -5,-1 0,-1.4 C5,-1.8 11,-1.4 15,1.6 Z" fill={stone} />
      <Trunk
        c={mix(BARK, 85, AUTUMN)}
        d="M-3.8,0 C-2.4,-3 -2.8,-6 -3,-9 C-5,-12 -8,-13 -10,-13.4 L-9.6,-15 C-7,-14.6 -5,-14 -2.6,-12.4 C-2.2,-16 -3,-20 -4.2,-24 L-2.6,-24.4 C-1,-21 -0.2,-18 0.2,-15 C2,-17 5,-19 8,-20 L8.8,-18.8 C5,-16.8 2.6,-14.6 2,-11 C2.2,-7 3,-3 4.8,0 Z"
      />
      <Line d="M-1.2,-1 C-1.4,-4 -0.8,-7 -1,-10" c={dark(BARK, 30)} w={0.5} />
      <Tuft x={-11} y={-15.4} s={5} c={c} />
      <Tuft x={10} y={-20.6} s={5.4} c={c} />
      <Tuft x={2} y={-15} s={3.8} c={c} />
      <Tuft x={-5} y={-25.2} s={6} c={c} />
      <Tuft x={4} y={-28} s={5.6} c={c} />
      <Tuft x={-1} y={-33} s={3.8} c={c} />
      {[
        [8, -18.4],
        [-9, -13.2],
        [2, -25.4],
      ].map(([x, y], i) => (
        <ellipse
          key={i}
          cx={x}
          cy={y}
          rx={1.25}
          ry={1.6}
          fill={mix(LINGON, 40, mix(BARK, 60, "oklch(0.45 0.08 290)"))}
        />
      ))}
    </>
  );
};
const Mugo = () => {
  const c = dark(PINE, 8);
  return (
    <>
      <path d="M-18,1.6 C-14,-2 -8,-1 0,-1.6 C8,-2 14,-1.4 18,1.6 Z" fill={stone} />
      <Line
        d="M-1,-0.5 C-4,-3 -8,-4 -14,-7 M-0.4,-0.5 C-2,-4 -5,-7 -6,-12 M0.4,-0.5 C2,-4 3,-8 6,-14 M1,-0.5 C5,-3 9,-5 15,-6"
        c={mix(BARK, 80, BG)}
        w={1.5}
      />
      <Tuft x={-13} y={-8} s={4.6} c={c} />
      <Tuft x={14} y={-7.6} s={4.8} c={c} />
      <Tuft x={-6.5} y={-13} s={5.4} c={c} />
      <Tuft x={6.5} y={-15} s={5.6} c={c} />
      <Tuft x={0} y={-10} s={4.2} c={c} />
      <path
        d="M-11,-17 C-9,-19.6 -3,-19.6 -1,-16.4 C-3.6,-17.4 -8,-17 -11,-17 Z M1.4,-18.8 C3.8,-21.8 9.4,-21.4 11.8,-18.4 C8.6,-19.6 4.4,-19.4 1.4,-18.8 Z M-17.4,-10.6 C-15.4,-12.8 -11,-12.4 -9.4,-10.2 C-12,-11 -15,-10.8 -17.4,-10.6 Z M10,-10.2 C11.8,-12.4 16.4,-12.6 18.4,-10 C15.6,-10.8 12.4,-10.8 10,-10.2 Z"
        fill={SNOW}
      />
    </>
  );
};
const Alpenrose = () => {
  const c = dark(leaf, 15),
    f = mix(LINGON, 72, BLOSSOM),
    r = rng(61);
  return (
    <>
      <Ground w={15} c={stone} />
      <Line
        d="M-1,0 C-3,-3 -6,-5 -10,-7 M0,0 C0,-3 -1,-7 -1,-10 M1,0 C4,-3 7,-5 11,-7"
        c={BARK}
        w={0.9}
      />
      {Array.from({ length: 44 }, (_, i) => {
        const x = -15 + r() * 30,
          y = -2.5 - r() * (12 - Math.abs(x) * 0.5),
          a = r() * 180;
        return (
          <ellipse
            key={i}
            cx={x}
            cy={y}
            rx={2.1}
            ry={0.95}
            transform={`rotate(${a} ${x} ${y})`}
            fill={i % 3 ? c : dark(c, 22)}
          />
        );
      })}
      {[
        [-11, -9, 2.3],
        [-5, -13.6, 2.7],
        [1, -17, 2.7],
        [7, -13.6, 2.6],
        [12, -8.6, 2.2],
        [-7, -7.6, 2.2],
        [3, -9.6, 2.3],
        [-1, -11.6, 2],
      ].map(([x, y, s], i) => (
        <g key={i}>
          {Array.from({ length: 7 }, (_, k) => {
            const a = (k / 7) * Math.PI * 2 + i,
              dx = Math.cos(a) * s! * 0.62,
              dy = Math.sin(a) * s! * 0.62;
            return (
              <ellipse
                key={k}
                cx={x! + dx}
                cy={y! + dy}
                rx={s! * 0.46}
                ry={s! * 0.36}
                transform={`rotate(${(a * 180) / Math.PI} ${x! + dx} ${y! + dy})`}
                fill={k % 2 ? f : mix(f, 80, BLOSSOM)}
              />
            );
          })}
          <circle cx={x} cy={y} r={s! * 0.26} fill={dark(f, 30)} />
        </g>
      ))}
    </>
  );
};
const Juniper = () => {
  const c = mix(PINE, 60, "oklch(0.58 0.05 200)"),
    r = rng(71);
  return (
    <>
      <path d="M-13,1.6 C-9,-1.4 9,-1.4 13,1.6 Z" fill={stone} />
      <path
        d="M0,-27 C2,-23 4,-20 6,-16 C8,-12 11,-7 12,-1 C8,-0.2 -8,-0.2 -12,-1 C-11,-7 -8,-12 -6,-16 C-4,-20 -2,-23 0,-27 Z"
        fill={dark(c, 18)}
      />
      {Array.from({ length: 80 }, (_, i) => {
        const y = -25 + r() * 24,
          h = ((y + 27) / 27) * 11.5,
          x = (r() - 0.5) * 2 * h;
        return (
          <path
            key={i}
            d={`M${x},${y} l${x > 0 ? 1.7 : -1.7},-2`}
            stroke={i % 3 ? c : mix(c, 72, "oklch(0.85 0.05 210)")}
            strokeWidth={0.55}
            strokeLinecap="round"
          />
        );
      })}
      {[
        [-5, -7],
        [5, -12],
        [-2.4, -16],
        [7, -5],
        [0.5, -5],
        [-7, -3.4],
        [2, -20],
      ].map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r={0.95} fill="oklch(0.42 0.09 265)" />
          <circle cx={x! - 0.25} cy={y! - 0.25} r={0.3} fill="oklch(0.72 0.05 250)" />
        </g>
      ))}
    </>
  );
};
const Rowan = () => {
  const c = mix(SUMMER, 80, leaf),
    b = mix(AUTUMN, 62, LINGON);
  return (
    <>
      <path d="M-13,1.6 C-11,-3 -6,-3.6 -2,-1.8 C3,-3.6 10,-3 13,1.6 Z" fill={stone} />
      <Trunk
        c={mix(BARK, 70, FG)}
        d="M-2,-1 C-1.6,-6 -2.6,-10 -1.6,-15 C-3,-19 -5,-20 -7,-23 L-6,-23.6 C-3.6,-22 -1,-19.6 0,-17 C1.6,-20 4,-22 6.4,-24 L7,-23 C4,-20 2,-17 1.4,-13 C1,-9 1.4,-5 2.4,-1 Z"
      />
      {[
        [-7, -24, 200, 11],
        [-7, -24, 245, 11],
        [-7, -24, 165, 10],
        [6.5, -24, -20, 11],
        [6.5, -24, -65, 11],
        [6.5, -24, 15, 10],
        [-1, -18, 225, 10],
        [1, -18, -45, 10],
        [-2, -13, 180, 9],
        [2, -12, 0, 9],
        [0, -22, -90, 11],
      ].map(([x, y, a, l], i) => (
        <Pinnate key={i} x={x!} y={y!} a={a!} len={l!} n={6} s={1.25} c={i % 3 ? c : dark(c, 16)} />
      ))}
      {[
        [-10, -17],
        [10, -18],
        [-3, -25],
        [5, -28],
        [-13, -24],
        [13, -25],
      ].map(([x, y], i) => (
        <g key={i}>
          {[
            [0, 0],
            [1.2, 0.2],
            [-1.2, 0.3],
            [0.6, 1.1],
            [-0.6, 1.2],
            [0, -1],
            [1.3, -0.9],
            [-1.2, -0.9],
            [0, 2.1],
          ].map(([dx, dy], k) => (
            <circle
              key={k}
              cx={x! + dx!}
              cy={y! + dy!}
              r={0.68}
              fill={k % 2 ? b : mix(b, 85, BIRCH)}
            />
          ))}
        </g>
      ))}
    </>
  );
};
const Larch = () => {
  const c = mix(BIRCH, 62, AUTUMN),
    r = rng(81);
  return (
    <>
      <path d="M-11,1.6 C-7,-1.4 7,-1.4 11,1.6 Z" fill={stone} />
      <rect x={-1} y={-6} width={2} height={6.4} fill={BARK} />
      <Tiers n={8} top={-36} base={-4} w={10.5} c={c} droop={1.6} />
      {Array.from({ length: 60 }, (_, i) => {
        const y = -33 + r() * 28,
          h = ((y + 36) / 32) * 10,
          x = (r() - 0.5) * 2 * h;
        return (
          <path
            key={i}
            d={`M${x},${y} l${x > 0 ? 0.9 : -0.9},1.5`}
            stroke={i % 2 ? mix(c, 60, SNOW) : dark(c, 26)}
            strokeWidth={0.4}
            strokeLinecap="round"
          />
        );
      })}
    </>
  );
};
const Bilberry = () => {
  const c = mix(SUMMER, 78, SPRING),
    berry = "oklch(0.34 0.09 275)";
  const lf = [
    [-11, -8, -30],
    [-8, -12.5, 20],
    [-5, -7, -60],
    [-2, -13.5, -30],
    [3, -8, 30],
    [5, -14, 20],
    [8, -8.6, -20],
    [11, -13, 25],
    [-13, -13, -50],
    [1, -18, -50],
    [-5, -17.4, 30],
    [7, -19, -30],
  ];
  return (
    <>
      <Ground w={14} c={mix(BARK, 70, BG)} />
      <Line
        d="M-1,0 C-4,-3 -8,-6 -13,-13 M-3,-3 C-3,-8 -5,-12 -5,-17 M0,0 C0,-6 1,-12 1,-18 M1,0 C4,-4 7,-10 7,-19 M1,-1 C5,-3 9,-7 11,-13"
        c={mix(SUMMER, 50, BARK)}
        w={0.7}
      />
      {lf.map(([x, y, a], i) => (
        <ellipse
          key={i}
          cx={x}
          cy={y}
          rx={2.3}
          ry={1.25}
          transform={`rotate(${a} ${x} ${y})`}
          fill={i % 3 ? c : dark(c, 18)}
        />
      ))}
      {[
        [-9, -6.4],
        [-4, -10],
        [-1, -5.6],
        [2, -11],
        [5, -7],
        [9, -10.6],
        [-6, -14],
        [4.5, -16.5],
      ].map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r={1.65} fill={berry} />
          <circle cx={x! - 0.5} cy={y! - 0.5} r={0.6} fill="oklch(0.62 0.05 260)" opacity={0.85} />
          <circle cx={x! + 0.5} cy={y! + 0.7} r={0.35} fill={dark(berry, 40)} />
        </g>
      ))}
    </>
  );
};

/* ------------------- flowers ------------------- */
const Crocus = () => {
  const p = "oklch(0.62 0.15 305)",
    l = mix(p, 70, SNOW);
  return (
    <>
      <path d="M-15,1.6 C-11,-2.4 -5,-3 0,-2.2 C5,-3 11,-2.4 15,1.6 Z" fill={SNOW} />
      <path
        d="M-3,-1.4 C-4.6,-8 -6,-12 -8,-15 C-5,-12 -2.8,-8 -1.8,-1.4 Z M2,-1.4 C3.6,-7 6,-11 8,-14 C4.8,-11 2.8,-7 3.4,-1.4 Z"
        fill={leaf}
      />
      <path d="M-1,-1.4 L-0.6,-13 L0.6,-13 L1,-1.4 Z" fill={mix(SNOW, 70, SPRING)} />
      <path d="M0,-12 C-4.8,-13 -6,-19 -3.6,-27 C-2,-23 -0.4,-20 0,-12 Z" fill={l} />
      <path d="M0,-12 C4.8,-13 6,-19 3.6,-27 C2,-23 0.4,-20 0,-12 Z" fill={l} />
      <path d="M0,-12 C-3.4,-15 -3.2,-23 0,-29 C3.2,-23 3.4,-15 0,-12 Z" fill={p} />
      <path d="M0,-14 L0,-26" stroke={dark(p, 22)} strokeWidth={0.4} />
      <Line
        d="M0,-24 L-1,-30 M0,-24 L1,-30.6 M0,-24 L0.2,-31"
        c={mix(AUTUMN, 80, LINGON)}
        w={0.8}
      />
    </>
  );
};
const Primrose = () => {
  const p = mix(BIRCH, 62, SNOW),
    c = mix(SUMMER, 65, SPRING);
  const fl = [
    [-6.4, -13.5, 4.3],
    [6.2, -14.5, 4.4],
    [0, -19.4, 4.5],
  ];
  return (
    <>
      <Ground w={13} c={mix(BARK, 70, BG)} />
      {[
        [-9, -3.6, -25],
        [9, -3.8, 25],
        [-4, -5.8, -60],
        [4, -6, 60],
      ].map(([x, y, a], i) => (
        <g key={i} transform={`rotate(${a} ${x} ${y})`}>
          <ellipse cx={x} cy={y} rx={5.2} ry={2.5} fill={i % 2 ? c : dark(c, 16)} />
          <path d={`M${x! - 4.4},${y} L${x! + 4.4},${y}`} stroke={dark(c, 30)} strokeWidth={0.3} />
        </g>
      ))}
      {fl.map(([x, y], i) => (
        <Line
          key={i}
          d={`M0,-3 Q${x! * 0.5},${y! * 0.6} ${x},${y}`}
          c={mix(SPRING, 70, SUMMER)}
          w={0.7}
        />
      ))}
      {fl.map(([x, y, s], i) => (
        <g key={i}>
          {[0, 1, 2, 3, 4].map((k) => {
            const a = (k / 5) * Math.PI * 2 - Math.PI / 2,
              cx = x! + Math.cos(a) * s! * 0.56,
              cy = y! + Math.sin(a) * s! * 0.56;
            return (
              <ellipse
                key={k}
                cx={cx}
                cy={cy}
                rx={s! * 0.54}
                ry={s! * 0.46}
                transform={`rotate(${(a * 180) / Math.PI} ${cx} ${cy})`}
                fill={k % 2 ? p : mix(p, 88, SNOW)}
              />
            );
          })}
          <circle cx={x} cy={y} r={s! * 0.28} fill={mix(AUTUMN, 60, BIRCH)} />
        </g>
      ))}
    </>
  );
};
const Edelweiss = () => {
  const w = mix(SNOW, 88, BIRCH),
    c = mix(FG, 45, leaf);
  const star = (x: number, y: number, s: number, n: number, off: number) => (
    <g>
      {Array.from({ length: n }, (_, k) => {
        const a = (k / n) * Math.PI * 2 + off;
        return (
          <path
            key={k}
            transform={`translate(${x} ${y}) rotate(${(a * 180) / Math.PI})`}
            d={`M0,${-s * 0.3} C${s * 0.34},${-s * 0.3} ${s * 0.82},${-s * 0.24} ${s * 1.32},0 C${s * 0.82},${s * 0.24} ${s * 0.34},${s * 0.3} 0,${s * 0.3} Z`}
            fill={k % 2 ? w : mix(w, 88, c)}
          />
        );
      })}
      {[
        [0, 0],
        [0.38, 0.2],
        [-0.38, 0.2],
        [0, -0.42],
        [0.2, 0.42],
        [-0.22, 0.42],
      ].map(([dx, dy], k) => (
        <circle
          key={k}
          cx={x + dx! * s}
          cy={y + dy! * s}
          r={s * 0.17}
          fill={mix(BIRCH, 72, BARK)}
        />
      ))}
    </g>
  );
  return (
    <>
      <path d="M-15,1.6 C-14,-4 -9,-6 -5,-4 C-3,-7 3,-7 6,-4 C10,-5 14,-3 15,1.6 Z" fill={stone} />
      <path
        d="M-5,-4 L-3,-1.6 L-6,1 M6,-4 L3,-1 L5,1.4"
        stroke={dark(stone, 25)}
        strokeWidth={0.4}
        fill="none"
      />
      <Line
        d="M-1,-5.4 C-1.4,-10 -3.4,-13 -5,-17 M0,-5.4 C0.6,-12 1,-17 1,-23 M1,-5 C3,-8 5,-10 7,-12"
        c={c}
        w={0.75}
      />
      {[
        [-3.2, -8.5, 40],
        [2, -8.4, -40],
        [-1, -13, 30],
        [2.4, -14.5, -30],
      ].map(([x, y, a], i) => (
        <ellipse
          key={i}
          cx={x}
          cy={y}
          rx={2.2}
          ry={0.65}
          transform={`rotate(${a} ${x} ${y})`}
          fill={c}
        />
      ))}
      {star(-5.4, -18, 3.5, 7, 0.2)}
      {star(7.4, -13, 3.2, 7, 0.5)}
      {star(1, -25, 4.3, 8, 0)}
    </>
  );
};
const Poppy = () => {
  const r = mix(LINGON, 78, AUTUMN),
    st = mix(SUMMER, 60, SPRING),
    rr = rng(91);
  return (
    <>
      <Ground w={13} c={mix(BIRCH, 28, BARK)} />
      <Line
        d="M-2,0 C-3,-10 2,-17 1,-24 M1,0 C5,-6 9,-8 10.4,-14 C11,-17 9,-18.4 8,-17.6 M0,0 C-3,-5 -6,-9 -8,-14"
        c={st}
        w={0.7}
      />
      {[
        [-4, -5, -30],
        [4, -4, 40],
        [-1, -9, -60],
        [3, -11, 50],
      ].map(([x, y, a], i) => (
        <Pinnate key={i} x={x!} y={y!} a={a! < 0 ? 200 : -20} len={6} n={4} s={1.1} c={st} />
      ))}
      <g>
        <path d="M1,-23 C-6,-22 -9,-28 -6,-33 C-4,-35.4 -1,-34 1,-33 Z" fill={dark(r, 16)} />
        <path d="M1,-23 C8,-22 10,-29 7,-33.4 C5,-35.6 3,-34.6 1,-33 Z" fill={dark(r, 16)} />
        <path d="M-5,-27 C-4.6,-22 6,-21.4 6.4,-27 C6,-32.4 -4.6,-33 -5,-27 Z" fill={r} />
        <path
          d="M-3.6,-29 C-2,-31.4 1,-31 2,-30"
          stroke={mix(r, 60, BIRCH)}
          strokeWidth={0.8}
          strokeLinecap="round"
          fill="none"
        />
        <ellipse cx={0.7} cy={-26.4} rx={2.3} ry={1.4} fill={inkB} />
        <circle cx={0.7} cy={-26.6} r={0.8} fill={mix(SPRING, 60, BIRCH)} />
        {Array.from({ length: 9 }, (_, i) => (
          <circle
            key={i}
            cx={-1 + rr() * 3.4}
            cy={-27.2 + rr() * 1.4}
            r={0.2}
            fill={SNOW}
            opacity={0.5}
          />
        ))}
      </g>
      <path d="M-8,-14 C-10,-14.6 -10.4,-17.6 -8.6,-18.8 C-6.8,-18 -6.2,-15.2 -8,-14 Z" fill={st} />
      <path d="M-8.6,-18.8 C-8,-18 -7.6,-17 -7.6,-16.2 L-8.6,-15.8 Z" fill={r} />
      <path d="M8,-17.6 C6.4,-17 6.4,-14.4 8,-13.6 C9.4,-14.6 9.4,-17 8,-17.6 Z" fill={st} />
    </>
  );
};
const Gentian = () => {
  const b = "oklch(0.46 0.17 265)",
    l = "oklch(0.62 0.15 258)",
    c = dark(leaf, 8);
  const tr = (x: number, y: number, s: number, a: number) => (
    <g transform={`translate(${x} ${y}) rotate(${a}) scale(${s})`}>
      <path
        d="M-1.4,0 C-1.6,-3 -2.6,-5 -3.8,-9 L-2.1,-8.2 L-1.4,-10 L0,-8.5 L1.4,-10 L2.1,-8.2 L3.8,-9 C2.6,-5 1.6,-3 1.4,0 Z"
        fill={b}
      />
      <path
        d="M-0.9,-1 C-1.3,-3.6 -1.8,-5.6 -2,-8 L-1.4,-8.4 L-0.6,-8 C-0.7,-5.6 -0.6,-3 -0.3,-1 Z"
        fill={l}
      />
      <path
        d="M0.4,-1 C0.5,-3 0.7,-6 0.8,-8.1"
        stroke={dark(b, 24)}
        strokeWidth={0.34}
        fill="none"
      />
      <path d="M-1.6,-8.3 Q0,-7 1.7,-8.3" stroke={mix(l, 50, SNOW)} strokeWidth={0.4} fill="none" />
      <path
        d="M-1.4,0.4 C-1.2,1.4 1.2,1.4 1.4,0.4 L1.2,-1.6 L0.4,-0.8 L-0.3,-1.6 L-1.1,-0.8 Z"
        fill={SPRING}
      />
    </g>
  );
  return (
    <>
      <path d="M-15,1.6 C-12,-3 -6,-2.6 0,-2 C6,-2.6 12,-3 15,1.6 Z" fill={stone} />
      {[
        [-11, -2.6, 15],
        [-7, -3.8, -30],
        [11, -2.6, -15],
        [7, -3.8, 30],
        [-3.4, -4, -60],
        [3.4, -4, 60],
      ].map(([x, y, a], i) => (
        <ellipse
          key={i}
          cx={x}
          cy={y}
          rx={4.5}
          ry={1.5}
          transform={`rotate(${a} ${x} ${y})`}
          fill={i % 2 ? c : dark(c, 18)}
        />
      ))}
      {tr(-7.4, -5, 1.25, -18)}
      {tr(7.4, -5, 1.25, 18)}
      {tr(0, -6, 1.8, 0)}
    </>
  );
};

/* ------------------- animals ------------------- */
const Rock = ({
  d = "M-17,1.6 C-15,-2.4 -9,-2.2 -5,-1.4 C0,-2.2 8,-2.4 11,-1.2 C14,-1.6 16,-0.4 17,1.6 Z",
}: {
  d?: string;
}) => <path d={d} fill={stone} />;
const Chamois = () => {
  const fur = mix(BARK, 72, AUTUMN),
    d = dark(fur, 30),
    cream = mix(SNOW, 80, BIRCH);
  return (
    <>
      <Rock />
      <Line d="M-8,-11 C-9.6,-7 -7,-5 -8.6,-0.8" c={d} w={1.3} />
      <Line d="M6,-10 C6.6,-6 5,-4 5.6,-0.8" c={d} w={1.2} />
      <path
        d="M-12,-11.6 C-13,-15 -10,-18 -6,-18.4 C-1,-19 3,-18.6 6,-19 C7.4,-21 8.2,-23 9.4,-25 L13.4,-24 C13,-21 12.6,-18 11,-15 C9.6,-12.6 8.4,-11.2 7,-10.6 C2,-9.6 -7,-9.4 -12,-11.6 Z"
        fill={fur}
      />
      <path
        d="M-12,-11.6 C-13.6,-12 -14.4,-13.4 -13.8,-15 C-13,-14.6 -12.4,-14 -11.6,-14 Z"
        fill={d}
      />
      <path d="M-9,-17.8 C-4,-18.8 2,-18.4 7,-19.4 L7.6,-18.4 C2,-17 -4,-17 -9,-17 Z" fill={d} />
      <path d="M-9,-11 C-9.6,-8 -9.8,-4 -10.8,-0.8 L-9,-0.8 C-8,-4 -7,-7 -6,-10 Z" fill={fur} />
      <path d="M3.4,-10 C3.2,-7 3,-4 2.6,-0.8 L4.2,-0.8 C4.8,-4 5.8,-7 6.8,-10.4 Z" fill={fur} />
      <path
        d="M8.6,-23.4 C9.4,-27.2 13,-28 15,-26.4 L18.6,-23 C19.4,-22 18.8,-21 17.6,-21.2 L13.4,-21.2 C11,-20.6 8.8,-21 8.6,-23.4 Z"
        fill={cream}
      />
      <path
        d="M12.4,-27.2 C13.4,-25.6 16,-24.4 18.8,-22.4 C18,-22.2 16.8,-22.2 15.6,-22.8 C13.4,-23.8 11.6,-25 10.8,-26.4 Z"
        fill={inkB}
      />
      <path d="M10,-26.4 L6.6,-28.4 L9.6,-24.2 Z" fill={fur} />
      <Line
        d="M11.4,-27.2 C11,-30.4 12,-33 14.4,-33 C15.6,-33 15.8,-31.6 14.8,-31"
        c={inkB}
        w={0.95}
      />
      <Eye x={13.6} y={-25} r={0.6} />
    </>
  );
};
const Ibex = () => {
  const fur = mix(BARK, 62, mix(FG, 25, BIRCH)),
    d = dark(fur, 34),
    horn = mix(BARK, 40, mix(FG, 40, BIRCH));
  const ridges = [
    [9.8, -27.6],
    [8, -29.6],
    [5.8, -31],
    [3.4, -31.8],
    [1, -32],
    [-1.4, -31.4],
    [-3.4, -30],
  ];
  return (
    <>
      <path d="M-19,1.6 L-19,-4 L-9,-4 L-9,-1.6 L1,-1.6 L1,0 L19,0 L19,1.6 Z" fill={stone} />
      <path
        d="M-13,-4.4 L-3,-4.4 M3,-0.6 L15,-0.6"
        stroke={mix(stone, 80, SNOW)}
        strokeWidth={0.5}
      />
      <Line d="M-8,-12 C-9,-9 -7,-7 -8,-4.4" c={d} w={1.4} />
      <Line d="M6,-12 C7,-8 5,-5 5.6,-1" c={d} w={1.3} />
      <path
        d="M-13,-13 C-14,-17 -11,-20 -7,-20.4 C-2,-21 3,-21 6,-21 C7,-22 8,-23.4 9,-25 L13,-23.8 C13,-20 12,-16 10,-13 C8.4,-11.6 3,-10.6 -3,-10.6 C-7,-10.6 -11,-11 -13,-13 Z"
        fill={fur}
      />
      <path d="M-13,-14.2 C-14.6,-15 -15,-16.6 -14,-18 C-13,-17.4 -12,-16.6 -12,-15.4 Z" fill={d} />
      <path d="M-10,-11.6 C-11,-9 -11.4,-7 -12,-4.4 L-10,-4.4 C-9,-7 -8,-9 -7,-11 Z" fill={fur} />
      <path d="M3,-11 C3,-7.6 2.8,-4 2.4,-0.8 L4.2,-0.8 C5,-4 6,-8 7.6,-11.6 Z" fill={fur} />
      <path d="M-6,-11 C-2,-12.6 3,-12 8,-12.6 C6,-11 2,-10.6 -3,-10.6 Z" fill={d} />
      <path
        d="M8.6,-23.6 C9.4,-27 13,-27.8 15,-26.2 L18,-23 C18.8,-21.8 18,-20.8 16.8,-21 L13.6,-20.8 C11,-20 8.8,-21 8.6,-23.6 Z"
        fill={fur}
      />
      <path
        d="M14.4,-20.8 C14.2,-18.6 14.6,-16.4 15.4,-15.2 C16.4,-16.6 16.8,-18.8 16.6,-21 Z"
        fill={d}
      />
      <path
        d="M12,-27 C10,-31.6 5,-34.4 0,-34 C-3,-33.8 -6,-32 -7,-29.4 C-5,-30.6 -2.6,-31 -0.4,-30.6 C3,-30 7,-28 9.6,-25.4 Z"
        fill={horn}
      />
      {ridges.map(([x, y], i) => (
        <path
          key={i}
          d={`M${x},${y! - 2} l${0.6},${3}`}
          stroke={dark(horn, 34)}
          strokeWidth={0.5}
          strokeLinecap="round"
          transform={`rotate(${-20 + i * -14} ${x} ${y})`}
        />
      ))}
      <path d="M9.6,-25 L6.6,-26.6 L9,-23.2 Z" fill={d} />
      <Eye x={13.2} y={-24.6} r={0.6} />
    </>
  );
};
const Hare = () => {
  const w = mix(SNOW, 92, BIRCH),
    sh = mix(SNOW, 76, BARK);
  return (
    <>
      <path d="M-18,1.6 C-10,-0.8 8,-0.8 18,1.6 Z" fill={SNOW} opacity={0.8} />
      <Line d="M-1,-0.6 l1,0.4 M5,-0.4 l1.2,0.4" c={sh} w={0.5} />
      <path d="M-9,-6 C-12,-5 -15,-3 -18,-1.6 L-16,-0.6 C-13,-1.4 -9,-2 -6,-3 Z" fill={sh} />
      <path d="M8,-8 C10,-5 13,-3 15.4,-1.2 L13.4,-0.8 C10.6,-2.2 8,-3.6 5,-6 Z" fill={sh} />
      <path
        d="M-11,-8 C-13,-12 -9,-17.6 -3,-18.6 C2,-19.4 7,-18 10,-15.6 C10.8,-17 12,-18 13.6,-18.4 C16,-18.6 18,-17 18.6,-15 C18.8,-14 18,-13.4 17,-13.4 L14.6,-12.6 C13.4,-11 12,-9 9,-7.6 C3,-5 -8,-4 -11,-8 Z"
        fill={w}
      />
      <path
        d="M-11,-8 C-9,-5 -1,-5 5,-6.4 C3,-3.4 -5,-3 -8,-4 C-10,-4.6 -11,-6 -11,-8 Z"
        fill={sh}
      />
      <path
        d="M-11.4,-12 C-13.4,-13 -14.4,-11.4 -13.6,-9.6 C-12.8,-9 -11.6,-9.4 -11,-10.4 Z"
        fill={w}
      />
      <path
        d="M13,-18 C9,-20 4,-23 0,-22.6 C-0.8,-22.2 -0.4,-21 1,-20.4 C5,-19 9,-17.4 12,-16.2 Z"
        fill={w}
      />
      <path
        d="M1,-22.4 C-0.4,-22.6 -0.8,-22 -0.2,-21.2 C0.6,-20.8 1.6,-20.4 2.6,-20.2 C3,-21 2.2,-21.8 1,-22.4 Z"
        fill={inkB}
      />
      <path
        d="M13.6,-18.6 C10,-21.6 6.6,-25 3,-25.2 C2.2,-25 2.4,-23.8 3.6,-22.8 C7,-20.6 10,-18.4 12.6,-16.8 Z"
        fill={sh}
      />
      <path
        d="M4,-25.2 C2.6,-25.6 2,-24.8 2.8,-23.8 C3.6,-23.2 4.8,-22.8 6,-22.4 C6.2,-23.4 5.2,-24.6 4,-25.2 Z"
        fill={inkB}
      />
      <circle cx={18.2} cy={-14.8} r={0.5} fill={LINGON} />
      <Eye x={15} y={-16} r={0.75} ring={mix(AUTUMN, 70, BIRCH)} />
    </>
  );
};
const Water = ({ w = 18 }: { w?: number }) => (
  <>
    <path
      d={`M${-w},1.8 C${-w * 0.7},0.6 ${-w * 0.4},0.8 ${-w * 0.2},1.2 C0,1.6 ${w * 0.4},0.6 ${w},1.8 Z`}
      fill={mix(PRIMARY, 55, BG)}
    />
    <Line
      d={`M${-w * 0.8},0.2 q2.4,-1 4.8,0 M${w * 0.35},0.5 q2.4,-1 4.8,0`}
      c={mix(PRIMARY, 70, SNOW)}
      w={0.5}
    />
  </>
);
const Dipper = () => {
  const b = mix(BARK, 55, inkB),
    belly = mix(AUTUMN, 50, BARK),
    w = SNOW;
  return (
    <>
      <Water />
      <path d="M-13,1 C-12,-3.4 -3,-4.4 2,-3.6 C7,-4.6 12,-3 13,1 Z" fill={stone} />
      <Line d="M-1.6,-7 L-2,-3.8 M2.2,-7 L2.4,-3.8" c={mix(BARK, 55, FG)} w={0.9} />
      <path
        d="M-13.6,-19.4 C-13.8,-20.8 -12.4,-21.6 -11.2,-20.8 L-7,-16.6 C-5,-20 -1,-22 3.6,-21.6 C4.6,-25.4 11,-25.6 12.4,-21.4 C12.8,-19.6 11.6,-18 10.4,-17 C10.6,-12 7,-6.4 1,-6 C-4,-5.6 -7,-8.6 -8,-12 Z"
        fill={b}
      />
      <path
        d="M4.4,-24.8 C7,-26 11,-25 12.2,-22 C9.4,-23.2 6.4,-23.6 4.4,-24.8 Z"
        fill={mix(b, 75, AUTUMN)}
      />
      <path
        d="M12,-20.2 C12.2,-18.8 11.2,-17.6 10.4,-17 C10.6,-13.4 8.6,-9.8 5.4,-8 C3.4,-10.6 3.6,-15.6 6.6,-19 C8.4,-20.4 10.4,-20.6 12,-20.2 Z"
        fill={w}
      />
      <path
        d="M5.4,-8 C3.6,-7 2,-6.2 0.4,-6 C0.4,-7.6 2,-9 3.8,-9.8 C4.2,-9 4.8,-8.4 5.4,-8 Z"
        fill={belly}
      />
      <path d="M-7,-14 C-4,-19 2,-19 4,-15 C1.6,-12.2 -3.4,-11.6 -7,-14 Z" fill={dark(b, 26)} />
      <path d="M12.2,-22.4 L15.6,-21.2 L12.2,-20.4 Z" fill={inkB} />
      <Eye x={9.8} y={-22.2} r={0.7} ring={SNOW} />
      <g fill={mix(PRIMARY, 60, SNOW)}>
        <circle cx={15.5} cy={-8} r={0.5} />
        <circle cx={-16} cy={-4} r={0.4} />
        <circle cx={17} cy={-4} r={0.35} />
      </g>
    </>
  );
};
const Fingers = (
  x: number,
  y: number,
  n: number,
  len: number,
  a0: number,
  da: number,
  c: string,
  w = 1.5,
) =>
  Array.from({ length: n }, (_, i) => {
    const a = ((a0 + da * i) * Math.PI) / 180;
    return (
      <path
        key={i}
        d={`M${x},${y} L${x + Math.cos(a) * len},${y + Math.sin(a) * len}`}
        stroke={c}
        strokeWidth={w}
        strokeLinecap="round"
      />
    );
  });
const Eagle = () => {
  const b = mix(BARK, 75, inkB),
    gold = mix(BIRCH, 50, AUTUMN),
    wing = dark(b, 14);
  return (
    <g transform="translate(1 -1) scale(0.9)">
      {/* far wing */}
      <path d="M1,-13 C2,-20 7,-28 13,-31 L17,-31.4 C14,-27 10,-20 7,-13 Z" fill={dark(wing, 26)} />
      {Fingers(14.6, -30.4, 4, 4.2, -80, 18, dark(wing, 26), 1.1)}
      <path
        d="M-13,-9 L-20,-8 L-20,-5.4 L-12.6,-6 C-8,-4 0,-3 6,-5 C10,-6.4 12.6,-9 13.6,-11 L18,-10.8 L14.2,-13 C13.4,-15.4 10.4,-16 8,-15 C2,-13.6 -7,-12 -13,-9 Z"
        fill={b}
      />
      <path d="M-20,-8 L-20,-5.4 L-16,-5.8 L-16,-8.4 Z" fill={mix(SNOW, 40, b)} />
      <path d="M8,-15 C10.4,-16 13.4,-15.4 14.2,-13 C12,-12.2 9,-11.4 6,-12.4 Z" fill={gold} />
      <path
        d="M13.6,-13.6 C15.6,-13.8 17.4,-13 18,-11 C16.8,-11.6 15,-11.4 13.6,-11.2 Z"
        fill={BIRCH}
      />
      <path
        d="M16.4,-12.9 C17.6,-12.7 18.4,-11.8 18.2,-10.2 C17.6,-10.8 16.8,-11.2 15.8,-11.3 Z"
        fill={inkB}
      />
      <path
        d="M3,-13 C-1,-20 -7,-28 -15,-33 L-20,-33 C-17,-27 -10,-16 -6,-10 C-2,-9 2,-10 3,-13 Z"
        fill={wing}
      />
      {Fingers(-16, -32.4, 5, 6.4, -160, 22, wing, 1.5)}
      <path
        d="M-3,-14 C-6,-20 -10,-25 -15,-29"
        stroke={mix(wing, 70, gold)}
        strokeWidth={1.2}
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M-1,-6 C-2,-4.6 -3.6,-4.4 -5,-4.8 M-3,-5.8 L-6,-3.8"
        stroke={BIRCH}
        strokeWidth={0.8}
        strokeLinecap="round"
        fill="none"
      />
      <Eye x={13} y={-13.8} r={0.6} ring={mix(AUTUMN, 60, BIRCH)} />
    </g>
  );
};
const Swift = () => {
  const b = mix(BARK, 40, inkB),
    w = mix(b, 82, FG);
  return (
    <g transform="translate(1 -15)">
      <path d="M1,-4 C-3,-10 -10,-15 -20,-17 C-14,-12 -8,-7 -3,-2 Z" fill={dark(b, 26)} />
      <path
        d="M-11,1 L-20,5 L-14.6,0 L-20,-2.6 L-10,-2 C-6,-4.4 1,-5.6 6,-4.2 C9.6,-5 12.6,-3.4 13,-0.8 C12,1 9.6,2 7,2.4 C2,3.6 -6,3.4 -11,1 Z"
        fill={b}
      />
      <path
        d="M8,-0.6 C10,-0.2 12,-0.6 13,-0.8 C12,1 9.6,2 7,2.4 C6.8,1.2 7.2,0 8,-0.6 Z"
        fill={mix(FG, 75, BIRCH)}
      />
      <path d="M13,-1.8 L14.8,-1 L12.8,-0.6 Z" fill={inkB} />
      <path
        d="M3.4,-1.4 C-1,4 -9,10 -21,13.6 C-13,7.6 -7,2 -3,-3 C-1,-3.6 2,-3 3.4,-1.4 Z"
        fill={w}
      />
      <path
        d="M1,-1 C-3,3 -9,8 -15,10.6"
        stroke={b}
        strokeWidth={0.45}
        fill="none"
        strokeLinecap="round"
      />
      <Eye x={10} y={-1.8} r={0.55} />
    </g>
  );
};
const Skylark = () => {
  const b = mix(BARK, 62, AUTUMN),
    d = dark(b, 36),
    cr = mix(FG, 70, BIRCH);
  const notes = "M12,-31 q1.4,-1.8 3,-0.8 M15,-28 q1.6,-1.6 3,-0.4 M16,-33.4 q1.3,-1.2 2.4,-0.3";
  return (
    <g transform="translate(-1 -1)">
      <Line
        d="M1,-7 C0,-5.4 -1,-4.8 -2.6,-4.6 M3,-8 C2.4,-6 1.2,-5 -0.4,-4.6"
        c={mix(BARK, 60, FG)}
        w={0.5}
      />
      <path
        d="M-3,-19 C-7,-26 -13,-30 -17,-30 C-16.6,-27.6 -16.2,-26.4 -15,-25 C-15,-23.6 -14.4,-22.6 -13.6,-21.6 C-13,-20 -12,-19 -11,-18 C-8,-14 -4,-13 -1,-14 Z"
        fill={d}
      />
      <path
        d="M-9,-8 L-13,-5 L-12.6,-3.8 L-5,-7 C-1,-5.6 4,-7.4 6.6,-11 C9,-13.6 10.6,-17 10.6,-19 C10.8,-22 8,-23.6 5.4,-22.8 L4.6,-25 L3.6,-22.4 C-1,-20 -6,-14 -9,-8 Z"
        fill={b}
      />
      <path
        d="M6.6,-11 C4,-7.4 -1,-5.6 -5,-7 C-1,-9 3,-13 6,-16 C7,-15 7.2,-13 6.6,-11 Z"
        fill={cr}
      />
      {[
        [3.6, -11.4],
        [1.4, -9.4],
        [5.4, -13.6],
        [-1, -8.2],
      ].map(([x, y], i) => (
        <path
          key={i}
          d={`M${x},${y} l-1.1,0.5`}
          stroke={d}
          strokeWidth={0.5}
          strokeLinecap="round"
        />
      ))}
      <path
        d="M6,-20 C2,-27 -2,-31 -8,-33.4 C-7.6,-31 -7,-29.4 -6.4,-28 C-6,-26.4 -5.6,-25.4 -4.8,-24 C-4,-22 -2.6,-20 -1.4,-18.4 C1,-15 4,-15.4 6,-20 Z"
        fill={mix(b, 80, BIRCH)}
      />
      <Line d="M-5.6,-29 L1,-20.6 M-4.2,-26 L0,-19 M-2.8,-23 L-0.6,-18.6" c={d} w={0.45} />
      <path
        d="M10.2,-21.2 L13.4,-22.6 L10.4,-20.4 Z M10.4,-20.2 L13,-19.4 L10.2,-19.4 Z"
        fill={inkB}
      />
      <path d="M6.6,-21 C8,-20.2 9.2,-20 10.4,-20.2" stroke={cr} strokeWidth={0.5} fill="none" />
      <Eye x={8} y={-21.3} r={0.55} />
      <Line d={notes} c={mix(BIRCH, 70, SNOW)} w={0.4} />
    </g>
  );
};
const Goshawk = () => {
  const b = mix(inkB, 60, "oklch(0.5 0.03 240)"),
    cr = mix(SNOW, 85, BIRCH),
    d = dark(b, 26);
  return (
    <g transform="translate(1 -5) scale(0.85)">
      <Line d="M2,-1 C3,1.6 5,2.6 7,3 M7,3 L9.4,2.6 M7,3 L9,4" c={BIRCH} w={0.9} />
      <Line d="M-3,0 C-2,2.4 0,3.4 2,3.8 M2,3.8 L4.4,3.4 M2,3.8 L4,4.8" c={BIRCH} w={0.9} />
      {/* wing back */}
      <path
        d="M-6,-12 C-11,-18 -17,-20 -22,-20 C-21,-17.6 -20,-16.6 -18.6,-15.6 C-18.4,-14 -17.6,-13 -16.6,-12 C-15,-9.6 -11,-7 -7,-7 Z"
        fill={d}
      />
      <path
        d="M-13,-6 L-22,-1 L-20.6,1.6 L-12,-1.6 C-8,0.4 0,0 5,-2.6 L14,-3.4 C16,-4 18,-5 19,-6 L19.4,-7.8 C19.2,-12.4 15,-14 12,-13.2 C5,-13 -6,-13 -13,-6 Z"
        fill={b}
      />
      <path
        d="M-22,-1 L-20.6,1.6 L-18.4,0.8 L-19.6,-1.8 Z M-17.2,-3.4 L-16,-0.4 L-14.2,-1 L-15.4,-4 Z"
        fill={d}
      />
      <path
        d="M12,-7 C8,-6.4 4,-3.6 0,-0.6 C4,-0.2 8,-1 11,-2.6 L14,-3.4 C16,-4 18,-5 19,-6 L14,-7.6 Z"
        fill={cr}
      />
      {[
        [4, -3.4],
        [7, -4.6],
        [10, -5.6],
        [6.4, -2.2],
        [9.4, -3.4],
        [12.4, -4.6],
        [2.8, -1.6],
      ].map(([x, y], i) => (
        <path
          key={i}
          d={`M${x},${y} l1.4,-0.4`}
          stroke={d}
          strokeWidth={0.45}
          strokeLinecap="round"
        />
      ))}
      <path d="M13,-11.4 C15,-11.4 17,-11 18.4,-9.8 L13.4,-10 Z" fill={SNOW} />
      <path
        d="M-2,-12 C-6,-20 -11,-25 -17,-28 L-21,-27.6 C-18,-24 -13,-16 -9,-9 C-5,-7 -1,-8 -2,-12 Z"
        fill={mix(b, 90, FG)}
      />
      {Fingers(-18, -27, 4, 4.4, -170, 26, mix(b, 90, FG), 1.2)}
      <Line d="M-8,-13 L-13,-20 M-5,-12 L-9,-18" c={d} w={0.6} />
      <path d="M19.4,-8.6 C21,-8.4 22,-7 21.8,-5 C21,-6 20,-6.4 19,-6.4 Z" fill={inkB} />
      <path d="M19,-8.8 L19.6,-7.2 L18.6,-6.4 Z" fill={BIRCH} />
      <Eye x={16.8} y={-9} r={0.72} ring={mix(AUTUMN, 80, LINGON)} />
    </g>
  );
};
const Chough = () => {
  const b = inkB,
    sheen = "oklch(0.36 0.05 255)",
    rim = mix(FG, 28, BG);
  return (
    <g transform="translate(0 -5)">
      <Line d="M-3,-5 C-5,-3.6 -7,-3 -9,-3 M-1,-5 C-3,-3 -5,-2 -7,-1.4" c={LINGON} w={0.85} />
      <path
        d="M0,-12 C-1,-18 -2,-24 -2,-30 L0.4,-28.6 L2,-31.4 L3.6,-28.6 L6,-30.6 L7,-27 L10,-27.6 C8,-21 6,-15 4,-11 Z"
        fill={dark(b, 30)}
        stroke={rim}
        strokeWidth={0.2}
      />
      <path
        d="M-13,-8 L-20,-7.6 C-21,-6 -21,-5 -20,-3.6 L-12,-5 C-8,-3 -1,-3 4,-5 C8,-5.6 11,-7.6 12,-9.4 C12,-13.4 8,-14.6 5,-13.6 C0,-12.4 -8,-11 -13,-8 Z"
        fill={b}
        stroke={rim}
        strokeWidth={0.28}
      />
      <path d="M5,-13 C8,-14 11,-13 11.4,-10 C8,-11.4 6,-12 5,-13 Z" fill={sheen} />
      <path d="M12,-11 C13.6,-11 16,-9.8 16.8,-7.6 C15,-8.4 13.4,-8.8 11.6,-8.8 Z" fill={BIRCH} />
      <path
        d="M2,-9 C-3,-11 -7,-15 -11,-22 L-16,-30 L-13,-29 L-13.6,-32 L-10.4,-30 L-9.6,-32.6 L-7.4,-29.6 L-6,-31.6 C-3,-26 0,-19 3,-13 C3.6,-11 3,-9.6 2,-9 Z"
        fill={b}
        stroke={rim}
        strokeWidth={0.28}
      />
      <path
        d="M-1,-13 C-4,-17 -7,-22 -9,-27 M1,-13 C-1,-17 -3,-22 -6,-27"
        stroke={sheen}
        strokeWidth={0.7}
        fill="none"
        strokeLinecap="round"
      />
      <Eye x={9.6} y={-10.8} r={0.55} />
    </g>
  );
};
const Raven = () => {
  const b = inkB,
    rim = mix(FG, 30, BG),
    sheen = "oklch(0.36 0.06 280)";
  return (
    <>
      <Rock d="M-14,1.6 C-11,-2 -4,-2.6 1,-1.8 C6,-2.6 11,-1.8 14,1.6 Z" />
      <Line
        d="M-1,-6 L-1.4,-1.8 M3,-6 L3.4,-1.8 M-3,-1.6 L1,-1.6 M1.6,-1.6 L6,-1.6"
        c={mix(BG, 55, FG)}
        w={0.8}
      />
      <path
        d="M-18,-5 L-15.4,-3.6 L-7,-8 C-3,-5 4,-4.4 8,-9 C10,-11 10.4,-14 10.4,-16 C11,-19 11.4,-21 11.2,-23 C10.6,-28 4,-28.8 1.4,-25.4 C-3,-23 -9,-16 -11,-11 Z"
        fill={b}
        stroke={rim}
        strokeWidth={0.28}
      />
      <path
        d="M1,-21 C-3.6,-19.4 -8,-14 -10,-9 C-5,-8 2,-11 4,-16 C4.4,-18 3,-20.4 1,-21 Z"
        fill={dark(sheen, 20)}
      />
      <path
        d="M-2,-18 C-4,-16.6 -6,-14 -7.6,-11 M1,-17 C-1,-15 -3,-12.6 -4,-10.6"
        stroke={sheen}
        strokeWidth={0.6}
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M10.4,-16 L9.8,-13.4 L8.8,-14.6 L8.4,-11.8 L7,-13.6 L6.8,-10.8 L5.6,-12.2 C6,-15 8,-17 10.4,-16 Z"
        fill={mix(b, 80, FG)}
      />
      <path
        d="M10.4,-25.8 C12.6,-26.4 15.6,-25 18,-22 C16,-21.4 13.4,-21.2 11,-20.8 Z"
        fill={mix(FG, 32, BARK)}
      />
      <path
        d="M11,-22.6 C13,-22.6 15.6,-22.6 18,-22"
        stroke={inkB}
        strokeWidth={0.35}
        fill="none"
      />
      <Eye x={8} y={-24.6} r={0.62} />
    </>
  );
};
const Stoat = () => {
  const w = mix(SNOW, 94, BIRCH),
    sh = mix(SNOW, 74, BARK);
  return (
    <>
      <path d="M-20,1.6 C-10,-0.6 10,-0.6 20,1.6 Z" fill={SNOW} opacity={0.8} />
      <path
        d="M-11,-7 C-13,-5.4 -15,-4.4 -17,-2.6 L-15.4,-1.4 C-13,-3 -10,-3.8 -8,-5 Z"
        fill={sh}
      />
      <path d="M6,-9 C8,-7 10,-4 11.4,-1.6 L9.8,-1.2 C8,-3 5.6,-5 3.6,-7 Z" fill={sh} />
      <path
        d="M-13,-9 C-16,-10 -19,-11 -21,-15 C-22,-17.4 -19.6,-18.4 -18,-16.8 C-16,-14.6 -14,-13.6 -11,-13.4 Z"
        fill={w}
      />
      <path
        d="M-21,-15 C-22,-17.4 -19.6,-18.4 -18,-16.8 C-17.4,-16 -17,-15.4 -16.4,-15 C-17.6,-14 -19.6,-13.6 -21,-15 Z"
        fill={inkB}
      />
      <path
        d="M-13,-8 C-14,-12 -11,-14.6 -7,-15.6 C-3,-17 2,-17.6 6,-15.4 C8,-14.6 9,-15.4 11,-16.6 C13,-18 17,-18 19,-15.8 L21,-14 C21.4,-13.4 21,-12.8 20.4,-12.6 L17.6,-11.8 C15,-10.6 12,-10 10,-8.6 C6,-6 -9,-3.6 -13,-8 Z"
        fill={w}
      />
      <path
        d="M-13,-8 C-9,-4.6 4,-6 10,-8.6 C7,-5.6 -5,-3.4 -10,-5 C-11.6,-5.6 -12.6,-6.6 -13,-8 Z"
        fill={sh}
      />
      <path
        d="M12,-16.8 C11.8,-18.6 13,-19.6 14.4,-19.2 C15,-18.6 15,-17.8 14.8,-17.2 Z"
        fill={w}
      />
      <path
        d="M12.8,-17.4 C12.8,-18.2 13.3,-18.8 14,-18.6 C14.3,-18.2 14.3,-17.8 14.2,-17.4 Z"
        fill={BLOSSOM}
      />
      <circle cx={20.9} cy={-13.6} r={0.5} fill={inkB} />
      <circle cx={17} cy={-15} r={0.72} fill={inkB} />
      <circle cx={17.2} cy={-15.2} r={0.22} fill={FG} opacity={0.85} />
    </>
  );
};
const Peregrine = () => {
  const b = mix(inkB, 35, "oklch(0.52 0.05 250)"),
    cr = mix(SNOW, 85, BIRCH),
    d = dark(b, 30);
  return (
    <g transform="translate(1 -15) rotate(52) scale(0.92)">
      <path
        d="M-16,-1 L-19,-2.4 L-18.4,1.6 L-13,2.6 C-6,5.6 5,5.6 11,2.6 C14,2 16,1 18,-0.6 C18.4,-3 16,-5 12,-5 C4,-6.8 -9,-5.6 -16,-1 Z"
        fill={b}
      />
      <path
        d="M-10,2.8 C-4,5.4 5,5.6 11,2.6 C14,2 16,1 18,-0.6 L12,-1.4 C4,0 -4,1.6 -10,2.8 Z"
        fill={cr}
      />
      {[
        [-5, 3.2],
        [-2, 3.6],
        [1, 3.6],
        [4, 3.4],
        [7, 2.6],
        [-0.4, 2.2],
        [3, 1.8],
        [6, 1.2],
      ].map(([x, y], i) => (
        <path
          key={i}
          d={`M${x},${y} l0.9,-0.4`}
          stroke={d}
          strokeWidth={0.42}
          strokeLinecap="round"
        />
      ))}
      <path d="M8,-3 C2,-6 -8,-6 -22,-5.6 C-14,-1.6 -2,1.6 8,-0.2 Z" fill={d} />
      <path
        d="M-6,-3.4 C-10,-3.8 -13,-4 -17,-4.8"
        stroke={mix(b, 70, FG)}
        strokeWidth={0.5}
        fill="none"
      />
      <path
        d="M12,-5 C16,-5 18.4,-3 18,-0.6 L15,0.4 C14.2,-1 13,-2 11.4,-2 C10.6,-3 11,-4.4 12,-5 Z"
        fill={inkB}
      />
      <path d="M14.4,-0.2 L14.8,1.6 L16.2,-0.2 Z" fill={inkB} />
      <path d="M18,-1.6 C19.2,-1.2 19.6,-0.2 19,0.8 C18.2,0.4 17.4,0 16.8,-0.4 Z" fill={BIRCH} />
      <Eye x={15.4} y={-2.6} r={0.65} ring={BIRCH} />
    </g>
  );
};
const Grasshopper = () => {
  const c = mix(SPRING, 70, SUMMER),
    d = dark(c, 30);
  return (
    <g transform="translate(0 -1)">
      <path d="M-18,2.6 C-10,0.8 10,0.8 18,2.6 Z" fill={mix(BARK, 70, BG)} />
      <Line d="M3,-6 L4,-1 L6,1 M7,-6.4 L9.6,-2 L12,1" c={d} w={0.65} />
      <Line d="M14,-10 C17,-15 20,-17 21,-19 M14.4,-10.2 C18,-13 21,-14 22,-14.4" c={d} w={0.32} />
      <path
        d="M-15,-6 L-13,-11.6 C-8,-13 2,-14 8,-13 C11,-13 15,-12 15.6,-9.4 C15.6,-7.6 14,-6.6 11,-6 C3,-4.4 -8,-4.2 -15,-6 Z"
        fill={c}
      />
      <path d="M-15,-6 C-8,-4.2 3,-4.4 11,-6 C3,-7 -7,-7.6 -14,-8 Z" fill={mix(c, 75, BIRCH)} />
      <path d="M-16,-10.6 C-9,-13.6 0,-15 8,-13 C1,-11.6 -6,-10 -13,-8 Z" fill={d} />
      <path d="M2,-13.8 C4,-14.6 7,-14 9,-13 L9,-8 C6,-8 4,-8 2,-9 Z" fill={mix(c, 88, "black")} />
      <path
        d="M4,-8 C1,-11 -3,-18 -5,-20 C-7,-20.6 -8.4,-19 -7.6,-17.6 C-5,-14 -1,-9 2,-7 Z"
        fill={c}
      />
      <path d="M-4,-17 C-3.4,-15 -1,-12 1,-9.4" stroke={d} strokeWidth={0.4} fill="none" />
      <path
        d="M-6.4,-20 C-8,-15 -11,-7 -12,-1.6 L-12,0.6 M-12,0.6 L-15,1"
        stroke={d}
        strokeWidth={0.9}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M-11.6,-3 L-10.8,-2.6 M-10.8,-5.6 L-10,-5.2 M-10,-8.4 L-9.2,-8"
        stroke={d}
        strokeWidth={0.3}
      />
      <Eye x={12.6} y={-10.6} r={1} ring={d} />
    </g>
  );
};
const Marten = () => {
  const fur = mix(AUTUMN, 28, BARK),
    cr = mix(BIRCH, 76, SNOW),
    d = dark(fur, 30);
  return (
    <g>
      <path d="M2,1.6 C4,-10 5,-24 6,-37 L15,-37 C15,-24 16,-10 18,1.6 Z" fill={dark(BARK, 34)} />
      <Line
        d="M8,-3 L8.6,-10 M13,-6 L13.2,-14 M10,-18 L10.4,-26 M13.4,-24 L13.6,-33"
        c={dark(BARK, 58)}
        w={0.5}
      />
      <g transform="translate(-3 -16) rotate(-58) scale(0.8)">
        <path
          d="M-12,3 C-16,5 -20,4 -23,1 C-24.4,-1 -22.6,-3 -20.6,-2.4 C-17,-1.4 -14,-1.6 -11,-2 Z"
          fill={fur}
        />
        <path
          d="M-23,1 C-24.4,-1 -22.6,-3 -20.6,-2.4 C-20,-2.2 -19.4,-2 -18.8,-1.8 C-19,0.4 -20,2 -21,2.4 C-21.8,2 -22.4,1.6 -23,1 Z"
          fill={d}
        />
        <path d="M-9,4 C-10,6 -9,8 -6,9.6 L-4.4,8.2 C-6,7 -6,5.6 -5,4 Z" fill={d} />
        <path d="M6,3 C7,5 8,7 11,8.4 L12.2,7 C10,6 9,4.6 9,2 Z" fill={d} />
        <path
          d="M-13,0 C-13,-4 -9,-5 -4,-6 C1,-7 5,-6.6 9,-6 C11,-7 13,-8 15,-8 C18,-8 20,-6.6 21,-5 L23,-3.4 C23.4,-2.8 23,-2.2 22.4,-2 L19,-1 C16,0.4 13,1 11,2.6 C6,5.6 -9,6 -13,0 Z"
          fill={fur}
        />
        <path d="M-8,4 C-9,6.4 -8,8.4 -5.6,10 L-3.6,8.6 C-5,7 -5,5.6 -4,4 Z" fill={fur} />
        <path d="M7,3 C8,5.4 9.6,7.4 12,8.6 L13.4,7 C11.4,6 10.6,4.4 10.6,2 Z" fill={fur} />
        <path
          d="M19,-1 C16,0.4 13,1 11,2.6 C10,0 11.4,-2.6 14,-3.4 C16,-3.6 18,-2.6 19,-1 Z"
          fill={cr}
        />
        <path d="M13,-8 C12.6,-10 13.6,-11.2 15,-11 C15.8,-10.4 16,-9.2 15.8,-8.4 Z" fill={fur} />
        <path
          d="M13.8,-8.4 C13.6,-9.6 14.1,-10.3 14.8,-10.2 C15.2,-9.8 15.3,-9.2 15.2,-8.6 Z"
          fill={cr}
        />
        <circle cx={22.7} cy={-3} r={0.5} fill={inkB} />
        <Eye x={18.4} y={-5.2} r={0.68} />
      </g>
    </g>
  );
};
const Lynx = () => {
  const fur = mix(AUTUMN, 35, mix(BARK, 60, FG)),
    d = dark(fur, 36),
    cr = mix(SNOW, 80, BIRCH),
    r = rng(101);
  return (
    <>
      <Rock />
      <Line d="M-8,-10 C-10,-8 -8,-5 -10,-1 L-7,-1" c={d} w={1.6} />
      <path
        d="M-13,-10 C-14,-15 -11,-18.6 -6,-19 C-1,-19.4 4,-19 7,-18 C9,-20 10,-21.4 11,-23 L16,-22.8 C17,-20 16.4,-17 14,-14 C12,-11.6 10,-10.6 8,-10 C3,-8.4 -7,-7.6 -13,-10 Z"
        fill={fur}
      />
      <path
        d="M-13,-13 C-15,-13.4 -16,-14.4 -15.8,-15.8 C-14.4,-16 -13,-15.6 -12,-15 Z"
        fill={fur}
      />
      <path
        d="M-15.8,-15.8 C-16,-14.4 -15,-13.4 -14.2,-13.2 C-13.8,-14 -14,-15.4 -14.4,-15.8 Z"
        fill={inkB}
      />
      <path
        d="M-11,-9.6 C-11.4,-6.6 -11,-4 -12,-1 L-9,-1 C-7.6,-4 -6.6,-7 -5.4,-9.4 Z"
        fill={fur}
      />
      <path d="M4,-9 C4,-6 3.6,-3.4 3,-1 L6,-1 C6.8,-3.4 7.4,-6.4 8.6,-10 Z" fill={fur} />
      <path d="M9,-10.4 C9.4,-6.6 9.4,-3.4 8.6,-1 L11.2,-1 C12,-4 12.8,-7 13,-12 Z" fill={d} />
      <path d="M-5,-9 C0,-9.6 5,-10 9,-11 C7,-9 2,-8.2 -3,-8 Z" fill={cr} />
      {Array.from({ length: 22 }, (_, i) => (
        <ellipse key={i} cx={-11 + r() * 19} cy={-18 + r() * 8} rx={0.55} ry={0.42} fill={d} />
      ))}
      <path
        d="M9,-23 C9.4,-26.8 12.8,-28 15.6,-27 C18,-26 19.4,-24 19.6,-22 C19.8,-20.6 18.6,-19.6 17,-19.4 C14,-18.8 11,-19 10,-20.4 C9.2,-21 8.8,-22 9,-23 Z"
        fill={fur}
      />
      <path
        d="M10,-20.6 C9,-19 9.6,-17 11,-15.6 L12.6,-17.4 L14,-15.6 L15,-18 C13,-18.4 11,-19 10,-20.6 Z"
        fill={cr}
      />
      <path d="M11.4,-26.8 L10.6,-31.6 L14.2,-27.4 Z" fill={fur} />
      <Line d="M10.6,-31.2 L10.4,-33" c={inkB} w={0.5} />
      <path d="M14.4,-27.4 L14.6,-31 L16.8,-26.6 Z" fill={d} />
      <path
        d="M15.6,-22 C16.6,-21 18,-20.6 19.4,-21.2 C19.6,-20.2 18.6,-19.6 17,-19.4 C15.6,-19.4 15,-20.8 15.6,-22 Z"
        fill={cr}
      />
      <circle cx={19.2} cy={-22.2} r={0.5} fill={LINGON} />
      <Eye x={16.4} y={-23.8} r={0.72} ring={BIRCH} />
    </>
  );
};
const Weasel = () => {
  const fur = mix(AUTUMN, 50, BARK),
    cr = mix(SNOW, 88, BIRCH),
    d = dark(fur, 30);
  return (
    <>
      <path d="M-14,1.6 C-9,-1.6 7,-1.6 14,1.6 Z" fill={stone} />
      <path
        d="M-4,-1 C-8,-1.4 -11,-1 -13,-3 C-14,-4 -13,-5.4 -11.4,-5 C-9,-4 -6,-5 -3,-4 Z"
        fill={d}
      />
      <Line d="M-1,-1 L4,-1" c={d} w={1.3} />
      <path
        d="M-4.6,-1 C-5.6,-7 -4.8,-14 -2,-19 C0,-22.6 3,-25 5,-26.4 C8,-27.4 10,-26 11,-23.8 L13.6,-22.8 C14.4,-22.2 14,-21.2 13.2,-21.2 L10,-20 C8,-14 7,-8 5,-1 Z"
        fill={fur}
      />
      <path
        d="M10.2,-20.2 C8,-14 7,-8 5,-1 L1.6,-1 C1,-8 1.6,-15 5,-20 C7,-21 9,-21 10.2,-20.2 Z"
        fill={cr}
      />
      <path d="M4.6,-26.4 C3.8,-28 4.8,-29.2 6.2,-29 C7,-28.6 7.2,-27.6 7,-26.8 Z" fill={fur} />
      <path
        d="M5.2,-26.8 C4.9,-27.8 5.4,-28.4 6.1,-28.3 C6.5,-28 6.6,-27.5 6.5,-27 Z"
        fill={BLOSSOM}
      />
      <Line d="M6,-15.6 L8,-14.2 M3.6,-15.6 L5.6,-13.8" c={fur} w={1.1} />
      <circle cx={13.7} cy={-22} r={0.48} fill={inkB} />
      <circle cx={9.6} cy={-23.6} r={0.72} fill={inkB} />
      <circle cx={9.8} cy={-23.8} r={0.22} fill={FG} opacity={0.85} />
    </>
  );
};
const Wolf = () => {
  const fur = mix(FG, 42, mix(BARK, 55, BG)),
    d = dark(fur, 30),
    cr = mix(SNOW, 70, fur);
  return (
    <>
      <path d="M-20,1.6 C-10,-1 10,-1 20,1.6 Z" fill={mix(BARK, 70, BG)} />
      <Line d="M-9,-9 C-7,-6 -9,-3 -6,-0.6" c={d} w={1.5} />
      <Line d="M7,-10 C10,-7 9,-4 11,-0.6" c={d} w={1.4} />
      <path
        d="M-14,-16 C-18,-15 -20,-11 -20,-6 C-19.6,-3.6 -17.4,-3.4 -16.4,-5.4 C-15.4,-8.4 -14,-11 -12,-13 Z"
        fill={fur}
      />
      <path
        d="M-20,-6 C-19.6,-3.6 -17.4,-3.4 -16.4,-5.4 L-15.8,-7 C-17,-8 -19,-8 -20,-6 Z"
        fill={inkB}
      />
      <path
        d="M-15,-12 C-15.4,-16 -12,-19 -7,-19.4 C-2,-20 3,-20.4 7,-19.4 C10,-18.6 12,-16.6 13.4,-15.4 L14,-11 C12,-9.6 10,-9.4 8,-9.4 C2,-8.6 -9,-8 -15,-12 Z"
        fill={fur}
      />
      <path
        d="M-13.6,-17 C-8,-19.8 2,-20.8 9,-19 C11,-18.2 12,-17 12.6,-16 C5,-16.6 -5,-16.4 -14.6,-13.6 C-14.8,-14.8 -14.4,-16 -13.6,-17 Z"
        fill={d}
      />
      <path
        d="M-12.6,-10.4 C-13,-7 -12.6,-4 -14,-0.6 L-11.2,-0.6 C-9.8,-4 -8.8,-7 -7.4,-9.6 Z"
        fill={fur}
      />
      <path
        d="M3.6,-9.4 C4.2,-6 4,-3.6 3.2,-0.6 L5.8,-0.6 C6.6,-3.6 7.6,-6.4 9,-9.6 Z"
        fill={fur}
      />
      <path d="M-5,-9.2 C0,-9.8 5,-10 9,-10.6 C8,-9.4 3,-8.6 -3,-8.4 Z" fill={cr} />
      <path
        d="M10,-17 C12,-19 15,-19 17,-17.6 L22,-14.4 C22.8,-13.6 22.4,-12.6 21.4,-12.6 L17,-12 C15,-10.6 12.4,-10.4 10.6,-11.6 C9,-13 9,-15.4 10,-17 Z"
        fill={fur}
      />
      <path
        d="M13,-12 C15,-13 18,-13.4 21.6,-13.4 C22.4,-13 22.2,-12.6 21.4,-12.6 L17,-12 C15.4,-10.8 13,-10.6 11.6,-11 Z"
        fill={cr}
      />
      <path d="M11,-18 L9.6,-22 L13.6,-18.8 Z" fill={d} />
      <path d="M13.4,-18.6 L12.8,-22.4 L16,-18.2 Z" fill={fur} />
      <circle cx={22} cy={-13.6} r={0.55} fill={inkB} />
      <Eye x={16} y={-16} r={0.58} ring={BIRCH} />
    </>
  );
};
const Bear = () => {
  const fur = mix(BARK, 72, "oklch(0.28 0.03 50)"),
    d = dark(fur, 34),
    lit = mix(fur, 76, AUTUMN);
  return (
    <>
      <path d="M-20,1.6 C-10,-1 10,-1 20,1.6 Z" fill={mix(BARK, 70, BG)} />
      <path d="M-14,-13 C-15,-9 -15,-4 -16,-0.4 L-10,-0.4 C-9,-3 -8,-6 -6,-9 Z" fill={d} />
      <path d="M7,-12 C7,-8 7,-4 6,-0.4 L11,-0.4 C12,-4 13,-8 13,-12 Z" fill={d} />
      <path
        d="M-18,-12 C-20,-19 -15,-26 -7,-26 C-3,-27 0,-29 4,-28.6 C8,-28 10,-25 11.4,-22 C14,-19 14,-12 11,-9 C5,-6 -8,-5 -14,-7 C-16,-8 -17.6,-10 -18,-12 Z"
        fill={fur}
      />
      <path
        d="M-16,-20 C-13,-25 -8,-25 -4,-26 C0,-27.6 4,-27.8 7,-26 C3,-25.4 -2,-24 -5,-23 C-9,-22 -13,-22 -16,-20 Z"
        fill={lit}
      />
      <path
        d="M-16,-10 C-15.6,-6 -15.6,-3 -16.6,-0.4 L-11,-0.4 C-10,-3 -8.6,-6 -7,-9 Z"
        fill={fur}
      />
      <path d="M3,-9 C3.6,-6 3.4,-3 2.6,-0.4 L8,-0.4 C9,-3 10,-6 10.4,-9 Z" fill={fur} />
      <path
        d="M8.6,-21 C9,-25 13,-26.6 16,-25.4 C18,-24.6 19,-23 20.4,-21.8 L22,-20.4 C22.8,-19.4 22.2,-18.2 21,-18.2 L17.4,-17.4 C14,-16 10,-16 9,-18 Z"
        fill={fur}
      />
      <path
        d="M17.4,-21.8 C19,-21.8 21,-21.2 22,-20.4 C22.8,-19.4 22.2,-18.2 21,-18.2 L17.4,-17.4 C16.4,-18.6 16.4,-20.8 17.4,-21.8 Z"
        fill={lit}
      />
      <circle cx={10.8} cy={-25.6} r={1.7} fill={fur} />
      <circle cx={10.8} cy={-25.6} r={0.85} fill={d} />
      <circle cx={21.7} cy={-20.2} r={0.7} fill={inkB} />
      <circle cx={16} cy={-22.2} r={0.62} fill={BG} />
      <circle cx={16.2} cy={-22.4} r={0.2} fill={FG} />
      <Line d="M-15,-1 h1 M-13,-1 h1 M4,-1 h1 M6,-1 h1" c={BIRCH} w={0.4} />
    </>
  );
};
const Hornet = () => {
  const y = mix(BIRCH, 85, AUTUMN),
    red = mix(LINGON, 50, BARK),
    k = inkB;
  return (
    <g transform="translate(0 -14) rotate(-8)">
      <path
        d="M2,-3 C-2,-11 -10,-17 -19,-16 C-19,-11 -12,-4 1,-2 Z"
        fill={mix(BIRCH, 28, SNOW)}
        opacity={0.5}
      />
      <path
        d="M2,-3 C0,-9 -4,-14 -11,-15 M2,-3 C-3,-6 -9,-10 -16,-13"
        stroke={mix(FG, 45, BG)}
        strokeWidth={0.25}
        fill="none"
      />
      <path
        d="M1,-3 C-4,-7 -11,-7 -16,-5 C-13,-1 -5,1 1,-1 Z"
        fill={mix(BIRCH, 30, SNOW)}
        opacity={0.4}
      />
      <Line d="M4,3 L3,8 L0,10 M6,3 L7,8 L5,12 M8,3 L11,8 L12,12" c={red} w={0.65} />
      <path
        d="M0,1 C-3,-2 -8,-3.4 -12,-1.6 C-16,0 -19,4 -21,7 C-16,8.6 -10,8 -5,6 C-2,5 0,3 0,1 Z"
        fill={y}
      />
      {[
        ["M-2.4,-1.4 C-3.6,1 -3.6,4 -2.8,5", 2],
        ["M-6.8,-2.6 C-8,0.6 -8,4 -7,7", 2.1],
        ["M-11.4,-2 C-12.6,1 -12.6,5 -11.6,7.8", 2],
        ["M-15.6,0.6 C-16.6,3 -16.6,6 -15.8,8", 1.5],
      ].map(([dd, w], i) => (
        <path key={i} d={dd as string} stroke={k} strokeWidth={w as number} fill="none" />
      ))}
      <path d="M0,-3 C3,-5.4 8,-5 10,-2 C11,0 10,3 7,4 C3,5 0,3 0,1 Z" fill={red} />
      <path d="M2,-3 C5,-4.4 8,-3.6 9,-1.4 C6,-2 4,-2 2,-3 Z" fill={mix(red, 70, BIRCH)} />
      <circle cx={13.4} cy={-1} r={4.1} fill={y} />
      <path d="M10,-3.4 C12,-5.4 15,-5.4 16.8,-3.6 C15,-3 12,-3 10,-3.4 Z" fill={red} />
      <ellipse cx={14.4} cy={-1.8} rx={1.7} ry={2.5} fill={k} />
      <path d="M15.6,1.8 L18,2.6 L15.4,3 Z" fill={k} />
      <Line d="M15,-4.6 C16,-8 19,-9 22,-8 M13.6,-5 C14,-9 16,-11 18,-11.6" c={k} w={0.5} />
    </g>
  );
};
const Viper = () => {
  const c = mix(BARK, 55, mix(FG, 45, BIRCH)),
    k = inkB,
    u = dark(c, 22);
  const zig = (d: string) => (
    <path d={d} stroke={k} strokeWidth={1.1} strokeLinejoin="round" fill="none" />
  );
  return (
    <>
      <path d="M-20,1.6 C-10,-1 10,-1 20,1.6 Z" fill={stone} />
      <ellipse cx={-1} cy={-3} rx={16} ry={3.8} fill={u} />
      <path d="M-17,-3.6 C-13,-1.4 11,-1.4 15,-3.6 C11,-6 -13,-6 -17,-3.6 Z" fill={c} />
      {zig(
        "M-15,-3.4 L-12.6,-2.2 L-10.2,-3.8 L-7.8,-2.2 L-5.4,-3.8 L-3,-2.2 L-0.6,-3.8 L1.8,-2.2 L4.2,-3.8 L6.6,-2.2 L9,-3.8 L11.4,-2.2 L13.6,-3.4",
      )}
      <ellipse cx={-1} cy={-7.4} rx={12.6} ry={3.6} fill={u} />
      <path d="M-13,-8 C-9,-5.4 7,-5.4 11,-8 C7,-10.4 -9,-10.4 -13,-8 Z" fill={c} />
      {zig(
        "M-11.4,-8 L-9,-6.6 L-6.6,-8.4 L-4.2,-6.6 L-1.8,-8.4 L0.6,-6.6 L3,-8.4 L5.4,-6.6 L8,-8.4 L10,-7.4",
      )}
      <path
        d="M-11,-10 C-11,-13.4 -6,-14.4 -2,-14 C2,-14 5,-13 6.4,-11 C7,-9.4 3,-8.4 -2,-8.4 C-7,-8.4 -11,-8.4 -11,-10 Z"
        fill={u}
      />
      <path d="M-10,-11 C-6,-9 -1,-9 4,-11 C1,-13.6 -7,-13.6 -10,-11 Z" fill={c} />
      {zig("M-8.6,-11.2 L-6.4,-9.8 L-4.2,-11.6 L-2,-9.8 L0.2,-11.6 L2.8,-10.6")}
      <path
        d="M3,-12.4 C5,-16 5.4,-20 4,-23.6 C3.2,-26.4 5,-28.4 7.4,-28 L11,-25 L7.4,-23.6 C8.8,-20 8.6,-15 6.4,-11 Z"
        fill={c}
      />
      {zig("M4.8,-12.8 L6.8,-15.4 L5.2,-17.8 L6.9,-20.2 L5.4,-22.6 L6.8,-24.6")}
      <path
        d="M4.4,-25 C4.6,-28 7,-29.8 10,-29 L15.6,-26.6 C16.6,-26 16.4,-25 15.4,-24.6 L10.4,-23.4 C7.6,-22.8 4.8,-23 4.4,-25 Z"
        fill={c}
      />
      <path d="M5.6,-26.6 L8.6,-27.8 L7.8,-26 L10.4,-26.4 L8.4,-24.6 L6.6,-25.4 Z" fill={k} />
      <Line d="M15.6,-25 L17.8,-24 M17.8,-24 L19,-24.8 M17.8,-24 L19,-23.2" c={LINGON} w={0.35} />
      <Eye x={11.6} y={-26.4} r={0.65} ring={mix(LINGON, 70, AUTUMN)} />
    </>
  );
};
const Boar = () => {
  const fur = mix(inkB, 32, BARK),
    d = dark(fur, 30),
    lit = mix(fur, 72, AUTUMN);
  return (
    <>
      <path d="M-20,1.6 C-10,-1 10,-1 20,1.6 Z" fill={mix(BARK, 70, BG)} />
      <Line d="M-12,-7 C-14,-5 -13,-3 -16,-0.6 M8,-8 C11,-5 11,-3 13,-0.6" c={d} w={1.4} />
      <path
        d="M-16,-18 C-18,-17 -19,-15 -19,-13.4"
        stroke={fur}
        strokeWidth={0.7}
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M-17,-11 C-18,-15 -15,-18 -10,-18.6 C-4,-20 2,-24.6 8,-24 C12,-23.4 15,-20 15,-14 C14,-10 11,-8 7,-7 C0,-5.6 -12,-6 -17,-11 Z"
        fill={fur}
      />
      <path
        d="M-14,-18 L-12,-20 L-10,-19 L-8,-21 L-6,-20.4 L-4,-22.6 L-2,-22 L0,-24.4 L2,-23.8 L4,-25.8 L6,-24.8 L8,-26.6 L10,-24.8 L12,-25 L12,-21 C5,-22 -5,-18 -14,-16 Z"
        fill={d}
      />
      <path d="M-13,-8 C-12,-5 -13,-3 -14.4,-0.6 L-11.4,-0.6 C-10,-3 -8,-6 -7,-7 Z" fill={fur} />
      <path d="M4,-7 C5,-5 5,-3 4,-0.6 L7,-0.6 C8,-3 9,-5 10.6,-8 Z" fill={fur} />
      <path
        d="M10,-22 C14,-22 17,-20 19,-17 L24,-13.4 C25,-12.4 25,-10.6 24,-10 L20,-9.4 C17,-8.4 13,-8.4 11,-10 C9,-12 8.6,-18 10,-22 Z"
        fill={fur}
      />
      <path
        d="M21,-14.8 L24,-13.4 C25,-12.4 25,-10.6 24,-10 C23,-11 22,-13 21,-14.8 Z"
        fill={lit}
      />
      <ellipse cx={24.2} cy={-11.8} rx={0.65} ry={1.5} fill={mix(LINGON, 40, BARK)} />
      <path d="M12,-21.6 L10,-25.6 L14.6,-22.6 Z" fill={d} />
      <path
        d="M19.4,-10 C20.4,-11.4 21,-13 20.6,-14.6 C19.4,-14.2 18.6,-12.4 18.2,-10 Z"
        fill={SNOW}
      />
      <Eye x={15.6} y={-17.8} r={0.55} />
    </>
  );
};
const Badger = () => {
  const fur = mix(FG, 40, mix(BARK, 40, BG)),
    k = inkB,
    w = mix(SNOW, 94, BIRCH),
    d = dark(fur, 38);
  return (
    <>
      <path d="M-20,1.6 C-10,-1 10,-1 20,1.6 Z" fill={mix(BARK, 70, BG)} />
      <path
        d="M-13,-6 C-13,-3 -14,-1 -15,0 L-10,0 C-9,-2 -8,-4 -7,-6 Z M5,-6 C5,-3 4,-1 3,0 L8,0 C9,-2 10,-4 10.6,-7 Z"
        fill={k}
      />
      <path d="M-15,-11 C-18,-11 -19,-9 -18.4,-7.6 C-17,-7 -15,-7.4 -14,-8.4 Z" fill={fur} />
      <path
        d="M-16,-8 C-17,-13 -13,-17 -6,-17.6 C-1,-18 4,-17 7,-16 L11,-8 C8,-5.4 2,-4.6 -4,-4.6 C-9,-4.6 -14,-5.4 -16,-8 Z"
        fill={fur}
      />
      <path
        d="M-15.4,-7 C-14,-5.6 -9,-4.6 -4,-4.6 C2,-4.6 8,-5.4 11,-8 L8,-10 C2,-8 -8,-8 -15.4,-7 Z"
        fill={k}
      />
      {Array.from({ length: 20 }, (_, i) => (
        <path
          key={i}
          d={`M${-14 + i * 1.3},${-15 + (i % 3) * 1.6 + Math.abs(i - 10) * 0.12} l0.5,1.4`}
          stroke={i % 2 ? d : w}
          strokeWidth={0.28}
          opacity={0.75}
        />
      ))}
      <path
        d="M6,-15 C9,-17.6 13,-17.6 16,-15.6 L22,-11 C22.8,-10 22.4,-9 21.4,-8.8 L16,-7.6 C12,-6.8 8,-7.4 7,-10 C6,-11.6 5.6,-13.4 6,-15 Z"
        fill={w}
      />
      <path
        d="M8,-16.4 C11,-16 15,-14 21.4,-10 C19,-10 16,-10.4 14.6,-9.8 L13,-9.4 C11,-11 9,-13 7,-14.6 Z"
        fill={k}
      />
      <path d="M21.6,-10.2 C22.6,-10 22.8,-9.2 21.6,-8.8 C21,-9 21,-9.8 21.6,-10.2 Z" fill={k} />
      <path d="M8,-15.6 C7.8,-17.4 9,-18 10,-17.4 C10.4,-16.8 10.2,-16.2 9.8,-15.8 Z" fill={w} />
      <circle cx={15.4} cy={-11.6} r={0.62} fill={BG} />
      <circle cx={15.6} cy={-11.8} r={0.2} fill={FG} />
    </>
  );
};

const ART: Record<SpeciesKey, ComponentType> = {
  Moss,
  Fern,
  Beech,
  Oak,
  Fir,
  Birch,
  Maple,
  Chestnut,
  Spruce,
  Aspen,
  Hazel,
  Cirmolo,
  Mugo,
  Alpenrose,
  Juniper,
  Rowan,
  Larch,
  Bilberry,
  Chamois,
  Ibex,
  Hare,
  Dipper,
  Eagle,
  Swift,
  Skylark,
  Goshawk,
  Chough,
  Raven,
  Stoat,
  Peregrine,
  Grasshopper,
  Marten,
  Lynx,
  Weasel,
  Wolf,
  Bear,
  Hornet,
  Viper,
  Boar,
  Badger,
  Crocus,
  Primrose,
  Edelweiss,
  Poppy,
  Gentian,
};

/** A workout's plant or animal, or nothing for a name that isn't one of them. */
export const WorkoutIcon = memo(function WorkoutIcon({
  name,
  className,
}: {
  name: string | null | undefined;
  className?: string;
}) {
  const key = speciesOf(name);
  if (!key) return null;
  const Art = ART[key];
  return (
    <svg viewBox="-25 -37 50 41" className={className ?? "h-8 w-10 shrink-0"} aria-hidden>
      <Art />
    </svg>
  );
});
