// The sky of the Garden and the forests: the real time of day (night, dawn, day, dusk) with the sun crossing it or the moon
// in its phase, and today's form as weather over the whole of it, as on the tree but everywhere: a few fair clouds
// when fresh, a sky filling up and darkening as form drops, rain and then snow at the deep end. Clouds take the light
// of the moment (white by day, slate at night, lit pink and gold from below at sunrise and sunset). `TimeSky` is the
// back of the scene, `Mist` lies over the far hills, `WeatherFront` (rain, snow) is drawn over everything, last. The
// tree page keeps its own sky.
import { useId, useMemo } from "react";
import { Sun } from "@/components/tree/Crown";
import { skyColors, skyCover as cover, WARM, type Daylight } from "@/lib/daylight";
import { rng, seedOf, type Weather } from "@/lib/tree";

const mix = (a: string, pa: number, b: string) =>
  `color-mix(in oklab, ${a} ${Math.round(Math.min(100, Math.max(0, pa)))}%, ${b})`;

/** The moon, `lit` 0 (new) → 1 (full), lit on the right while waxing. */
function Moon({
  x,
  y,
  r,
  lit,
  waxing,
}: {
  x: number;
  y: number;
  r: number;
  lit: number;
  waxing: boolean;
}) {
  // The terminator is a half-ellipse whose width follows how much is lit.
  const k = Math.abs(1 - 2 * lit) * r;
  const side = waxing ? 1 : 0;
  const bulge = lit > 0.5 ? 1 - side : side;
  const shape = `M${x},${y - r} A${r},${r} 0 0,${side} ${x},${y + r} A${k},${r} 0 0,${bulge} ${x},${y - r} Z`;
  const pale = mix("var(--snow)", 85, "var(--birch)");
  return (
    <g>
      {[2.6, 1.8].map((s, i) => (
        <circle
          key={i}
          cx={x}
          cy={y}
          r={r * s}
          fill={pale}
          opacity={(0.04 + i * 0.04) * (0.3 + lit)}
        />
      ))}
      {/* The dark part still shows faintly against the sky (earthshine). */}
      <circle cx={x} cy={y} r={r} fill={mix(pale, 12, "var(--scene-background)")} />
      {lit > 0.02 && <path d={shape} fill={pale} />}
      {lit > 0.4 && (
        <g fill={mix(pale, 80, "var(--muted-foreground)")} opacity={0.5}>
          <circle cx={x - r * 0.3} cy={y - r * 0.25} r={r * 0.16} />
          <circle cx={x + r * 0.25} cy={y + r * 0.3} r={r * 0.12} />
          <circle cx={x + r * 0.1} cy={y - r * 0.45} r={r * 0.08} />
        </g>
      )}
    </g>
  );
}

/**
 * One cloud: puffs on a domed top over a calm flat base, lit from above by day, from below at sunrise and sunset.
 * `dark` 0 → 1 from fair white to storm grey.
 */
function Cloud({
  x,
  y,
  s,
  seed,
  d,
  dark,
}: {
  x: number;
  y: number;
  s: number;
  seed: number;
  d: Daylight;
  dark: number;
}) {
  const r = rng(seed);
  // By day white to slate; by night the sky's own dark blue, a little lighter than it.
  const dayBody = mix("oklch(0.55 0.02 250)", dark * 100, "oklch(0.95 0.01 240)");
  const nightBody = mix("oklch(0.3 0.03 260)", 100 - dark * 40, "var(--scene-background)");
  const body = mix(dayBody, d.light * 100, nightBody);
  const top = mix(body, 75, d.light > 0.3 ? "white" : "oklch(0.45 0.03 260)");
  const under = mix(WARM, d.glow * 60, mix(body, 80, "black"));
  const puffs = Array.from({ length: 9 }, () => {
    const a = r() * Math.PI;
    const dd = Math.sqrt(r());
    return {
      cx: x + Math.cos(a) * dd * 30 * s,
      cy: y - Math.sin(a) * dd * 9 * s,
      r: (8 + r() * 8) * s,
    };
  });
  return (
    <g opacity={0.92}>
      {/* The underside first, a little lower, then the body, then the lit tops. */}
      {puffs.map((p, i) => (
        <circle key={`u${i}`} cx={p.cx} cy={p.cy + 3 * s} r={p.r} fill={under} />
      ))}
      {puffs.map((p, i) => (
        <circle key={`b${i}`} cx={p.cx} cy={p.cy} r={p.r} fill={body} />
      ))}
      {puffs
        .filter((p) => p.cy < y - 2 * s)
        .map((p, i) => (
          <circle
            key={`t${i}`}
            cx={p.cx - p.r * 0.15}
            cy={p.cy - p.r * 0.3}
            r={p.r * 0.55}
            fill={top}
            opacity={0.55}
          />
        ))}
    </g>
  );
}

