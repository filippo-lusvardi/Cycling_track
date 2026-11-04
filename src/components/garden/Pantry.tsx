// The pantry: where the garden's harvests go once they've grown their 8 weeks. A wall of wooden shelves from edge to
// edge of the window, a year's shelves (newest at the top) with a jam jar per month, filled as high as that month's
// hours off the bike, in layers coloured by crop; a month without any is an empty jar, waiting. Cupboard doors fill
// the wall below the shelves down to the window's foot. It reads like the tree's rings: a quiet, dense history to
// glance down. Sheets of paper nailed to the top board say which colour is which sport (see PantryNotes).
import { useEffect } from "react";
import {
  allSports,
  CROP_COLOR,
  cropFor,
  type CropMap,
  type Jar,
  type Shelf,
  type Sport,
} from "@/lib/garden";
import { format, t } from "@/lib/i18n";
import { formatDuration } from "@/lib/training";
import { rng, seedOf } from "@/lib/tree";
import { PantryNotes, pantryNotes } from "./PantryNotes";
import { mainSport } from "@/lib/sport";

const mix = (a: string, pa: number, b: string) =>
  `color-mix(in oklab, ${a} ${Math.round(Math.min(100, Math.max(0, pa)))}%, ${b})`;

const WOOD = mix("var(--bark)", 70, "var(--scene-background)");
const WOOD_LIGHT = mix("var(--bark)", 85, "var(--birch)");
const GLASS = mix("var(--snow)", 22, "var(--scene-background)");
/** Cloth covers on the lids, one colour per jar (stable by month). */
const CLOTHS = ["var(--lingon)", "var(--fitness)", "var(--birch)", "var(--pine)", "var(--blossom)"];

/** A month's jar, drawn `w` wide with its foot at (x, y); `fill` 0 → 1 of its height. */
function JarShape({
  map,
  jar,
  month,
  x,
  y,
  w,
  fill,
}: {
  map: CropMap;
  jar: Jar | null;
  month: string;
  x: number;
  y: number;
  w: number;
  fill: number;
}) {
  const h = w * 1.45;
  const neck = w * 0.78;
  const top = y - h;
  const id = `jar${month.replace("-", "")}`;
  // The glass: a rounded body narrowing a little to its neck.
  const body = `M${x - w / 2 + 2},${y} Q${x - w / 2},${y} ${x - w / 2},${y - 3} L${x - w / 2},${top + h * 0.28} Q${x - w / 2},${top + h * 0.14} ${x - neck / 2},${top + h * 0.1} L${x + neck / 2},${top + h * 0.1} Q${x + w / 2},${top + h * 0.14} ${x + w / 2},${top + h * 0.28} L${x + w / 2},${y - 3} Q${x + w / 2},${y} ${x + w / 2 - 2},${y} Z`;
  const inner = top + h * 0.16;
  const room = y - 2 - inner;
  // Layers from the bottom up, in the garden's order, each as thick as its share of the month.
  let level = y - 2;
  const layers = jar
    ? allSports(map, mainSport()).flatMap((c) => {
        const m = jar.bySport[c];
        if (!m) return [];
        const th = (m / jar.minutes) * room * fill;
        level -= th;
        return [{ c, y: level, h: th }];
      })
    : [];
  const r = rng(seedOf(month));
  const cloth = CLOTHS[Math.floor(r() * CLOTHS.length)]!;
  return (
    <g opacity={jar ? 1 : 0.35}>
      <defs>
        <clipPath id={id}>
          <path d={body} />
        </clipPath>
      </defs>
      <path d={body} fill={GLASS} />
      <g clipPath={`url(#${id})`}>
        {layers.map((l) => (
          <rect
            key={l.c}
            x={x - w / 2}
            y={l.y}
            width={w}
            height={l.h + 0.6}
            fill={CROP_COLOR[cropFor(map, l.c)]}
            opacity={0.88}
          />
        ))}
        {/* The top of the preserve, not ruled flat. */}
        {layers.length > 0 && (
          <path
            d={`M${x - w / 2},${level + 0.6} q${w * 0.25},-1.4 ${w * 0.5},0 t${w * 0.5},0 V${level + 2} H${x - w / 2} Z`}
            fill={CROP_COLOR[cropFor(map, layers.at(-1)!.c)]}
            opacity={0.88}
          />
        )}
      </g>
      {/* Glass: a highlight down one side and the rim. */}
      <path
        d={`M${x - w / 2 + 2.6},${y - 4} L${x - w / 2 + 2.6},${top + h * 0.3}`}
        stroke="var(--snow)"
        strokeWidth={1.2}
        strokeLinecap="round"
        opacity={0.35}
      />
      <path
        d={body}
        fill="none"
        stroke={mix("var(--snow)", 40, "var(--scene-background)")}
        strokeWidth={0.7}
      />
      {jar && (
        <>
          {/* A cloth cover over the lid, tied with string. */}
          <path
            d={`M${x - neck / 2 - 2.5},${top + h * 0.13} Q${x - neck / 2 - 1},${top - 1} ${x},${top - 1.6} Q${x + neck / 2 + 1},${top - 1} ${x + neck / 2 + 2.5},${top + h * 0.13} L${x + neck / 2 + 1},${top + h * 0.17} L${x - neck / 2 - 1},${top + h * 0.17} Z`}
            fill={mix(cloth, 70, "var(--scene-background)")}
          />
          <line
            x1={x - neck / 2 - 0.6}
            y1={top + h * 0.12}
            x2={x + neck / 2 + 0.6}
            y2={top + h * 0.12}
            stroke={WOOD_LIGHT}
            strokeWidth={0.8}
          />
        </>
      )}
    </g>
  );
}

