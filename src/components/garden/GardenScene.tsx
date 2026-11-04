// The garden under the sky of the moment (the real time of day, today's form as weather): a traditional vegetable
// garden, with your tree standing beyond its old fence. Each bed is a mound of earthed-up soil only as long as what
// grows in it, lit along its crown and worked by hand, so a few sessions make a small tended plot rather than a field
// with mud in it: the fewer the plants, the bigger they stand and the more of the sky stays. Plants keep their order
// (oldest at the left, today's at the right). The soil darkens with regular training off the bike; today's readiness
// season lies over everything (snow, blossom, fallen leaves, fireflies in summer). Flowers grow at the front, and the
// pond appears once something grows in it.
import { useEffect, useMemo, type ReactNode } from "react";
import { MiniTree, type SceneTree } from "@/components/forest/ForestScene";
import { Mist, WeatherFront } from "@/components/sky/TimeSky";
import { GardenCritter, Plant, Scarecrow, type Look } from "@/components/garden/Crops";
import {
  sportSign,
  type Crop,
  type CropMap,
  type Garden,
  type Plant as GardenPlant,
  type Sport,
} from "@/lib/garden";
import { daylight, WARM, type Daylight } from "@/lib/daylight";
import { t } from "@/lib/i18n";
import { ridgeAcross } from "@/lib/ridge";
import { rng, seedOf, type Season, type Weather } from "@/lib/tree";

const mix = (a: string, pa: number, b: string) =>
  `color-mix(in oklab, ${a} ${Math.round(Math.min(100, Math.max(0, pa)))}%, ${b})`;

/** A colour by day and by night, warmed at sunrise and sunset. */
function tone(d: Daylight, day: string, night: string) {
  const c = mix(day, d.light * 100, night);
  return d.glow > 0 ? mix(c, 100 - d.glow * 16, WARM) : c;
}

/** The land: `depth` 0 where the light falls, higher in shade. Calm, so the plants stand out against it. */
function land(season: Season | null, d: Daylight, depth: number) {
  const k = Math.max(0, depth);
  const day = (l: number, step = 0.11) => (l - k * step).toFixed(3);
  const night = (l: number) => (l - k * 0.045).toFixed(3);
  if (season === "winter")
    return tone(d, `oklch(${day(0.86, 0.05)} 0.022 232)`, `oklch(${night(0.4)} 0.03 250)`);
  if (season === "autumn")
    return tone(d, `oklch(${day(0.6)} 0.07 95)`, `oklch(${night(0.28)} 0.03 130)`);
  if (season === "spring")
    return tone(d, `oklch(${day(0.63)} 0.09 128)`, `oklch(${night(0.28)} 0.04 175)`);
  return tone(d, `oklch(${day(0.61)} 0.095 130)`, `oklch(${night(0.27)} 0.035 185)`);
}

/** Earth keeps its meaning: pale and dry when resting, dark and moist with regular training. `k` lifts or sinks it. */
function earth(d: Daylight, soil: number, k = 0) {
  const dayL = 0.54 - soil * 0.17 + k;
  const nightL = 0.29 - soil * 0.08 + k * 0.6;
  return tone(
    d,
    `oklch(${dayL.toFixed(3)} ${(0.055 + soil * 0.01).toFixed(3)} 58)`,
    `oklch(${nightL.toFixed(3)} 0.03 55)`,
  );
}

const wood = (d: Daylight, k = 0) =>
  tone(d, `oklch(${0.58 + k} 0.045 72)`, `oklch(${0.35 + k} 0.025 60)`);

/** Crops that grow by the water or in the front border rather than in a bed. */
const POND: Crop[] = ["lily", "reeds"];
const BORDER: Crop = "flowers";

export type GardenSky = { season: Season | null; weather: Weather | null; weatherPhase: number };

const look = (p: GardenPlant, season: Season | null): Look => ({
  size: p.size,
  vigor: p.vigor,
  fruit: p.fruit,
  ripeness: p.ripeness,
  intensity: p.intensity,
  seed: p.seed,
  season,
});

/** How big a bed's plants stand: a rare session isn't a speck. */
const plantScale = (n: number) => (n <= 2 ? 1.8 : n <= 4 ? 1.55 : n <= 7 ? 1.2 : 0.98);

