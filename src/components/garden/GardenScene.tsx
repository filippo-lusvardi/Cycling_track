// The garden under the sky of the moment (the real time of day, today's form as weather). Nothing here is ruled
// straight: the beds are soft mounds of earth of different lengths, plants stand where they were planted (older to
// the left, today's to the right) but scattered in depth, flowers grow in loose clumps by an irregular pond, the
// fence is old and leans, grass grows where it likes. The soil darkens with regular training off the bike; today's readiness season lies over everything (snow,
// blossom, fallen leaves, fireflies in summer).
import { useEffect, type ReactNode } from "react";
import { Mist, WeatherFront } from "@/components/sky/TimeSky";
import { GardenCritter, Plant, Scarecrow, type Look } from "@/components/garden/Crops";
import {
  bedName,
  CROP_NAME,
  GROWING_DAYS,
  type Crop,
  type Garden,
  type Plant as GardenPlant,
  type Sport,
} from "@/lib/garden";
import { daylight, hazed, lit, type Daylight } from "@/lib/daylight";
import { t } from "@/lib/i18n";
import { ridgeAcross } from "@/lib/ridge";
import { rng, seedOf, type Season, type Weather } from "@/lib/tree";

const mix = (a: string, pa: number, b: string) =>
  `color-mix(in oklab, ${a} ${Math.round(Math.min(100, Math.max(0, pa)))}%, ${b})`;

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

/** Where a plant stands along a stretch: oldest at the left, today at the right, loosely (it's a garden). */
const along = (p: GardenPlant, x0: number, x1: number) =>
  x0 + ((GROWING_DAYS - 1 - p.age) / (GROWING_DAYS - 1)) * (x1 - x0) + (p.seed - 0.5) * 10;

/** Soil from resting (pale, dry) to well watered (dark, moist). */
const soilColor = (soil: number) =>
  mix(
    mix("var(--bark)", 62, mix("var(--autumn)", 12, "var(--scene-background)")),
    35 + soil * 65,
    mix("var(--bark)", 75, "var(--birch)"),
  );

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
  let d = `M${p(0)[0].toFixed(1)},${p(0)[1].toFixed(1)}`;
  for (let i = 0; i < n; i++) {
    const [p0, p1, p2, p3] = [p(i - 1), p(i), p(i + 1), p(i + 2)];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0]!.toFixed(1)},${c1[1]!.toFixed(1)} ${c2[0]!.toFixed(1)},${c2[1]!.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return `${d} Z`;
}

