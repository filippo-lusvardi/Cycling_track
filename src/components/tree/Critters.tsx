// The tree's animals. Birds perch on a ride's branch, one per brioche, each a species picked at random (seeded by
// the ride, so a branch keeps its birds across renders and devices). Two branches get a guardian instead: a red
// squirrel on the longest ride ever, an owl on the ride with the most climbing.
//
// Every drawing faces right with its feet at the origin and is mirrored for branches growing left. Birds share one
// sparrow-sized box (about 16 × 10 units); colours are mixed from the theme so they read on the dark sky and on
// the wood alike.

const mix = (a: string, pa: number, b: string) => `color-mix(in oklab, ${a} ${pa}%, ${b})`;

const FG = "var(--foreground)";
const BG = "var(--scene-background)";
const BIRCH = "var(--birch)";
const BARK = "var(--bark)";
const AUTUMN = "var(--autumn)";
const LINGON = "var(--lingon)";
const SNOW = "var(--snow)";

/** Tail, back, head, breast and belly as one outline: the shared songbird silhouette. */
const BODY =
  "M-6.6,-2.3 L-7.1,-4 L-3.4,-4.6 C-2.2,-7.6 1.4,-8.4 3,-7.6 C3.3,-9.8 6.8,-10 7.2,-7.5 C7.4,-6.3 6.6,-5.4 5.6,-5 C5.4,-2.4 3.2,-0.8 0.7,-0.8 C-1.4,-0.7 -2.8,-1.7 -3.5,-2.7 Z";
/** Folded wing over the back. */
const WING = "M-2.8,-3.7 C-1,-6.6 2.4,-6.5 3.3,-4.5 C1.7,-3.4 -0.6,-3 -2.8,-3.7 Z";
/** Wing tips (primaries) at the back of the folded wing. */
const WING_TIP = "M-2.8,-3.7 C-2.2,-4.9 -1.2,-5.5 -0.2,-5.6 C-0.6,-4.6 -1.4,-3.8 -2.8,-3.7 Z";
/** The tail alone, for species whose tail differs from their body. */
const TAIL = "M-6.6,-2.3 L-7.1,-4 L-3.4,-4.6 L-3.5,-2.7 Z";
/** Face and breast (a robin's red bib, a blue tit's yellow front). */
const BIB =
  "M5,-9.2 C6.5,-9.7 7.5,-8.7 7.3,-7.3 C7.2,-6.3 6.7,-5.6 5.9,-5 C5.8,-3.3 4.6,-1.8 2.8,-1.5 C2.6,-3.3 3.4,-5 4.3,-6.4 C4.2,-7.6 4.4,-8.7 5,-9.2 Z";
/** Crown and nape (a cap). */
const CAP = "M3.1,-7.7 C3.4,-9.8 6.8,-10.1 7.2,-7.9 C6.2,-8.6 4.6,-8.7 3.1,-7.7 Z";
const SHORT_BEAK = "M7.1,-7.4 L9,-6.8 L7,-6.3 Z";

export type BirdKind =
  "sparrow" | "robin" | "snow" | "blackbird" | "bluetit" | "goldfinch" | "kingfisher";

/** Every species a brioche can bring, picked uniformly. */
export const BIRD_KINDS: readonly BirdKind[] = [
  "sparrow",
  "robin",
  "snow",
  "blackbird",
  "bluetit",
  "goldfinch",
  "kingfisher",
];

function Legs({ color = BIRCH }: { color?: string }) {
  return (
    <path
      d="M0.4,-0.9 L0.2,0 M1.7,-0.9 L1.6,0"
      stroke={color}
      strokeWidth={0.7}
      strokeLinecap="round"
    />
  );
}

function Eye({ cx = 5.7, cy = -7.7, ring }: { cx?: number; cy?: number; ring?: string }) {
  return (
    <>
      {ring && <circle cx={cx} cy={cy} r={0.95} fill={ring} />}
      <circle cx={cx} cy={cy} r={0.6} fill={BG} />
      <circle cx={cx + 0.2} cy={cy - 0.2} r={0.17} fill={FG} opacity={0.8} />
    </>
  );
}

