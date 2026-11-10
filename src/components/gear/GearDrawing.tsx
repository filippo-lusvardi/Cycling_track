// A bike or a shoe, drawn in the app's own colours. On the gear's page every part that wears is its own shape, tinted
// by how far it is through its interval and tappable; small (in lists, on an activity) it's a plain grey icon.
import type { KeyboardEvent, ReactNode } from "react";
import { DUE, PARTS, type Frame, type PartKind } from "@/lib/gear";
import { t } from "@/lib/i18n";

export type Drawn = PartKind | "sole";
/** `ratio` is km over interval; null when the part has none. Untracked parts are drawn faint. */
export type PartState = { tracked: boolean; ratio?: number | null };

/** In use (the season's accent) → nearly due → past. No interval: plain, still tappable. */
export function wearTone(s?: PartState) {
  if (!s || !s.tracked) return "var(--muted-foreground)";
  const r = s.ratio;
  if (r == null) return "color-mix(in oklab, var(--foreground) 75%, transparent)";
  if (r < DUE) return "var(--primary)";
  if (r < 1) return "var(--z5)";
  return "var(--lingon)";
}

const FRAME = "color-mix(in oklab, var(--foreground) 62%, transparent)";

type Props = {
  parts?: Partial<Record<Drawn, PartState>>;
  selected?: Drawn | null;
  onSelect?: (p: Drawn) => void;
  /** As an icon: grey, no detail, nothing to tap. */
  mini?: boolean;
  className?: string | undefined;
};

const R = [140, 270] as const;
const F = [462, 270] as const;
const BB = [292, 284] as const;

function usePart({ parts = {}, selected, onSelect, mini }: Props) {
  return (id: Drawn, node: (c: string, on: boolean) => ReactNode) => {
    const st = parts[id];
    const on = selected === id;
    const c = mini ? FRAME : wearTone(st);
    const tap = !mini && onSelect;
    const label = id === "sole" ? t("Sole", "Suola") : PARTS[id].label();
    return (
      <g
        key={id}
        {...(tap
          ? {
              role: "button",
              tabIndex: 0,
              "aria-label": label,
              "aria-pressed": on,
              onClick: () => onSelect(id),
              onKeyDown: (e: KeyboardEvent) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(id);
                }
              },
            }
          : {})}
        className={tap ? "cursor-pointer outline-none [&:focus-visible]:opacity-100" : undefined}
        style={{
          opacity: mini ? 1 : selected && !on ? 0.45 : st && !st.tracked ? 0.4 : 1,
          filter: on ? `drop-shadow(0 0 6px ${c})` : undefined,
          transition: "opacity .2s, filter .2s",
        }}
      >
        {tap && <title>{label}</title>}
        {node(c, on)}
      </g>
    );
  };
}

const BARS: Record<Frame, string> = {
  road: "M454,104 Q480,102 488,116 Q494,140 480,158 Q472,166 462,162",
  gravel: "M454,104 Q482,100 490,116 Q500,142 486,162 Q480,170 470,168",
  mtb: "M446,98 L478,94",
  tt: "M454,104 L506,98 M462,104 L466,92",
};

