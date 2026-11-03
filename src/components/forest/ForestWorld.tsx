import { useId, useMemo } from "react";
import { MiniTree, WildPines, type SceneTree } from "@/components/forest/ForestScene";
import { useNow } from "@/hooks/use-now";
import { daylight, lit } from "@/lib/daylight";
import { treeGrowth } from "@/lib/forest/age";
import type { Forest } from "@/lib/forest/forests";
import { t } from "@/lib/i18n";
import { ridgeAcross } from "@/lib/ridge";
import { isoDate } from "@/lib/training";
import { rng, seedOf } from "@/lib/tree";

export type WorldWood = { forest: Forest; trees: SceneTree[]; waiting: number };

/** The sky above the mountains: room for the sun and moon to ride over them. */
const SKY = 30;
const TOP = 96 + SKY;
/** One wood per row on the phone; a wide scene's rows of woods are this far apart. */
const STEP = 158;
const WIDE_STEP = 210;
/** A wide scene's woods: the nearest stand this far either side of the trail, the next ones this much further. */
const SIDE_IN = 190;
const SIDE_STEP = 270;

/**
 * My forests as one little world at night: a trail winds down the valley from the mountains, past a wood on its own
 * hill for each forest (its members' trees in their seasons), to a clearing where a new forest can be planted. On a
 * wide scene the trail runs straight down the middle with the woods in rows either side, wild pines between.
 */
