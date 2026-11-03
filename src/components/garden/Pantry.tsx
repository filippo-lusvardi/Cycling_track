// The pantry: where the garden's harvests go once they've grown their 8 weeks. A wooden cupboard with a shelf per
// year (newest at the top) and a jam jar per month, filled as high as that month's hours off the bike, in layers
// coloured by crop; a month without any is an empty jar, waiting. It reads like the tree's rings: a quiet, dense
// history to glance down.
import {
  CROP_COLOR,
  SPORT_NAME,
  SPORTS,
  type CropMap,
  type Jar,
  type Shelf,
  type Sport,
} from "@/lib/garden";
import { format, t } from "@/lib/i18n";
import { formatDuration } from "@/lib/training";
import { rng, seedOf } from "@/lib/tree";

const mix = (a: string, pa: number, b: string) =>
  `color-mix(in oklab, ${a} ${Math.round(Math.min(100, Math.max(0, pa)))}%, ${b})`;

const WOOD = mix("var(--bark)", 70, "var(--background)");
const WOOD_LIGHT = mix("var(--bark)", 85, "var(--birch)");
const GLASS = mix("var(--snow)", 22, "var(--background)");
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
    ? SPORTS.flatMap((c) => {
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
            fill={CROP_COLOR[map[l.c]]}
            opacity={0.88}
          />
        ))}
        {/* The top of the preserve, not ruled flat. */}
        {layers.length > 0 && (
          <path
            d={`M${x - w / 2},${level + 0.6} q${w * 0.25},-1.4 ${w * 0.5},0 t${w * 0.5},0 V${level + 2} H${x - w / 2} Z`}
            fill={CROP_COLOR[map[layers.at(-1)!.c]]}
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
        stroke={mix("var(--snow)", 40, "var(--background)")}
        strokeWidth={0.7}
      />
      {jar && (
        <>
          {/* A cloth cover over the lid, tied with string. */}
          <path
            d={`M${x - neck / 2 - 2.5},${top + h * 0.13} Q${x - neck / 2 - 1},${top - 1} ${x},${top - 1.6} Q${x + neck / 2 + 1},${top - 1} ${x + neck / 2 + 2.5},${top + h * 0.13} L${x + neck / 2 + 1},${top + h * 0.17} L${x - neck / 2 - 1},${top + h * 0.17} Z`}
            fill={mix(cloth, 70, "var(--background)")}
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

const MONTHS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0"));

/**
 * The cupboard, `w` units wide (360 on a phone): one shelf per year in `shelves` (newest first), twelve places on
 * each. `today` (YYYY-MM-DD) leaves the months still to come empty, with no jar at all.
 */
export function Pantry({
  map,
  shelves,
  today,
  w: W = 360,
  onJar,
}: {
  shelves: Shelf[];
  today: string;
  w?: number;
  onJar?: (jar: Jar) => void;
  /** Which crop grows for which sport: the jars' layers take its colour. */
  map: CropMap;
}) {
  const pad = 16;
  const slot = (W - pad * 2) / 12;
  const jarW = Math.min(30, slot * 0.78);
  const SHELF = jarW * 1.45 + 30;
  const TOP = 18;
  const H = TOP + Math.max(1, shelves.length) * SHELF + 16;
  const all = shelves.flatMap((s) => s.jars);
  const most = Math.max(60, ...all.map((j) => j.minutes));
  const thisMonth = today.slice(0, 7);
  // Nothing before the first harvest: the pantry starts when the garden did.
  const firstMonth = all.reduce((m, j) => (j.month < m ? j.month : m), thisMonth);
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="block h-auto w-full"
      role="group"
      aria-label={t("Pantry", "Dispensa")}
    >
      {/* The cupboard's back: dark planks. */}
      <rect width={W} height={H} rx={10} fill={mix("var(--bark)", 35, "var(--background)")} />
      {Array.from({ length: Math.ceil(W / 46) }, (_, i) => (
        <line
          key={i}
          x1={i * 46 + 23}
          y1={6}
          x2={i * 46 + 23}
          y2={H - 6}
          stroke={mix("var(--bark)", 25, "var(--background)")}
          strokeWidth={1}
        />
      ))}
      {shelves.length === 0 && (
        <text
          x={W / 2}
          y={TOP + SHELF / 2}
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
      {shelves.map((shelf, i) => {
        const y = TOP + (i + 1) * SHELF - 12;
        const byMonth = new Map(shelf.jars.map((j) => [j.month.slice(5), j]));
        return (
          <g key={shelf.year}>
            {MONTHS.map((m, k) => {
              const month = `${shelf.year}-${m}`;
              if (month > thisMonth || month < firstMonth) return null;
              const jar = byMonth.get(m) ?? null;
              const x = pad + slot * (k + 0.5);
              const label = jar
                ? `${format(new Date(shelf.year, k, 1), "MMMM yyyy")}: ${formatDuration(jar.minutes * 60)}`
                : format(new Date(shelf.year, k, 1), "MMMM yyyy");
              const art = (
                <JarShape
                  map={map}
                  jar={jar}
                  month={month}
                  x={x}
                  y={y}
                  w={jarW}
                  fill={jar ? Math.max(0.12, Math.sqrt(jar.minutes / most)) : 0}
                />
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
                    y={y - jarW * 1.6}
                    width={slot}
                    height={jarW * 1.6 + 4}
                    fill="transparent"
                  />
                </g>
              ) : (
                <g key={m} aria-label={label}>
                  {art}
                </g>
              );
            })}
            {/* The shelf board, the year carved into its front edge. */}
            <rect x={6} y={y} width={W - 12} height={7} rx={1.5} fill={WOOD_LIGHT} />
            <rect x={6} y={y + 7} width={W - 12} height={3} fill={WOOD} />
            <text
              x={14}
              y={y + 6}
              fontSize={6}
              letterSpacing="0.2em"
              fontWeight={600}
              fill={mix("var(--bark)", 60, "black")}
            >
              {shelf.year}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** Which colour is which sport, under the shelves. */
export function PantryLegend({ sports, map }: { sports: Sport[]; map: CropMap }) {
  return (
    <ul className="on-sky mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-foreground/85">
      {sports.map((c) => (
        <li key={c} className="flex items-center gap-1.5">
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ background: CROP_COLOR[map[c]] }}
            aria-hidden
          />
          {SPORT_NAME[c]()}
        </li>
      ))}
    </ul>
  );
}