/**
 * A soft, irregular closed shape around (cx, cy): an ellipse whose radius wobbles (by `wobble`, 0–1) at a few
 * random points, smoothed into one path (Catmull-Rom through the points).
 */
function blob(cx: number, cy: number, rx: number, ry: number, seed: number, wobble = 0.12) {
  const r = rng(seed);
  const n = 10;
  const pts = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    const k = 1 + (r() - 0.5) * 2 * wobble;
    return [cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k] as const;
  });
  const p = (i: number) => pts[(i + n) % n]!;
  let s = `M${p(0)[0].toFixed(1)},${p(0)[1].toFixed(1)}`;
  for (let i = 0; i < n; i++) {
    const [p0, p1, p2, p3] = [p(i - 1), p(i), p(i + 1), p(i + 2)];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    s += ` C${c1[0]!.toFixed(1)},${c1[1]!.toFixed(1)} ${c2[0]!.toFixed(1)},${c2[1]!.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return `${s} Z`;
}

/** Tufts of curved grass blades in two tones, growing bigger toward the front. */
function Grass({
  seed,
  count,
  W,
  y0,
  y1,
  c1,
  c2,
  avoid,
}: {
  seed: string;
  count: number;
  W: number;
  y0: number;
  y1: number;
  c1: string;
  c2: string;
  avoid: (x: number, y: number) => boolean;
}) {
  const r = rng(seedOf(seed));
  const tufts: ReactNode[] = [];
  for (let i = 0; i < count; i++) {
    const x = r() * W;
    const y = y0 + r() * (y1 - y0);
    const s = 0.72 * (0.8 + r() * 0.7) * (1 + (0.7 * (y - y0)) / Math.max(1, y1 - y0));
    const color = r() < 0.5 ? c1 : c2;
    const blades = 3 + Math.floor(r() * 3);
    let d = "";
    for (let b = 0; b < blades; b++) {
      const dx = (b - (blades - 1) / 2) * 1.5 * s + (r() - 0.5);
      d += `M${(x + dx * 0.3).toFixed(1)},${y.toFixed(1)} Q${(x + dx * 0.5).toFixed(1)},${(y - 3 * s).toFixed(1)} ${(x + dx * 1.2).toFixed(1)},${(y - (4 + r() * 2.6) * s).toFixed(1)} `;
    }
    if (!avoid(x, y))
      tufts.push(
        <path
          key={i}
          d={d}
          stroke={color}
          strokeWidth={0.75 + s * 0.12}
          fill="none"
          strokeLinecap="round"
        />,
      );
  }
  return <g>{tufts}</g>;
}

/** A few wildflowers in the grass, meaning nothing but the season. */
function Wildflowers({
  W,
  y0,
  y1,
  count,
  season,
  d,
  avoid,
}: {
  W: number;
  y0: number;
  y1: number;
  count: number;
  season: Season | null;
  d: Daylight;
  avoid: (x: number, y: number) => boolean;
}) {
  if (season === "winter") return null;
  const r = rng(seedOf("garden-wild"));
  const hues =
    season === "autumn"
      ? ["var(--autumn)", "var(--birch)"]
      : ["var(--blossom)", "var(--birch)", "var(--snow)"];
  return (
    <g opacity={0.5 + d.light * 0.4}>
      {Array.from({ length: count }, (_, i) => {
        const x = r() * W;
        const y = y0 + r() * (y1 - y0);
        const hue = hues[Math.floor(r() * hues.length)]!;
        const h = 3 + r() * 2.5;
        if (avoid(x, y)) return null;
        return (
          <g key={i}>
            <line
              x1={x}
              y1={y}
              x2={x}
              y2={y - h}
              stroke={mix("var(--summer)", 80, "black")}
              strokeWidth={0.5}
            />
            <circle cx={x} cy={y - h} r={1} fill={hue} />
          </g>
        );
      })}
    </g>
  );
}

/** A button over a part of the scene (plant, bed sign): keyboard and screen reader friendly. */
function Tap({
  label,
  onTap,
  children,
}: {
  label: string;
  onTap: (() => void) | undefined;
  children: ReactNode;
}) {
  if (!onTap) return <g>{children}</g>;
  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={label}
      className="cursor-pointer outline-none [&:focus-visible]:opacity-80 [&:hover]:opacity-90"
      onClick={onTap}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onTap()}
    >
      {children}
    </g>
  );
}

const plantLabel = (p: GardenPlant) => {
  const days =
    p.age === 0
      ? t("today", "oggi")
      : p.age === 1
        ? t("yesterday", "ieri")
        : t(`${p.age} days ago`, `${p.age} giorni fa`);
  const km = p.km >= 0.5 ? `, ${p.km.toFixed(1)} km` : "";
  return `${p.name}${km}, ${Math.round(p.minutes)} min, ${days}`;
};

/** A bed of earthed-up soil: lit along its crown, shaded at its foot, with the marks of the hoe and a few clods. */
function Mound({
  id,
  cx,
  cy,
  len,
  hgt,
  soil,
  d,
  winter,
  seed,
}: {
  id: string;
  cx: number;
  cy: number;
  len: number;
  hgt: number;
  soil: number;
  d: Daylight;
  winter: boolean;
  seed: number;
}) {
  const r = rng(seed);
  const n = 28;
  const prof = (u: number) => Math.pow(Math.max(0, Math.sin(Math.PI * u)), 0.42);
  const noise = Array.from({ length: n + 1 }, () => (r() - 0.5) * 1.1);
  const X = (u: number) => cx - len / 2 + u * len;
  const top = noise.map((v, i) => {
    const u = i / n;
    return `${X(u).toFixed(1)},${(cy - hgt * prof(u) + v * prof(u)).toFixed(1)}`;
  });
  const bottom = noise.map((v, i) => {
    const u = 1 - i / n;
    return `${X(u).toFixed(1)},${(cy + hgt * 0.55 * prof(u) + v * 0.6 * prof(u)).toFixed(1)}`;
  });
  const dark = earth(d, soil, -0.13);
  return (
    <g>
      <ellipse
        cx={cx}
        cy={cy + hgt * 0.62}
        rx={len * 0.52}
        ry={hgt * 0.42}
        fill="black"
        opacity={0.16}
      />
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: earth(d, soil, 0.075) }} />
          <stop offset="0.5" style={{ stopColor: earth(d, soil) }} />
          <stop offset="1" style={{ stopColor: earth(d, soil, -0.1) }} />
        </linearGradient>
      </defs>
      <path d={`M${[...top, ...bottom].join(" L")} Z`} fill={`url(#${id})`} />
      {[-0.45, 0, 0.32].map((f, li) => {
        const segs = Math.max(2, Math.round(len / 34));
        return Array.from({ length: segs }, (_, si) => {
          const u0 = 0.05 + (si / segs) * 0.9 + r() * 0.02;
          const u1 = u0 + (0.9 / segs) * (0.5 + r() * 0.42);
          const skip = r() < 0.14;
          const bend = (r() - 0.5) * 1.6;
          if (skip) return null;
          const yy = (u: number) => cy + f * hgt * prof(u);
          const m = (u0 + u1) / 2;
          return (
            <path
              key={`${li}-${si}`}
              d={`M${X(u0).toFixed(1)},${yy(u0).toFixed(1)} Q${X(m).toFixed(1)},${(yy(m) + bend).toFixed(1)} ${X(u1).toFixed(1)},${yy(u1).toFixed(1)}`}
              stroke={dark}
              strokeWidth={0.8}
              strokeLinecap="round"
              fill="none"
              opacity={0.6}
            />
          );
        });
      })}
      {Array.from({ length: Math.round(len / 7) }, (_, i) => {
        const u = 0.06 + r() * 0.88;
        const y = cy + (r() - 0.55) * 1.5 * hgt * prof(u) * 0.75;
        const big = r();
        const rx = 0.8 + big * 1.4;
        const ry = 0.5 + big * 0.5;
        return (
          <g key={i}>
            <ellipse cx={X(u)} cy={y + 0.45} rx={rx} ry={ry} fill={dark} />
            <ellipse cx={X(u)} cy={y} rx={rx} ry={ry} fill={earth(d, soil, 0.05)} />
          </g>
        );
      })}
      {winter && (
        <path
          d={blob(cx, cy - hgt * 0.55, len * 0.4, hgt * 0.4, seed + 3, 0.25)}
          fill="var(--snow)"
          opacity={0.85}
        />
      )}
    </g>
  );
}

