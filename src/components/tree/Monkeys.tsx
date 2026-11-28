// The monkeys on your back (lib/monkey): one hangs from the tip of the branch of each ride where the legs gave up,
// and bends it. Nine species share one drawing, in profile like the squirrel, picked at random per ride (`monkeyOf`).
// The origin is the branch's tip, where the hands grip; drawn facing right, mirrored by `side` to face the trunk.
import type { TreeBranch } from "@/lib/tree";

const mix = (a: string, pa: number, b: string) => `color-mix(in oklab, ${a} ${pa}%, ${b})`;
const FG = "var(--foreground)";
const BG = "var(--scene-background)";
const BIRCH = "var(--birch)";
const BARK = "var(--bark)";
const AUTUMN = "var(--autumn)";
const SNOW = "var(--snow)";
const LINGON = "var(--lingon)";
const CREAM = mix(FG, 72, mix(BIRCH, 55, AUTUMN));
const RIM = mix(FG, 22, BG);

type Tail = "curl" | "short" | "none" | "grip" | "long";
/** Head features; gibbon, orangutan and tamarin have heads of their own. */
type Extra = "cap" | "nose" | "beard" | "mask";
type Head = "gibbon" | "orangutan" | "tamarin";
export type MonkeySpecies = {
  id: string;
  fur: string;
  face: string;
  /** Lighter throat and chest patch. */
  chest?: string;
  tailColor?: string;
  hands?: string;
  tail: Tail;
  /** "two": both hands on the wood; "one": one hand, the other arm loose. A gripping tail goes with one hand. */
  grip: "two" | "one";
  /** Grip to shoulder. */
  arm: number;
  /** Body size. */
  k: number;
  head?: Head;
  extras?: Extra[];
};

const dark = (c: string, p = 72) => mix(c, p, "black");
const skin = (c: string) => mix(c, 75, AUTUMN);

/** Capuchin, spider monkey, gibbon, orangutan, golden lion tamarin, Japanese macaque, proboscis monkey, howler, squirrel monkey. */
export const MONKEYS: MonkeySpecies[] = [
  {
    id: "capuchin",
    fur: mix(AUTUMN, 30, mix(BARK, 75, "black")),
    face: CREAM,
    chest: CREAM,
    tail: "curl",
    grip: "two",
    arm: 7.4,
    k: 1,
    extras: ["cap"],
  },
  {
    id: "spider",
    fur: mix(BARK, 72, mix(AUTUMN, 15, "black")),
    face: mix(FG, 45, mix(AUTUMN, 50, BARK)),
    tail: "grip",
    grip: "one",
    arm: 8.4,
    k: 0.95,
  },
  {
    id: "gibbon",
    fur: mix(BIRCH, 30, mix(BARK, 60, FG)),
    face: mix(BARK, 62, mix(LINGON, 15, "black")),
    hands: mix(FG, 90, BIRCH),
    tail: "none",
    grip: "one",
    arm: 12.5,
    k: 0.82,
    head: "gibbon",
  },
  {
    id: "orangutan",
    fur: mix(AUTUMN, 62, mix(BARK, 60, LINGON)),
    face: mix(BARK, 70, mix(FG, 25, AUTUMN)),
    tail: "none",
    grip: "two",
    arm: 10,
    k: 1.2,
    head: "orangutan",
  },
  {
    id: "tamarin",
    fur: mix(AUTUMN, 55, BIRCH),
    face: mix(BARK, 70, mix(LINGON, 25, "black")),
    hands: mix(AUTUMN, 55, BIRCH),
    tail: "long",
    grip: "two",
    arm: 5.6,
    k: 0.72,
    head: "tamarin",
  },
  {
    id: "macaque",
    fur: mix(FG, 42, mix(BARK, 80, BG)),
    face: mix(LINGON, 55, mix(FG, 60, AUTUMN)),
    tail: "short",
    grip: "two",
    arm: 7,
    k: 1.05,
  },
  {
    id: "proboscis",
    fur: mix(AUTUMN, 55, CREAM),
    face: mix(LINGON, 25, mix(FG, 55, AUTUMN)),
    chest: mix(FG, 75, BIRCH),
    tailColor: mix(FG, 80, BIRCH),
    tail: "long",
    grip: "two",
    arm: 8,
    k: 1.05,
    extras: ["nose"],
  },
  {
    id: "howler",
    fur: mix(LINGON, 35, mix(BARK, 55, "black")),
    face: mix(BARK, 35, "black"),
    tail: "grip",
    grip: "one",
    arm: 7.6,
    k: 1.05,
    extras: ["beard"],
  },
  {
    id: "squirrel",
    fur: mix(FG, 40, mix(BIRCH, 50, BARK)),
    face: SNOW,
    chest: mix(BIRCH, 70, AUTUMN),
    tail: "curl",
    tailColor: mix(FG, 40, mix(BIRCH, 50, BARK)),
    grip: "two",
    arm: 6,
    k: 0.78,
    extras: ["mask"],
  },
];