export function BikeDrawing(props: Props & { frame?: Frame }) {
  const { frame = "road", mini, className } = props;
  const part = usePart(props);
  const wide = frame === "gravel" || frame === "mtb";
  const tyreW = frame === "mtb" ? 17 : frame === "gravel" ? 14 : 9;
  const sw = mini ? 1.6 : 1;
  const spokes = (cx: number, cy: number) =>
    Array.from({ length: 12 }, (_, i) => {
      const a = (i / 12) * Math.PI * 2;
      return (
        <line
          key={i}
          x1={cx + Math.cos(a) * 12}
          y1={cy + Math.sin(a) * 12}
          x2={cx + Math.cos(a) * 93}
          y2={cy + Math.sin(a) * 93}
          stroke="var(--border)"
          strokeWidth={1.2}
        />
      );
    });
  const tyre = (id: "tyreF" | "tyreR", [x, y]: readonly [number, number]) =>
    part(id, (c, on) => (
      <circle
        cx={x}
        cy={y}
        r={104}
        fill="none"
        stroke={c}
        strokeWidth={(on ? tyreW + 3 : tyreW) * sw}
        strokeDasharray={wide && !mini ? "2 3" : undefined}
      />
    ));
  return (
    <svg viewBox="20 44 570 346" className={className} aria-hidden={mini || undefined}>
      {[R, F].map(([x, y], i) => (
        <g key={i}>
          {!mini && spokes(x, y)}
          <circle cx={x} cy={y} r={96} fill="none" stroke={FRAME} strokeWidth={3 * sw} />
        </g>
      ))}
      {tyre("tyreR", R)}
      {tyre("tyreF", F)}
      {part("discR", (c, on) => (
        <circle cx={R[0]} cy={R[1]} r={29} fill="none" stroke={c} strokeWidth={(on ? 6 : 4) * sw} />
      ))}
      {part("discF", (c, on) => (
        <circle cx={F[0]} cy={F[1]} r={27} fill="none" stroke={c} strokeWidth={(on ? 6 : 4) * sw} />
      ))}
      <g
        stroke={FRAME}
        strokeWidth={9 * sw}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      >
        <path d={`M${R[0]},${R[1]} L${BB[0]},${BB[1]} L258,122 Z`} />
        <path d={`M258,122 L428,124 L${BB[0]},${BB[1]}`} />
        <path d="M428,124 L438,172" strokeWidth={12 * sw} />
        <path
          d={`M438,172 Q452,232 ${F[0]},${F[1]}`}
          strokeWidth={(frame === "mtb" ? 11 : 7) * sw}
        />
        <path d="M258,122 L249,66" strokeWidth={6 * sw} />
        <path
          d={frame === "mtb" ? "M428,124 L426,104 L446,98" : "M428,124 L426,112 L454,104"}
          strokeWidth={6 * sw}
        />
      </g>
      <path d="M206,60 Q234,52 276,60 L272,67 Q240,63 210,67 Z" fill={FRAME} />
      {part("tape", (c, on) => (
        <path
          d={BARS[frame]}
          fill="none"
          stroke={c}
          strokeWidth={(on ? 10 : 7) * sw}
          strokeLinecap="round"
        />
      ))}
      {part("cassette", (c, on) => (
        <g>
          <circle
            cx={R[0]}
            cy={R[1]}
            r={21}
            fill="var(--card)"
            stroke={c}
            strokeWidth={(on ? 5 : 3.5) * sw}
            strokeDasharray={mini ? undefined : "3 1.6"}
          />
          <circle cx={R[0]} cy={R[1]} r={13} fill="none" stroke={c} strokeWidth={2 * sw} />
        </g>
      ))}
      {part("chain", (c, on) => (
        <path
          d={`M${R[0]},${R[1] - 22} L${BB[0]},${BB[1] - 38} M${R[0] + 4},${R[1] + 21} L${BB[0]},${BB[1] + 38}`}
          fill="none"
          stroke={c}
          strokeWidth={(on ? 6 : 4) * sw}
          strokeDasharray={mini ? undefined : "4 2.4"}
        />
      ))}
      {part("chainring", (c, on) => (
        <circle
          cx={BB[0]}
          cy={BB[1]}
          r={38}
          fill="var(--card)"
          stroke={c}
          strokeWidth={(on ? 6 : 4.5) * sw}
          strokeDasharray={mini ? undefined : "3.2 1.8"}
        />
      ))}
      <path
        d={`M${BB[0]},${BB[1]} L318,334`}
        stroke={FRAME}
        strokeWidth={8 * sw}
        strokeLinecap="round"
      />
      <rect x={306} y={331} width={26} height={7} rx={3} fill={FRAME} />
      {part("bb", (c, on) => (
        <circle cx={BB[0]} cy={BB[1]} r={on ? 11 : 9} fill={c} />
      ))}
      {part("padsR", (c) => (
        <rect
          x={150}
          y={232}
          width={22}
          height={12}
          rx={4}
          fill={c}
          transform="rotate(-20 161 238)"
        />
      ))}
      {part("padsF", (c) => (
        <rect
          x={444}
          y={233}
          width={22}
          height={12}
          rx={4}
          fill={c}
          transform="rotate(70 455 239)"
        />
      ))}
    </svg>
  );
}

