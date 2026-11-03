// The sky behind the pages that live under it (Home, the Garden, the forests): one sky filling the window from its
// very top, behind the bars and the page's header, staying put while the page scrolls (the scenes draw only their
// land over it). The layers sit at the bottom of the page's stack (z 0 and 1) with the page's content raised above
// them (the root's main is z-10): never behind the body, whose own background would hide them. `PageSky` is that sky, drawn by the root; `SkyLand` adds mountains and hills low down for the forest
// pages without a scene of their own (climbs, members, a climb).
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { TimeSky, WeatherFront } from "@/components/sky/TimeSky";
import { useNow } from "@/hooks/use-now";
import { daylight, lit } from "@/lib/daylight";
import { ridgeAcross } from "@/lib/ridge";
import { useSkyState } from "@/lib/sky-store";

const mix = (a: string, pa: number, b: string) => `color-mix(in oklab, ${a} ${pa}%, ${b})`;
/** Drawing units across the window. */
const W = 1000;

/** The window's height in drawing units (W across), following resizes. */
function useViewHeight() {
  const measure = () => Math.round((W * window.innerHeight) / Math.max(1, window.innerWidth));
  const [h, setH] = useState(measure);
  useEffect(() => {
    const on = () => setH(measure());
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return h;
}

const layer = "pointer-events-none fixed inset-0 h-full w-full";

/** Where the sun and moon meet the land: about where the scenes' mountains stand. */
const horizonOf = (h: number) => h * 0.64;

/** The sky of the moment behind the whole page: today's weather on Home and in the Garden, clear elsewhere. */
export function PageSky() {
  const d = daylight(useNow());
  const H = useViewHeight();
  const { weather, phase, peakPx } = useSkyState();
  const horizon = horizonOf(H);
  // Below Home's recap; otherwise below the page's own header (title, tabs).
  const peak = peakPx != null ? (peakPx * W) / Math.max(1, window.innerWidth) : H * 0.32;
  const meadow = lit(mix("var(--summer)", 16, mix("var(--secondary)", 80, "var(--background)")), d);
  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className={`${layer} z-0`}
    >
      <TimeSky
        d={d}
        w={W}
        h={H}
        horizon={horizon}
        peak={Math.min(peak, horizon - 60)}
        weather={weather}
        phase={phase}
        seed="page"
      />
      {/* Land at the window's foot, so where a scene ends before it the ground runs on instead of the sky. */}
      <defs>
        <linearGradient id="page-ground" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: meadow }} stopOpacity={0} />
          <stop offset="0.45" style={{ stopColor: meadow }} stopOpacity={1} />
          <stop offset="1" style={{ stopColor: meadow }} stopOpacity={1} />
        </linearGradient>
      </defs>
      <rect x={0} y={H * 0.8} width={W} height={H * 0.2} fill="url(#page-ground)" />
      <WeatherFront
        d={d}
        w={W}
        h={H}
        horizon={horizon}
        weather={weather}
        phase={phase}
        seed="page"
      />
    </svg>
  );
}

/** Mountains and hills low in the window, for a forest page without a scene, over the page's sky. */
export function SkyLand() {
  const d = daylight(useNow());
  const H = useViewHeight();
  const horizon = horizonOf(H) + 30;
  const far = useMemo(() => ridgeAcross("backdrop-far", W, 1.3), []);
  const near = useMemo(() => ridgeAcross("backdrop-near", W, 1.1), []);
  const ridge = (ys: number[], top: number, depth: number) =>
    `0,${H} ${ys.map((v, i) => `${((i / (ys.length - 1)) * W).toFixed(1)},${(top + (1 - v) * depth).toFixed(1)}`).join(" ")} ${W},${H}`;
  // Into the page's background stack, beside the sky, not inside the page's (raised) content.
  return createPortal(
    <svg
      aria-hidden
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className={`${layer} z-[1]`}
    >
      <polygon
        points={ridge(far, horizon - 120, 120)}
        fill={lit(mix("var(--border)", 80, "var(--primary)"), d)}
      />
      <polygon
        points={ridge(near, horizon + 10, 70)}
        fill={lit(mix("var(--pine)", 16, mix("var(--secondary)", 50, "var(--background)")), d)}
      />
      <path
        d={`M0,${H} L0,${H * 0.92} Q${W / 2},${H * 0.86} ${W},${H * 0.92} L${W},${H} Z`}
        fill={lit(mix("var(--summer)", 18, mix("var(--secondary)", 80, "var(--background)")), d)}
      />
    </svg>,
    document.body,
  );
}
