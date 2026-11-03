import { useNavigate } from "@tanstack/react-router";
import { parseISO } from "date-fns";
import { useId, type ReactNode } from "react";
import type { PlannedEvent } from "@/lib/intervals";
import { ceilingText } from "@/lib/readiness";
import { formatDuration } from "@/lib/training";
import {
  rng,
  SEASON_COLOR,
  seedOf,
  WEATHER_WORD,
  weekRange,
  type Crown as CrownState,
  type Scar as ScarSpan,
  type TreeYear,
  type Weather,
} from "@/lib/tree";
import { format, num, t } from "@/lib/i18n";

const H = 262;
const MONTHS = t(
  "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec",
  "Gen Feb Mar Apr Mag Giu Lug Ago Set Ott Nov Dic",
).split(" ");
/** Day of the year each month starts on (non-leap; a day's drift doesn't show at this scale). */
const MONTH_STARTS = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];

/** Today: the crown's season is readiness; the sky beside it is form. */
export function CrownView({
  crown,
  today,
  trunk,
  w,
  limit,
  quiet,
  block,
  onOpen,
}: {
  crown: CrownState;
  today: string;
  trunk: number;
  w: number;
  /** Today's ceiling on an easy or endurance day. */
  limit: { watts: number | null; bpm: number | null } | null;
  /** Quiet tree: the picture without the scores. */
  quiet: boolean;
  /** The current training block's focus, e.g. "VO2max". */
  block: string;
  onOpen: () => void;
}) {
  const cx = w / 2;
  const [rx, ry, cy] = [Math.min(w * 0.42, 160), 82, 134];
  const r = rng(seedOf(today));
  const color = crown.season ? SEASON_COLOR[crown.season] : "var(--muted-foreground)";
  // The trunk rises from the first row (vertical, same width) and narrows gently to the fork.
  const fork = cy + 46;
  const forkW = trunk * 0.62;
  const rise = H - fork;
  const trunkPath = `M${cx - trunk / 2},${H} C${cx - trunk / 2},${H - rise * 0.55} ${cx - forkW / 2},${fork + rise * 0.35} ${cx - forkW / 2},${fork} L${cx + forkW / 2},${fork} C${cx + forkW / 2},${fork + rise * 0.35} ${cx + trunk / 2},${H - rise * 0.55} ${cx + trunk / 2},${H} Z`;

  // Limbs, each with a few twigs reaching up and out: hidden in summer, the whole shape in winter.
  const wood: { d: string; width: number }[] = [];
  const limbW = Math.max(1.5, trunk / 4);
  [-0.7, -0.3, 0.25, 0.65].forEach((s, i) => {
    const [x0, y0] = [cx + s * forkW * 0.5, fork + 12];
    const [qx, qy] = [cx + s * rx * 0.3, cy + 20];
    const [x1, y1] = [cx + s * rx * 0.75, cy - 10 + i * 6];
    wood.push({ d: `M${x0},${y0} Q${qx},${qy} ${x1},${y1}`, width: limbW });
    const dir = s < 0 ? -1 : 1;
    for (const t of [0.5, 0.75, 1]) {
      const px = (1 - t) ** 2 * x0 + 2 * (1 - t) * t * qx + t * t * x1;
      const py = (1 - t) ** 2 * y0 + 2 * (1 - t) * t * qy + t * t * y1;
      const len = 18 + r() * 26;
      const lean = t === 1 ? 0.5 : 0.15 + r() * 0.35;
      const [tx, ty] = [px + dir * len * lean, py - len];
      wood.push({
        d: `M${px},${py} Q${px + dir * len * 0.1},${py - len * 0.6} ${tx},${ty}`,
        width: limbW * 0.45,
      });
      if (t === 1) {
        const [ux, uy] = [px + dir * len * 0.9, py - len * 0.45];
        wood.push({ d: `M${px},${py} L${ux},${uy}`, width: limbW * 0.35 });
      }
    }
  });

  const blob = (size: [number, number], spread = 1) => {
    const a = r() * Math.PI * 2;
    const d = Math.sqrt(r()) * spread;
    return {
      cx: cx + Math.cos(a) * d * rx,
      cy: cy + Math.sin(a) * d * ry,
      r: size[0] + r() * (size[1] - size[0]),
    };
  };
  const canopy: ReactNode[] = [];
  const extras: ReactNode[] = [];
  // On the ground at the trunk's foot: snow drifts, fallen leaves.
  const ground: ReactNode[] = [];
  // Where in its season the crown is (0 → 1 toward better readiness), so no two springs look alike. Neighbouring
  // ends meet: deep winter → first snow ≈ late autumn → early autumn; early spring → late spring ≈ early summer.
  const p = crown.seasonPhase;
  const lerp = (a: number, b: number) => a + (b - a) * p;
  const warm = [
    "var(--autumn)",
    "var(--birch)",
    "var(--lingon)",
    "color-mix(in oklab, var(--autumn) 60%, var(--bark))",
  ];
  const brown = "color-mix(in oklab, var(--autumn) 45%, var(--bark))";
  // A leaf on its way down, either side of the trunk. The tilt sits on a wrapper: the animated leaf measures
  // transforms from its own box.
  const fallingLeaf = (key: string, fill: string) => {
    const x = cx + (r() < 0.5 ? 1 : -1) * (forkW + 10 + r() * rx * 0.9);
    const y = cy + 30 + r() * (H - cy - 40);
    return (
      <g key={key} transform={`rotate(${r() * 180} ${x} ${y})`}>
        <ellipse
          cx={x}
          cy={y}
          rx={4.5}
          ry={2.4}
          fill={fill}
          className="tree-fall"
          style={{ animationDelay: `${-r() * 6}s` }}
        />
      </g>
    );
  };
  // A leaf lying at the trunk's foot.
  const fallenLeaf = (key: string, fill: string) => {
    const x = cx + (r() < 0.5 ? 1 : -1) * (trunk / 2 + 2 + r() * rx * 0.75);
    const y = H - 2 - r() * 5;
    return (
      <ellipse
        key={key}
        cx={x}
        cy={y}
        rx={4}
        ry={1.8}
        fill={fill}
        opacity={0.85}
        transform={`rotate(${r() * 40 - 20} ${x} ${y})`}
      />
    );
  };
  const blossom = (key: string, size: [number, number]) => {
    const b = blob(size, 1);
    const petal = r() < 0.6 ? "var(--blossom)" : "var(--snow)";
    return (
      <g key={key}>
        {[0, 1, 2, 3, 4].map((k) => {
          const a = (k / 5) * Math.PI * 2;
          return (
            <circle
              key={k}
              cx={b.cx + Math.cos(a) * b.r * 1.3}
              cy={b.cy + Math.sin(a) * b.r * 1.3}
              r={b.r}
              fill={petal}
            />
          );
        })}
        <circle cx={b.cx} cy={b.cy} r={b.r * 0.7} fill="var(--birch)" />
      </g>
    );
  };
  if (crown.season === "summer") {
    // Early summer: still light and fresh, the last blossoms (as late spring); high summer: dense, dark, laden.
    const fresh = Math.round(lerp(55, 0));
    for (let i = 0; i < crown.leaves; i++)
      canopy.push(
        <circle
          key={i}
          {...blob([lerp(7, 9.5), lerp(12, 17)])}
          fill={`color-mix(in oklab, color-mix(in oklab, var(--spring) ${fresh}%, var(--summer)) ${Math.min(100, Math.round(lerp(70, 50) + r() * 30))}%, black)`}
          opacity={0.75 + r() * 0.25}
        />,
      );
    for (let i = 0; i < Math.round(Math.max(0, 0.4 - p) * 12); i++)
      extras.push(blossom(`b${i}`, [1.8, 2.4]));
    for (let i = 0; i < Math.round(lerp(1, 16)); i++)
      extras.push(
        <circle
          key={`f${i}`}
          {...blob([lerp(2, 3), lerp(2.8, 4)], 0.85)}
          fill={`color-mix(in oklab, var(--lingon) ${Math.round(lerp(60, 100))}%, var(--birch))`}
          opacity={0.9}
        />,
      );
  } else if (crown.season === "spring") {
    // Early spring: buds and tiny pale leaves on bare wood; late spring: nearly summer-green and full (as early
    // summer). Blossom peaks in between.
    for (let i = 0; i < crown.leaves; i++)
      canopy.push(
        <circle
          key={i}
          {...blob([lerp(3, 7), lerp(6, 12)])}
          fill={`color-mix(in oklab, var(--summer) ${Math.round(lerp(0, 50) + r() * 30)}%, var(--spring))`}
          opacity={lerp(0.45, 0.65) + r() * 0.3}
        />,
      );
    for (let i = 0; i < Math.round(lerp(18, 0)); i++) {
      const bud = blob([1, 1], 1.05);
      extras.push(
        <ellipse
          key={`bud${i}`}
          cx={bud.cx}
          cy={bud.cy}
          rx={1.6}
          ry={2.6}
          fill="color-mix(in oklab, var(--spring) 70%, var(--bark))"
        />,
      );
    }
    for (let i = 0; i < Math.round(6 + 14 * Math.sin(Math.PI * p)); i++)
      extras.push(blossom(`b${i}`, [lerp(1.6, 2.2), lerp(2.2, 2.8)]));
  } else if (crown.season === "autumn") {
    // Late autumn: a few brown leaves left, most down and blowing (as the first snow); early autumn: a full
    // crown only starting to turn.
    const green = "color-mix(in oklab, var(--summer) 70%, var(--birch))";
    const leaf = () => {
      const g = r();
      return g < lerp(0, 0.5)
        ? green
        : g > lerp(0.55, 1)
          ? brown
          : warm[Math.floor(r() * warm.length)]!;
    };
    for (let i = 0; i < crown.leaves; i++)
      canopy.push(
        <circle
          key={i}
          {...blob([lerp(5, 7), lerp(10, 13)])}
          fill={leaf()}
          opacity={0.65 + r() * 0.3}
        />,
      );
    for (let i = 0; i < Math.round(lerp(16, 3)); i++)
      extras.push(fallingLeaf(`l${i}`, i % 3 ? warm[i % warm.length]! : brown));
    for (let i = 0; i < Math.round(lerp(16, 2)); i++)
      ground.push(fallenLeaf(`g${i}`, i % 2 ? warm[i % warm.length]! : brown));
  } else if (crown.season === "winter") {
    // Deep winter: a blizzard, limbs loaded with snow, a deep drift; early winter: the first snow, a light
    // dusting, and the last brown leaves still clinging and falling (as late autumn).
    for (let i = 0; i < Math.round(lerp(44, 8)); i++) {
      const b = blob([1.2, 2.6], 1.2);
      extras.push(
        <circle
          key={`s${i}`}
          {...b}
          fill="var(--snow)"
          opacity={0.85}
          className="tree-snow"
          style={{ animationDelay: `${-r() * 3}s` }}
        />,
      );
    }
    for (let i = 0; i < Math.round(Math.max(0, p - 0.3) * 12); i++)
      extras.push(<circle key={`c${i}`} {...blob([3, 5], 0.9)} fill={brown} opacity={0.8} />);
    for (let i = 0; i < Math.round(Math.max(0, p - 0.5) * 6); i++)
      extras.push(fallingLeaf(`l${i}`, brown));
    for (let i = 0; i < Math.round(Math.max(0, p - 0.4) * 10); i++)
      ground.push(fallenLeaf(`g${i}`, brown));
    ground.push(
      <ellipse
        key="drift"
        cx={cx}
        cy={H + 3}
        rx={lerp(rx * 1.1, rx * 0.35)}
        ry={lerp(18, 5)}
        fill="var(--snow)"
        opacity={lerp(0.92, 0.55)}
      />,
    );
  } else {
    // No data yet: a quiet grey crown.
    for (let i = 0; i < crown.leaves; i++)
      canopy.push(
        <circle key={i} {...blob([7, 13])} fill="var(--muted-foreground)" opacity={0.2} />,
      );
  }
  const heading = crown.seasonLabel
    ? crown.advice
      ? `${crown.seasonLabel} · ${crown.advice.toLowerCase()}`
      : crown.seasonLabel
    : t("Today", "Oggi");

  return (
    <button
      type="button"
      onClick={onOpen}
      className="block w-full text-center focus-visible:outline-none"
      aria-label={`${t("Today", "Oggi")}: ${heading}`}
    >
      <div className="eyebrow flex flex-wrap justify-center gap-x-1.5">
        <span className="whitespace-nowrap">
          {format(parseISO(today), "EEEE d MMMM")}
          {block && " ·"}
        </span>
        {/* A friend's tree in a forest has no training block of mine to show. */}
        {block && (
          <span className="whitespace-nowrap">{t(`${block} block`, `blocco ${block}`)}</span>
        )}
      </div>
      <div className="mt-1 text-lg font-semibold" style={{ color }}>
        {heading}
      </div>
      {limit && (
        <div className="stat-num text-sm font-semibold" style={{ color }}>
          {ceilingText(limit)}
        </div>
      )}
      {crown.signals.length > 0 && (
        <div className="text-sm text-birch">
          {t("Something is changing · tap to see", "Qualcosa sta cambiando · tocca per vedere")}
        </div>
      )}
      {!quiet && (
        <div className="text-sm text-muted-foreground">
          {crown.score == null
            ? t(
                "Not enough data yet · tap to check in",
                "Dati ancora insufficienti · tocca per il check-in",
              )
            : crown.estimated
              ? t(
                  `Readiness ${crown.score} · estimated · check in to refine`,
                  `Prontezza ${crown.score} · stimata · fai il check-in per affinarla`,
                )
              : t(
                  `Readiness ${crown.score} · tap the crown for today`,
                  `Prontezza ${crown.score} · tocca la chioma per oggi`,
                )}
        </div>
      )}
      {!quiet && crown.ctl != null && (
        // Wraps between whole items, never inside one.
        <div className="stat-num mt-1 flex flex-wrap justify-center gap-x-3 text-sm">
          <span className="text-fitness">
            {t("Fitness", "Forma fisica")} {Math.round(crown.ctl)}
          </span>
          {crown.atl != null && (
            <span className="text-fatigue">
              {t("Fatigue", "Fatica")} {Math.round(crown.atl)}
            </span>
          )}
          {crown.form != null && (
            <span className="whitespace-nowrap text-form">
              {t("Form", "Forma")} {crown.form > 0 ? "+" : ""}
              {Math.round(crown.form)}
              {crown.formPct != null &&
                crown.ctl != null &&
                crown.ctl >= 10 &&
                ` (${Math.round(crown.formPct)}%)`}
              {crown.weather && (
                <span className="text-muted-foreground"> · {WEATHER_WORD[crown.weather]}</span>
              )}
            </span>
          )}
        </div>
      )}
      <svg className="block" width={w} height={H} aria-hidden>
        {crown.weather && (
          <>
            <Sky
              weather={crown.weather}
              phase={crown.weatherPhase}
              x={Math.min(w - 50, cx + rx + 20)} // beside the crown, never far off on wide screens
              y={34}
              seed={seedOf(`${today}sky`)}
            />
            <Sky
              weather={crown.weather}
              phase={crown.weatherPhase}
              x={Math.max(50, cx - rx - 20)}
              y={46}
              seed={seedOf(`${today}sky-left`)}
              echo
            />
          </>
        )}
        <path d={trunkPath} fill="var(--bark)" />
        <path
          d={`M${cx - trunk / 2 + 1},${H} C${cx - trunk / 2 + 1},${H - rise * 0.55} ${cx - forkW / 2 + 1},${fork + rise * 0.35} ${cx - forkW / 2 + 1},${fork + 6}`}
          fill="none"
          stroke="black"
          strokeOpacity={0.35}
          strokeWidth={2}
        />
        <path
          d={`M${cx + trunk / 2 - 1},${H} C${cx + trunk / 2 - 1},${H - rise * 0.55} ${cx + forkW / 2 - 1},${fork + rise * 0.35} ${cx + forkW / 2 - 1},${fork + 6}`}
          fill="none"
          stroke="var(--birch)"
          strokeOpacity={0.3}
          strokeWidth={1.5}
        />
        {wood.map((p, i) => (
          <path
            key={i}
            d={p.d}
            fill="none"
            stroke="var(--bark)"
            strokeWidth={p.width}
            strokeLinecap="round"
          />
        ))}
        {crown.season === "winter" &&
          // Snow resting on top of every limb and twig: loaded in deep winter, a dusting at the first snow.
          wood.map((limb, i) => (
            <path
              key={i}
              d={limb.d}
              fill="none"
              stroke="var(--snow)"
              strokeWidth={Math.max(0.8, limb.width * lerp(0.75, 0.22))}
              strokeLinecap="round"
              transform={`translate(0 ${-limb.width * 0.45})`}
              opacity={lerp(1, 0.45)}
            />
          ))}
        <ellipse cx={cx} cy={fork + 4} rx={forkW / 2} ry={10} fill="var(--bark)" />
        {ground}
        <g className="tree-grow">
          {canopy}
          {extras}
        </g>
        {crown.signals.length > 0 && (
          <Wind
            cx={cx}
            cy={cy}
            rx={rx}
            seed={seedOf(`${today}wind`)}
            winter={crown.season === "winter"}
          />
        )}
      </svg>
    </button>
  );
}