/**
 * Fills `w` × `h` with the sky of the moment; `horizon` is where the land begins (the sun and moon rise from it),
 * `peak` the highest they climb (below anything written over the sky). `weather` and `phase` are today's form.
 */
export function TimeSky({
  d,
  w,
  h,
  horizon,
  peak = 44,
  bodies = true,
  weather,
  phase,
  seed,
}: {
  d: Daylight;
  w: number;
  h: number;
  horizon: number;
  peak?: number;
  /** Draw the sun and moon (default); off, the sky keeps its colour, stars and cloud only. */
  bodies?: boolean;
  weather: Weather | null;
  phase: number;
  seed: string;
}) {
  const uid = `sky${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const c = cover(weather, phase);
  const { top, bottom } = skyColors(d);
  const stars = useMemo(() => {
    const r = rng(seedOf(`${seed}stars`));
    return Array.from({ length: Math.round((30 * w) / 360) }, () => [
      r() * w,
      r() * horizon * 0.9,
      0.25 + r() * 0.55,
      r(),
    ]);
  }, [seed, w, horizon]);
  // Stars fade in the light and behind cloud.
  const starLight = Math.max(0, 1 - d.light * 1.6) * (1 - c.clouds * 0.9);
  // Sun and moon ride an arc from the left horizon, highest at the middle, down to the right.
  const margin = Math.min(48, w * 0.12);
  const arc = (p: { x: number; alt: number }) => ({
    x: margin + p.x * (w - 2 * margin),
    y: horizon - 6 - p.alt * (horizon - 6 - peak),
  });
  // Clouds spread across the whole sky, more of them and bigger as it fills, a few rows deep.
  const clouds = useMemo(() => {
    const r = rng(seedOf(`${seed}clouds`));
    const n = Math.round(c.clouds * (w / 46)) + (c.clouds > 0.05 ? 1 : 0);
    return Array.from({ length: n }, (_, i) => {
      const row = i % 3;
      // Below whatever is written over the top of the sky, down to just above the hills.
      const band = Math.max(20, horizon - 30 - peak);
      return {
        x: ((i + r() * 0.8) / Math.max(1, n)) * (w + 60) - 30,
        y: peak - 10 + band * (row * 0.33 + r() * 0.25),
        s: (0.7 + r() * 0.6) * (0.75 + c.clouds * 0.6) * (1 - row * 0.12),
        seed: r(),
        drift: 10 + r() * 12,
      };
    }).sort((a, b) => a.s - b.s);
  }, [seed, w, horizon, peak, c.clouds]);
  return (
    <g>
      <defs>
        <radialGradient id={`${uid}glow`}>
          <stop offset="0" style={{ stopColor: WARM }} stopOpacity={0.55} />
          <stop offset="0.45" style={{ stopColor: WARM }} stopOpacity={0.22} />
          <stop offset="1" style={{ stopColor: WARM }} stopOpacity={0} />
        </radialGradient>
        <linearGradient id={`${uid}g`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: top }} />
          <stop offset={Math.min(1, horizon / h)} style={{ stopColor: bottom }} />
          <stop offset="1" style={{ stopColor: bottom }} />
        </linearGradient>
      </defs>
      <rect width={w} height={h} fill={`url(#${uid}g)`} />
      {starLight > 0 &&
        stars.map(([x, y, o, tw], i) => (
          <circle
            key={i}
            cx={x}
            cy={y}
            r={tw! > 0.85 ? 1 : 0.7}
            fill="var(--snow)"
            opacity={o! * starLight}
          />
        ))}
      {bodies &&
        d.sun &&
        (() => {
          const p = arc(d.sun);
          return (
            <>
              {d.glow > 0 && (
                <ellipse
                  cx={p.x}
                  cy={horizon}
                  rx={w * 0.7}
                  ry={horizon * 0.55}
                  fill={`url(#${uid}glow)`}
                  opacity={d.glow * (1 - c.clouds * 0.45)}
                />
              )}
              <Sun
                x={p.x}
                y={p.y}
                r={12 + d.sun.alt * 3}
                glow={(0.6 + d.sun.alt * 1.1) * (1 - c.clouds * 0.6)}
                rays={weather === "sun" ? Math.max(0, phase - 0.3) / 0.7 : 0}
              />
            </>
          );
        })()}
      {bodies &&
        d.moon &&
        (() => {
          const p = arc(d.moon);
          return <Moon x={p.x} y={p.y} r={10} lit={d.moon.lit} waxing={d.moon.waxing} />;
        })()}
      {/* Overcast: a veil over the whole sky, dimming whatever shines behind it. */}
      {c.dark > 0 && (
        <rect
          width={w}
          height={h}
          fill={mix("oklch(0.45 0.02 250)", d.light * 100, "var(--scene-background)")}
          opacity={c.clouds * c.dark * 0.75}
        />
      )}
      {clouds.map((k, i) => (
        <g
          key={i}
          className="tree-drift"
          style={{ animationDuration: `${k.drift}s`, animationDelay: `${-k.drift * k.seed}s` }}
        >
          <Cloud x={k.x} y={k.y} s={k.s} seed={k.seed} d={d} dark={c.dark} />
        </g>
      ))}
    </g>
  );
}