/** The board along the top of the wall, as thick as a shelf with its shadow: what the legend is nailed to. */
const TOP_BOARD = 15;

const MONTHS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0"));

/** The doors under the shelves, from `y` down past `H`, as many as fit the width. */
function Doors({ W, y, H }: { W: number; y: number; H: number }) {
  const n = Math.max(2, Math.round(W / 170));
  const dw = W / n;
  const line = mix("var(--bark)", 25, "var(--scene-background)");
  return (
    <g>
      <rect
        x={0}
        y={y}
        width={W}
        height={H - y}
        fill={mix("var(--bark)", 45, "var(--scene-background)")}
      />
      {Array.from({ length: n }, (_, i) => (
        <g key={i}>
          <rect
            x={i * dw + 10}
            y={y + 14}
            width={dw - 20}
            height={Math.max(0, H - y + 20)}
            rx={3}
            fill="none"
            stroke={line}
            strokeWidth={1.5}
          />
          <circle
            cx={i % 2 ? i * dw + 20 : (i + 1) * dw - 20}
            cy={y + 44}
            r={3}
            fill={WOOD_LIGHT}
          />
        </g>
      ))}
      <rect x={0} y={y - 2} width={W} height={7} fill={WOOD_LIGHT} />
      <rect x={0} y={y + 5} width={W} height={3} fill={WOOD} />
    </g>
  );
}

/**
 * The shelves, `w` units wide (360 on a phone): a year in `shelves` (newest first) takes one shelf of twelve places,
 * or two of six where twelve would be too small to read. `today` (YYYY-MM-DD) leaves the months still to come empty,
 * with no jar at all. Given `h`, the wall fills that height, the doors below the shelves taking what's left; the
 * lowest `foot` units are left clear of shelves, for what floats over the wall's end. `sports` are the ones the
 * legend's sheets name.
 */