const line = (d: string, color: string, w: number, key?: string | number) => (
  <path
    key={key}
    d={d}
    stroke={color}
    strokeWidth={w}
    fill="none"
    strokeLinecap="round"
    strokeLinejoin="round"
  />
);

function GibbonHead({ sp }: { sp: MonkeySpecies }) {
  const face =
    "M0.6,-1.2 C1.6,-1.5 2.5,-1 2.7,0 C3.3,0.4 3.5,1.2 3.1,1.8 C2.6,2.4 1.4,2.4 0.8,1.8 C0.2,1.2 0,-0.6 0.6,-1.2 Z";
  return (
    <g transform="translate(1.2 5.4)">
      <circle cx={0} cy={0} r={2.2} fill={sp.fur} />
      <path
        d={face}
        fill={mix(FG, 92, BIRCH)}
        transform="translate(-0.15 0.1) scale(1.2) translate(-0.3 -0.05)"
      />
      <path d={face} fill={sp.face} />
      <circle cx={1.75} cy={-0.2} r={0.3} fill={mix(AUTUMN, 50, BARK)} />
      <circle cx={1.78} cy={-0.22} r={0.17} fill="black" />
      <circle cx={1.86} cy={-0.3} r={0.08} fill={FG} />
      <path
        d="M2.4,1.5 C2.7,1.6 2.9,1.5 3,1.3"
        stroke={mix(sp.face, 60, FG)}
        strokeWidth={0.16}
        fill="none"
        strokeLinecap="round"
      />
    </g>
  );
}

function OrangHead({ sp }: { sp: MonkeySpecies }) {
  const hair = mix(sp.fur, 80, "black");
  return (
    <g transform="translate(1 5.2)">
      <path
        d="M-2.6,1.6 C-3.4,-1 -2.2,-3.4 0.4,-3.5 C2.6,-3.6 3.6,-2.2 3.2,-0.6 L2.4,1 L-1.2,3 Z"
        fill={sp.fur}
      />
      <path d="M-1,-3.2 L-0.5,-4.4 L0.2,-3.4 L0.8,-4.6 L1.3,-3.4 L2,-4.1 L2.1,-3" fill={sp.fur} />
      <path
        d="M-2.6,1.6 C-2.9,2.4 -2.6,3.2 -2.1,3.6 M-2,-1.6 C-2.6,-1 -2.8,0 -2.7,0.8"
        stroke={hair}
        strokeWidth={0.3}
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M0.4,-1.9 C1.6,-2.2 2.7,-1.6 2.8,-0.5 C3.5,0.1 3.8,1.3 3.3,2.2 C2.7,3.1 1.1,3.2 0.4,2.4 C-0.2,1.6 -0.3,-1 0.4,-1.9 Z"
        fill={sp.face}
      />
      <path
        d="M0.9,-0.8 C1.5,-1.1 2.2,-1.1 2.7,-0.8"
        stroke={mix(sp.face, 55, "black")}
        strokeWidth={0.28}
        fill="none"
        strokeLinecap="round"
      />
      <circle cx={1.85} cy={-0.25} r={0.27} fill="black" />
      <circle cx={1.93} cy={-0.34} r={0.1} fill={FG} />
      <path d="M2.6,1.1 C3.3,1.2 3.6,1.6 3.5,2.1 C3,2.5 2.3,2.4 2,2" fill={mix(sp.face, 65, FG)} />
      <path
        d="M2.2,2 C2.7,2.1 3.1,2 3.4,1.8"
        stroke={mix(sp.face, 45, "black")}
        strokeWidth={0.2}
        fill="none"
        strokeLinecap="round"
      />
    </g>
  );
}