/**
 * Wind through the crown: something is changing before the season does. A few gusts across the canopy and
 * leaves (snow in winter) carried sideways.
 */
function Wind({
  cx,
  cy,
  rx,
  seed,
  winter,
}: {
  cx: number;
  cy: number;
  rx: number;
  seed: number;
  winter: boolean;
}) {
  const r = rng(seed);
  const gusts = [-0.45, 0.05, 0.4].map((k, i) => {
    const y = cy + k * 80;
    const x0 = cx - rx * (0.9 + r() * 0.3);
    const len = rx * (1.1 + r() * 0.5);
    return (
      <path
        key={i}
        d={`M${x0},${y} q${len * 0.5},${-10 - r() * 6} ${len},0 q${len * 0.18},6 ${len * 0.12},-6`}
        fill="none"
        stroke="var(--muted-foreground)"
        strokeOpacity={0.55}
        strokeWidth={1.4}
        strokeLinecap="round"
        className="tree-gust"
        style={{ animationDelay: `${-i * 1.3}s` }}
      />
    );
  });
  const flying = Array.from({ length: 7 }, (_, i) => {
    const [x, y] = [cx + (r() - 0.2) * rx * 1.6, cy - 50 + r() * 110];
    const style = { animationDelay: `${-r() * 4}s` };
    return winter ? (
      <circle
        key={i}
        cx={x}
        cy={y}
        r={1.6}
        fill="var(--snow)"
        className="tree-blown"
        style={style}
      />
    ) : (
      <ellipse
        key={i}
        cx={x}
        cy={y}
        rx={4}
        ry={2}
        fill={i % 2 ? "var(--autumn)" : "color-mix(in oklab, var(--summer) 70%, var(--birch))"}
        className="tree-blown"
        style={style}
      />
    );
  });
  return (
    <g>
      {gusts}
      {flying}
    </g>
  );
}

