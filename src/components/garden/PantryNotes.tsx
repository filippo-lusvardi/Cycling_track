// The pantry's legend: sheets of paper nailed to the top board, one to four of them so that many sports stay short
// and readable on a phone. Drawn like the rest of the app, in flat colours and soft wobbly shapes; each sport's
// colour is a smear of its own jam, and everything is seeded, so a sheet looks the same on every visit.
import { CROP_COLOR, cropFor, sportName, type CropMap, type Sport } from "@/lib/garden";
import { t } from "@/lib/i18n";
import { rng, seedOf } from "@/lib/tree";

const HAND = '"Gaegu", "Comic Sans MS", cursive';
const FONT_SIZE = 14;
const LINE = 13.5;
const ROW_GAP = 5;
const PAD_TOP = 24;
const PAD_FOOT = 12;
const PAD_LEFT = 8;
const PAD_RIGHT = 6;
const SMEAR_W = 20;
const MIN_SHEET_W = 88;
/** Where the sheets' top edge lies, over the top board. */
const SHEET_Y = 3;
/** How many names a sheet should hold before the next sheet takes over. */
const ROWS_PER_SHEET = 4;
const MAX_SHEETS = 4;
/** Names break into two lines at this many letters when one line doesn't fit. */
const WRAP = 13;
const NO_WRAP = 40;
const GAP = 2;

const mix = (a: string, pct: number, b: string) => `color-mix(in oklab, ${a} ${pct}%, ${b})`;

const PAPER = "#d5c1a0";
const INK = mix("var(--bark)", 40, "black");

/** Width of a line of Gaegu at FONT_SIZE, from the font's own metrics: only m and w are much wider than the rest. */
export const lineWidth = (s: string) => {
  const wide = s.match(/[mwMW]/g)?.length ?? 0;
  return wide * 10 + (s.length - wide) * 6.2;
};

/** A name on one line or, past `width` letters, two: the split that leaves the shorter longest line. */
export function wrapName(name: string, width: number): string[] {
  if (name.length <= width) return [name];
  const cut = (s: string) => (s.length > width ? `${s.slice(0, width - 1)}…` : s);
  const words = name.split(/\s+/);
  if (words.length < 2) return [cut(name)];
  const splits = words
    .slice(1)
    .map((_, i) => [words.slice(0, i + 1).join(" "), words.slice(i + 1).join(" ")]);
  const longest = (l: string[]) => Math.max(l[0]!.length, l[1]!.length);
  return splits.reduce((a, b) => (longest(b) < longest(a) ? b : a)).map(cut);
}

export type SheetEntry = { sport: Sport; lines: string[]; y: number };
export type Sheet = { x: number; w: number; h: number; entries: SheetEntry[] };

/**
 * Deals the names onto sheets that fit `maxW` side by side, right-aligned at 0 (so `x` is negative): as few as keep
 * each to ROWS_PER_SHEET names, on one line if there's room and on two if that's what it takes to keep those sheets;
 * only if they still can't fit are there fewer, longer ones.
 */
export function layoutSheets(items: { sport: Sport; name: string }[], maxW: number): Sheet[] {
  if (!items.length) return [];
  const build = (count: number, wrap: number) => {
    const per = Math.ceil(items.length / count);
    const sheets: Omit<Sheet, "x">[] = [];
    for (let i = 0; i < items.length; i += per) {
      let y = PAD_TOP;
      const entries = items.slice(i, i + per).map(({ sport, name }) => {
        const lines = wrapName(name, wrap);
        const entry = { sport, lines, y };
        y += lines.length * LINE + ROW_GAP;
        return entry;
      });
      const longest = Math.max(...entries.flatMap((e) => e.lines.map(lineWidth)));
      sheets.push({
        entries,
        w: Math.max(MIN_SHEET_W, PAD_LEFT + SMEAR_W + longest + PAD_RIGHT),
        h: y - ROW_GAP + PAD_FOOT,
      });
    }
    return sheets;
  };
  const width = (s: Omit<Sheet, "x">[]) => s.reduce((a, b) => a + b.w, 0) + (s.length - 1) * GAP;
  const wanted = Math.min(MAX_SHEETS, Math.ceil(items.length / ROWS_PER_SHEET));
  for (let count = wanted; count >= 1; count--) {
    for (const wrap of [NO_WRAP, WRAP]) {
      const sheets = build(count, wrap);
      if (width(sheets) > maxW && !(count === 1 && wrap === WRAP)) continue;
      let x = -width(sheets);
      return sheets.map((s) => {
        const placed = { ...s, x };
        x += s.w + GAP;
        return placed;
      });
    }
  }
  return [];
}