export function ForestWorld({
  woods,
  onOpen,
  onPlant,
  w: W = 360,
  now,
}: {
  woods: WorldWood[];
  onOpen: (fid: string) => void;
  onPlant: () => void;
  w?: number;
  /** The moment the sky shows (now by default). */
  now?: Date;
}) {
  const uid = `world${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const wide = W > 360;
  // Wide: woods in rows either side of one straight trail down the middle, nearest it first.
  const perSide = Math.max(1, Math.floor((W / 2 - 90) / SIDE_STEP));
  const rows = wide ? Math.max(1, Math.ceil(woods.length / (2 * perSide))) : woods.length + 1;
  // A wide scene is a landscape, at least half as tall as it is wide, with the clearing down in the foreground.
  const H = wide
    ? Math.max(TOP + rows * WIDE_STEP + 190, Math.round(W * 0.5))
    : TOP + (woods.length + 1) * STEP;
  // Phone: woods sit left and right of the trail in turn, each on its own row. The clearing comes last, at the
  // trail's end (on a wide scene, in the middle of the foreground).
  const spots = [
    ...woods.map((_, i) => {
      if (!wide) return { x: i % 2 === 0 ? 112 : 248, y: TOP + i * STEP + 70 };
      const row = Math.floor(i / (2 * perSide));
      const k = Math.floor((i % (2 * perSide)) / 2);
      const side = i % 2 ? 1 : -1;
      return {
        x: W / 2 + side * (SIDE_IN + k * SIDE_STEP),
        y: TOP + row * WIDE_STEP + 70 + (k % 2) * 22,
      };
    }),
    wide
      ? { x: W / 2, y: H - 120 }
      : { x: woods.length % 2 === 0 ? 112 : 248, y: TOP + woods.length * STEP + 70 },
  ];
  // The trail: a smooth centre line (Catmull-Rom through points beside each wood, ending in the clearing), drawn
  // as a band that is a thread where it leaves the mountains and widens as it comes toward you.
  const trail = useMemo(() => {
    const end = spots.at(-1)!;
    const pts = wide
      ? [
          // A few bends far away, bunched up by the distance, straightening out as it comes toward you.
          ...Array.from({ length: 7 }, (_, k) => {
            const u = k / 7;
            const near = 1 - u;
            return {
              x: W / 2 + 18 * near + (k % 2 ? 1 : -1) * (k ? 64 : 0) * near ** 2,
              y: TOP - 30 + (end.y - TOP + 36) * u ** 1.6,
            };
          }),
          { x: end.x, y: end.y + 6 },
        ]
      : [
          { x: W / 2 + 18, y: TOP - 30 },
          ...spots.map((s, i) =>
            i < woods.length ? { x: W - s.x, y: s.y + 14 } : { x: s.x, y: s.y + 6 },
          ),
        ];
    const line: { x: number; y: number }[] = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)]!;
      const p1 = pts[i]!;
      const p2 = pts[i + 1]!;
      const p3 = pts[Math.min(pts.length - 1, i + 2)]!;
      for (let k = 0; k < 24; k++) {
        const u = k / 24;
        const u2 = u * u;
        const u3 = u2 * u;
        const f = (a: number, b: number, c: number, d: number) =>
          0.5 *
          (2 * b + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u2 + (-a + 3 * b - 3 * c + d) * u3);
        line.push({ x: f(p0.x, p1.x, p2.x, p3.x), y: f(p0.y, p1.y, p2.y, p3.y) });
      }
    }
    line.push(pts.at(-1)!);
    const half = (y: number) => 0.6 + 7 * Math.min(1, Math.max(0, (y - TOP + 30) / (H - TOP)));
    const side = (sign: 1 | -1) =>
      line.map((p, i) => {
        const q = line[Math.min(line.length - 1, i + 1)]!;
        const o = line[Math.max(0, i - 1)]!;
        const dx = q.x - o.x;
        const dy = q.y - o.y;
        const len = Math.hypot(dx, dy) || 1;
        const h = half(p.y) * sign;
        return `${(p.x - (dy / len) * h).toFixed(1)},${(p.y + (dx / len) * h).toFixed(1)}`;
      });
    return {
      band: `${side(1).join(" ")} ${side(-1).reverse().join(" ")}`,
      centre: line.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" "),
      line,
    };
    // spots, rows and H derive from the number of woods and the width.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [woods.length, W]);
  // The sky of the moment, as at Home, without weather (the forests are shared: their sky is nobody's form).
  const clock = useNow();
  const d = daylight(now ?? clock);
  const L = (c: string) => lit(c, d);
  const pines = L("color-mix(in oklab, var(--pine) 22%, var(--background))");
  const ridge = (key: string, top: number, depth: number) => {
    const ys = ridgeAcross(`world${key}`, W, 1.3);
    const pts = ys.map(
      (y, i) => `${((i / (ys.length - 1)) * W).toFixed(1)},${(top + (1 - y) * depth).toFixed(1)}`,
    );
    return `0,${H} ${pts.join(" ")} ${W},${H}`;
  };

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="block h-auto w-full"
      role="group"
      aria-label={t("Your forests", "I tuoi boschi")}
    >
      <defs>
        <linearGradient id={`${uid}valley`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: L("var(--secondary)") }} />
          <stop offset="1" style={{ stopColor: L("var(--background)") }} />
        </linearGradient>
        {/* Pale where the trail comes toward you, fading into the dark up by the mountains. */}
        <linearGradient id={`${uid}trail`} x1="0" y1="0" x2="0" y2="1">
          <stop
            offset="0"
            style={{ stopColor: L("color-mix(in oklab, var(--birch) 12%, var(--secondary))") }}
            stopOpacity={0.2}
          />
          <stop
            offset="1"
            style={{ stopColor: L("color-mix(in oklab, var(--birch) 22%, var(--secondary))") }}
            stopOpacity={0.9}
          />
        </linearGradient>
        <radialGradient id={`${uid}hill`} cx="0.5" cy="0.3" r="0.7">
          <stop
            offset="0"
            style={{ stopColor: L("color-mix(in oklab, var(--pine) 18%, var(--secondary))") }}
          />
          <stop offset="1" style={{ stopColor: L("var(--card)") }} />
        </radialGradient>
      </defs>
      {/* The sky is the page's own (components/sky/SkyPage), behind this scene from the window's top. */}
      <polygon
        points={ridge("far", SKY + 18, 50)}
        fill={L("color-mix(in oklab, var(--border) 80%, var(--primary))")}
        opacity={0.5 + d.light * 0.2}
      />
      <polygon points={ridge("mid", SKY + 44, 44)} fill={L("var(--muted)")} />
      <path
        d={`M0,${TOP} Q${W / 2},${TOP - 26} ${W},${TOP} L${W},${H} L0,${H} Z`}
        fill={`url(#${uid}valley)`}
      />
      {/* A treeline where the valley meets the mountains, and wild pines scattered between the woods. */}
      <WildPines
        seed="world-edge"
        w={W}
        count={Math.round(W / 12)}
        at={(r) => {
          const u = r();
          return [u * W, TOP - 52 * u * (1 - u) + 3 + r() * 8];
        }}
        size={0.8}
        tone={pines}
      />
      <polygon points={trail.band} fill={`url(#${uid}trail)`} />
      <polyline
        points={trail.centre}
        fill="none"
        stroke="var(--birch)"
        strokeOpacity={0.12}
        strokeWidth={1}
        strokeLinecap="round"
      />
      {/* Beside the trail, never on it: they stand clear of its line. */}
      <WildPines
        seed="world"
        w={W}
        count={Math.min(120, Math.round((W * H) / 4500))}
        at={(r) => {
          const x = r() * W;
          const y = TOP + 16 + r() * (H - TOP - 30);
          const clear = spots.every(
            (s) => Math.abs(s.x - x) > 112 || y < s.y - 64 || y > s.y + 104,
          );
          const offTrail = trail.line.every(
            (p) => Math.abs(p.x - x) > 12 || p.y < y - 4 || p.y > y + 22,
          );
          return clear && offTrail ? [x, y] : null;
        }}
        tone={pines}
      />
      {woods.map((w, i) => (
        <Wood
          key={w.forest.id}
          wood={w}
          x={spots[i]!.x}
          y={spots[i]!.y}
          hill={`url(#${uid}hill)`}
          onOpen={onOpen}
        />
      ))}
      <Clearing
        x={spots[woods.length]!.x}
        y={spots[woods.length]!.y}
        first={!woods.length}
        onPlant={onPlant}
      />
    </svg>
  );
}