/** One species' drawing in the shared box. */
function Species({ kind }: { kind: BirdKind }) {
  switch (kind) {
    case "sparrow":
      return (
        <>
          <Legs />
          <path d={BODY} fill={mix(AUTUMN, 55, mix(FG, 55, BARK))} />
          <ellipse cx={2.6} cy={-2.8} rx={2.5} ry={1.6} fill={mix(FG, 85, BIRCH)} />
          <path d={WING} fill={mix(BARK, 55, AUTUMN)} />
          <path d={WING_TIP} fill={mix(BARK, 80, "black")} opacity={0.7} />
          <path d={SHORT_BEAK} fill={BIRCH} />
          <Eye />
        </>
      );
    case "robin": {
      const back = mix(BARK, 70, mix(FG, 30, "var(--summer)"));
      return (
        <>
          <Legs color={mix(BARK, 60, FG)} />
          <path d={BODY} fill={back} />
          <ellipse cx={1.6} cy={-1.9} rx={2.4} ry={1.1} fill={mix(SNOW, 85, BARK)} />
          <path d={BIB} fill={mix(AUTUMN, 70, LINGON)} />
          <path d={WING} fill={mix(back, 80, "black")} />
          <path d="M7.1,-7.3 L8.8,-6.9 L7.1,-6.5 Z" fill={mix(BARK, 50, "black")} />
          <Eye />
        </>
      );
    }
    case "snow":
      return (
        <>
          <Legs color={mix(BARK, 40, "black")} />
          <path d={BODY} fill={SNOW} />
          <path d={TAIL} fill={mix(BG, 70, BARK)} />
          <path d={WING} fill={mix(SNOW, 88, "var(--primary)")} />
          {/* Black wing tips: the snow bunting's mark. */}
          <path
            d="M-2.8,-3.7 C-2,-5.3 -0.4,-6.1 1,-6 C0.2,-4.8 -1.2,-3.9 -2.8,-3.7 Z"
            fill={mix(BG, 75, "black")}
          />
          <path d={SHORT_BEAK} fill={mix(AUTUMN, 60, BIRCH)} />
          <Eye />
        </>
      );
    case "blackbird": {
      // Near-black, with a faint light rim so it doesn't vanish into the night sky.
      const black = mix(BG, 75, "black");
      return (
        <>
          <Legs color={mix(BARK, 50, "black")} />
          <path d={BODY} fill={black} stroke={mix(FG, 30, BG)} strokeWidth={0.28} />
          <path d={WING} fill={mix(black, 80, FG)} opacity={0.9} />
          <path d="M7.1,-7.5 L9.4,-6.8 L7,-6.2 Z" fill={mix(AUTUMN, 45, BIRCH)} />
          <Eye ring={mix(AUTUMN, 45, BIRCH)} />
        </>
      );
    }
    case "bluetit": {
      const blue = mix("var(--fitness)", 75, "oklch(0.55 0.15 255)");
      return (
        <>
          <Legs color={mix("oklch(0.55 0.15 255)", 60, BG)} />
          <path d={BODY} fill={mix("var(--summer)", 55, mix(BIRCH, 50, BARK))} />
          <path d={BIB} fill={mix(BIRCH, 80, "var(--spring)")} />
          <path d={TAIL} fill={blue} />
          <path d={WING} fill={blue} />
          <path
            d="M-1.2,-5.3 C0.4,-6.1 1.8,-6 2.6,-5.4"
            stroke={SNOW}
            strokeWidth={0.5}
            fill="none"
          />
          {/* White cheek under a blue cap, with the dark stripe through the eye. */}
          <path
            d="M4,-7.6 C5,-8.1 6.6,-8 7.2,-7.3 C7,-6.3 6.1,-5.6 5,-5.7 C4.4,-6.3 4,-6.9 4,-7.6 Z"
            fill={SNOW}
          />
          <path d={CAP} fill={blue} />
          <path
            d="M4.4,-7.5 L6.6,-7.7"
            stroke={mix(BG, 80, "oklch(0.45 0.12 255)")}
            strokeWidth={0.4}
            strokeLinecap="round"
          />
          <path d="M7.1,-7.3 L8.4,-7 L7.1,-6.6 Z" fill={mix(BG, 70, BARK)} />
          <Eye />
        </>
      );
    }
    case "goldfinch": {
      const black = mix(BG, 70, "black");
      return (
        <>
          <Legs color={mix(BLOSSOM, 60, BARK)} />
          <path d={BODY} fill={mix(AUTUMN, 30, mix(FG, 50, BARK))} />
          <ellipse cx={2.4} cy={-2.4} rx={2.6} ry={1.5} fill={mix(SNOW, 90, BIRCH)} />
          <path d={TAIL} fill={black} />
          <path d={WING} fill={black} />
          <path
            d="M-1.4,-4.9 C0,-5.7 1.6,-5.7 2.6,-5"
            stroke={mix(BIRCH, 70, "var(--spring)")}
            strokeWidth={1}
            strokeLinecap="round"
            fill="none"
          />
          {/* Black crown, white cheek, red face. */}
          <path
            d="M3.1,-7.7 C3.4,-9.8 6.8,-10.1 7.2,-7.9 C5.6,-6.4 4.4,-6.2 3.1,-7.7 Z"
            fill={SNOW}
          />
          <path d={CAP} fill={black} />
          <path
            d="M5.9,-9.2 C6.9,-9.3 7.5,-8.5 7.4,-7.3 C7.2,-6.4 6.6,-5.8 6,-5.8 C5.9,-6.9 5.5,-8.2 5.9,-9.2 Z"
            fill={mix(LINGON, 85, AUTUMN)}
          />
          <path d="M7.1,-7.6 L9.2,-6.9 L7.1,-6.3 Z" fill={mix(BLOSSOM, 50, FG)} />
          <Eye cx={5.4} cy={-7.6} />
        </>
      );
    }
    case "kingfisher": {
      const blue = mix("var(--primary)", 70, "oklch(0.6 0.15 220)");
      const orange = mix(AUTUMN, 85, LINGON);
      return (
        <>
          <Legs color={mix(LINGON, 70, AUTUMN)} />
          {/* A shorter tail and a big head: the kingfisher's stocky shape. */}
          <path
            d="M-5.2,-2.4 L-5.7,-3.8 L-3.2,-4.6 C-2.2,-7.6 1.4,-8.4 3,-7.8 C3.2,-10 6.9,-10.2 7.3,-7.5 C7.5,-6.3 6.6,-5.4 5.6,-5 C5.4,-2.4 3.2,-0.8 0.7,-0.8 C-1.4,-0.7 -2.6,-1.6 -3.3,-2.6 Z"
            fill={blue}
          />
          <path
            d="M5.6,-5 C5.4,-2.4 3.2,-0.8 0.7,-0.8 C-1,-0.8 -2.2,-1.5 -2.8,-2.3 C-0.4,-2.6 2.6,-3.6 4.4,-5.4 Z"
            fill={orange}
          />
          <path d={WING} fill={mix(blue, 70, "oklch(0.4 0.1 200)")} />
          <circle cx={-0.6} cy={-4.8} r={0.35} fill={mix("var(--primary)", 50, SNOW)} />
          <circle cx={0.9} cy={-5.4} r={0.35} fill={mix("var(--primary)", 50, SNOW)} />
          <path
            d="M4.6,-7.6 C5.4,-6.8 6.4,-6.6 7.1,-6.8 L6.6,-6 C5.6,-5.8 4.9,-6.4 4.6,-7.6 Z"
            fill={orange}
          />
          <ellipse cx={6.2} cy={-5.5} rx={0.8} ry={0.45} fill={SNOW} />
          {/* The long dagger beak. */}
          <path d="M7,-7.8 L11.2,-6.9 L7,-6.3 Z" fill={mix(BG, 70, "black")} />
          <Eye cx={5.4} cy={-8} />
        </>
      );
    }
  }
}

