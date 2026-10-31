import { useNavigate } from "@tanstack/react-router";
import { format, parseISO } from "date-fns";
import type { ReactNode } from "react";
import type { PlannedEvent } from "@/lib/intervals";
import { formatDuration } from "@/lib/training";
import {
  rng,
  SEASON_COLOR,
  seedOf,
  WEATHER_WORD,
  type Crown as CrownState,
  type TreeYear,
  type Weather,
} from "@/lib/tree";

const H = 262;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** Day of the year each month starts on (non-leap; a day's drift doesn't show at this scale). */
const MONTH_STARTS = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];

const SEASON_NAME = { summer: "Summer", spring: "Spring", autumn: "Autumn", winter: "Winter" };

/** Today: the crown's season is readiness; the sky beside it is form. */
export function CrownView({
  crown,
  today,
  trunk,
  w,
  onOpen,
}: {
  crown: CrownState;
  today: string;
  trunk: number;
  w: number;
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
  if (crown.season === "summer") {
    for (let i = 0; i < crown.leaves; i++)
      canopy.push(
        <circle
          key={i}
          {...blob([8, 15])}
          fill={`color-mix(in oklab, var(--summer) ${60 + Math.round(r() * 40)}%, black)`}
          opacity={0.75 + r() * 0.25}
        />,
      );
    for (let i = 0; i < 7; i++)
      extras.push(
        <circle key={i} {...blob([2.5, 3.5], 0.85)} fill="var(--lingon)" opacity={0.9} />,
      );
  } else if (crown.season === "spring") {
    for (let i = 0; i < crown.leaves; i++)
      canopy.push(
        <circle
          key={i}
          {...blob([6, 11])}
          fill={`color-mix(in oklab, var(--spring) ${70 + Math.round(r() * 30)}%, var(--summer))`}
          opacity={0.55 + r() * 0.3}
        />,
      );
    for (let i = 0; i < 16; i++) {
      const b = blob([2, 2.6], 1);
      const petal = r() < 0.6 ? "var(--blossom)" : "var(--snow)";
      extras.push(
        <g key={i}>
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
        </g>,
      );
    }
  } else if (crown.season === "autumn") {
    const warm = [
      "var(--autumn)",
      "var(--birch)",
      "var(--lingon)",
      "color-mix(in oklab, var(--autumn) 60%, var(--bark))",
    ];
    for (let i = 0; i < crown.leaves; i++)
      canopy.push(
        <circle
          key={i}
          {...blob([6, 12])}
          fill={warm[Math.floor(r() * warm.length)]}
          opacity={0.65 + r() * 0.3}
        />,
      );
    // A few leaves on their way down, either side of the trunk.
    for (let i = 0; i < 8; i++) {
      const x = cx + (i % 2 ? 1 : -1) * (forkW + 10 + r() * rx * 0.9);
      const y = cy + 30 + r() * (H - cy - 40);
      extras.push(
        <ellipse
          key={i}
          cx={x}
          cy={y}
          rx={4.5}
          ry={2.4}
          fill={warm[i % warm.length]}
          transform={`rotate(${r() * 180} ${x} ${y})`}
          className="tree-fall"
          style={{ animationDelay: `${-r() * 6}s` }}
        />,
      );
    }
  } else if (crown.season === "winter") {
    for (let i = 0; i < 22; i++) {
      const b = blob([1.2, 2.4], 1.15);
      extras.push(
        <circle
          key={i}
          {...b}
          fill="var(--snow)"
          opacity={0.85}
          className="tree-fall"
          style={{ animationDelay: `${-r() * 6}s` }}
        />,
      );
    }
  } else {
    // No data yet: a quiet grey crown.
    for (let i = 0; i < crown.leaves; i++)
      canopy.push(
        <circle key={i} {...blob([7, 13])} fill="var(--muted-foreground)" opacity={0.2} />,
      );
  }
  const heading = crown.season
    ? `${SEASON_NAME[crown.season]} · ${crown.advice!.toLowerCase()}`
    : "Today";

  return (
    <button
      type="button"
      onClick={onOpen}
      className="block w-full text-center focus-visible:outline-none"
      aria-label={`Today: ${heading}`}
    >
      <div className="eyebrow">{format(parseISO(today), "EEEE d MMMM")}</div>
      <div className="mt-1 text-lg font-semibold" style={{ color }}>
        {heading}
      </div>
      <div className="text-sm text-muted-foreground">
        {crown.score == null
          ? "Not enough data yet · tap to check in"
          : crown.estimated
            ? `Readiness ${crown.score} · estimated · check in to refine`
            : `Readiness ${crown.score} · tap the crown for today`}
      </div>
      {crown.ctl != null && (
        // Wraps between whole items, never inside one.
        <div className="stat-num mt-1 flex flex-wrap justify-center gap-x-3 text-sm">
          <span className="text-fitness">Fitness {Math.round(crown.ctl)}</span>
          {crown.atl != null && (
            <span className="text-fatigue">Fatigue {Math.round(crown.atl)}</span>
          )}
          {crown.form != null && (
            <span className="whitespace-nowrap text-form">
              Form {crown.form > 0 ? "+" : ""}
              {Math.round(crown.form)}
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
              x={Math.min(w - 50, cx + rx + 20)} // beside the crown, never far off on wide screens
              y={34}
              seed={seedOf(`${today}sky`)}
            />
            <Sky
              weather={crown.weather}
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
          // Snow resting on top of every limb and twig.
          wood.map((p, i) => (
            <path
              key={i}
              d={p.d}
              fill="none"
              stroke="var(--snow)"
              strokeWidth={Math.max(1.2, p.width * 0.5)}
              strokeLinecap="round"
              transform={`translate(0 ${-p.width * 0.45})`}
              opacity={0.9}
            />
          ))}
        <ellipse cx={cx} cy={fork + 4} rx={forkW / 2} ry={10} fill="var(--bark)" />
        <g className="tree-grow">
          {canopy}
          {extras}
        </g>
      </svg>
    </button>
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

/** A sun painted like the canopy: a warm disc inside soft layered halos. */
function Sun({ x, y, r }: { x: number; y: number; r: number }) {
  return (
    <g>
      {[2.6, 2, 1.5].map((k, i) => (
        <circle key={i} cx={x} cy={y} r={r * k} fill="var(--birch)" opacity={0.07 + i * 0.06} />
      ))}
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
 * Form as weather: sun when fresh, then a cloud, clouds, and rain when overreached. The `echo` on
 * the other side of the crown repeats the sky without a second sun (a pale fair-weather cloud when
 * it's sunny).
 */
function Sky({
  weather,
  x,
  y,
  seed,
  echo = false,
}: {
  weather: Weather;
  x: number;
  y: number;
  seed: number;
  echo?: boolean;
}) {
  const r = rng(seed + 0.5);
  return (
    <g>
      {weather === "sun" &&
        (echo ? (
          <g className="tree-drift" opacity={0.6}>
            <Cloud x={x} y={y + 6} s={0.6} tone={95} seed={seed} />
          </g>
        ) : (
          <Sun x={x} y={y} r={13} />
        ))}
      {weather === "partly" && (
        <>
          {!echo && <Sun x={x + 8} y={y - 6} r={11} />}
          <g className="tree-drift">
            <Cloud x={x - 6} y={y + 12} s={0.9} tone={80} seed={seed} />
          </g>
        </>
      )}
      {weather === "clouds" && (
        <g className="tree-drift">
          <Cloud x={x + 10} y={y - 2} s={0.75} tone={60} seed={seed + 0.1} />
          <Cloud x={x - 6} y={y + 12} s={1} tone={80} seed={seed} />
        </g>
      )}
      {weather === "rain" && (
        <>
          {Array.from({ length: 10 }, (_, i) => {
            const [dx, dy] = [x - 24 + i * 5 + r() * 3, y + 20 + r() * 22];
            return (
              <ellipse
                key={i}
                cx={dx}
                cy={dy}
                rx={1.3}
                ry={3.6}
                fill="var(--fitness)"
                opacity={0.55 + r() * 0.3}
                transform={`rotate(12 ${dx} ${dy})`}
                className="tree-fall"
                style={{ animationDelay: `${-r() * 6}s` }}
              />
            );
          })}
          <g className="tree-drift">
            <Cloud x={x} y={y + 8} s={1.05} tone={50} seed={seed} />
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
    const arcs = y.weekLoads.map((l, k) => {
      const [a0, a1] = [
        (k / 53) * Math.PI * 2 - Math.PI / 2,
        ((k + 1) / 53) * Math.PI * 2 - Math.PI / 2,
      ];
      return (
        <path
          key={k}
          d={`M${pt(mid, a0)} A${mid},${mid} 0 0 1 ${pt(mid, a1)}`}
          fill="none"
          stroke="color-mix(in oklab, var(--bark) 45%, black)"
          strokeWidth={width * 0.9}
          opacity={0.05 + 0.9 * (l / maxWeek)}
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
          aria-label={`Open ${MONTHS[m]} ${y.year} in the calendar`}
          className="cursor-pointer fill-transparent outline-none transition-colors hover:fill-birch/25 focus-visible:fill-birch/35 active:fill-birch/45"
          onClick={go}
          onKeyDown={(e) => e.key === "Enter" && go()}
        />
      );
    });
    const ring = (
      <g key={y.year}>
        {arcs}
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
        <circle cx={c} cy={c} r={wood} fill="color-mix(in oklab, var(--bark) 80%, var(--birch))" />
        <circle cx={c} cy={c} r={wood} fill="none" stroke="var(--bark)" strokeWidth={8} />
        <circle cx={c} cy={c} r={5} fill="var(--bark)" />
        <g aria-hidden>{months}</g>
        {rings}
      </svg>
      <p className="mx-auto max-w-sm text-center text-sm text-muted-foreground">
        Inner rings are older years. A wide ring is a big year; dark grain is a heavy week, read
        clockwise from January at the top. Tap a month to open it in the calendar.
      </p>
      <div className="mx-auto max-w-sm space-y-3">
        {[...years].reverse().map((y) => (
          <section key={y.year} className="rounded-xl border border-border bg-card p-4">
            <h2 className="text-lg font-semibold">{y.year}</h2>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <YearStat
                value={Math.round(y.distance / 1000).toLocaleString()}
                unit="km"
                label="Distance"
              />
              <YearStat value={Math.round(y.climb).toLocaleString()} unit="m" label="Climbed" />
              <YearStat value={Math.round(y.minutes / 60).toLocaleString()} unit="h" label="Time" />
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              {y.count} activities · load {Math.round(y.load).toLocaleString()}
            </p>
          </section>
        ))}
      </div>
    </div>
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