/** One forest: a wooded hill, its name below, a glowing dot while someone waits to join. */
function Wood({
  wood,
  x,
  y,
  hill,
  onOpen,
}: {
  wood: WorldWood;
  x: number;
  y: number;
  hill: string;
  onOpen: (fid: string) => void;
}) {
  const { forest, trees, waiting } = wood;
  const r = rng(seedOf(forest.id));
  // Up to 14 trees on the hill, back rows first so the front ones overlap them.
  const shown = trees.slice(0, 14);
  const today = isoDate(new Date());
  const placed = shown
    .map((tr, k) => {
      const a = (k + r() * 0.6) / Math.max(1, shown.length);
      const dx = (a - 0.5) * 132 + (r() - 0.5) * 10;
      const dy = (r() - 0.5) * 16 - Math.cos((dx / 70) * (Math.PI / 2)) * 8;
      return {
        tr,
        x: x + dx,
        y: y + 18 + dy,
        size: 0.7 + r() * 0.06,
        grow: treeGrowth(tr.header, today),
      };
    })
    .sort((a, b) => a.y - b.y);
  const open = () => onOpen(forest.id);
  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={forest.name}
      className="cursor-pointer outline-none [&:focus-visible_.wood-name]:underline [&:hover_.wood-name]:fill-[var(--primary)]"
      onClick={open}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && open()}
    >
      <ellipse cx={x} cy={y + 26} rx={98} ry={28} fill={hill} />
      <ellipse
        cx={x}
        cy={y + 26}
        rx={98}
        ry={28}
        fill="none"
        stroke="var(--border)"
        strokeOpacity={0.6}
      />
      {placed.map((p) => (
        <MiniTree
          key={p.tr.uid}
          tr={p.tr}
          x={p.x}
          y={p.y}
          size={p.size}
          seed={`${forest.id}${p.tr.uid}`}
          growth={p.grow}
        />
      ))}
      <text
        x={x}
        y={y + 74}
        textAnchor="middle"
        fontSize={14}
        fontWeight={600}
        fill="var(--foreground)"
        className="wood-name"
      >
        {forest.name.length > 22 ? `${forest.name.slice(0, 21)}…` : forest.name}
      </text>
      <text x={x} y={y + 90} textAnchor="middle" fontSize={10} fill="var(--muted-foreground)">
        {t(
          `${forest.members.length} ${forest.members.length === 1 ? "tree" : "trees"}`,
          `${forest.members.length} ${forest.members.length === 1 ? "albero" : "alberi"}`,
        )}
        {waiting > 0 && t(` · ${waiting} waiting`, ` · ${waiting} in attesa`)}
      </text>
      {waiting > 0 && (
        <g transform={`translate(${x + 84},${y - 18})`}>
          <circle r={9} fill="var(--primary)" opacity={0.25}>
            <animate attributeName="r" values="7;11;7" dur="2.4s" repeatCount="indefinite" />
          </circle>
          <circle r={5} fill="var(--primary)" />
        </g>
      )}
      {/* The whole wood is the tap target. */}
      <rect x={x - 100} y={y - 50} width={200} height={146} fill="transparent" />
    </g>
  );
}

/** The trail's end: a clearing with a sprout, where a new forest is planted. */
function Clearing({
  x,
  y,
  first,
  onPlant,
}: {
  x: number;
  y: number;
  first: boolean;
  onPlant: () => void;
}) {
  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={t("Plant a forest", "Pianta un bosco")}
      className="cursor-pointer outline-none [&:hover_circle.ring]:stroke-[var(--primary)]"
      onClick={onPlant}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onPlant()}
    >
      <ellipse cx={x} cy={y + 26} rx={70} ry={20} fill="var(--card)" opacity={0.7} />
      <circle
        className="ring"
        cx={x}
        cy={y + 10}
        r={30}
        fill="none"
        stroke="var(--birch)"
        strokeOpacity={0.6}
        strokeDasharray="3 5"
      />
      <line
        x1={x}
        y1={y + 22}
        x2={x}
        y2={y + 6}
        stroke="var(--bark)"
        strokeWidth={2}
        strokeLinecap="round"
      />
      <ellipse
        cx={x - 5}
        cy={y + 6}
        rx={6}
        ry={3}
        fill="var(--spring)"
        transform={`rotate(-25 ${x - 5} ${y + 6})`}
      />
      <ellipse
        cx={x + 5}
        cy={y + 3}
        rx={6}
        ry={3}
        fill="var(--spring)"
        transform={`rotate(25 ${x + 5} ${y + 3})`}
      />
      <text x={x} y={y + 62} textAnchor="middle" fontSize={13} fontWeight={600} fill="var(--birch)">
        {t("Plant a forest", "Pianta un bosco")}
      </text>
      {first && (
        <text x={x} y={y + 78} textAnchor="middle" fontSize={10} fill="var(--muted-foreground)">
          {t("or open an invite link", "oppure apri un link di invito")}
        </text>
      )}
      <rect x={x - 72} y={y - 24} width={144} height={110} fill="transparent" />
    </g>
  );
}