const BLOSSOM = "var(--blossom)";

/** A small bird perched facing outward, its feet at (x, y). */
export function Bird({
  x,
  y,
  side,
  s = 1,
  kind = "sparrow",
}: {
  x: number;
  y: number;
  side: -1 | 1;
  s?: number;
  kind?: BirdKind;
}) {
  return (
    <g transform={`translate(${x} ${y}) scale(${side * s} ${s})`}>
      <Species kind={kind} />
    </g>
  );
}

/** The wing a species opens in flight, in the colour of its folded one. */
const FLIGHT_WING: Record<BirdKind, string> = {
  sparrow: mix(BARK, 55, AUTUMN),
  robin: mix(BARK, 80, "black"),
  snow: mix(SNOW, 88, "var(--primary)"),
  blackbird: mix(BG, 70, "black"),
  bluetit: mix("var(--fitness)", 75, "oklch(0.55 0.15 255)"),
  goldfinch: mix(BG, 70, "black"),
  kingfisher: mix("var(--primary)", 60, "oklch(0.4 0.1 200)"),
};
const OPEN_WING = "M1.2,-5.2 C-1,-6 -4.2,-6.9 -7.2,-6.6 C-5.2,-4.8 -2.2,-3.7 1,-4 Z";
/** Seconds a bird takes to arrive or leave. */
export const FLIGHT_SECONDS = 1.25;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/**
 * A bird on the wing, `at` seconds into its flight. Arriving, it crosses the tree from the far side, so it comes in
 * already facing out along the branch, brakes with slow wide beats and folds its wings on the perch at (x, y). Leaving,
 * it takes off from there and carries on the way it faces.
 */