/** A cloud painted like the canopy: soft overlapping blobs, flatter at the bottom. */
function Cloud({
  x,
  y,
  s,
  tone,
  seed,
}: {
  x: number;
  y: number;
  s: number;
  tone: number;
  seed: number;
}) {
  const r = rng(seed);
  return (
    <g>
      {Array.from({ length: 11 }, (_, i) => {
        const a = r() * Math.PI;
        const d = Math.sqrt(r());
        // Blobs sit on an upper half-ellipse, so the cloud has a domed top and a calm, flat base.
        return (
          <circle
            key={i}
            cx={x + Math.cos(a) * d * 26 * s}
            cy={y - Math.sin(a) * d * 10 * s}
            r={(7 + r() * 7) * s}
            fill={`color-mix(in oklab, var(--muted-foreground) ${tone}%, var(--background))`}
            opacity={0.55 + r() * 0.35}
          />
        );
      })}
    </g>
  );
}

/**
 * A sun painted like the canopy: a warm disc inside soft layered halos (`glow` scales them), with short rays
 * fading in as `rays` goes 0 → 1.
 */
export function Sun({
  x,
  y,
  r,
  glow = 1,
  rays = 0,
}: {
  x: number;
  y: number;
  r: number;
  glow?: number;
  rays?: number;
}) {
  return (
    <g>
      {[2.6, 2, 1.5].map((k, i) => (
        <circle
          key={i}
          cx={x}
          cy={y}
          r={r * k}
          fill="var(--birch)"
          opacity={(0.07 + i * 0.06) * glow}
        />
      ))}
      {rays > 0 &&
        Array.from({ length: 10 }, (_, i) => {
          const a = (i / 10) * Math.PI * 2;
          const [r0, r1] = [r * 1.3, r * (1.7 + 0.5 * rays)];
          return (
            <line
              key={`ray${i}`}
              x1={x + Math.cos(a) * r0}
              y1={y + Math.sin(a) * r0}
              x2={x + Math.cos(a) * r1}
              y2={y + Math.sin(a) * r1}
              stroke="var(--birch)"
              strokeWidth={1.4}
              strokeLinecap="round"
              opacity={0.75 * rays}
            />
          );
        })}
      <circle
        cx={x}
        cy={y}
        r={r}
        fill="color-mix(in oklab, var(--birch) 85%, white)"
        opacity={0.95}
      />
    </g>
  );
}

