// Home: everything you grow, at a glance, in one landscape under the sky of the moment (the real time of day, today's
// form as weather over all of it). Far mountains, a hillside of small pines, then the meadow in today's season
// (snow, spring green, summer, autumn gold) where your tree stands, as tall as your years and kilometres make it, its
// shadow thrown away from the sun; your garden lies beside it with the last two weeks growing. Birds cross a fair
// morning. Tap the tree for the Tree (and from there the forests), the garden for the Garden.
import { useMemo, type ReactNode } from "react";
import { MiniTree, type SceneTree } from "@/components/forest/ForestScene";
import { MiniGarden } from "@/components/garden/GardenScene";
import { Mist, WeatherFront } from "@/components/sky/TimeSky";
import { daylight, lit, skyCover, type Daylight } from "@/lib/daylight";
import type { Garden } from "@/lib/garden";
import { t } from "@/lib/i18n";
import { ridgeAcross } from "@/lib/ridge";
import { rng, seedOf, type Season, type Weather } from "@/lib/tree";

const mix = (a: string, pa: number, b: string) =>
  `color-mix(in oklab, ${a} ${Math.round(Math.min(100, Math.max(0, pa)))}%, ${b})`;

/** A part of the scene that opens a page: the whole area is the target, named for screen readers. */
function Place({
  label,
  onOpen,
  hit,
  children,
}: {
  label: string;
  onOpen: () => void;
  hit: { x: number; y: number; w: number; h: number };
  children: ReactNode;
}) {
  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={label}
      className="cursor-pointer outline-none [&:focus-visible]:opacity-80 [&:hover]:opacity-95"
      onClick={onOpen}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onOpen()}
    >
      {children}
      <rect x={hit.x} y={hit.y} width={hit.w} height={hit.h} fill="transparent" />
    </g>
  );
}

/** The meadow's colour in a season, before the light of the moment. */
function meadow(season: Season | null, d: Daylight) {
  const base = mix("var(--secondary)", 80, "var(--background)");
  const tint =
    season === "winter"
      ? mix("var(--snow)", 34 + d.light * 20, base)
      : season === "autumn"
        ? mix(mix("var(--autumn)", 45, "var(--summer)"), 18 + d.light * 14, base)
        : season === "spring"
          ? mix("var(--spring)", 16 + d.light * 16, base)
          : mix("var(--summer)", 18 + d.light * 18, base);
  return lit(tint, d);
}

/** A few birds flying, small V's, gliding across a fair sky. */
function Birds({ x, y, color }: { x: number; y: number; color: string }) {
  return (
    <g
      className="tree-drift"
      style={{ animationDuration: "9s" }}
      stroke={color}
      strokeWidth={1}
      strokeLinecap="round"
      fill="none"
    >
      {[
        [0, 0, 1],
        [11, 5, 0.8],
        [-9, 7, 0.7],
      ].map(([dx, dy, s], i) => (
        <path
          key={i}
          d={`M${x + dx! - 4 * s!},${y + dy!} q${2 * s!},${-2.6 * s!} ${4 * s!},0 q${2 * s!},${-2.6 * s!} ${4 * s!},0`}
        />
      ))}
    </g>
  );
}