/** The old fence across the garden's back: posts leaning, rails sagging between them. */
function Fence({ w, y, winter, d }: { w: number; y: number; winter: boolean; d: Daylight }) {
  const r = rng(seedOf("garden-fence"));
  const n = Math.round((w + 12) / 24);
  const posts = Array.from({ length: n + 1 }, (_, i) => {
    const x = -6 + ((w + 12) * i) / n;
    return { x, y: y - (4 * i) / n, h: (13 + r() * 3) * 0.9, lean: (r() - 0.5) * 2.2 };
  });
  const c = wood(d);
  const dark = wood(d, -0.09);
  return (
    <g fill="none" strokeLinecap="round">
      {[0.42, 0.78].map((f, ri) => (
        <g key={ri} stroke={ri ? c : dark}>
          {posts.slice(1).map((p, i) => {
            const a = posts[i]!;
            return (
              <path
                key={i}
                strokeWidth={0.95}
                d={`M${a.x + a.lean * f},${a.y - a.h * f} Q${(a.x + p.x) / 2},${(a.y - a.h * f + p.y - p.h * f) / 2 + 1.3} ${p.x + p.lean * f},${p.y - p.h * f}`}
              />
            );
          })}
        </g>
      ))}
      {posts.map((p, i) => (
        <g key={i}>
          <line
            x1={p.x}
            y1={p.y}
            x2={p.x + p.lean}
            y2={p.y - p.h}
            stroke={dark}
            strokeWidth={2.1}
          />
          <line
            x1={p.x - 0.45}
            y1={p.y - 0.5}
            x2={p.x + p.lean - 0.45}
            y2={p.y - p.h}
            stroke={c}
            strokeWidth={0.7}
          />
          {winter && (
            <ellipse
              cx={p.x + p.lean}
              cy={p.y - p.h}
              rx={1.5}
              ry={0.75}
              fill="var(--snow)"
              stroke="none"
            />
          )}
        </g>
      ))}
    </g>
  );
}

