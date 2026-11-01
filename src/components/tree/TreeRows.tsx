// One horizontal slice of the tree per day (or week). Every slice is a full-width button, so a tap
// never has to hit a twig. Drawing stays inside each slice, so off-screen slices can skip painting.
import { parseISO } from "date-fns";
import { useId, type CSSProperties, type ReactNode } from "react";
import { dayHeight, LANE, MONTH_H, REST_STEP, restHeight, WEEK_H } from "./geometry";
import { KINDS, type Kind } from "@/lib/activity-kind";
import type { OffKind } from "@/lib/intervals";
import { FOCUS_LABEL, type Focus } from "@/lib/races";
import { formatDuration } from "@/lib/training";
import {
  leafSpots,
  LEVEL_COLOR,
  perchSpots,
  rng,
  type Chapter,
  type TreeBranch,
  type TrunkEdge,
  type TreeDay,
  type TreeWeek,
  weekRange,
} from "@/lib/tree";
import { format, t } from "@/lib/i18n";

const slice = (h: number): CSSProperties => ({
  height: h,
  contentVisibility: "auto",
  containIntrinsicSize: `auto ${h}px`,
});

function Slice({
  h,
  label,
  onOpen,
  children,
}: {
  h: number;
  label: string;
  onOpen: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={label}
      className="block w-full rounded-lg transition-colors hover:bg-secondary/30 focus-visible:bg-secondary/40 focus-visible:outline-none"
      style={slice(h)}
    >
      {children}
    </button>
  );
}

const barkFill = (tint: string | undefined) =>
  tint ? `color-mix(in oklab, var(--bark) 72%, ${tint})` : "var(--bark)";

/**
 * One piece of trunk. Its edges are Hermite curves that leave and arrive with the slopes shared with
 * the neighbouring pieces, so the whole trunk reads as one smooth outline; a different tint below
 * fades in down the piece instead of changing at the seam.
 */
export function Bark({
  cx,
  edge,
  tint,
  tintBelow = tint,
}: {
  cx: number;
  edge: TrunkEdge;
  tint?: string | undefined;
  tintBelow?: string | undefined;
}) {
  const id = useId();
  const { h, top, bottom, slopeTop, slopeBottom } = edge;
  // x of the start, both controls and the end of one edge; `inset` moves it inward, `scale` toward the middle.
  const side = (sgn: 1 | -1, inset = 0, scale = 1) => {
    const x0 = cx + sgn * ((top * scale) / 2 - inset);
    const x3 = cx + sgn * ((bottom * scale) / 2 - inset);
    return [
      x0,
      x0 + (sgn * slopeTop * scale * h) / 6,
      x3 - (sgn * slopeBottom * scale * h) / 6,
      x3,
    ] as const;
  };
  const down = ([x0, c1, c2, x3]: readonly number[]) =>
    `M${x0},0 C${c1},${h / 3} ${c2},${(2 * h) / 3} ${x3},${h}`;
  const [l0, l1, l2, l3] = side(-1);
  const [r0, r1, r2, r3] = side(1);
  const fade = tint !== tintBelow;
  return (
    <>
      {fade && (
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="40%" stopColor={barkFill(tint)} />
            <stop offset="100%" stopColor={barkFill(tintBelow)} />
          </linearGradient>
        </defs>
      )}
      <path
        d={`M${l0},0 L${r0},0 C${r1},${h / 3} ${r2},${(2 * h) / 3} ${r3},${h} L${l3},${h} C${l2},${(2 * h) / 3} ${l1},${h / 3} ${l0},0 Z`}
        fill={fade ? `url(#${CSS.escape(id)})` : barkFill(tint)}
      />
      <path
        d={down(side(-1, 0, 0.24))}
        fill="none"
        stroke="var(--background)"
        strokeOpacity={0.18}
      />
      {/* Shaded left edge and lit right edge give the trunk volume, so its width reads at a glance. */}
      <path d={down(side(-1, 1))} fill="none" stroke="black" strokeOpacity={0.35} strokeWidth={2} />
      <path
        d={down(side(1, 1))}
        fill="none"
        stroke="var(--birch)"
        strokeOpacity={0.3}
        strokeWidth={1.5}
      />
    </>
  );
}