function TamarinHead({ sp }: { sp: MonkeySpecies }) {
  const lobes = Array.from({ length: 11 }, (_, i) => {
    const a = (i / 11) * Math.PI * 2 + 0.3;
    return [Math.cos(a) * 2.5 - 0.1, Math.sin(a) * 2.7] as const;
  });
  const shine = mix(sp.fur, 65, BIRCH);
  return (
    <g transform="translate(1 5)">
      {lobes.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={1.25} fill={sp.fur} />
      ))}
      <circle cx={-0.1} cy={0} r={2.7} fill={sp.fur} />
      <path
        d="M-2,-1.6 C-1.2,-2.6 0.2,-2.9 1.2,-2.5 M-2.5,0.6 C-2.6,-0.4 -2.2,-1.2 -1.6,-1.8"
        stroke={shine}
        strokeWidth={0.35}
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M0.9,-1.3 C1.9,-1.4 2.6,-0.7 2.8,0.2 C3.5,0.5 3.7,1.3 3.3,1.8 C2.8,2.3 1.8,2.3 1.2,1.9 C0.5,1.4 0.2,0.4 0.3,-0.4 C0.4,-0.9 0.6,-1.2 0.9,-1.3 Z"
        fill={sp.face}
      />
      <circle cx={1.85} cy={-0.15} r={0.34} fill="black" />
      <circle cx={1.96} cy={-0.27} r={0.13} fill={FG} />
      <circle cx={3.15} cy={1} r={0.11} fill={mix(sp.face, 50, "black")} />
      <path
        d="M2.4,1.75 C2.7,1.85 3,1.8 3.2,1.6"
        stroke={mix(sp.face, 50, "black")}
        strokeWidth={0.16}
        fill="none"
        strokeLinecap="round"
      />
    </g>
  );
}

function Head({ sp }: { sp: MonkeySpecies }) {
  if (sp.head === "gibbon") return <GibbonHead sp={sp} />;
  if (sp.head === "orangutan") return <OrangHead sp={sp} />;
  if (sp.head === "tamarin") return <TamarinHead sp={sp} />;
  const ex = new Set(sp.extras ?? []);
  const furD = dark(sp.fur, 55);
  const mask = mix(BARK, 30, "black");
  return (
    <g transform="translate(1.2 5.6)">
      <circle cx={0} cy={0} r={2.4} fill={sp.fur} />
      {ex.has("cap") && (
        <path
          d="M-2.2,-0.6 C-2.2,-2.4 -0.8,-3 0.4,-2.8 C1.6,-2.6 2.4,-1.8 2.4,-1 C1.2,-1.6 -0.6,-1.6 -2.2,-0.6 Z"
          fill={furD}
        />
      )}
      <path
        d="M0.4,-1 C1.6,-1.2 2.8,-0.6 3,0.6 C3.2,1.6 2.6,2.4 1.6,2.4 C0.6,2.4 -0.2,1.6 -0.2,0.6 C-0.2,-0.2 0,-0.8 0.4,-1 Z"
        fill={sp.face}
      />
      {ex.has("mask") && (
        <path d="M1,-0.6 C1.8,-0.9 2.6,-0.5 2.6,0.4 C2,0.8 1.2,0.6 1,-0.6 Z" fill={mask} />
      )}
      {ex.has("nose") ? (
        <path
          d="M2.6,0.4 C3.8,0.4 4.6,1.4 4.4,2.6 C4.2,3.4 3.2,3.4 2.8,2.8 C2.6,2.2 2.6,1.2 2.6,0.4 Z"
          fill={mix(sp.face, 80, LINGON)}
        />
      ) : (
        <ellipse
          cx={2.7}
          cy={1.1}
          rx={0.72}
          ry={0.58}
          fill={ex.has("mask") ? mask : skin(sp.face)}
        />
      )}
      {ex.has("beard") && (
        <path d="M0.6,2 C1,3.6 2.2,4 2.8,3 C2.8,2.6 2.4,2.4 2,2.4 Z" fill={furD} />
      )}
      <circle cx={1.4} cy={0} r={0.36} fill="black" />
      <circle cx={1.5} cy={-0.12} r={0.12} fill={FG} />
      <circle cx={-1.6} cy={0.4} r={0.7} fill={skin(sp.face)} />
    </g>
  );
}