export function HomeScene({
  tree,
  growth,
  garden,
  sky,
  w: W = 360,
  h,
  peak = 150,
  now,
  onTree,
  onGarden,
}: {
  tree: SceneTree;
  /** The tree's height factor (see lib/forest/age). */
  growth: number;
  garden: Garden;
  sky: { season: Season | null; weather: Weather | null; weatherPhase: number };
  w?: number;
  /** The scene's height in its own units (to fill the screen); a sensible default otherwise. */
  h?: number;
  /** The highest the sun and moon climb: below today's recap written over the sky. */
  peak?: number;
  /** The moment the sky shows (now by default). */
  now?: Date;
  onTree: () => void;
  onGarden: () => void;
}) {
  const d = daylight(now ?? new Date());
  const c = skyCover(sky.weather, sky.weatherPhase);
  const wide = W > 360;
  const H = Math.round(Math.max(wide ? 440 : 540, h ?? (wide ? W * 0.52 : 600)));
  const horizon = Math.max(peak + 70, H * 0.5);
  const groundY = (x: number) => H * 0.84 - Math.sin((x / W) * Math.PI) * 14;
  const treeX = W * (wide ? 0.36 : 0.31);
  const gardenX = W * (wide ? 0.64 : 0.7);
  const gardenW = Math.min(wide ? 270 : 200, W * 0.54);
  const treeY = groundY(treeX) - 4;
  const gardenY = groundY(gardenX) + 24;
  const treeSize = wide ? 4 : 3.5;
  const top = treeY - 47 * treeSize * growth;

  const far = ridgeAcross("home-far", W, 1.3);
  const near = ridgeAcross("home-near", W, 1.1);
  const ridgeY = (ys: number[], x: number, top: number, depth: number) => {
    const i = Math.min(ys.length - 1, Math.max(0, Math.round((x / W) * (ys.length - 1))));
    return top + (1 - ys[i]!) * depth;
  };
  const ridge = (ys: number[], top: number, depth: number) =>
    `0,${H} ${ys.map((v, i) => `${((i / (ys.length - 1)) * W).toFixed(1)},${(top + (1 - v) * depth).toFixed(1)}`).join(" ")} ${W},${H}`;
  const steps = Math.round((24 * W) / 360);
  const hill = Array.from({ length: steps + 1 }, (_, i) => {
    const x = (i / steps) * W;
    return `L${x.toFixed(1)},${groundY(x).toFixed(1)}`;
  }).join(" ");
  const nearTop = horizon + 6;

  // Small pines along the near hillside, thinning where the tree stands against the sky.
  const pines = useMemo(() => {
    const r = rng(seedOf("home-pines"));
    return Array.from({ length: Math.round((W / 360) * 26) }, () => {
      const x = r() * W;
      const s = 0.55 + r() * 0.6;
      return { x, s, dy: r() * 10 };
    })
      .filter((p) => Math.abs(p.x - treeX) > 40 || p.s < 0.7)
      .sort((a, b) => a.dy - b.dy);
  }, [W, treeX]);
  // Grass tufts and, in spring and summer, a few wildflowers over the meadow, clear of the garden.
  const tufts = useMemo(() => {
    const r = rng(seedOf("home-tufts"));
    const g = (x: number) => H * 0.84 - Math.sin((x / W) * Math.PI) * 14;
    return Array.from({ length: Math.round((W / 360) * 70) }, () => {
      const x = r() * W;
      // Nearer the bottom edge is nearer to you: bigger tufts and flowers.
      const depth = r() ** 0.8;
      const y = g(x) + 6 + depth * (H - g(x) - 6);
      return { x, y, s: (0.6 + depth * 1.6) * (0.8 + r() * 0.4), flower: r() < 0.16, hue: r() };
    }).filter(
      (p) =>
        ((p.x - gardenX) / (gardenW * 0.6)) ** 2 +
          ((p.y - (gardenY - gardenW * 0.2)) / (gardenW * 0.3)) ** 2 >
        1,
    );
  }, [W, H, gardenX, gardenW, gardenY]);

  const ground = meadow(sky.season, d);
  const grass = lit(
    sky.season === "winter"
      ? mix("var(--snow)", 55, "var(--background)")
      : mix("var(--summer)", 50 + d.light * 15, "var(--background)"),
    d,
  );
  const pine = lit(mix("var(--pine)", 26, "var(--background)"), d);
  // The tree's shadow, thrown away from the sun: long at sunrise and sunset, short at noon, gone under thick cloud.
  const shade = d.sun
    ? {
        dir: d.sun.x < 0.5 ? 1 : -1,
        len: (16 + (1 - d.sun.alt) * 110) * (treeSize / 2.6),
        o: 0.3 * d.light * (1 - c.clouds * 0.75),
      }
    : d.moon
      ? { dir: d.moon.x < 0.5 ? 1 : -1, len: 40, o: 0.1 * d.moon.lit * (1 - c.clouds) }
      : null;
  const fair = (sky.weather === "sun" || sky.weather === "partly") && d.light > 0.25;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="block h-auto w-full"
      role="group"
      aria-label={t("Home", "Casa")}
    >
      {/* The sky is the page's own (components/sky/SkyPage), behind this scene from the window's top. */}
      {fair && d.part !== "dusk" && (
        <Birds
          x={W * 0.74}
          y={peak + 40}
          color={lit(mix("var(--background)", 70, "var(--bark)"), d)}
        />
      )}
      <polygon
        points={ridge(far, horizon - 48, 48)}
        fill={lit(mix("var(--border)", 80, "var(--primary)"), d)}
        opacity={0.5 + d.light * 0.2}
      />
      {sky.season === "winter" && (
        <polygon
          points={ridge(far, horizon - 48, 18)}
          fill="var(--snow)"
          opacity={0.25 + d.light * 0.25}
        />
      )}
      <polygon
        points={ridge(near, nearTop, 34)}
        style={{
          fill: lit(mix("var(--pine)", 16, mix("var(--secondary)", 45, "var(--background)")), d),
        }}
      />
      <g style={{ fill: pine }}>
        {pines.map((p, i) => {
          const base = ridgeY(near, p.x, nearTop, 34) + p.dy;
          return (
            <g key={i}>
              <polygon
                points={`${p.x - 6 * p.s},${base} ${p.x},${base - 17 * p.s} ${p.x + 6 * p.s},${base}`}
              />
              <polygon
                points={`${p.x - 4.5 * p.s},${base - 8 * p.s} ${p.x},${base - 24 * p.s} ${p.x + 4.5 * p.s},${base - 8 * p.s}`}
              />
              {sky.season === "winter" && (
                <polygon
                  points={`${p.x - 2.4 * p.s},${base - 16 * p.s} ${p.x},${base - 24 * p.s} ${p.x + 2.4 * p.s},${base - 16 * p.s}`}
                  fill="var(--snow)"
                  opacity={0.8}
                />
              )}
            </g>
          );
        })}
      </g>
      <Mist d={d} w={W} horizon={nearTop + 14} weather={sky.weather} phase={sky.weatherPhase} />
      <path d={`M0,${H} L0,${groundY(0)} ${hill} L${W},${H} Z`} style={{ fill: ground }} />
      <g stroke={grass} strokeWidth={0.8} strokeLinecap="round" fill="none">
        {tufts.map((p, i) => (
          <path
            key={i}
            d={`M${p.x},${p.y} l${-1.6 * p.s},${-3.4 * p.s} M${p.x},${p.y} l${0.2 * p.s},${-4.2 * p.s} M${p.x},${p.y} l${1.8 * p.s},${-3 * p.s}`}
          />
        ))}
      </g>
      {(sky.season === "spring" || sky.season === "summer") &&
        tufts
          .filter((p) => p.flower)
          .map((p, i) => (
            <circle
              key={`wf${i}`}
              cx={p.x}
              cy={p.y - 4 * p.s}
              r={0.8 + p.s * 0.5}
              fill={p.hue < 0.4 ? "var(--blossom)" : p.hue < 0.7 ? "var(--birch)" : "var(--snow)"}
              opacity={0.85}
            />
          ))}

      {shade && shade.o > 0.01 && (
        <ellipse
          cx={treeX + (shade.dir * shade.len) / 2}
          cy={treeY + 2}
          rx={shade.len / 2 + 10}
          ry={6}
          fill="black"
          opacity={shade.o}
        />
      )}
      <Place
        label={t("Tree", "Albero")}
        onOpen={onTree}
        hit={{ x: treeX - 75, y: top - 10, w: 150, h: treeY - top + 24 }}
      >
        <MiniTree tr={tree} x={treeX} y={treeY} size={treeSize} seed="home-tree" growth={growth} />
      </Place>

      <Place
        label={t("Garden", "Orto")}
        onOpen={onGarden}
        hit={{
          x: gardenX - gardenW / 2 - 6,
          y: gardenY - gardenW * 0.42 - 30,
          w: gardenW + 12,
          h: gardenW * 0.42 + 44,
        }}
      >
        <MiniGarden garden={garden} season={sky.season} x={gardenX} y={gardenY} w={gardenW} d={d} />
      </Place>

      <WeatherFront
        d={d}
        w={W}
        h={H}
        horizon={horizon}
        from={horizon - 40}
        weather={sky.weather}
        phase={sky.weatherPhase}
        seed="home"
      />
    </svg>
  );
}