/**
 * Rain, sleet or snow under a cloud at (x, y): `count` particles, `snow` (0 → 1) of them flakes. Drops are
 * slanted on a wrapper, so their own animation only ever moves them down.
 */
function Precip({
  x,
  y,
  count,
  snow,
  seed,
}: {
  x: number;
  y: number;
  count: number;
  snow: number;
  seed: number;
}) {
  const r = rng(seed + 0.7);
  return (
    <>
      {Array.from({ length: count }, (_, i) => {
        const flake = r() < snow;
        // Flakes float over a taller, looser band than drops.
        const [px, py] = flake
          ? [x - 28 + (i * 56) / count + r() * 6, y + 16 + r() * 36]
          : [x - 24 + (i * 50) / count + r() * 3, y + 20 + r() * 22];
        return flake ? (
          <circle
            key={i}
            cx={px}
            cy={py}
            r={1.5 + r() * 1}
            fill="var(--snow)"
            opacity={0.8 + r() * 0.2}
            className="tree-snow"
            style={{ animationDelay: `${-r() * 3}s` }}
          />
        ) : (
          <g key={i} transform={`rotate(12 ${px} ${py})`} opacity={0.55 + r() * 0.3}>
            <ellipse
              cx={px}
              cy={py}
              rx={1.3}
              ry={3.6}
              fill="var(--fitness)"
              className="tree-rain"
              style={{ animationDelay: `${-r() * 1.4}s` }}
            />
          </g>
        );
      })}
    </>
  );
}