/** The sheets for these sports, with their total width and how far down the wall the longest one reaches. */
export function pantryNotes(map: CropMap, sports: Sport[], maxW: number) {
  const sheets = layoutSheets(
    sports.map((sport) => ({ sport, name: sportName(map, sport) })),
    maxW,
  );
  return {
    sheets,
    width: sheets[0] ? -sheets[0].x : 0,
    // A sheet's swing lowers one of its bottom corners by a few units.
    bottom: SHEET_Y + Math.max(0, ...sheets.map((s) => s.h)) + 5,
  };
}

type Point = readonly [number, number];

/** A smooth closed curve through the middles of `pts`: what gives every shape here its soft, drawn edge. */
function smooth(pts: Point[]) {
  const mid = (a: Point, b: Point) =>
    `${((a[0] + b[0]) / 2).toFixed(1)},${((a[1] + b[1]) / 2).toFixed(1)}`;
  const n = pts.length;
  return (
    `M${mid(pts[n - 1]!, pts[0]!)} ` +
    pts
      .map((p, i) => `Q${p[0].toFixed(1)},${p[1].toFixed(1)} ${mid(p, pts[(i + 1) % n]!)}`)
      .join(" ") +
    " Z"
  );
}

/** A sheet's outline: gently wavy sides, with one bottom corner folded up (`fold` units of it). */
function sheetOutline(w: number, h: number, fold: number, foldLeft: boolean, r: () => number) {
  const wave = () => (r() - 0.5) * 1.6;
  const side = (x0: number, y0: number, x1: number, y1: number): Point[] => {
    const n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0) / 22));
    return Array.from({ length: n }, (_, i) => {
      const k = i / n;
      return i === 0
        ? ([x0, y0] as const)
        : ([x0 + (x1 - x0) * k + wave(), y0 + (y1 - y0) * k + wave()] as const);
    });
  };
  return smooth([
    ...side(0, 0, w, 0),
    ...side(w, 0, w, foldLeft ? h : h - fold),
    ...(foldLeft
      ? [...side(w, h, fold, h), ...side(fold, h, 0, h - fold), ...side(0, h - fold, 0, 0)]
      : [...side(w, h - fold, w - fold, h), ...side(w - fold, h, 0, h), ...side(0, h, 0, 0)]),
  ]);
}

/** A closed lumpy shape round (cx, cy), `rx` × `ry`, turned by `turn` radians. */
function lump(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  turn: number,
  r: () => number,
  rough = 0.34,
) {
  const n = 9;
  const pts = Array.from({ length: n }, (_, i): Point => {
    const a = (i / n) * Math.PI * 2;
    const k = 1 + (r() - 0.5) * rough * 2;
    const x = Math.cos(a) * rx * k;
    const y = Math.sin(a) * ry * k;
    return [
      cx + x * Math.cos(turn) - y * Math.sin(turn),
      cy + x * Math.sin(turn) + y * Math.cos(turn),
    ];
  });
  return smooth(pts);
}

const SMEARS = ["swipe", "dab", "drip", "blot"] as const;

/** A sport's colour as it would get onto paper in a pantry: wiped, dabbed, dripped or blotted on. */
function Smear({
  color,
  x,
  y,
  seed,
  kind,
}: {
  color: string;
  x: number;
  y: number;
  seed: number;
  kind: number;
}) {
  const r = rng(seed);
  const type = SMEARS[kind % SMEARS.length]!;
  const cx = x + 8 + (r() - 0.5) * 2;
  const cy = y + (r() - 0.5) * 1.5;
  const turn = (r() - 0.5) * 0.8;
  const shapes =
    type === "swipe"
      ? [
          { rx: 8.6, ry: 2.8, dx: 0, dy: 0 },
          { rx: 4.2, ry: 3.8, dx: -3.8, dy: 0.2 },
        ]
      : type === "dab"
        ? [
            { rx: 5.2, ry: 4.4, dx: -0.5, dy: 0 },
            { rx: 2.6, ry: 2, dx: 4.6, dy: -1.8 },
          ]
        : type === "drip"
          ? [
              { rx: 6.2, ry: 3.4, dx: 0, dy: -1.2 },
              { rx: 1.6, ry: 4.2, dx: 1.5 + r() * 2, dy: 3 },
            ]
          : [{ rx: 6.4, ry: 4.8, dx: 0, dy: 0 }];
  const body = shapes.map((s) => lump(cx + s.dx, cy + s.dy, s.rx, s.ry, turn, r)).join(" ");
  const drops = Array.from({ length: 1 + Math.floor(r() * 3) }, () => ({
    x: cx + (r() < 0.5 ? -1 : 1) * (6.5 + r() * 2.5),
    y: cy + (r() - 0.5) * 8,
    s: 0.5 + r() * 0.7,
  }));
  return (
    <g>
      <path d={body} fill={mix(color, 62, "var(--bark)")} transform="translate(0.5 0.8)" />
      <path d={body} fill={color} />
      <path
        d={lump(cx - 1.5 + r() * 2, cy - 1.2, 2.3, 0.9, turn, r, 0.2)}
        fill="white"
        opacity={0.5}
      />
      {drops.map((d, i) => (
        <circle key={i} cx={d.x} cy={d.y} r={d.s} fill={color} />
      ))}
    </g>
  );
}