export function Pantry({
  map,
  sports = [],
  shelves,
  today,
  w: W = 360,
  h = 0,
  foot = 0,
  onJar,
  onHorizon,
}: {
  sports?: Sport[];
  shelves: Shelf[];
  today: string;
  w?: number;
  h?: number;
  foot?: number;
  onJar?: (jar: Jar) => void;
  /** Tells the sky behind that the wall starts at the top (0). */
  onHorizon?: (y: number) => void;
  /** Which crop grows for which sport: the jars' layers take its colour. */
  map: CropMap;
}) {
  useEffect(() => onHorizon?.(0), [onHorizon]);
  const cols = W <= 480 ? 6 : 12;
  const span = Math.min(W - 24, 760);
  const left = (W - span) / 2;
  const slot = span / cols;
  const jarW = Math.min(44, slot * 0.78);
  const jarH = jarW * 1.45;
  const BOARD = 12;
  const YEAR = 18;
  const all = shelves.flatMap((s) => s.jars);
  const most = Math.max(60, ...all.map((j) => j.minutes));
  const thisMonth = today.slice(0, 7);
  // Nothing before the first harvest: the pantry starts when the garden did.
  const firstMonth = all.reduce((m, j) => (j.month < m ? j.month : m), thisMonth);
  const shown = (year: number, m: string) => {
    const month = `${year}-${m}`;
    return month <= thisMonth && month >= firstMonth;
  };
  // Each year's shelves, leaving out any with no month to show.
  const rows = shelves.flatMap((shelf) =>
    Array.from({ length: 12 / cols }, (_, i) => MONTHS.slice(i * cols, (i + 1) * cols))
      .filter((ms) => ms.some((m) => shown(shelf.year, m)))
      .map((months, i) => ({ shelf, months, first: i === 0 })),
  );
  // The sheets hang above the first jars, the wall growing to hold them by no more than it must; one that reaches
  // over the year's place hangs clear of it too.
  const notes = pantryNotes(map, sports, Math.min(span - 8, 640));
  const overYear = notes.width > span - 48;
  const TOP = Math.max(
    TOP_BOARD + 4,
    notes.sheets.length ? notes.bottom + 6 - YEAR - 17 + (overYear ? 16 : 0) : 0,
  );
  const rowH = jarH + BOARD + 22;
  const base = rows.length * rowH + shelves.length * YEAR;
  // With room to spare the shelves stand a little further apart, up to a point; the doors take the rest.
  const room = Math.max(0, h - foot - TOP - base - 40);
  const gap = rows.length ? Math.min(20, room / rows.length) : 0;
  const shelvesEnd = shelves.length ? TOP + base + rows.length * gap + 18 : TOP + rowH + 18;
  const H = Math.max(h, shelvesEnd + foot + 24);
  let y = TOP;
  const placed = rows.map((row) => {
    if (row.first) y += YEAR;
    y += rowH + gap;
    return { ...row, y: y - BOARD - 3 };
  });
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="block h-auto w-full"
      role="group"
      aria-label={t("Pantry", "Dispensa")}
    >
      {/* The wall: dark planks, under a cornice. */}
      <rect width={W} height={H} fill={mix("var(--bark)", 35, "var(--scene-background)")} />
      {Array.from({ length: Math.ceil(W / 46) }, (_, i) => (
        <line
          key={i}
          x1={i * 46 + 23}
          y1={0}
          x2={i * 46 + 23}
          y2={H}
          stroke={mix("var(--bark)", 25, "var(--scene-background)")}
          strokeWidth={1}
        />
      ))}
      <rect width={W} height={TOP_BOARD - 3} fill={WOOD_LIGHT} />
      <rect y={TOP_BOARD - 3} width={W} height={3} fill={WOOD} />
      {shelves.length === 0 && (
        <text
          x={W / 2}
          y={TOP + rowH / 2}
          textAnchor="middle"
          fontSize={11}
          fill="var(--muted-foreground)"
        >
          {t(
            "Harvests come here after 8 weeks in the garden",
            "I raccolti arrivano qui dopo 8 settimane nell'orto",
          )}
        </text>
      )}
      {placed.map(({ shelf, months, first, y: by }) => {
        const byMonth = new Map(shelf.jars.map((j) => [j.month.slice(5), j]));
        return (
          <g key={`${shelf.year}${months[0]}`}>
            {first && (
              <text
                x={left + 4}
                y={by - jarH - 15}
                fontSize={11}
                letterSpacing="0.12em"
                fontWeight={600}
                fill={mix("var(--birch)", 70, "var(--scene-background)")}
              >
                {shelf.year}
              </text>
            )}
            {/* The shelf board first: the jars stand on it. The month is carved into its front edge. */}
            <rect x={0} y={by} width={W} height={BOARD} fill={WOOD_LIGHT} />
            <rect x={0} y={by + BOARD} width={W} height={3} fill={WOOD} />
            {months.map((m, c) => {
              if (!shown(shelf.year, m)) return null;
              const k = Number(m) - 1;
              const month = `${shelf.year}-${m}`;
              const jar = byMonth.get(m) ?? null;
              const x = left + slot * (c + 0.5);
              const date = new Date(shelf.year, k, 1);
              const label = jar
                ? `${format(date, "MMMM yyyy")}: ${formatDuration(jar.minutes * 60)}`
                : format(date, "MMMM yyyy");
              const art = (
                <>
                  <JarShape
                    map={map}
                    jar={jar}
                    month={month}
                    x={x}
                    y={by}
                    w={jarW}
                    fill={jar ? Math.max(0.12, Math.sqrt(jar.minutes / most)) : 0}
                  />
                  <text
                    x={x}
                    y={by + 9}
                    textAnchor="middle"
                    fontSize={cols === 6 ? 8 : 7}
                    fontWeight={600}
                    fill={mix("var(--bark)", 60, "black")}
                    opacity={jar ? 1 : 0.6}
                  >
                    {format(date, "MMM")}
                  </text>
                </>
              );
              return jar && onJar ? (
                <g
                  key={m}
                  role="button"
                  tabIndex={0}
                  aria-label={label}
                  className="cursor-pointer outline-none [&:focus-visible]:opacity-80 [&:hover]:opacity-90"
                  onClick={() => onJar(jar)}
                  onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onJar(jar)}
                >
                  {art}
                  <rect
                    x={x - slot / 2}
                    y={by - jarH - 8}
                    width={slot}
                    height={jarH + 8 + BOARD}
                    fill="transparent"
                  />
                </g>
              ) : (
                <g key={m} aria-label={label}>
                  {art}
                </g>
              );
            })}
          </g>
        );
      })}
      <Doors W={W} y={shelvesEnd} H={H} />
      <PantryNotes map={map} sheets={notes.sheets} right={left + span - 4} />
    </svg>
  );
}