/**
 * Form as weather, one continuous sky from worst to best; `phase` (0 → 1, toward fairer) moves within each kind.
 * Overreached: a snowstorm under heavy cloud → sleet → gentle rain. Training hard: dark overcast with drizzle →
 * clouds breaking up, the sun behind. Neutral: a big cloud over the sun → a small one. Fresh: a pale sun → a
 * blazing one with rays. The `echo` on the other side of the crown repeats the sky without a second sun (a pale
 * fair-weather cloud when it's sunny).
 */
export function Sky({
  weather,
  phase,
  x,
  y,
  seed,
  echo = false,
}: {
  weather: Weather;
  phase: number;
  x: number;
  y: number;
  seed: number;
  echo?: boolean;
}) {
  const lerp = (a: number, b: number) => a + (b - a) * phase;
  return (
    <g>
      {weather === "sun" &&
        (echo ? (
          <g className="tree-drift" opacity={lerp(0.7, 0.3)}>
            <Cloud x={x} y={y + 6} s={lerp(0.75, 0.45)} tone={95} seed={seed} />
          </g>
        ) : (
          <Sun
            x={x}
            y={y}
            r={lerp(10, 15)}
            glow={lerp(0.6, 1.7)}
            rays={Math.max(0, phase - 0.3) / 0.7}
          />
        ))}
      {weather === "partly" && (
        <>
          {!echo && (
            <Sun x={x + lerp(2, 14)} y={y - lerp(2, 8)} r={lerp(9, 12)} glow={lerp(0.4, 1)} />
          )}
          <g className="tree-drift" opacity={lerp(1, 0.8)}>
            <Cloud
              x={x - 6}
              y={y + 12}
              s={lerp(1.1, 0.6)}
              tone={Math.round(lerp(72, 94))}
              seed={seed}
            />
          </g>
        </>
      )}
      {weather === "clouds" && (
        <>
          {/* The sun starts to show through as the clouds break up. */}
          {!echo && phase > 0.55 && (
            <g opacity={(phase - 0.55) / 0.45}>
              <Sun x={x + 16} y={y - 10} r={9} glow={0.5} />
            </g>
          )}
          {/* Drizzle under the darkest overcast. */}
          {phase < 0.4 && (
            <Precip x={x} y={y + 4} count={Math.round((0.4 - phase) * 15)} snow={0} seed={seed} />
          )}
          <g className="tree-drift">
            <Cloud
              x={x + 10}
              y={y - 2}
              s={lerp(1, 0.6)}
              tone={Math.round(lerp(44, 80))}
              seed={seed + 0.1}
            />
            <Cloud
              x={x - 6}
              y={y + 12}
              s={lerp(1.25, 0.8)}
              tone={Math.round(lerp(58, 92))}
              seed={seed}
            />
          </g>
        </>
      )}
      {weather === "rain" && (
        <>
          <Precip
            x={x}
            y={y + 4}
            count={Math.round(lerp(22, 7))}
            // All snow at the deep end, sleet in between, all rain from two-thirds on.
            snow={Math.max(0, 1 - phase * 1.5)}
            seed={seed}
          />
          <g className="tree-drift">
            {/* A second storm cloud, fading out as the snow turns to rain. */}
            {phase < 0.6 && (
              <g opacity={Math.min(1, (0.6 - phase) / 0.3)}>
                <Cloud
                  x={x + 14}
                  y={y - 4}
                  s={lerp(1, 0.7)}
                  tone={Math.round(lerp(26, 45))}
                  seed={seed + 0.2}
                />
              </g>
            )}
            <Cloud x={x} y={y + 8} s={lerp(1.3, 0.9)} tone={Math.round(lerp(32, 62))} seed={seed} />
          </g>
        </>
      )}
    </g>
  );
}