export function FlyingBird({
  at,
  x,
  y,
  side,
  s,
  kind,
  span,
  leaving = false,
}: {
  at: number;
  x: number;
  y: number;
  side: -1 | 1;
  s: number;
  kind: BirdKind;
  /** How far away the flight starts or ends, in px. */
  span: number;
  leaving?: boolean;
}) {
  const p = clamp01(at / FLIGHT_SECONDS);
  const along = leaving ? p ** 1.8 : 1 - (1 - p) ** 2.2;
  const where = (k: number) =>
    leaving
      ? ([x + side * span * k, y - 90 * k - 14 * Math.sin(Math.PI * k)] as const)
      : ([x - side * span * (1 - k), y - 70 * (1 - k) + 46 * Math.sin(Math.PI * k)] as const);
  const [px, py] = where(along);
  const [qx, qy] = where(Math.min(1, along + 0.01));
  const heading = (Math.atan2(qy - py, Math.abs(qx - px) + 0.001) * 180) / Math.PI;
  const inFlight = Math.max(-28, Math.min(28, heading));
  const flare = leaving ? 0 : clamp01((p - 0.72) / 0.2);
  const settle = leaving ? 0 : clamp01((p - 0.92) / 0.08);
  const pitch = (inFlight * (1 - flare) - 30 * flare) * (1 - settle);
  const beat = Math.sin(at * 2 * Math.PI * (leaving || p < 0.72 ? 5 : 3.2));
  const open = leaving ? clamp01(p / 0.1) : 1 - clamp01((p - 0.9) / 0.1);
  const lift = (25 + 50 * beat) * open;
  return (
    <g
      transform={`translate(${px} ${py}) scale(${side * s} ${s}) rotate(${pitch} 0 -4)`}
      opacity={leaving ? 1 - clamp01((p - 0.85) / 0.15) : clamp01(at / 0.12)}
    >
      <path
        d={OPEN_WING}
        fill={FLIGHT_WING[kind]}
        opacity={0.65 * open}
        transform={`rotate(${lift + 12} 0.8 -4.6)`}
      />
      <Species kind={kind} />
      <path
        d={OPEN_WING}
        fill={FLIGHT_WING[kind]}
        opacity={open}
        transform={`rotate(${lift} 0.8 -4.6)`}
      />
    </g>
  );
}