/** What the weather puts in front of everything: rain or snow falling over the whole scene. Draw it last. */
export function WeatherFront({
  d,
  w,
  h,
  weather,
  phase,
  seed,
  from = 0,
}: {
  d: Daylight;
  w: number;
  h: number;
  weather: Weather | null;
  phase: number;
  seed: string;
  /** Only below this line (a scene's land, in front of what stands on it; the page's sky does the rest). */
  from?: number;
}) {
  const c = cover(weather, phase);
  const drops = useMemo(() => {
    const r = rng(seedOf(`${seed}fall`));
    return Array.from({ length: Math.round((c.fall * w * (h - from)) / 3600) }, () => ({
      x: r() * w,
      y: from + r() * (h - from),
      flake: r() < c.snow,
      delay: r(),
      s: 0.7 + r() * 0.6,
    }));
  }, [seed, w, h, from, c.fall, c.snow]);
  const rain = mix("var(--fitness)", 55, d.light > 0.4 ? "white" : "var(--snow)");
  return (
    <g pointerEvents="none" aria-hidden>
      {drops.map((p, i) =>
        p.flake ? (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={1.3 * p.s}
            fill="var(--snow)"
            opacity={0.85}
            className="tree-snow"
            style={{ animationDelay: `${-p.delay * 3}s` }}
          />
        ) : (
          <g key={i} transform={`rotate(12 ${p.x} ${p.y})`}>
            <line
              x1={p.x}
              y1={p.y}
              x2={p.x}
              y2={p.y + 6 * p.s}
              stroke={rain}
              strokeWidth={0.9}
              strokeLinecap="round"
              opacity={0.55}
              className="tree-rain"
              style={{ animationDelay: `${-p.delay * 1.4}s` }}
            />
          </g>
        ),
      )}
    </g>
  );
}

/**
 * Mist lying along `horizon` at dawn, at dusk and under heavy cloud: soft banks over the far hills. Draw it behind
 * the tree and the garden, in front of the hills.
 */
export function Mist({
  d,
  w,
  horizon,
  weather,
  phase,
}: {
  d: Daylight;
  w: number;
  horizon: number;
  weather: Weather | null;
  phase: number;
}) {
  const c = cover(weather, phase);
  const mist = Math.max(d.glow * 0.8, c.clouds * c.dark * 0.6);
  const uid = `mist${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  if (mist <= 0.05) return null;
  const mistColor = mix(
    "var(--snow)",
    30 + d.light * 40,
    mix(WARM, d.glow * 40, "var(--scene-background)"),
  );
  return (
    <g pointerEvents="none" aria-hidden>
      <defs>
        <radialGradient id={`${uid}g`}>
          <stop offset="0" style={{ stopColor: mistColor }} stopOpacity={1} />
          <stop offset="1" style={{ stopColor: mistColor }} stopOpacity={0} />
        </radialGradient>
      </defs>
      {[0, 1, 2].map((i) => (
        <ellipse
          key={i}
          cx={w * (0.2 + i * 0.35)}
          cy={horizon + 8 + i * 10}
          rx={w * 0.55}
          ry={14 + i * 4}
          fill={`url(#${uid}g)`}
          opacity={mist * (0.5 - i * 0.1)}
          className="tree-drift"
          style={{ animationDuration: `${18 + i * 6}s` }}
        />
      ))}
    </g>
  );
}