/** A little hand-painted sign stuck in the earth, askew. */
function Sign({ text, s, d, tilt }: { text: string; s: number; d: Daylight; tilt: number }) {
  const w = text.length * 4.5 + 8;
  return (
    <g transform={`rotate(${tilt}) scale(${s})`}>
      <line
        x1={0}
        y1={1}
        x2={0}
        y2={-15}
        stroke={wood(d, -0.09)}
        strokeWidth={1.5}
        strokeLinecap="round"
      />
      <rect x={-w / 2} y={-24} width={w} height={10.5} rx={1.6} fill={wood(d, -0.04)} />
      <rect x={-w / 2} y={-24} width={w} height={1.3} rx={0.6} fill={wood(d, 0.07)} />
      <text
        x={0}
        y={-16.4}
        textAnchor="middle"
        fontSize={6.5}
        letterSpacing="0.06em"
        fontWeight={650}
        fill={tone(d, "oklch(0.22 0.02 60)", "oklch(0.88 0.02 80)")}
      >
        {text.toUpperCase()}
      </text>
    </g>
  );
}

/** The watering can, left where it was last used. */
function Can({ x, y, s, d }: { x: number; y: number; s: number; d: Daylight }) {
  const c = tone(d, "oklch(0.66 0.012 230)", "oklch(0.4 0.015 240)");
  const c2 = tone(d, "oklch(0.52 0.012 230)", "oklch(0.3 0.015 240)");
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <ellipse cx={1} cy={0.4} rx={8} ry={1.6} fill="black" opacity={0.2} />
      <path d="M-5,0 L-4.3,-9.5 L4.3,-9.5 L5,0 Z" fill={c} />
      <path d="M1.2,-9.5 L4.3,-9.5 L5,0 L1.6,0 Z" fill={c2} />
      <path
        d="M4.5,-3 L11,-10.5 M11,-10.5 l1.8,1.5"
        stroke={c}
        strokeWidth={1.4}
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M-3,-9.5 Q0,-15 3,-9.5 M-4.6,-8 Q-9,-6.5 -4.8,-2"
        stroke={c2}
        strokeWidth={0.9}
        fill="none"
      />
    </g>
  );
}