/** Tufts of grass scattered over a stretch of ground. */
function Grass({
  seed,
  count,
  x0,
  x1,
  y0,
  y1,
  color,
  near = 0,
  avoid = () => false,
}: {
  seed: string;
  count: number;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  color: string;
  /** How much bigger the tufts grow toward the front (y1), nearer to you. */
  near?: number;
  avoid?: (x: number, y: number) => boolean;
}) {
  const r = rng(seedOf(seed));
  const tufts = Array.from(
    { length: count },
    () => [x0 + r() * (x1 - x0), y0 + r() * (y1 - y0), 0.7 + r() * 0.6] as const,
  ).filter(([x, y]) => !avoid(x, y));
  return (
    <g stroke={color} strokeWidth={0.8} strokeLinecap="round" fill="none">
      {tufts.map(([x, y, s0], i) => {
        const s = s0 * (1 + (near * (y - y0)) / Math.max(1, y1 - y0));
        return (
          <path
            key={i}
            d={`M${x},${y} l${-1.6 * s},${-3.2 * s} M${x},${y} l${0.2 * s},${-4 * s} M${x},${y} l${1.8 * s},${-2.8 * s}`}
          />
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

/** An old fence along y: posts of uneven height leaning a little, rails sagging between them, a gap here and there. */
function Fence({
  seed,
  w,
  y,
  winter,
  d,
}: {
  seed: string;
  w: number;
  y: number;
  winter: boolean;
  d: Daylight;
}) {
  const r = rng(seedOf(`${seed}fence`));
  const posts: { x: number; h: number; lean: number }[] = [];
  for (let x = 4 + r() * 6; x < w + 10; x += 19 + r() * 9)
    if (r() > 0.08) posts.push({ x, h: 14 + r() * 6, lean: (r() - 0.5) * 6 });
  const wood = lit(mix("var(--bark)", 72, "var(--birch)"), d);
  return (
    <g stroke={wood} strokeLinecap="round" fill="none">
      {[4, 10].map((dy) => (
        <path
          key={dy}
          strokeWidth={1.2}
          d={posts
            .map((p, i) => {
              const py = y + dy - p.h + 14 + (r() - 0.5) * 1.5;
              if (!i) return `M${p.x},${py}`;
              const prev = posts[i - 1]!;
              return `Q${(prev.x + p.x) / 2},${py + 2.2} ${p.x},${py}`;
            })
            .join(" ")}
        />
      ))}
      {posts.map((p, i) => (
        <g key={i}>
          <line x1={p.x} y1={y + 16} x2={p.x + p.lean * 0.3} y2={y + 16 - p.h} strokeWidth={2.2} />
          {winter && (
            <ellipse
              cx={p.x + p.lean * 0.3}
              cy={y + 15.5 - p.h}
              rx={2.2}
              ry={1}
              fill="var(--snow)"
              stroke="none"
            />
          )}
        </g>
      ))}
    </g>
  );
}

/**
 * The whole garden, drawn `w` units wide (360 on a phone). Given `h` it fills that height: the land runs to the foot
 * and the beds spread over it, the sky keeping what they don't need (a garden with many beds grows past `h` and
 * scrolls). The lowest `foot` units are left to grass, for what floats over the scene's end.
 */
export function GardenScene({
  garden,
  sky,
  w: W = 360,
  h,
  foot = 0,
  seed = "garden",
  now,
  onPlant,
  onBed,
  onHorizon,
}: {
  garden: Garden;
  sky: GardenSky;
  w?: number;
  h?: number;
  foot?: number;
  seed?: string;
  /** The moment the sky shows (now by default). */
  now?: Date;
  onPlant?: (p: GardenPlant) => void;
  onBed?: (sport: Sport) => void;
  /** Where the land begins, in scene units (for the sky behind to set its sun and moon by). */
  onHorizon?: (y: number) => void;
}) {
  const { season } = sky;
  const d = daylight(now ?? new Date());
  const beds = garden.beds.filter((b) => !POND.includes(b.crop) && b.crop !== BORDER);
  const border = garden.beds.find((b) => b.crop === BORDER)?.plants ?? [];
  const pond = garden.beds.filter((b) => POND.includes(b.crop)).flatMap((b) => b.plants);
  const empty = garden.count === 0;
  // An empty garden still shows three freshly turned beds, waiting.
  const rows = empty ? 3 : Math.max(1, beds.length);
  const r = rng(seedOf(`${seed}layout`));
  // A wide garden is drawn with bigger plants and roomier beds, not just longer ones.
  const wide = W > 360 ? Math.min(1.6, 0.6 + W / 900) : 1;

  // Each bed its own length and lean, alternating its offset, deeper ones a little smaller.
  const layout = Array.from({ length: rows }, (_, i) => {
    const k = 0.82 + (0.18 * i) / Math.max(1, rows - 1);
    const len = (W - 40) * (0.68 + r() * 0.26) * (0.9 + 0.1 * k);
    const shift = (i % 2 ? 1 : -1) * (W - 40 - len) * (0.3 + r() * 0.5);
    return { k, len, cx: W / 2 + shift / 2, tilt: (r() - 0.5) * 5, seed: r() };
  });
  // How much land the beds need at their closest, and so what's left of the height given: the sky takes its share
  // (a band at least, up to about a third), the beds spread over the rest and, with room to spare, grow.
  const depth = layout.reduce((s, b) => s + 48 * b.k * wide, 0);
  const need = 24 + 34 + depth + (44 + 38) * wide + foot;
  const SKY = h ? Math.max(96, Math.min(h * 0.32, h - need)) : 96;
  const extra = h ? Math.max(0, h - SKY - need) : 0;
  const big = wide * Math.min(1.4, 1 + extra / depth);
  const FENCE = SKY + 24;
  const bedY: number[] = [];
  let y = FENCE + 34;
  layout.forEach((b, i) => {
    y += 48 * b.k * wide;
    bedY.push(y + (extra * (i + 0.5)) / rows);
  });
  // The front strip: flowers and the pond.
  const FRONT = y + extra + 44 * wide;
  const H = FRONT + 38 * wide + foot;
  useEffect(() => onHorizon?.(SKY), [onHorizon, SKY]);

  const winter = season === "winter";
  const ground = lit(
    winter
      ? mix("var(--snow)", 22, "var(--scene-background)")
      : season === "autumn"
        ? mix(mix("var(--summer)", 60, "var(--autumn)"), 16, "var(--scene-background)")
        : mix("var(--summer)", 18 + d.light * 16, "var(--scene-background)"),
    d,
  );
  const grass = lit(
    winter
      ? mix("var(--snow)", 45, "var(--scene-background)")
      : mix("var(--summer)", 45 + d.light * 15, "var(--scene-background)"),
    d,
  );
  const soil = lit(soilColor(garden.soil), d);
  const ridge = ridgeAcross(`${seed}ridge`, W, 1.2);
  const pondRx = Math.min(58 * wide, W * 0.16);
  const pondX = W - pondRx - 14;
  const pondY = FRONT + 6;
  const hedgeR = rng(seedOf(`${seed}hedge`));
  const deco = rng(seedOf(`${seed}deco`));

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="block h-auto w-full"
      role="group"
      aria-label={t("Garden", "Orto")}
    >
      {/* The sky is the page's own (components/sky/SkyPage), behind this scene from the window's top. */}
      <polygon
        points={`0,${SKY + 10} ${ridge.map((v, i) => `${((i / (ridge.length - 1)) * W).toFixed(1)},${(SKY - 22 + (1 - v) * 26).toFixed(1)}`).join(" ")} ${W},${SKY + 10}`}
        fill={hazed(lit("var(--scene-border)", d), d, 0.45 + d.light * 0.2)}
      />
      <rect x={0} y={SKY} width={W} height={H - SKY} fill={ground} />
      <Mist d={d} w={W} horizon={SKY + 2} weather={sky.weather} phase={sky.weatherPhase} />

      {/* The hedge: bushes of every size in two layers, then the old fence in front. */}
      {[0, 1].map((layer) =>
        Array.from({ length: Math.ceil(W / (layer ? 13 : 18)) + 1 }, (_, i) => {
          const cx = i * (layer ? 13 : 18) + (hedgeR() - 0.5) * 10;
          const cr = (layer ? 7 : 10) + hedgeR() * 6;
          const cy = FENCE - (layer ? 2 : 9) - hedgeR() * 4;
          const fill = lit(mix("var(--pine)", layer ? 52 : 38, "var(--scene-background)"), d);
          return (
            <g key={`h${layer}-${i}`}>
              <circle cx={cx} cy={cy} r={cr} fill={fill} />
              {season === "spring" && hedgeR() < 0.35 && (
                <circle
                  cx={cx + (hedgeR() - 0.5) * cr}
                  cy={cy - cr * 0.5}
                  r={1.2}
                  fill="var(--blossom)"
                />
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
      <rect x={0} y={FENCE + 8} width={W} height={H - FENCE - 8} fill={ground} />
      <Fence seed={seed} w={W} y={FENCE - 6} winter={winter} d={d} />
      <Grass
        seed={`${seed}grass`}
        count={Math.round((W * (H - FENCE)) / 1500)}
        x0={0}
        x1={W}
        y0={FENCE + 14}
        y1={H}
        color={grass}
        near={0.9}
        avoid={(gx, gy) =>
          layout.some((b, i) => Math.abs(gy - bedY[i]!) < 9 && Math.abs(gx - b.cx) < b.len / 2) ||
          (Math.abs(gx - pondX) < pondRx + 4 && Math.abs(gy - pondY) < 18)
        }
      />

      {/* The beds: soft mounds of turned earth, back to front, each with its plants scattered in depth. */}
      {layout.map((b, i) => {
        const by = bedY[i]!;
        const bed = beds[i];
        const x0 = b.cx - b.len / 2;
        const x1 = b.cx + b.len / 2;
        const sign = bed ? CROP_NAME[bed.crop]() : null;
        const pr = rng(seedOf(`${seed}bed${i}`));
        const signScale = b.k * Math.max(1.25, big);
        // The plants start past the sign, whatever its length.
        const signEnd = sign ? (sign.length * 4.6 + 8) * signScale : 0;
        const plants = (bed?.plants ?? [])
          .map((p) => ({
            p,
            x: along(p, Math.max(x0 + 34 * b.k * big, x0 + signEnd + 12), x1 - 12),
            dy: (pr() - 0.5) * 7 * b.k * big,
            s: b.k * big * (0.9 + pr() * 0.2),
          }))
          .sort((a, c) => a.dy - c.dy);
        return (
          <g key={`bed${i}`} transform={`rotate(${b.tilt} ${b.cx} ${by})`}>
            <path
              d={blob(b.cx, by + 1, b.len / 2, 8 * b.k * big, b.seed, 0.1)}
              fill={mix(soil, 70, "black")}
              opacity={0.5}
            />
            <path
              d={blob(b.cx, by, b.len / 2 - 2, 6.5 * b.k * big, b.seed + 0.1, 0.12)}
              fill={soil}
            />
            {/* A few clods and stones, not furrows. */}
            {Array.from({ length: Math.round(b.len / 26) }, (_, j) => (
              <ellipse
                key={j}
                cx={x0 + 8 + pr() * (b.len - 16)}
                cy={by + (pr() - 0.5) * 6 * b.k}
                rx={1.4 + pr()}
                ry={0.8}
                fill={mix(soil, 60, "black")}
                opacity={0.6}
              />
            ))}
            {winter && (
              <path
                d={blob(b.cx, by - 3 * b.k, b.len / 2 - 6, 2.6 * b.k, b.seed + 0.2, 0.25)}
                fill="var(--snow)"
                opacity={0.85}
              />
            )}
            {bed && sign && (
              <Tap label={bedName(bed.name, bed.crop)} onTap={onBed && (() => onBed(bed.sport))}>
                {/* A little hand-painted sign stuck in the earth at the bed's end, askew. */}
                <g
                  transform={`translate(${x0 + 6} ${by - 2}) rotate(${(pr() - 0.5) * 12}) scale(${signScale})`}
                >
                  <line
                    x1={0}
                    y1={0}
                    x2={0}
                    y2={-15}
                    stroke={mix("var(--bark)", 80, "var(--birch)")}
                    strokeWidth={1.4}
                    strokeLinecap="round"
                  />
                  <rect
                    x={-3}
                    y={-24}
                    width={sign.length * 4.6 + 8}
                    height={10}
                    rx={2.5}
                    fill={mix("var(--bark)", 70, "var(--birch)")}
                  />
                  <text
                    x={1}
                    y={-16.6}
                    fontSize={6.6}
                    letterSpacing="0.06em"
                    fill="var(--scene-background)"
                    fontWeight={600}
                  >
                    {sign.toUpperCase()}
                  </text>
                </g>
              </Tap>
            )}
            {plants.map(({ p, x, dy, s }) => (
              <Tap key={p.id} label={plantLabel(p)} onTap={onPlant && (() => onPlant(p))}>
                <Plant crop={p.crop} l={look(p, season)} x={x} y={by + dy} s={s} />
                {p.critter && (
                  <GardenCritter kind={p.critter} x={x + 9 * s} y={by + dy + 2} s={0.8 * s} />
                )}
                <rect
                  x={x - 9 * s}
                  y={by + dy - 40 * s}
                  width={18 * s}
                  height={42 * s}
                  fill="transparent"
                />
              </Tap>
            ))}
          </g>
        );
      })}

      {empty && (
        <>
          <Scarecrow x={W * 0.56} y={bedY[1]! + 1} s={1.2} />
          <text
            x={W * 0.36}
            y={FRONT + 14}
            textAnchor="middle"
            fontSize={11}
            fill="var(--muted-foreground)"
          >
            {t("Your first run plants a tomato", "La tua prima corsa pianta un pomodoro")}
          </text>
        </>
      )}
      {/* Fallen leaves on the grass in autumn. */}
      {season === "autumn" &&
        Array.from({ length: 10 }, (_, i) => (
          <ellipse
            key={`fl${i}`}
            cx={deco() * W}
            cy={FENCE + 20 + deco() * (H - FENCE - 24)}
            rx={1.8}
            ry={0.9}
            fill="var(--autumn)"
            opacity={0.8}
            transform={`rotate(${deco() * 180})`}
          />
        ))}

      {/* The flowers grow wild at the front, in loose clumps. */}
      {border.map((p) => {
        const x = along(p, 18, pondX - pondRx - 20);
        const fy = FRONT - 8 * wide + (p.seed - 0.5) * 16 * wide;
        return (
          <Tap key={p.id} label={plantLabel(p)} onTap={onPlant && (() => onPlant(p))}>
            <Plant
              crop="flowers"
              l={look(p, season)}
              x={x}
              y={fy}
              s={(0.95 + p.seed * 0.2) * wide}
            />
            <rect x={x - 9} y={fy - 26} width={18} height={28} fill="transparent" />
          </Tap>
        );
      })}

      {/* The pond: an irregular pool with stones round it, reeds at its back, lilies on the water. */}
      <path
        d={blob(pondX, pondY, pondRx + 4, 18, seedOf(`${seed}pondrim`), 0.1)}
        fill={lit(mix("var(--bark)", 45, "var(--scene-background)"), d)}
      />
      <path
        d={blob(pondX, pondY, pondRx, 15, seedOf(`${seed}pond`), 0.1)}
        fill={
          winter
            ? mix("var(--snow)", 45, "var(--primary)")
            : lit(mix("var(--primary)", 28 + d.light * 20, "var(--scene-background)"), d)
        }
      />
      {Array.from({ length: 9 }, (_, i) => {
        const a = Math.PI * (0.05 + (i / 8) * 0.9);
        return (
          <ellipse
            key={`st${i}`}
            cx={pondX + Math.cos(a) * (pondRx + 3)}
            cy={pondY + Math.sin(a) * 17}
            rx={2.6 + deco() * 1.6}
            ry={1.6}
            fill={lit(mix("var(--muted-foreground)", 45, "var(--scene-background)"), d)}
          />
        );
      })}
      {/* The moon (or the sun) glinting on the water. */}
      {!winter && (
        <ellipse
          cx={pondX + pondRx * (d.moon ? d.moon.x - 0.5 : d.sun ? d.sun.x - 0.5 : 0.3) * 0.8}
          cy={pondY - 4}
          rx={pondRx * 0.22}
          ry={1.6}
          fill={d.sun ? "var(--birch)" : "var(--snow)"}
          opacity={d.moon ? 0.15 + d.moon.lit * 0.25 : d.sun ? 0.3 : 0.1}
        />
      )}
      {pond
        .filter((p) => p.crop === "reeds")
        .map((p) => {
          const x = along(p, pondX - pondRx * 0.8, pondX + pondRx * 0.6);
          return (
            <Tap key={p.id} label={plantLabel(p)} onTap={onPlant && (() => onPlant(p))}>
              <Plant
                crop="reeds"
                l={look(p, season)}
                x={x}
                y={pondY - 10 + p.seed * 3}
                s={0.9 * wide}
              />
            </Tap>
          );
        })}
      {pond
        .filter((p) => p.crop === "lily")
        .map((p) => {
          const x = along(p, pondX - pondRx * 0.65, pondX + pondRx * 0.65);
          const ly = pondY + (p.seed - 0.5) * 12;
          return (
            <Tap key={p.id} label={plantLabel(p)} onTap={onPlant && (() => onPlant(p))}>
              <Plant crop="lily" l={look(p, season)} x={x} y={ly} s={0.9 * wide} />
              {p.critter && <GardenCritter kind={p.critter} x={x + 2} y={ly - 1} s={0.7} />}
            </Tap>
          );
        })}

      {/* Fireflies over a summer garden, once it's dark. */}
      {season === "summer" &&
        d.light < 0.3 &&
        Array.from({ length: 8 }, (_, i) => (
          <circle
            key={`ff${i}`}
            cx={20 + deco() * (W - 40)}
            cy={FENCE + 16 + deco() * (FRONT - FENCE - 24)}
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
        seed={seed}
      />
    </svg>
  );
}

/**
 * The garden in miniature, for Home: a patch of dark earth in the grass with the last two weeks growing in it,
 * flowers spilling over its front edge, a small pool at its side when there were swims, a bit of old fence behind.
 * Drawn `w` wide, its front edge's middle at (x, y).
 */
export function MiniGarden({
  garden,
  season,
  x,
  y,
  w,
  d,
}: {
  garden: Garden;
  season: Season | null;
  x: number;
  y: number;
  w: number;
  /** The time of day lighting it (see lib/daylight). */
  d: Daylight;
}) {
  const recent = garden.beds.flatMap((b) => b.plants.filter((p) => p.age < 14));
  const water = recent.filter((p) => POND.includes(p.crop));
  const flowers = recent.filter((p) => p.crop === BORDER);
  const crops = recent.filter((p) => !POND.includes(p.crop) && p.crop !== BORDER).slice(-9);
  const soil = lit(soilColor(garden.soil), d);
  const winter = season === "winter";
  const ry = w * 0.2;
  const cy = y - ry;
  const r = rng(seedOf("mini-garden"));
  // Plants scattered over the patch in loose depth, back ones first so the front ones overlap them.
  const placed = crops
    .map((p, i) => {
      const f = crops.length === 1 ? 0.5 : i / (crops.length - 1);
      const depth = r();
      return {
        p,
        x: x - w * 0.36 + f * w * 0.66 + (r() - 0.5) * 10,
        y: cy - ry * 0.55 + depth * ry * 1.05,
        s: 0.62 + depth * 0.22,
      };
    })
    .sort((a, b) => a.y - b.y);
  const pool = { x: x + w * 0.46, y: y - 6 };
  const wood = lit(mix("var(--bark)", 72, "var(--birch)"), d);
  return (
    <g aria-hidden>
      {/* A stretch of old fence behind the patch. */}
      <g stroke={wood} strokeLinecap="round" fill="none">
        <path
          d={`M${x - w * 0.42},${cy - ry * 0.95} Q${x},${cy - ry * 1.25} ${x + w * 0.4},${cy - ry * 1.0}`}
          strokeWidth={1.1}
        />
        {[-0.4, -0.2, 0.02, 0.22, 0.4].map((f, i) => (
          <line
            key={i}
            x1={x + f * w}
            y1={cy - ry * 0.75}
            x2={x + f * w + (i % 2 ? 0.8 : -0.6)}
            y2={cy - ry * 1.35 - (i % 3)}
            strokeWidth={1.8}
          />
        ))}
      </g>
      <path
        d={blob(x, cy + 2, w * 0.5, ry * 1.05, seedOf("mini-shadow"), 0.08)}
        fill={mix(soil, 60, "black")}
        opacity={0.5}
      />
      <path
        d={blob(x, cy, w * 0.48, ry, seedOf("mini-soil"), 0.1)}
        fill={mix(soil, 82, "var(--scene-background)")}
      />
      {/* Lighter where the moon catches the back of the mound. */}
      <path
        d={blob(x - w * 0.05, cy - ry * 0.35, w * 0.34, ry * 0.45, seedOf("mini-light"), 0.15)}
        fill={soil}
        opacity={0.55}
      />
      {Array.from({ length: 10 }, (_, i) => (
        <ellipse
          key={i}
          cx={x + (r() - 0.5) * w * 0.8}
          cy={cy + (r() - 0.5) * ry * 1.4}
          rx={1.2 + r()}
          ry={0.7}
          fill={mix(soil, 60, "black")}
          opacity={0.6}
        />
      ))}
      {/* Grass growing up to the patch's edge. */}
      <Grass
        seed="mini-grass"
        count={34}
        x0={x - w * 0.62}
        x1={x + w * 0.62}
        y0={cy - ry * 1.2}
        y1={y + 8}
        color={
          winter
            ? mix("var(--snow)", 45, "var(--scene-background)")
            : mix("var(--summer)", 50, "var(--scene-background)")
        }
        avoid={(gx, gy) => ((gx - x) / (w * 0.5)) ** 2 + ((gy - cy) / (ry * 1.1)) ** 2 < 1}
      />
      {winter && (
        <path
          d={blob(x - 4, cy - ry * 0.35, w * 0.36, ry * 0.4, seedOf("mini-snow"), 0.25)}
          fill="var(--snow)"
          opacity={0.8}
        />
      )}
      {placed.map(({ p, x: px, y: py, s }) => (
        <Plant key={p.id} crop={p.crop} l={look(p, season)} x={px} y={py} s={s} />
      ))}
      {flowers.slice(-5).map((p, i) => (
        <Plant
          key={p.id}
          crop="flowers"
          l={look(p, season)}
          x={x - w * 0.34 + i * 14 + (r() - 0.5) * 6}
          y={y + 2}
          s={0.8}
        />
      ))}
      {water.length > 0 && (
        <g>
          <path
            d={blob(pool.x, pool.y, 17, 6, seedOf("mini-pool"), 0.12)}
            fill={
              winter
                ? mix("var(--snow)", 45, "var(--primary)")
                : mix("var(--primary)", 30, "var(--scene-background)")
            }
          />
          {water.slice(-3).map((p, j) => (
            <Plant
              key={p.id}
              crop={p.crop}
              l={look(p, season)}
              x={pool.x - 8 + j * 8}
              y={p.crop === "reeds" ? pool.y - 4 : pool.y}
              s={0.55}
            />
          ))}
        </g>
      )}
      {crops.length === 0 && flowers.length === 0 && water.length === 0 && (
        <Scarecrow x={x} y={cy + ry * 0.3} s={0.9} />
      )}
    </g>
  );
}