/** A monkey hanging from a branch's tip at (x, y). */
export function HangingMonkey({
  sp,
  x,
  y,
  side = 1,
  s = 1,
}: {
  sp: MonkeySpecies;
  x: number;
  y: number;
  side?: -1 | 1;
  s?: number;
}) {
  const { arm: A, k } = sp;
  const shaggy = sp.head === "orangutan";
  const far = dark(sp.fur);
  const hand = sp.hands ?? skin(sp.face);
  const limb = shaggy ? 1.7 : 1.2;
  // Body coordinates are the capuchin's: shoulders at y 7.4. Map them under this species' arms.
  const body = `translate(0 ${A}) scale(${k}) translate(0 -7.4)`;
  const g = (bx: number, by: number) => [bx * k, A + (by - 7.4) * k] as const;
  const [rx, ry] = g(-1.8, 14.6);
  const tailColor = sp.tailColor ?? sp.fur;
  return (
    <g transform={`translate(${x} ${y}) scale(${side * s} ${s})`}>
      {/* Tail around the tip, then down to the rump. */}
      {sp.tail === "grip" &&
        line(
          `M-1.4,-0.6 C-1,-1.8 1,-1.8 1.4,-0.6 C1.8,0.6 0.6,1.6 -0.4,1.2 M1.2,0.4 C2.4,${A * 0.5} 3.4,${ry - 4} ${rx},${ry}`,
          tailColor,
          0.95,
        )}
      {/* Far arm: on the wood, or loose. */}
      {sp.grip === "two"
        ? line(`M0.9,-0.2 C1,${A * 0.33} 0.9,${A * 0.62} ${0.5 * k},${A}`, far, limb)
        : null}
      <g transform={body}>
        {line("M-0.6,14.6 C-0.9,16.6 -1,18.4 -0.8,20", far, 1.25)}
        <ellipse cx={-0.5} cy={20.3} rx={0.95} ry={0.55} fill={far} />
        {sp.tail === "curl" &&
          line(
            "M-1.8,14.6 C-3.8,16.8 -4.2,20.2 -3,22.2 C-2.2,23.6 -0.6,23.4 -0.8,22.2 C-0.9,21.5 -1.6,21.4 -1.9,21.9",
            tailColor,
            0.95,
          )}
        {sp.tail === "short" && line("M-1.8,14.4 C-2.8,14.8 -3.2,15.6 -3,16.4", tailColor, 1.1)}
        {sp.tail === "long" && (
          <>
            {line("M-1.8,14.6 C-3.2,17.6 -3.4,21.6 -2.6,25.6", tailColor, 0.95)}
            {sp.tailColor && <ellipse cx={-2.5} cy={25.6} rx={0.8} ry={1.4} fill={tailColor} />}
          </>
        )}
        <path
          d="M-1.8,7.2 C-2.8,9.8 -2.8,12.8 -1.8,14.8 C-0.8,16.4 1.4,16.2 1.8,14.4 C2.2,12.4 1.8,9.6 1,7.4 C0.4,6.4 -1.2,6.2 -1.8,7.2 Z"
          fill={sp.fur}
          stroke={RIM}
          strokeWidth={0.18}
        />
        {sp.chest && (
          <path d="M0.4,7.4 C1.4,8.4 1.8,10 1.6,11.4 C1,10.4 0.5,9 0.4,7.4 Z" fill={sp.chest} />
        )}
        {shaggy && (
          <>
            <path
              d="M-2.6,9 C-3.6,10.6 -3.6,12.6 -2.8,14.4 L-2.2,13.6 L-2.6,15.2 L-1.6,14.6 C-2.6,12.8 -2.6,10.6 -2.2,9 Z"
              fill={sp.fur}
            />
            {line(
              "M-1.2,9.4 C-1.8,11 -1.8,12.6 -1.2,14 M0.6,9.6 C1,11 1,12.4 0.6,13.6",
              mix(sp.fur, 75, "black"),
              0.3,
            )}
          </>
        )}
        {line("M0.6,14.4 C2.2,15 3.2,15.8 3.2,16.8 C3.2,18 2.4,19 2,20", sp.fur, 1.45)}
        <path
          d="M1.2,20 C1.4,19.4 2.4,19.4 2.9,19.9 C3.2,20.3 2.9,20.8 2.4,20.8 L1.4,20.7 Z"
          fill={hand}
        />
        {sp.grip === "one" && (
          <>
            {line("M0.4,7.8 C2.4,10.2 3.6,13.2 4.2,16.4", sp.fur, 1.15)}
            <ellipse cx={4.3} cy={16.9} rx={0.6} ry={0.8} fill={hand} />
          </>
        )}
        <Head sp={sp} />
      </g>
      {/* Near arm and the hands round the wood. */}
      {line(`M-0.2,0 C-0.6,${A * 0.33} -0.9,${A * 0.65} ${-1 * k},${A + 0.2}`, sp.fur, limb)}
      {shaggy &&
        [0.3, 0.48, 0.66, 0.84].map((f, i) => {
          const [px, py] = [-0.2 - 0.8 * k * f, A * f];
          return line(`M${px - 0.4},${py} c-0.6,0.5 -0.9,1.2 -0.8,1.9`, sp.fur, 0.75, i);
        })}
      <path d="M-1.2,0.6 C-1.4,-0.6 -0.4,-1.4 0.6,-1.2 C1.6,-1 1.8,0.2 1.2,0.8 Z" fill={hand} />
    </g>
  );
}

/** How far below the grip a species reaches, in its own units (feet, or the end of a hanging tail). */
export const monkeyReach = (sp: MonkeySpecies) =>
  sp.arm + ((sp.tail === "long" ? 27 : 23.6) - 7.4) * sp.k;

/** The ride's monkey, picked at random but fixed by the ride (so a branch keeps its species everywhere). */
export function monkeyOf(b: Pick<TreeBranch, "seed">): MonkeySpecies {
  return MONKEYS[Math.floor(b.seed * 7919) % MONKEYS.length]!;
}