/** Planned workouts, waiting above the crown. */
export function Buds({
  events,
  onOpen,
}: {
  events: PlannedEvent[];
  onOpen: (e: PlannedEvent) => void;
}) {
  if (!events.length) return null;
  return (
    <div className="mx-auto mb-2 max-w-sm space-y-1">
      {events.map((e) => (
        <button
          key={e.id}
          type="button"
          onClick={() => onOpen(e)}
          className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm transition-colors hover:bg-secondary/40"
        >
          <svg width={14} height={18} aria-hidden className="shrink-0">
            <path d="M7,17 L7,9" stroke="var(--bark)" strokeWidth={1.5} />
            <ellipse cx={7} cy={6} rx={4} ry={5.5} fill="var(--birch)" opacity={0.85} />
          </svg>
          <span className="w-16 shrink-0 text-muted-foreground">
            {format(parseISO(e.date), "EEE d")}
          </span>
          <span className="min-w-0 flex-1 truncate">{e.name ?? e.category.toLowerCase()}</span>
          <span className="stat-num shrink-0 text-muted-foreground">
            {formatDuration(e.moving_time)}
          </span>
        </button>
      ))}
    </div>
  );
}

/**
 * The tree cut across: one ring per year, wider for bigger years, darker grain for heavier weeks.
 * Each year × month sector opens that month in the calendar.
 */
