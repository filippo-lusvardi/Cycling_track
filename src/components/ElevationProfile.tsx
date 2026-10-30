import { useMemo } from "react";
import { Area, AreaChart, CartesianGrid, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Climb, ClimbCategory } from "@/lib/climbs";

export const CAT_COLOR: Record<ClimbCategory, string> = {
  HC: "var(--z6)",
  "1": "var(--z5)",
  "2": "var(--z4)",
  "3": "var(--z3)",
  "4": "var(--z2)",
  Uncat: "var(--z1)",
};

/** Altitude vs distance with detected climbs shaded by category, plus an optional selected range. */
export function ElevationProfile({
  distance,
  altitude,
  climbs,
  highlight,
  selection,
  onHoverKm,
}: {
  distance: number[];
  altitude: number[];
  climbs: Climb[];
  highlight?: number | null;
  selection?: [number, number] | null;
  /** Distance under the pointer, for a map marker to follow. */
  onHoverKm?: (km: number | null) => void;
}) {
  const data = useMemo(() => {
    const n = Math.min(distance.length, altitude.length);
    const step = Math.max(1, Math.ceil(n / 800));
    const out: { km: number; alt: number }[] = [];
    for (let i = 0; i < n; i += step) {
      const alt = altitude[i];
      if (alt != null && Number.isFinite(alt)) out.push({ km: distance[i]! / 1000, alt });
    }
    return out;
  }, [distance, altitude]);
  if (data.length < 2) return <p className="text-sm text-muted-foreground">No altitude data for this ride.</p>;

  return (
    <div className="h-48 sm:h-56">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ left: -16, right: 4, top: 8 }}
          onMouseMove={(st) => onHoverKm?.(st?.activeLabel != null ? Number(st.activeLabel) : null)}
          onMouseLeave={() => onHoverKm?.(null)}
        >
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="km"
            type="number"
            domain={[0, data.at(-1)!.km]}
            tickFormatter={(v: number) => `${v.toFixed(0)} km`}
            stroke="var(--muted-foreground)"
            fontSize={11}
            minTickGap={30}
          />
          <YAxis domain={["dataMin - 20", "dataMax + 20"]} stroke="var(--muted-foreground)" fontSize={11} tickFormatter={(v: number) => `${Math.round(v)}`} />
          <Tooltip
            contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8 }}
            labelFormatter={(v) => `${Number(v).toFixed(1)} km`}
            formatter={(v) => [`${Math.round(Number(v))} m`, "Altitude"]}
          />
          {climbs.map((c, i) => (
            <ReferenceArea
              key={i}
              x1={c.startKm}
              x2={c.endKm}
              fill={CAT_COLOR[c.category]}
              fillOpacity={highlight === i ? 0.5 : 0.22}
              stroke={highlight === i ? CAT_COLOR[c.category] : undefined}
              ifOverflow="hidden"
            />
          ))}
          {selection && (
            <ReferenceArea x1={selection[0]} x2={selection[1]} fill="var(--primary)" fillOpacity={0.3} stroke="var(--primary)" ifOverflow="hidden" />
          )}
          <Area type="monotone" dataKey="alt" stroke="var(--fitness)" fill="var(--fitness)" fillOpacity={0.12} strokeWidth={1.5} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
