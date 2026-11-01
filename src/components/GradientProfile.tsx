import { useEffect, useMemo, useRef, useState } from "react";
import { GRADE_STOPS, gradeChunks, gradeColor, gradeRampCss, type Chunk } from "@/lib/profile";
import { t } from "@/lib/i18n";

const H = 220;
const PAD = { l: 40, r: 8, t: 12, b: 24 };

/**
 * Climb-style altimetry: altitude vs distance, filled in 100 m chunks shaded along a gradient colour ramp.
 * Reports the hovered sample index so a map can follow along.
 */
export function GradientProfile({
  dist,
  alt,
  hover,
  onHover,
  markers,
}: {
  dist: number[];
  alt: number[];
  hover?: number | null;
  onHover?: (i: number | null) => void;
  /** Dots on the altitude line at these distances (m), e.g. the riders of a ghost race. */
  markers?: { dist: number; color: string }[];
}) {
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(600);
  useEffect(() => {
    if (!box.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(240, e!.contentRect.width)));
    ro.observe(box.current);
    return () => ro.disconnect();
  }, []);

  const chunks = useMemo(() => gradeChunks(dist, alt), [dist, alt]);
  if (chunks.length === 0) return <p className="text-sm text-muted-foreground">{t("No altitude data.", "Nessun dato altimetrico.")}</p>;

  const total = dist.at(-1)!;
  const lo = Math.min(...chunks.map((c) => Math.min(c.altFrom, c.altTo)));
  const hi = Math.max(...chunks.map((c) => Math.max(c.altFrom, c.altTo)));
  const span = Math.max(20, hi - lo);
  const yMin = lo - span * 0.1;
  const yMax = hi + span * 0.1;
  const x = (d: number) => PAD.l + (d / total) * (w - PAD.l - PAD.r);
  const y = (a: number) => PAD.t + (1 - (a - yMin) / (yMax - yMin)) * (H - PAD.t - PAD.b);
  const bottom = H - PAD.b;
  const kmStep = total > 20000 ? 5 : total > 8000 ? 2 : total > 3000 ? 1 : 0.5;
  const kms = Array.from({ length: Math.floor(total / 1000 / kmStep) + 1 }, (_, i) => i * kmStep);
  const hc = hover != null ? chunks.find((c) => hover >= c.i0 && hover <= c.i1) : undefined;

  function pick(e: React.PointerEvent<SVGSVGElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const d = ((e.clientX - r.left - PAD.l) / (w - PAD.l - PAD.r)) * total;
    let i = 0;
    while (i < dist.length - 1 && dist[i]! < d) i++;
    onHover?.(d < 0 || d > total ? null : i);
  }

  return (
    <div ref={box} className="w-full">
      <svg
        width={w}
        height={H}
        className="touch-pan-y select-none"
        onPointerMove={pick}
        onPointerDown={pick}
        onPointerLeave={() => onHover?.(null)}
        role="img"
        aria-label={t("Elevation profile coloured by gradient", "Profilo altimetrico colorato per pendenza")}
      >
        {[lo, hi].map((a) => (
          <g key={a}>
            <line x1={PAD.l} x2={w - PAD.r} y1={y(a)} y2={y(a)} stroke="var(--border)" strokeDasharray="2 4" />
            <text x={PAD.l - 6} y={y(a)} textAnchor="end" dominantBaseline="middle" fontSize="10" fill="var(--muted-foreground)">
              {Math.round(a)}
            </text>
          </g>
        ))}
        {/* Opacity on the group, not per chunk, so neighbouring chunks don't show seams. */}
        <g opacity={0.9}>
          {chunks.map((c, i) => (
            <polygon
              key={i}
              points={`${x(c.from)},${y(c.altFrom)} ${x(c.to)},${y(c.altTo)} ${x(c.to)},${bottom} ${x(c.from)},${bottom}`}
              fill={gradeColor(c.grade)}
              stroke={gradeColor(c.grade)}
              strokeWidth={0.6}
            />
          ))}
        </g>
        {hc && (
          <polygon
            points={`${x(hc.from)},${y(hc.altFrom)} ${x(hc.to)},${y(hc.altTo)} ${x(hc.to)},${bottom} ${x(hc.from)},${bottom}`}
            fill="#ffffff"
            opacity={0.25}
            pointerEvents="none"
          />
        )}
        {chunks.map((c, i) => (
          <g key={i}>
            {x(c.to) - x(c.from) >= 22 && (
              <text
                x={(x(c.from) + x(c.to)) / 2}
                y={bottom - 6}
                textAnchor="middle"
                fontSize="9"
                fontWeight="600"
                fill="#0b1220"
              >
                {Math.round(c.grade)}
              </text>
            )}
          </g>
        ))}
        <polyline
          points={chunks.map((c) => `${x(c.from)},${y(c.altFrom)}`).join(" ") + ` ${x(total)},${y(chunks.at(-1)!.altTo)}`}
          fill="none"
          stroke="var(--foreground)"
          strokeWidth="1.5"
        />
        <line x1={PAD.l} x2={w - PAD.r} y1={bottom} y2={bottom} stroke="var(--muted-foreground)" />
        {kms.map((k) => (
          <text key={k} x={x(k * 1000)} y={H - 8} textAnchor="middle" fontSize="10" fill="var(--muted-foreground)">
            {k} km
          </text>
        ))}
        {markers?.map((mk, i) => {
          const a = lineAlt(chunks, mk.dist);
          return (
            <g key={i} pointerEvents="none">
              <line x1={x(mk.dist)} x2={x(mk.dist)} y1={y(a)} y2={bottom} stroke={mk.color} strokeWidth={1.5} />
              <circle cx={x(mk.dist)} cy={y(a)} r={6} fill={mk.color} stroke="#0b1220" strokeWidth={2} />
            </g>
          );
        })}
        {hover != null && dist[hover] != null && (
          <g pointerEvents="none">
            <line x1={x(dist[hover]!)} x2={x(dist[hover]!)} y1={PAD.t} y2={bottom} stroke="var(--foreground)" strokeDasharray="3 3" />
            <text
              x={Math.min(w - 90, Math.max(PAD.l + 4, x(dist[hover]!) + 6))}
              y={PAD.t + 10}
              fontSize="11"
              fill="var(--foreground)"
              className="stat-num"
            >
              {(dist[hover]! / 1000).toFixed(2)} km · {Math.round(alt[hover]!)} m{hc ? ` · ${hc.grade.toFixed(1)}%` : ""}
            </text>
          </g>
        )}
      </svg>
      <div className="mt-2 max-w-xs text-[11px] text-muted-foreground">
        <div className="h-2 rounded-sm" style={{ background: gradeRampCss() }} />
        <div className="stat-num relative mt-0.5 h-4">
          {GRADE_STOPS.map(([g], i) => (
            <span
              key={g}
              className="absolute -translate-x-1/2 first:translate-x-0 last:-translate-x-full"
              style={{ left: `${(g / GRADE_STOPS.at(-1)![0]) * 100}%` }}
            >
              {g}
              {i === GRADE_STOPS.length - 1 ? "%+" : "%"}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Altitude of the drawn (smoothed, per-chunk) profile line at a distance, so markers sit on the line. */
function lineAlt(chunks: Chunk[], d: number): number {
  const c = chunks.find((k) => d <= k.to) ?? chunks.at(-1)!;
  const f = c.to > c.from ? Math.min(1, Math.max(0, (d - c.from) / (c.to - c.from))) : 0;
  return c.altFrom + (c.altTo - c.altFrom) * f;
}

/** Map polylines for a path, one per 100 m chunk, coloured by gradient like the profile. */
export function gradientLines(t: { lat: number[]; lng: number[]; dist: number[]; alt: number[] }) {
  return gradeChunks(t.dist, t.alt).map((c) => ({
    lat: t.lat.slice(c.i0, c.i1 + 1),
    lng: t.lng.slice(c.i0, c.i1 + 1),
    color: gradeColor(c.grade),
    weight: 6,
  }));
}