export function Rings({ years, w }: { years: TreeYear[]; w: number }) {
  const navigate = useNavigate();
  const size = Math.min(w, 380);
  const c = size / 2;
  const total = years.reduce((s, y) => s + Math.sqrt(y.load + 1), 0) || 1;
  const maxWeek = Math.max(1, ...years.flatMap((y) => y.weekLoads));
  const wood = c - 20; // outer band left free for the month names
  const angle = (doy: number) => (doy / 7 / 53) * Math.PI * 2 - Math.PI / 2;
  const pt = (rad: number, a: number) => `${c + rad * Math.cos(a)},${c + rad * Math.sin(a)}`;
  const months = MONTH_STARTS.map((doy, m) => {
    const a = angle(doy);
    const mid = angle(doy + (MONTH_STARTS[m + 1] ?? 365) / 2 - doy / 2);
    return (
      <g key={m}>
        <line
          x1={c + 10 * Math.cos(a)}
          y1={c + 10 * Math.sin(a)}
          x2={c + wood * Math.cos(a)}
          y2={c + wood * Math.sin(a)}
          stroke="var(--background)"
          strokeOpacity={0.35}
          strokeWidth={0.75}
        />
        <text
          x={c + (c - 8) * Math.cos(mid)}
          y={c + (c - 8) * Math.sin(mid)}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={10}
          fill="var(--muted-foreground)"
        >
          {MONTHS[m]}
        </text>
      </g>
    );
  });
  let inner = 10;
  const rings = years.map((y) => {
    const width = ((wood - 14) * Math.sqrt(y.load + 1)) / total;
    const mid = inner + width / 2;
    const [r0, r1] = [inner, inner + width];
    // Grain shaded day by day, each day blended between its week and the neighbouring one, so weeks flow into each
    // other. Solid mixed colours (not opacity) let the slivers overlap a hair without visible seams.
    const loadAt = (k: number) => y.weekLoads[Math.max(0, Math.min(52, k))]!;
    const arcs = Array.from({ length: 53 * 7 }, (_, d) => {
      const p = (d + 0.5) / 7 - 0.5;
      const k = Math.floor(p);
      const l = loadAt(k) + (loadAt(k + 1) - loadAt(k)) * (p - k);
      const [a0, a1] = [
        ((d - 0.6) / 371) * Math.PI * 2 - Math.PI / 2,
        ((d + 1.6) / 371) * Math.PI * 2 - Math.PI / 2,
      ];
      return (
        <path
          key={d}
          d={`M${pt(mid, a0)} A${mid},${mid} 0 0 1 ${pt(mid, a1)}`}
          fill="none"
          stroke={`color-mix(in oklab, ${GRAIN} ${Math.round(5 + 90 * (l / maxWeek))}%, ${LIGHT_WOOD})`}
          strokeWidth={width * 0.9}
        />
      );
    });
    const taps = MONTH_STARTS.map((doy, m) => {
      const [a0, a1] = [angle(doy), angle(MONTH_STARTS[m + 1] ?? 371)];
      const month = `${y.year}-${String(m + 1).padStart(2, "0")}`;
      const go = () => void navigate({ to: "/calendar", search: { month } });
      return (
        <path
          key={m}
          d={`M${pt(r1, a0)} A${r1},${r1} 0 0 1 ${pt(r1, a1)} L${pt(r0, a1)} A${r0},${r0} 0 0 0 ${pt(r0, a0)} Z`}
          role="link"
          tabIndex={0}
          aria-label={t(
            `Open ${MONTHS[m]} ${y.year} in the calendar`,
            `Apri ${MONTHS[m]} ${y.year} nel calendario`,
          )}
          className="cursor-pointer fill-transparent outline-none transition-colors hover:fill-birch/25 focus-visible:fill-birch/35 active:fill-birch/45"
          onClick={go}
          onKeyDown={(e) => e.key === "Enter" && go()}
        />
      );
    });
    const scars = y.scars.map((s) => (
      <Scar key={s.from} s={s} r0={r0} r1={r1} angle={angle} pt={pt} />
    ));
    const ring = (
      <g key={y.year}>
        {arcs}
        <g aria-hidden className="pointer-events-none">
          {scars}
        </g>
        <circle cx={c} cy={c} r={r1} fill="none" stroke="var(--background)" strokeOpacity={0.5} />
        {taps}
      </g>
    );
    inner += width;
    return ring;
  });

  return (
    <div className="space-y-6">
      <svg width={size} height={size} className="tree-grow mx-auto block">
        <circle cx={c} cy={c} r={wood} fill={LIGHT_WOOD} />
        <circle cx={c} cy={c} r={wood} fill="none" stroke="var(--bark)" strokeWidth={8} />
        <circle cx={c} cy={c} r={5} fill="var(--bark)" />
        {rings}
        {/* Over the rings: the grain is solid, so month lines underneath would be hidden. */}
        <g aria-hidden className="pointer-events-none">
          {months}
        </g>
      </svg>
      <p className="mx-auto max-w-sm text-center text-sm text-muted-foreground">
        {t(
          "Inner rings are older years. A wide ring is a big year; dark grain is a heavy week, read clockwise from January at the top. Tap a month to open it in the calendar.",
          "Gli anelli interni sono gli anni più vecchi. Un anello largo è un anno intenso; le venature scure sono settimane pesanti, da leggere in senso orario da gennaio in alto. Tocca un mese per aprirlo nel calendario.",
        )}
      </p>
      <div className="mx-auto max-w-sm space-y-3">
        {[...years].reverse().map((y) => (
          <section key={y.year} className="rounded-xl border border-border bg-card p-4">
            <h2 className="text-lg font-semibold">{y.year}</h2>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <YearStat
                value={num(Math.round(y.distance / 1000))}
                unit="km"
                label={t("Distance", "Distanza")}
              />
              <YearStat
                value={num(Math.round(y.climb))}
                unit="m"
                label={t("Climbed", "Dislivello")}
              />
              <YearStat
                value={num(Math.round(y.minutes / 60))}
                unit="h"
                label={t("Time", "Tempo")}
              />
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              {t(`${y.count} rides · load`, `${y.count} uscite · carico`)} {num(Math.round(y.load))}
              {y.crossMinutes >= 60 &&
                t(
                  ` · ${num(Math.round(y.crossMinutes / 60))} h in the garden`,
                  ` · ${num(Math.round(y.crossMinutes / 60))} h nell'orto`,
                )}
            </p>
            {y.scars.length > 0 && (
              <ul className="mt-2 space-y-0.5 text-sm">
                {y.scars.map((s) => (
                  <li key={s.from} className="flex items-center gap-2">
                    <span
                      className="h-2 w-3 shrink-0 rounded-sm"
                      style={{ background: SCAR }}
                      aria-hidden
                    />
                    {t("Injured", "Infortunato")} {weekRange(s.start, s.end)}
                    <span className="text-muted-foreground">
                      ·{" "}
                      {s.to - s.from + 1 === 1
                        ? t("1 day", "1 giorno")
                        : t(`${s.to - s.from + 1} days`, `${s.to - s.from + 1} giorni`)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}

/** The cut wood of the rings, and the dark grain of a heavy week. */
const LIGHT_WOOD = "color-mix(in oklab, var(--bark) 80%, var(--birch))";
const GRAIN = "color-mix(in oklab, var(--bark) 45%, black)";

/** The trunk's knot colour, and the darker grain that flows around a knot. */
const SCAR = "color-mix(in oklab, var(--bark) 75%, black)";
const KNOT_GRAIN = "color-mix(in oklab, var(--bark) 45%, black)";

/**
 * An injured stretch on a year's ring, drawn as a knot in wood grain: an oval spiral lying across the ring, with long
 * grain lines running past it on both sides. The lines bend around the knot, the nearest most and the farther ones
 * gently, and fade out at their ends. Centred on the injured days and bigger for a longer injury, up to what fits in
 * the ring.
 */
function Scar({
  s,
  r0,
  r1,
  angle,
  pt,
}: {
  s: ScarSpan;
  r0: number;
  r1: number;
  angle: (doy: number) => number;
  pt: (rad: number, a: number) => string;
}) {
  const fade = useId();
  const am = angle((s.from + s.to + 1) / 2);
  const w = r1 - r0;
  const rm = r0 + w / 2;
  const length = (angle(s.to + 1) - angle(s.from)) * rm;
  const r = Math.max(1.8, Math.min(length * 0.05 + 1.5, w * 0.1, 4.5));
  const [x, y] = pt(rm, am).split(",").map(Number) as [number, number];
  // Local frame: x across the ring (the grain runs toward the pith), y along it. The lines stay inside the ring.
  const across = (am * 180) / Math.PI;
  const half = Math.min(r * 7, w * 0.48);
  // Two and a half open turns of an oval spiral, longer along the grain.
  const spiral = Array.from({ length: 51 }, (_, i) => {
    const a = (i / 50) * 5 * Math.PI;
    const d = (r * i) / 50;
    return `${(Math.cos(a) * d * 1.6).toFixed(2)},${(Math.sin(a) * d).toFixed(2)}`;
  }).join(" ");
  // Each line sits in its lane and is pushed out around the knot by a smooth bump, less the farther it is.
  const grain = [1, 2, 3].flatMap((j) =>
    [-1, 1].map((side) => {
      const lane = 0.9 * r * j;
      const push = 1.1 * r * 0.75 ** (j - 1);
      const spread = r * (2.6 + 0.8 * j);
      const pts = Array.from({ length: 41 }, (_, k) => {
        const px = -half + (2 * half * k) / 40;
        const py = side * (lane + push * Math.exp(-((px / spread) ** 2)));
        return `${px.toFixed(2)},${py.toFixed(2)}`;
      });
      return { key: `${j}${side}`, points: pts.join(" ") };
    }),
  );
  return (
    <g transform={`translate(${x} ${y}) rotate(${across})`}>
      <defs>
        <linearGradient id={fade} gradientUnits="userSpaceOnUse" x1={-half} x2={half} y1={0} y2={0}>
          <stop offset="0" stopColor={KNOT_GRAIN} stopOpacity={0} />
          <stop offset="0.3" stopColor={KNOT_GRAIN} stopOpacity={0.85} />
          <stop offset="0.7" stopColor={KNOT_GRAIN} stopOpacity={0.85} />
          <stop offset="1" stopColor={KNOT_GRAIN} stopOpacity={0} />
        </linearGradient>
      </defs>
      {grain.map((g) => (
        <polyline
          key={g.key}
          points={g.points}
          fill="none"
          stroke={`url(#${CSS.escape(fade)})`}
          strokeWidth={1.1}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
      <polyline
        points={spiral}
        fill="none"
        stroke={SCAR}
        strokeWidth={1.1}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </g>
  );
}

function YearStat({ value, unit, label }: { value: string; unit: string; label: string }) {
  return (
    <div>
      <div className="stat-num text-xl font-semibold">
        {value}
        <span className="ml-0.5 text-sm font-normal text-muted-foreground">{unit}</span>
      </div>
      <div className="eyebrow mt-0.5">{label}</div>
    </div>
  );
}