export function ShoeDrawing(props: Props) {
  const { mini, className } = props;
  const part = usePart(props);
  const sw = mini ? 1.8 : 1;
  const line = {
    stroke: FRAME,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  return (
    <svg viewBox="70 108 510 242" className={className} aria-hidden={mini || undefined}>
      <path
        d="M96,264 C86,226 86,180 100,150 C104,142 110,140 116,144 C140,162 160,172 182,172 C192,150 204,132 222,124 C232,120 242,122 246,130 C282,160 322,186 372,206 C430,226 490,232 528,246 C552,256 562,268 560,282 L420,286 L140,266 Z"
        {...line}
        fill="var(--card)"
        strokeWidth={5 * sw}
      />
      <path
        d="M116,154 C140,172 160,182 184,182"
        fill="none"
        {...line}
        strokeWidth={2.5 * sw}
        opacity={0.55}
      />
      <path
        d="M102,256 C132,246 150,220 156,182"
        fill="none"
        {...line}
        strokeWidth={3 * sw}
        opacity={0.7}
      />
      <path
        d="M476,234 C484,256 506,272 538,280"
        fill="none"
        {...line}
        strokeWidth={3 * sw}
        opacity={0.7}
      />
      {!mini && (
        <path
          d="M176,270 C238,242 318,236 404,266"
          fill="none"
          {...line}
          strokeWidth={3}
          opacity={0.45}
        />
      )}
      <path d="M238,136 L372,208" fill="none" {...line} strokeWidth={3 * sw} opacity={0.6} />
      {!mini &&
        [0, 1, 2, 3, 4].map((k) => {
          const x = 252 + k * 27;
          const y = 144 + k * 14.5;
          return (
            <path
              key={k}
              d={`M${x + 6},${y - 11} L${x - 6},${y + 11}`}
              fill="none"
              {...line}
              strokeWidth={4}
            />
          );
        })}
      {part("sole", (c) => (
        <g>
          <path
            d="M92,262 L140,266 L420,286 L560,282 C568,294 564,306 548,312 C500,324 400,328 300,328 C200,328 130,326 102,322 C86,316 82,286 92,262 Z"
            fill={`color-mix(in oklab, ${c} ${mini ? 20 : 28}%, var(--card))`}
            stroke={c}
            strokeWidth={4 * sw}
            strokeLinejoin="round"
          />
          <path
            d="M102,322 C130,326 200,328 300,328 C400,328 500,324 548,312 L552,320 C504,334 402,338 300,338 C198,338 124,336 100,331 Z"
            fill={c}
          />
          {!mini && (
            <path
              d="M114,333 C200,336 300,336 400,333 C470,330 520,324 544,318"
              fill="none"
              stroke="var(--card)"
              strokeWidth={3}
              strokeDasharray="10 8"
            />
          )}
        </g>
      ))}
    </svg>
  );
}

/** The gear's own drawing as a small grey icon. */
export function GearIcon({
  kind,
  frame,
  className,
}: {
  kind: "bike" | "shoes";
  frame?: Frame | undefined;
  className?: string;
}) {
  return kind === "shoes" ? (
    <ShoeDrawing mini className={className} />
  ) : (
    <BikeDrawing mini frame={frame ?? "road"} className={className} />
  );
}

/** Parts the bike drawing has a shape for. */
export const DRAWN: PartKind[] = [
  "chain",
  "cassette",
  "chainring",
  "padsF",
  "padsR",
  "discF",
  "discR",
  "tyreF",
  "tyreR",
  "tape",
  "bb",
];