/** Ill or injured: a knot in the bark, a small brown elliptical spiral. */
function Knot({
  cx,
  trunk,
  y,
  side,
  room,
}: {
  cx: number;
  trunk: number;
  y: number;
  side: -1 | 1;
  /** Height available in px, so the knot never spills out of its row. */
  room: number;
}) {
  const r = Math.max(3, Math.min(7, trunk * 0.22));
  // Taller than wide, like a knot stretched by the grain.
  const stretch = Math.max(1, Math.min(1.7, (room / 2 - 1) / r));
  const x = cx + side * Math.max(0, trunk / 2 - r * 1.8);
  // Two turns outward from the centre.
  const points = Array.from({ length: 41 }, (_, i) => {
    const a = (i / 40) * 4 * Math.PI;
    const d = (r * i) / 40;
    return `${(x + Math.cos(a) * d).toFixed(1)},${(y + Math.sin(a) * d * stretch).toFixed(1)}`;
  }).join(" ");
  return (
    <polyline
      points={points}
      fill="none"
      stroke="color-mix(in oklab, var(--bark) 75%, black)"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
}

/** Consecutive off days in a rest run as [first index, length]: one knot each, not one per day. */
function offRuns(days: TreeDay[]): [number, number][] {
  const runs: [number, number][] = [];
  days.forEach((d, i) => {
    if (!d.off) return;
    const prev = runs[runs.length - 1];
    if (prev && prev[0] + prev[1] === i) prev[1]++;
    else runs.push([i, 1]);
  });
  return runs;
}

/** "3 days sick", for labels. */
function offWord(n: number, kind: OffKind): string {
  return kind === "SICK"
    ? n === 1 ? t("sick", "malato") : t(`${n} days sick`, `${n} giorni malato`)
    : n === 1 ? t("injured", "infortunato") : t(`${n} days injured`, `${n} giorni infortunato`);
}

/** Leaf colour: the activity's intensity, or a muted kind colour when there's no power data. */
const leafColor = (b: TreeBranch) =>
  b.intensity
    ? LEVEL_COLOR[b.intensity - 1]!
    : `color-mix(in oklab, ${KINDS[b.kind].color} 55%, var(--muted-foreground))`;

/** Leaves spread over the outer part of a curve, alternating sides; one per 100 m climbed. */
function Leaves({
  b,
  at,
  from,
  size,
}: {
  b: TreeBranch;
  at: (t: number) => readonly [number, number];
  from: number;
  size: number;
}) {
  const r = rng(b.seed);
  const fill = leafColor(b);
  return (
    <>
      {leafSpots(b.leaves, from).map((t, i) => {
        const [x, y] = at(t);
        const off = (i % 2 ? 1 : -1) * (2 + r() * size);
        return (
          <ellipse
            key={i}
            cx={x}
            cy={y + off}
            rx={size}
            ry={size * 0.53}
            fill={fill}
            opacity={0.75 + r() * 0.2}
            transform={`rotate(${b.side * (20 + r() * 50) * (off > 0 ? 1 : -1)} ${x} ${y + off})`}
          />
        );
      })}
    </>
  );
}

/** Most birds drawn on one branch; more would hide it. */
const MAX_BIRDS = 8;

/**
 * A small sparrow perched facing outward, its feet at (x, y). Drawn facing right in a unit box (feet at the origin,
 * about 16 × 10) and mirrored for the left side.
 */
function Bird({ x, y, side, s = 1 }: { x: number; y: number; side: -1 | 1; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${side * s} ${s})`}>
      <path d="M0.4,-0.9 L0.2,0 M1.7,-0.9 L1.6,0" stroke="var(--birch)" strokeWidth={0.7} strokeLinecap="round" />
      {/* Tail, back, head, breast and belly as one outline. */}
      <path
        d="M-6.6,-2.3 L-7.1,-4 L-3.4,-4.6 C-2.2,-7.6 1.4,-8.4 3,-7.6 C3.3,-9.8 6.8,-10 7.2,-7.5 C7.4,-6.3 6.6,-5.4 5.6,-5 C5.4,-2.4 3.2,-0.8 0.7,-0.8 C-1.4,-0.7 -2.8,-1.7 -3.5,-2.7 Z"
        fill={BIRD}
      />
      <ellipse cx={2.6} cy={-2.8} rx={2.5} ry={1.6} fill={BIRD_BELLY} />
      <path d="M-2.8,-3.7 C-1,-6.6 2.4,-6.5 3.3,-4.5 C1.7,-3.4 -0.6,-3 -2.8,-3.7 Z" fill={BIRD_WING} />
      <path d="M7.1,-7.4 L9,-6.8 L7,-6.3 Z" fill="var(--birch)" />
      <circle cx={5.7} cy={-7.7} r={0.6} fill="var(--background)" />
    </g>
  );
}

/** Size of a bird on a daily branch with room to spare (the drawing is about 16 units wide). */
const BIRD_SCALE = 1.4;

/** One bird per brioche, on free stretches of the branch (clear of the leaves on top), sitting on it. */
function Birds({
  b,
  at,
  length,
  from,
}: {
  b: TreeBranch;
  at: (t: number) => readonly [number, number];
  length: number;
  from: number;
}) {
  const n = Math.min(b.brioches, MAX_BIRDS);
  // On a short branch (a phone, a short ride) birds shrink a little so they fit side by side, down to 2/3 size.
  const scale = Math.max(BIRD_SCALE * 0.65, Math.min(BIRD_SCALE, (length * 0.8) / (n * 16 * 1.1)));
  const spots = perchSpots(n, b.leaves, from, length, 16 * scale);
  return (
    <>
      {spots.map((t, i) => {
        const [x, y] = at(t);
        return <Bird key={i} x={x} y={y - b.thickness / 2} side={b.side} s={scale} />;
      })}
    </>
  );
}

const quad =
  (x0: number, y0: number, qx: number, qy: number, x1: number, y1: number) => (t: number) =>
    [
      (1 - t) ** 2 * x0 + 2 * (1 - t) * t * qx + t * t * x1,
      (1 - t) ** 2 * y0 + 2 * (1 - t) * t * qy + t * t * y1,
    ] as const;

function Branch({ b, cx, trunk, y0 }: { b: TreeBranch; cx: number; trunk: number; y0: number }) {
  const reach = Math.max(18, Math.min(cx - trunk / 2 - 14, 200) * b.length);
  const rise = Math.min(y0 - 10, reach * (0.2 + b.seed * 0.2));
  const x0 = cx + b.side * (trunk / 2 - 1);
  const [qx, qy] = [x0 + b.side * reach * 0.55, y0 - rise * 0.1];
  const [x1, y1] = [x0 + b.side * reach, y0 - rise];
  return (
    <g>
      <path
        d={`M${x0},${y0} Q${qx},${qy} ${x1},${y1}`}
        fill="none"
        stroke={YOUNG_WOOD}
        strokeWidth={b.thickness}
        strokeLinecap="round"
      />
      <Leaves b={b} at={quad(x0, y0, qx, qy, x1, y1)} from={0.4} size={4.2} />
      <Birds b={b} at={quad(x0, y0, qx, qy, x1, y1)} length={Math.hypot(x1 - x0, y1 - y0)} from={0.4} />
      {/* Not a ride: a bud at the tip in the activity's colour. Rides are plain wood. */}
      {!RIDES.has(b.kind) && (
        <circle cx={x1} cy={y1} r={Math.max(2.4, b.thickness * 0.55)} fill={KINDS[b.kind].color} />
      )}
    </g>
  );
}

/** Text on the side opposite the branch, so labels and leaves never collide. */
function Label({
  cx,
  trunk,
  side,
  y,
  title,
  sub,
}: {
  cx: number;
  trunk: number;
  side: -1 | 1;
  y: number;
  title: string;
  sub: string;
}) {
  const x = cx - side * (trunk / 2 + 10);
  const room = Math.floor((cx - trunk / 2 - 18) / 7.4);
  const t = title.length > room ? `${title.slice(0, Math.max(4, room - 1))}…` : title;
  // The second line is monospace: drop its least important trailing parts until it fits.
  const parts = sub.split(" · ");
  while (parts.length > 1 && parts.join(" · ").length * 6.8 > cx - trunk / 2 - 14) parts.pop();
  const anchor = side > 0 ? "end" : "start";
  return (
    <>
      <text x={x} y={y - 4} textAnchor={anchor} fontSize={13} fill="var(--foreground)">
        {t}
      </text>
      <text
        x={x}
        y={y + 11}
        textAnchor={anchor}
        fontSize={11}
        fill="var(--muted-foreground)"
        className="stat-num"
      >
        {parts.join(" · ")}
      </text>
    </>
  );
}

export function DayRow({
  day,
  edge,
  w,
  quiet,
  onOpen,
}: {
  day: TreeDay;
  edge: TrunkEdge;
  w: number;
  /** Quiet tree: no load numbers. */
  quiet: boolean;
  onOpen: () => void;
}) {
  const cx = w / 2;
  const h = dayHeight(day.branches.length);
  const date = format(parseISO(day.date), "EEE d");
  return (
    <Slice
      h={h}
      label={`${format(parseISO(day.date), "EEEE d MMMM")}: ${day.branches.map((b) => b.name).join(", ")}`}
      onOpen={onOpen}
    >
      <svg className="block" width={w} height={h} aria-hidden>
        <Bark cx={cx} edge={edge} />
        {day.off && <Knot cx={cx} trunk={day.trunk} y={h / 2} side={day.budSide} room={h} />}
        {day.branches.map((b, i) => {
          const y0 = LANE * (day.branches.length - i) - 8; // later rides sit higher
          const parts = [
            date,
            formatDuration(b.minutes * 60),
            b.climb >= 50 ? `${Math.round(b.climb)} m` : null,
            b.load && !quiet ? String(Math.round(b.load)) : null,
          ];
          return (
            <g key={b.id}>
              <Branch b={b} cx={cx} trunk={day.trunk} y0={y0} />
              <Label
                cx={cx}
                trunk={day.trunk}
                side={b.side}
                y={y0 - 14}
                title={b.name}
                sub={parts.filter(Boolean).join(" · ")}
              />
            </g>
          );
        })}
      </svg>
    </Slice>
  );
}

/** A run of consecutive rest days: bare bark with a bud per day. */
export function RestRow({
  days,
  edge,
  w,
  onOpen,
}: {
  days: TreeDay[];
  edge: TrunkEdge;
  w: number;
  onOpen: () => void;
}) {
  const cx = w / 2;
  const h = restHeight(days.length);
  const first = days[days.length - 1]!.date;
  const last = days[0]!.date;
  const off = days.every((d) => d.off) ? days[0]!.off : null;
  const label = off
    ? `${format(parseISO(first), "d MMM")}${days.length > 1 ? `–${format(parseISO(last), "d MMM")}` : ""}: ${offWord(days.length, off)}`
    : days.length === 1
      ? `${format(parseISO(last), "EEEE d MMMM")}: ${t("rest", "riposo")}`
      : t(
          `${days.length} rest days, ${format(parseISO(first), "d MMM")} to ${format(parseISO(last), "d MMM")}`,
          `${days.length} giorni di riposo, dal ${format(parseISO(first), "d MMM")} al ${format(parseISO(last), "d MMM")}`,
        );
  return (
    <Slice h={h} label={label} onOpen={onOpen}>
      <svg className="block" width={w} height={h} aria-hidden>
        <Bark cx={cx} edge={edge} />
        {offRuns(days).map(([i, n]) => (
          <Knot
            key={days[i]!.date}
            cx={cx}
            trunk={days[i]!.trunk}
            y={5 + (i + n / 2) * REST_STEP}
            side={days[i]!.budSide}
            room={n * REST_STEP + 8}
          />
        ))}
        {days.map((d, i) =>
          d.off ? null : (
            <circle
              key={d.date}
              cx={cx + d.budSide * (d.trunk / 2 + 2.5)}
              cy={5 + i * REST_STEP + REST_STEP / 2}
              r={2.6}
              fill="var(--pine)"
              opacity={0.7}
            />
          ),
        )}
      </svg>
    </Slice>
  );
}

/** Month boundary: a faint ring in the bark and the month name. */
export function MonthRow({
  month,
  edge,
  w,
  ctl,
  chapter,
  fadeFrom = chapter,
}: {
  month: string;
  edge: TrunkEdge;
  w: number;
  /** Chapter of the week below, so the bark keeps its colour across the month mark. */
  chapter?: Chapter | undefined;
  /** Chapter of the bark above, when it differs (the recent days are plain bark). */
  fadeFrom?: Chapter | undefined;
  /** Fitness here, written beside the trunk so its width has a number. */
  ctl?: number | null | undefined;
}) {
  const cx = w / 2;
  return (
    <div style={slice(MONTH_H)}>
      <svg className="block" width={w} height={MONTH_H} aria-hidden>
        <Bark
          cx={cx}
          edge={edge}
          tint={fadeFrom && CHAPTER_TINT[fadeFrom]}
          tintBelow={chapter && CHAPTER_TINT[chapter]}
        />
        <line
          x1={cx - (edge.top + edge.bottom) / 4}
          y1={15}
          x2={cx + (edge.top + edge.bottom) / 4}
          y2={15}
          stroke="var(--background)"
          strokeOpacity={0.3}
          strokeWidth={1.5}
        />
        <text x={8} y={20} fontSize={11} letterSpacing="0.14em" fill="var(--muted-foreground)">
          {month.toUpperCase()}
        </text>
        {ctl != null && (
          <text
            x={w - 8}
            y={20}
            textAnchor="end"
            fontSize={11}
            fill="var(--fitness)"
            className="stat-num"
          >
            {t("fitness", "forma")} {Math.round(ctl)}
          </text>
        )}
      </svg>
    </div>
  );
}

// Steady is plain bark, named explicitly so a fade into or out of it has two real colours.
const CHAPTER_TINT = {
  build: "var(--birch)",
  steady: "var(--bark)",
  rest: "var(--fitness)",
} as const;

/**
 * A week: one bough of older wood (trunk colour, straight) — length from the week's time, thickness
 * from its load — with a twig per activity, each carrying its own climbing leaves in its intensity.
 */
export function WeekRow({
  week,
  edge,
  w,
  quiet,
  block,
  olderChapter,
  onOpen,
}: {
  week: TreeWeek;
  edge: TrunkEdge;
  w: number;
  /** Quiet tree: no load numbers. */
  quiet: boolean;
  /** A training block started this week. */
  block?: Focus | undefined;
  /** Chapter of the week underneath, so the bark colour blends into it. */
  olderChapter: TreeWeek["chapter"] | undefined;
  onOpen: () => void;
}) {
  const cx = w / 2;
  const chapterStart = olderChapter !== week.chapter;
  const sub = [
    // First, so it's the last part dropped when the line is too long.
    block ? t(`${FOCUS_LABEL[block]} block`, `blocco ${FOCUS_LABEL[block]}`) : null,
    formatDuration(week.minutes * 60),
    week.climb >= 50 ? `${Math.round(week.climb)} m` : null,
    quiet ? null : String(Math.round(week.load)),
    chapterStart && week.chapter !== "steady"
      ? week.chapter === "build"
        ? t("building", "costruzione")
        : t("resting", "scarico")
      : null,
  ];
  return (
    <Slice
      h={WEEK_H}
      label={t(
        `Week ${weekRange(week.start, week.end)}: ${week.count} activities`,
        `Settimana ${weekRange(week.start, week.end)}: ${week.count} attività`,
      )}
      onOpen={onOpen}
    >
      <svg className="block" width={w} height={WEEK_H} aria-hidden>
        <Bark
          cx={cx}
          edge={edge}
          tint={CHAPTER_TINT[week.chapter]}
          tintBelow={olderChapter ? CHAPTER_TINT[olderChapter] : CHAPTER_TINT[week.chapter]}
        />
        {week.count > 0 && <Bough week={week} cx={cx} />}
        {week.off && <Knot cx={cx} trunk={week.trunk} y={WEEK_H * 0.4} side={week.side} room={WEEK_H * 0.8} />}
        <Label
          cx={cx}
          trunk={week.trunk}
          side={week.side}
          y={WEEK_H / 2}
          title={weekRange(week.start, week.end)}
          sub={
            week.count
              ? sub.filter(Boolean).join(" · ")
              : week.off
                ? offWord(week.off.days, week.off.kind)
                : t("rest week", "settimana di riposo")
          }
        />
      </svg>
    </Slice>
  );
}

const OLD_WOOD = "color-mix(in oklab, var(--bark) 80%, black)";
/** A sparrow: warm light brown body, darker wing, cream belly, all readable on the dark sky and on the wood. */
const BIRD = "color-mix(in oklab, var(--autumn) 55%, color-mix(in oklab, var(--foreground) 55%, var(--bark)))";
const BIRD_WING = "color-mix(in oklab, var(--bark) 55%, var(--autumn))";
const BIRD_BELLY = "color-mix(in oklab, var(--foreground) 85%, var(--birch))";
const RIDES = new Set<Kind>(["road", "gravel", "mtb", "indoor", "ebike"]);
/** This week's branches: new growth, a warmer, lighter brown than the old wood of past weeks. */
const YOUNG_WOOD = "color-mix(in oklab, var(--bark) 82%, var(--birch))";

function Bough({ week, cx }: { week: TreeWeek; cx: number }) {
  const side = week.side;
  const y0 = WEEK_H * 0.68;
  const reach = Math.max(
    24,
    Math.min(cx - week.trunk / 2 - 14, 200) * (1 - Math.exp(-week.minutes / 480)),
  );
  const x0 = cx + side * (week.trunk / 2 - 1);
  const x1 = x0 + side * reach;
  const thickness = 2 + Math.min(1, week.load / 900) * 7;
  const n = week.twigs.length;
  return (
    <g>
      <path
        d={`M${x0},${y0} L${x1},${y0 - 3}`}
        stroke={OLD_WOOD}
        strokeWidth={thickness}
        strokeLinecap="round"
      />
      {week.twigs.map((t, j) => {
        // Twigs spread along the outer part of the bough; alternate up (long) and down (short).
        const along = 0.3 + (0.65 * (j + 0.5)) / n;
        const [bx, by] = [x0 + side * reach * along, y0 - 3 * along];
        const up = j % 2 === 0;
        const len = (up ? 22 : 11) * (0.45 + 0.55 * t.length);
        const [tx, ty] = [bx + side * len * 0.6, by + (up ? -len * 0.8 : len * 0.8)];
        const at = (k: number) => [bx + (tx - bx) * k, by + (ty - by) * k] as const;
        return (
          <g key={t.id}>
            <path
              d={`M${bx},${by} L${tx},${ty}`}
              stroke={OLD_WOOD}
              strokeWidth={1.6}
              strokeLinecap="round"
            />
            <Leaves b={{ ...t, side }} at={at} from={0.2} size={3} />
            {t.brioches > 0 && <Bird x={bx + side * 4} y={by - 1} side={side} s={0.95} />}
          </g>
        );
      })}
    </g>
  );
}

/** The bottom of the tree: where the history begins. */
export function Roots({ trunk, w, since }: { trunk: number; w: number; since: string }) {
  const cx = w / 2;
  const roots = [-1, -0.45, 0.2, 0.7, 1].map((s, i) => {
    const x = cx + s * trunk * 2.2;
    return (
      <path
        key={i}
        d={`M${cx + s * trunk * 0.3},0 Q${cx + s * trunk},28 ${x},${44 + (i % 2) * 10}`}
        fill="none"
        stroke="var(--bark)"
        strokeWidth={Math.max(1.5, trunk / 5)}
        strokeLinecap="round"
        opacity={0.8}
      />
    );
  });
  return (
    <div className="pb-6 text-center">
      <svg className="block" width={w} height={60} aria-hidden>
        {roots}
      </svg>
      <div className="eyebrow">{t("Roots", "Radici")}</div>
      <div className="text-sm text-muted-foreground">
        {t("History begins", "Lo storico inizia il")} {format(parseISO(since), "d MMMM yyyy")}
      </div>
    </div>
  );
}