/** One flower of the bloom: five petals, the same as the crown's own spring blossoms. */
export function Blossom({ x, y, s, white }: { x: number; y: number; s: number; white: boolean }) {
  if (s <= 0) return null;
  return (
    <g>
      {[0, 1, 2, 3, 4].map((k) => (
        <circle
          key={k}
          cx={x + Math.cos((k / 5) * Math.PI * 2) * s * 1.3}
          cy={y + Math.sin((k / 5) * Math.PI * 2) * s * 1.3}
          r={s}
          fill={white ? SNOW : BLOSSOM}
        />
      ))}
      <circle cx={x} cy={y} r={s * 0.7} fill={BIRCH} />
    </g>
  );
}

/** Size of the squirrel's and the owl's drawings, in their own units (feet at the origin). */
export const SQUIRREL_BOX = { w: 20, h: 22 };
export const OWL_BOX = { w: 13, h: 19 };

/**
 * A red squirrel sitting up on the branch, holding a hazelnut, its bushy tail curled up behind: the longest ride's
 * guardian. Feet at the origin, facing right.
 */
export function Squirrel({
  x,
  y,
  side,
  s = 1,
}: {
  x: number;
  y: number;
  side: -1 | 1;
  s?: number;
}) {
  const fur = mix(AUTUMN, 75, BARK);
  const dark = mix(fur, 75, "black");
  const cream = mix(FG, 80, BIRCH);
  return (
    <g transform={`translate(${x} ${y}) scale(${side * s} ${s})`}>
      {/* Tail: one plume rising behind the back and curling forward at the top. */}
      <path
        d="M-1.5,-1.5 C-7,-1 -10.5,-5.5 -9.6,-10.5 C-8.8,-15.5 -4.4,-19 -0.6,-18.4 C2.2,-18 2.6,-15.4 0.8,-14.6 C-1.4,-13.8 -3.4,-15.6 -4.6,-13.6 C-5.8,-11.4 -3.6,-9.2 -2.6,-6.6 C-2,-4.8 -1.6,-3 -1.5,-1.5 Z"
        fill={fur}
      />
      <path
        d="M-8.4,-8.5 C-8.4,-12.5 -5.8,-16.2 -2.2,-17.2"
        stroke={mix(fur, 70, BIRCH)}
        strokeWidth={0.9}
        strokeLinecap="round"
        fill="none"
        opacity={0.8}
      />
      {/* Hind leg and body, sitting up. */}
      <path
        d="M-2,0 C-3.2,-3 -2.6,-7.4 0.4,-9.6 C2.6,-11.2 5.4,-10.6 6,-8.2 C6.6,-5.6 5.6,-2.6 4,0 Z"
        fill={fur}
      />
      <path d="M-1.6,0 C-2.4,-2.4 -1.6,-4.6 0.8,-4.8 C2.6,-4.9 3.2,-2.4 2.4,0 Z" fill={dark} />
      <path d="M3.4,-1.2 C4.6,-3.4 5.2,-6 4.8,-8.2 C4,-6.4 3,-4.8 2.6,-2.6 Z" fill={cream} />
      {/* Head with its ear tuft, snout forward. */}
      <path
        d="M2.4,-11.4 C2.4,-14.2 4.4,-15.6 6.4,-15 C7.8,-14.6 8.6,-13.4 9.6,-12.6 C10.2,-12 9.8,-11 9,-10.8 C7.8,-10.4 6.8,-9.8 5.6,-9.6 C3.8,-9.4 2.4,-10 2.4,-11.4 Z"
        fill={fur}
      />
      <path d="M4.2,-14.4 L4.4,-17.8 L6.4,-14.8 Z" fill={fur} />
      <path d="M4.6,-15 L4.7,-16.9 L5.8,-15.1 Z" fill={dark} />
      <circle cx={9.6} cy={-12.1} r={0.55} fill={dark} />
      <circle cx={6.8} cy={-12.9} r={0.8} fill={BG} />
      <circle cx={7.05} cy={-13.15} r={0.22} fill={FG} opacity={0.85} />
      {/* Front paws holding a hazelnut. */}
      <circle cx={7.4} cy={-7.6} r={1.6} fill={mix(BARK, 60, AUTUMN)} />
      <path
        d="M6.4,-8.9 C7,-9.5 7.9,-9.5 8.4,-8.9 C7.7,-8.5 7,-8.5 6.4,-8.9 Z"
        fill={mix(BIRCH, 50, BARK)}
      />
      <path
        d="M4.6,-8.6 C5.6,-8.8 6.4,-8.2 6.4,-7.4 M4.8,-6.4 C5.6,-6.4 6.2,-6.8 6.4,-7.2"
        stroke={dark}
        strokeWidth={0.9}
        strokeLinecap="round"
        fill="none"
      />
      {/* Feet on the branch. */}
      <path d="M-0.4,0 L2.8,0" stroke={dark} strokeWidth={1} strokeLinecap="round" />
    </g>
  );
}