/** The spade, stuck in the ground. */
function Spade({ x, y, s, d }: { x: number; y: number; s: number; d: Daylight }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(7) scale(${s})`}>
      <line
        x1={0}
        y1={-3}
        x2={0}
        y2={-28}
        stroke={wood(d, -0.02)}
        strokeWidth={1.5}
        strokeLinecap="round"
      />
      <path d="M-3,-31 H3" stroke={wood(d, -0.02)} strokeWidth={1.4} strokeLinecap="round" />
      <path
        d="M-3,-5 H3 L2.5,1 Q0,3 -2.5,1 Z"
        fill={tone(d, "oklch(0.55 0.01 240)", "oklch(0.34 0.012 245)")}
      />
    </g>
  );
}

/**
 * The whole garden, drawn `w` units wide (360 on a phone). Given `h` it fills that height: the plot takes what it
 * needs, the sky keeps up to about two fifths (a garden with many beds grows past `h` and scrolls). The lowest `foot`
 * units are left to grass, for what floats over the scene's end.
 */
export function GardenScene({
  garden,
  sky,
  tree,
  growth = 1,
  w: W = 360,
  h,
  foot = 0,
  now,
  onPlant,
  onBed,
  onTree,
  onHorizon,
  map,
  onAddSport,
}: {
  garden: Garden;
  /** Which sports the beds are, for what their signs say. */
  map: CropMap;
  sky: GardenSky;
  /** My tree, beyond the fence; its height factor (see lib/forest/age). */
  tree?: SceneTree;
  growth?: number;
  w?: number;
  h?: number;
  foot?: number;
  /** The moment the sky shows (now by default). */
  now?: Date;
  onPlant?: (p: GardenPlant) => void;
  onBed?: (sport: Sport) => void;
  onTree?: () => void;
  /** No sports in the garden yet: where to add one. */
  onAddSport?: (() => void) | undefined;
  /** Where the land begins, in scene units (for the sky behind to set its sun and moon by). */
  onHorizon?: (y: number) => void;
}) {
  const { season } = sky;
  const winter = season === "winter";
  const d = daylight(now ?? new Date());
  const beds = garden.beds.filter((b) => !POND.includes(b.crop) && b.crop !== BORDER);
  const border = garden.beds.find((b) => b.crop === BORDER)?.plants ?? [];
  const water = garden.beds.filter((b) => POND.includes(b.crop)).flatMap((b) => b.plants);
  const empty = garden.count === 0;
  // A wide garden is drawn with bigger plants and roomier beds, not just longer ones.
  const wide = W > 360 ? Math.min(1.6, 0.6 + W / 900) : 1;
  const rowsN = Math.max(empty ? 2 : 1, beds.length);
  const front = border.length || water.length ? 56 * wide : 18;

  // Twice over: what's left of the height after a first go lets a small garden's plants stand a little bigger.
  const layout = (grow: number) => {
    const rows = Array.from({ length: rowsN }, (_, i) => {
      const k = 0.84 + (0.16 * i) / Math.max(1, rowsN - 1);
      const bed = beds[i];
      const n = bed?.plants.length ?? 0;
      const s = plantScale(n) * wide * k * grow;
      return { i, k, bed, n, s, gap: k * wide * 26 + 28 * s };
    });
    const need = rows.reduce((a, b) => a + b.gap, 0) + front + foot * 0.86 + 12;
    const SKY = h ? Math.max(96, Math.min(h * 0.42, h - need - 30)) : 96;
    return { rows, need, SKY, extra: h ? Math.max(0, h - SKY - 30 - need) : 0 };
  };
  const first = layout(1);
  const { rows, need, SKY, extra } = layout(Math.min(1.3, 1 + first.extra / 500));
  const H = Math.max(h ?? 0, SKY + 30 + need);
  const FENCE = SKY + 22;
  useEffect(() => onHorizon?.(SKY), [onHorizon, SKY]);

  // Each bed only as long as what grows in it, set a little off the middle.
  const lay = rng(seedOf("garden-layout"));
  let cursor = FENCE + 8 + extra * 0.3;
  const placed = rows.map((row) => {
    cursor += row.gap + (extra * 0.5) / rowsN;
    const sign = row.bed ? sportSign(map, row.bed.sport) : null;
    const signS = Math.min(1.25, Math.max(1, row.s * 0.9));
    const signW = sign ? (sign.length * 4.5 + 8) * signS : 0;
    const spacing = (row.n <= 4 ? 40 : 30) * row.s;
    const want = row.n
      ? signW * 0.55 + Math.max(0, row.n - 1) * spacing + 44 * row.s
      : 150 * row.k * wide;
    const len = Math.min(W - 26, want);
    const shift = rowsN === 1 ? 0 : (lay() - 0.5) * 0.7;
    const cx = W / 2 + shift * Math.max(0, W - 34 - len);
    return { ...row, y: cursor, sign, signS, signW, len, cx, shift };
  });
  const end = cursor;

  const far = useMemo(() => ridgeAcross("garden-ridge", W, 1.2), [W]);
  const hedgeR = rng(seedOf("garden-hedge"));
  const deco = rng(seedOf("garden-deco"));
  const clear = (x: number, y: number) =>
    placed.some((b) => Math.abs(y - b.y) < 15 && Math.abs(x - b.cx) < b.len / 2 + 8);
  const pond = { x: W - 62 * wide, y: end + 32 * wide };
  const treeX = Math.min(W * 0.16, 90);
  const last = placed[placed.length - 1]!;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="block h-auto w-full"
      role="group"
      aria-label={t("Garden", "Orto")}
    >
      {/* The sky is the page's own (components/sky/SkyPage), behind this scene from the window's top. */}
      <defs>
        <linearGradient id="garden-land" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: land(season, d, 0.45) }} />
          <stop offset="1" style={{ stopColor: land(season, d, 0.95) }} />
        </linearGradient>
      </defs>
      <polygon
        points={`0,${SKY + 10} ${far.map((v, i) => `${((i / (far.length - 1)) * W).toFixed(1)},${(SKY - 26 + (1 - v) * 30).toFixed(1)}`).join(" ")} ${W},${SKY + 10}`}
        fill={tone(d, "oklch(0.63 0.04 235)", "oklch(0.27 0.03 255)")}
      />
      <rect x={0} y={SKY} width={W} height={H - SKY} fill="url(#garden-land)" />
      <Mist d={d} w={W} horizon={SKY + 2} weather={sky.weather} phase={sky.weatherPhase} />

      {/* The hedge: bushes of every size in three layers, darkest behind. */}
      {[0, 1, 2].map((layer) =>
        Array.from({ length: Math.ceil(W / (layer === 1 ? 13 : 17)) + 1 }, (_, i) => {
          const cx = i * (layer === 1 ? 13 : 17) + (hedgeR() - 0.5) * 10;
          const cr = (layer === 1 ? 6.5 : 9) + hedgeR() * 5 - (layer === 2 ? 3.4 : 0);
          const cy = FENCE - (layer === 0 ? 6 : layer === 1 ? 0 : 4) - hedgeR() * 4;
          const fill = land(season, d, layer === 0 ? 2.3 : layer === 1 ? 1.85 : 1.45);
          return (
            <g key={`h${layer}-${i}`}>
              <circle cx={cx} cy={cy} r={Math.max(2, cr)} fill={fill} />
              {season === "spring" && layer === 2 && hedgeR() < 0.28 && (
                <circle cx={cx} cy={cy - 3} r={1.1} fill="var(--blossom)" />
              )}
              {winter && layer === 1 && (
                <path
                  d={`M${cx - cr * 0.7},${cy - cr * 0.55} Q${cx},${cy - cr * 1.15} ${cx + cr * 0.7},${cy - cr * 0.55}`}
                  stroke="var(--snow)"
                  strokeWidth={2}
                  fill="none"
                  strokeLinecap="round"
                />
              )}
            </g>
          );
        }),
      )}
      <rect x={0} y={FENCE + 6} width={W} height={H - FENCE - 6} fill="url(#garden-land)" />
      {/* Your tree beyond the fence: this is still its land. */}
      {tree && (
        <Tap label={t("Tree", "Albero")} onTap={onTree}>
          <MiniTree tr={tree} x={treeX} y={FENCE + 9} size={1.9} seed="home-tree" growth={growth} />
        </Tap>
      )}
      <Grass
        seed="garden-grass"
        count={Math.round((W / 360) * (H - FENCE) * 0.13)}
        W={W}
        y0={FENCE + 12}
        y1={H}
        c1={land(season, d, 1.15)}
        c2={land(season, d, 0.05)}
        avoid={clear}
      />
      <Wildflowers
        W={W}
        y0={FENCE + 14}
        y1={H}
        count={Math.round((W / 360) * 12)}
        season={season}
        d={d}
        avoid={clear}
      />
      <Fence w={W} y={FENCE + 12} winter={winter} d={d} />

      {/* Fallen leaves on the grass in autumn. */}
      {season === "autumn" &&
        Array.from({ length: 10 }, (_, i) => {
          const cx = deco() * W;
          const cy = FENCE + 20 + deco() * (H - FENCE - 24);
          return (
            <ellipse
              key={`fl${i}`}
              cx={cx}
              cy={cy}
              rx={1.8}
              ry={0.9}
              fill="var(--autumn)"
              opacity={0.8}
              transform={`rotate(${deco() * 180} ${cx} ${cy})`}
            />
          );
        })}

      {/* The beds, back to front. */}
      {placed.map((b) => {
        const x0 = b.cx - b.len / 2;
        const x1 = b.cx + b.len / 2;
        const plants = b.bed?.plants ?? [];
        const from = Math.min(x1 - 24 * b.s, x0 + b.signW * 0.62 + 20 * b.s);
        const to = x1 - 18 * b.s;
        const step = plants.length > 1 ? (to - from) / (plants.length - 1) : 0;
        const inRow = plants
          .map((p, i) => ({
            p,
            x: plants.length === 1 ? (from + to) / 2 : from + i * step + (p.seed - 0.5) * 3,
            dy: plants.length > 5 ? (i % 2 ? -3 : 2) * b.s : (p.seed - 0.5) * 2,
          }))
          .sort((a, c) => a.dy - c.dy);
        return (
          <g key={b.i} transform={`rotate(${(b.shift * 3).toFixed(2)} ${b.cx} ${b.y})`}>
            <Mound
              id={`garden-bed${b.i}`}
              cx={b.cx}
              cy={b.y}
              len={b.len}
              hgt={9.5 * b.k * Math.max(1, Math.min(1.25, b.s * 0.85))}
              soil={garden.soil}
              d={d}
              winter={winter}
              seed={seedOf(`garden-bed${b.i}`)}
            />
            {b.bed && b.sign && (
              <Tap label={b.bed.name} onTap={onBed && (() => onBed(b.bed!.sport))}>
                <g transform={`translate(${x0 + b.signW * 0.32} ${b.y - 1})`}>
                  <Sign text={b.sign} s={b.signS} d={d} tilt={(plants[0]!.seed - 0.5) * 7} />
                </g>
              </Tap>
            )}
            {inRow.map(({ p, x, dy }) => {
              const y = b.y - 2 + dy;
              return (
                <Tap key={p.id} label={plantLabel(p)} onTap={onPlant && (() => onPlant(p))}>
                  <ellipse
                    cx={x}
                    cy={y + 0.2}
                    rx={5.5 * b.s}
                    ry={1.2 * b.s}
                    fill="black"
                    opacity={0.2}
                  />
                  <Plant crop={p.crop} l={look(p, season)} x={x} y={y} s={b.s} />
                  {p.critter && (
                    <GardenCritter
                      kind={p.critter}
                      x={x + 9 * b.s}
                      y={y + 2}
                      s={0.8 * Math.max(1, b.s * 0.85)}
                    />
                  )}
                  <rect
                    x={x - 11 * b.s}
                    y={y - 38 * b.s}
                    width={22 * b.s}
                    height={41 * b.s}
                    fill="transparent"
                  />
                </Tap>
              );
            })}
          </g>
        );
      })}

      {/* The tools left where they were last used, and whoever guards the seeds in a small garden. */}
      <Spade
        x={Math.min(W - 26, placed[0]!.cx + placed[0]!.len / 2 + 14)}
        y={placed[0]!.y + 3}
        s={1.3 * wide}
        d={d}
      />
      {!water.length && <Can x={W * 0.74} y={last.y + 24} s={1.35 * wide} d={d} />}
      {rowsN <= 2 && <Scarecrow x={W * 0.87} y={last.y - 2} s={1.45 * wide} />}
      {empty &&
        (onAddSport ? (
          <Tap label={t("Add a sport", "Aggiungi uno sport")} onTap={onAddSport}>
            <text
              x={W / 2}
              y={end + 42}
              textAnchor="middle"
              fontSize={12}
              fontWeight={600}
              fill="var(--birch)"
            >
              {t("Add a sport to plant its bed", "Aggiungi uno sport per piantare la sua aiuola")}
            </text>
            <rect x={W / 2 - 130} y={end + 26} width={260} height={24} fill="transparent" />
          </Tap>
        ) : (
          <text
            x={W / 2}
            y={end + 42}
            textAnchor="middle"
            fontSize={11}
            fill="var(--foreground)"
            opacity={0.85}
          >
            {t(
              "Your first session plants the first seed",
              "La tua prima sessione pianta il primo seme",
            )}
          </text>
        ))}

      {/* The flowers grow at the front, in a loose line. */}
      {border.map((p, i) => {
        const room = (water.length ? W * 0.6 : W * 0.86) / Math.max(1, border.length);
        const x = 24 + (i + 0.5) * Math.min(38 * wide, room);
        const y = end + 32 * wide + (p.seed - 0.5) * 10;
        const s = 1.15 * wide;
        return (
          <Tap key={p.id} label={plantLabel(p)} onTap={onPlant && (() => onPlant(p))}>
            <ellipse cx={x} cy={y + 0.3} rx={6 * s} ry={1.3 * s} fill="black" opacity={0.18} />
            <Plant crop="flowers" l={look(p, season)} x={x} y={y} s={s} />
            <rect x={x - 10 * s} y={y - 28 * s} width={20 * s} height={30 * s} fill="transparent" />
          </Tap>
        );
      })}

      {/* The pond: only once something grows in it. Reeds at its back, lilies on the water. */}
      {water.length > 0 && (
        <g>
          <path
            d={blob(pond.x, pond.y, 46 * wide, 13.5 * wide, 3.3, 0.08)}
            fill={tone(d, "oklch(0.52 0.03 70)", "oklch(0.28 0.02 245)")}
          />
          <path
            d={blob(pond.x, pond.y, 42 * wide, 11 * wide, 3.5, 0.08)}
            fill={
              winter
                ? tone(d, "oklch(0.86 0.025 225)", "oklch(0.5 0.03 240)")
                : tone(d, "oklch(0.64 0.07 220)", "oklch(0.33 0.05 245)")
            }
          />
          {!winter && (
            <ellipse
              cx={
                pond.x + 42 * wide * (d.moon ? d.moon.x - 0.5 : d.sun ? d.sun.x - 0.5 : 0.3) * 0.8
              }
              cy={pond.y - 3 * wide}
              rx={13 * wide}
              ry={1.4 * wide}
              fill={d.sun ? "var(--birch)" : "var(--snow)"}
              opacity={d.moon ? 0.15 + d.moon.lit * 0.25 : d.sun ? 0.3 : 0.1}
            />
          )}
          {water
            .filter((p) => p.crop === "reeds")
            .map((p, i, list) => {
              const x = pond.x - 28 * wide + (i * 56 * wide) / Math.max(1, list.length);
              const y = pond.y - 5 * wide;
              return (
                <Tap key={p.id} label={plantLabel(p)} onTap={onPlant && (() => onPlant(p))}>
                  <Plant crop="reeds" l={look(p, season)} x={x} y={y} s={wide} />
                  <rect
                    x={x - 8}
                    y={y - 30 * wide}
                    width={16}
                    height={32 * wide}
                    fill="transparent"
                  />
                </Tap>
              );
            })}
          {water
            .filter((p) => p.crop === "lily")
            .map((p, i, list) => {
              const x = pond.x - 24 * wide + (i * 48 * wide) / Math.max(1, list.length);
              const y = pond.y + ((i % 2) * 2 + (p.seed - 0.5) * 3) * wide;
              return (
                <Tap key={p.id} label={plantLabel(p)} onTap={onPlant && (() => onPlant(p))}>
                  <Plant crop="lily" l={look(p, season)} x={x} y={y} s={0.85 * wide} />
                  {p.critter && <GardenCritter kind={p.critter} x={x + 2} y={y - 1} s={0.7} />}
                </Tap>
              );
            })}
        </g>
      )}

      {/* Fireflies over a summer garden, once it's dark. */}
      {season === "summer" &&
        d.light < 0.3 &&
        Array.from({ length: 8 }, (_, i) => (
          <circle
            key={`ff${i}`}
            cx={20 + deco() * (W - 40)}
            cy={FENCE + 16 + deco() * (end - FENCE)}
            r={1.1}
            fill="var(--birch)"
            opacity={0.75}
            className="tree-drift"
          />
        ))}
      <WeatherFront
        d={d}
        w={W}
        h={H}
        horizon={SKY + 4}
        from={SKY}
        weather={sky.weather}
        phase={sky.weatherPhase}
        seed="garden"
      />
    </svg>
  );
}