/** A plain round-headed nail, as a cartoon draws one: a flat head, its shadow and a glint. */
function Nail({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <ellipse
        cx={x + 0.9}
        cy={y + 1.5}
        rx={3.5}
        ry={3.1}
        fill={mix("var(--bark)", 55, "black")}
        opacity={0.5}
      />
      <circle cx={x} cy={y} r={3.3} fill={mix("var(--snow)", 38, "var(--bark)")} />
      <path
        d={`M${x - 3.3},${y} A3.3,3.3 0 0 0 ${x + 3.3},${y} A4,4 0 0 1 ${x - 3.3},${y} Z`}
        fill={mix("var(--bark)", 60, "black")}
        opacity={0.55}
      />
      <path
        d={`M${x - 1.9},${y - 0.5} A2,2 0 0 1 ${x - 0.3},${y - 2}`}
        fill="none"
        stroke="var(--snow)"
        strokeWidth={0.9}
        strokeLinecap="round"
      />
    </g>
  );
}

function SheetOfPaper({
  map,
  sheet,
  index,
  x,
  y,
}: {
  map: CropMap;
  sheet: Sheet;
  index: number;
  x: number;
  y: number;
}) {
  const { w, h, entries } = sheet;
  const r = rng(seedOf(`pantry-sheet-${index}`));
  const fold = 9 + r() * 3;
  const foldLeft = r() < 0.4;
  const outline = sheetOutline(w, h, fold, foldLeft, r);
  const nx = w * (0.44 + r() * 0.12);
  const ny = 8;
  // Hung from one nail, each sheet settles its own way; wide ones swing less, and stay on the board.
  const lean = (index % 2 ? 1 : -1) * (0.7 + r() * 0.9);
  const swing = lean * Math.min(1, 70 / w);
  // The fold stays inside the outline's rounded cut: `side` runs from the paper's edge inward.
  const side = (d: number) => (foldLeft ? d : w - d);
  return (
    <g
      transform={`translate(${x.toFixed(1)} ${y}) rotate(${swing.toFixed(2)} ${nx.toFixed(1)} ${ny})`}
    >
      <path d={outline} fill="black" opacity={0.3} transform="translate(1.5 2.5)" />
      <path d={outline} fill={PAPER} />
      {/* The corner folded up, showing its back. */}
      <path
        d={`M${side(1.5)},${h - fold - 0.5} L${side(fold + 0.5)},${h - 1.5} Q${side(fold - 0.5)},${h - fold + 2} ${side(1.5)},${h - fold - 0.5} Z`}
        fill={mix(PAPER, 72, "var(--bark)")}
      />
      {entries.map(({ sport, lines, y: ey }, i) => {
        const line = rng(seedOf(`pantry-line-${sport}`));
        const tilt = (line() - 0.5) * 2;
        const textX = PAD_LEFT + SMEAR_W + (line() - 0.5);
        const textY = ey + 10;
        return (
          <g key={sport}>
            <Smear
              color={CROP_COLOR[cropFor(map, sport)]}
              x={PAD_LEFT - 2}
              y={ey + (lines.length * LINE) / 2 + 0.5}
              seed={seedOf(`jam-${sport}`)}
              kind={(seedOf(sport) % SMEARS.length) + i}
            />
            <text
              transform={`rotate(${tilt.toFixed(2)} ${textX.toFixed(1)} ${textY.toFixed(1)})`}
              fontFamily={HAND}
              fontSize={FONT_SIZE}
              fontWeight={700}
              fill={INK}
            >
              {lines.map((l, j) => (
                <tspan key={j} x={textX} y={textY + j * LINE}>
                  {l}
                </tspan>
              ))}
            </text>
          </g>
        );
      })}
      <Nail x={nx} y={ny} />
    </g>
  );
}

/** The sheets along the top board, the last one's right edge at `right`. */
export function PantryNotes({
  map,
  sheets,
  right,
}: {
  map: CropMap;
  sheets: Sheet[];
  right: number;
}) {
  const names = sheets.flatMap((s) => s.entries.map((e) => e.lines.join(" ")));
  return (
    <g role="img" aria-label={`${t("Legend", "Legenda")}: ${names.join(", ")}`}>
      {sheets.map((s, i) => (
        <SheetOfPaper key={i} map={map} sheet={s} index={i} x={right + s.x} y={SHEET_Y} />
      ))}
    </g>
  );
}