/**
 * An owl perched upright, ear tufts up and eyes wide, keeping watch over the ride with the most climbing. Faces the
 * viewer, so it isn't mirrored; feet at the origin.
 */
export function Owl({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  const plumage = mix(BARK, 70, mix(FG, 35, AUTUMN));
  const wing = mix(plumage, 70, "black");
  const disc = mix(FG, 70, mix(BIRCH, 40, BARK));
  const eye = mix(BIRCH, 70, AUTUMN);
  return (
    <g transform={`translate(${x} ${y}) scale(${s} ${s})`}>
      {/* Body and head as one egg, with the ear tufts. */}
      <path
        d="M-5.4,-1.6 C-6.6,-5 -6.4,-10.2 -5.2,-13.6 L-5.8,-17.4 L-3.2,-15.4 C-1.2,-16.2 1.2,-16.2 3.2,-15.4 L5.8,-17.4 L5.2,-13.6 C6.4,-10.2 6.6,-5 5.4,-1.6 C4,-0.4 -4,-0.4 -5.4,-1.6 Z"
        fill={plumage}
      />
      {/* Folded wings at the sides. */}
      <path d="M-5.6,-2 C-6.8,-5 -6.6,-8.8 -5,-10.6 C-4,-8 -3.8,-4.6 -4.2,-1.2 Z" fill={wing} />
      <path d="M5.6,-2 C6.8,-5 6.6,-8.8 5,-10.6 C4,-8 3.8,-4.6 4.2,-1.2 Z" fill={wing} />
      {/* Breast feathers. */}
      <path
        d="M-2.4,-6.6 L-1.6,-5.8 L-0.8,-6.6 M0.8,-6.6 L1.6,-5.8 L2.4,-6.6 M-1.6,-4.4 L-0.8,-3.6 L0,-4.4 L0.8,-3.6 L1.6,-4.4"
        stroke={wing}
        strokeWidth={0.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      {/* Facial disc and the big eyes. */}
      <path
        d="M0,-9.6 C-1,-8.6 -4.8,-8.8 -4.8,-11.8 C-4.8,-14.4 -1.6,-14.8 0,-13.2 C1.6,-14.8 4.8,-14.4 4.8,-11.8 C4.8,-8.8 1,-8.6 0,-9.6 Z"
        fill={disc}
      />
      <circle cx={-2.3} cy={-11.8} r={1.75} fill={eye} />
      <circle cx={2.3} cy={-11.8} r={1.75} fill={eye} />
      <circle cx={-2.2} cy={-11.7} r={0.9} fill={BG} />
      <circle cx={2.4} cy={-11.7} r={0.9} fill={BG} />
      <circle cx={-1.95} cy={-12} r={0.28} fill={FG} />
      <circle cx={2.65} cy={-12} r={0.28} fill={FG} />
      <path d="M-0.7,-10.6 L0.7,-10.6 L0,-9.2 Z" fill={mix(BIRCH, 50, BARK)} />
      {/* Talons gripping the branch. */}
      <path
        d="M-2.4,-0.6 L-2.6,0.3 M-1.6,-0.6 L-1.6,0.3 M1.6,-0.6 L1.6,0.3 M2.4,-0.6 L2.6,0.3"
        stroke={BIRCH}
        strokeWidth={0.6}
        strokeLinecap="round"
      />
    </g>
  );
}
