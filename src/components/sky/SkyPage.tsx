// The sky behind the pages that live under it (the Tree, the Garden, the forests): one sky filling the window from its
// very top, behind the bars and the page's header, staying put while the page scrolls (the scenes draw only their
// land over it). The layers sit at the bottom of the page's stack (z 0 and 1) with the page's content raised above
// them (the root's main is z-10): never behind the body, whose own background would hide them. `PageSky` is that sky, drawn by the root; `SkyLand` adds mountains and hills low down for the forest
// pages without a scene of their own (climbs, members, a climb).
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { TimeSky, WeatherFront } from "@/components/sky/TimeSky";
import { useNow } from "@/hooks/use-now";
import { lastWeather } from "@/lib/accent";
import { daylight, lit } from "@/lib/daylight";
import { ridgeAcross, worldWidth } from "@/lib/ridge";
import { useSkyState } from "@/lib/sky-store";

const mix = (a: string, pa: number, b: string) => `color-mix(in oklab, ${a} ${pa}%, ${b})`;
/** Drawing units across the window for the land behind a page. */
const W = 1000;

/** The window in drawing units: `across` units wide (by default the scenes' own scale). */
function measureView(across?: number) {
  const w = across ?? worldWidth(window.innerWidth);
  return { w, h: Math.round((w * window.innerHeight) / Math.max(1, window.innerWidth)) };
}

/** The window in drawing units, following resizes. */
function useView(across?: number) {
  const [view, setView] = useState(() => measureView(across));
  useEffect(() => {
    const on = () => setView(measureView(across));
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, [across]);
  return view;
}

const layer = "pointer-events-none fixed inset-0 h-full w-full";

/** Where the sun and moon meet the land: about where the scenes' mountains stand. */
const horizonOf = (h: number) => h * 0.64;

/**
 * The sky of the moment behind the whole page, with the weather its page sets. `own`: my pages that set none (calendar,
 * analysis, body…) show my last known weather, matching the colours of their cards.
 */
export function PageSky({ bodies = true, own = false }: { bodies?: boolean; own?: boolean }) {
  const d = daylight(useNow());
  // At the scenes' own scale, so a moon, a cloud or a raindrop is the same size over a phone's land as over a desktop's.
  const { w: SW, h: H } = useView();
  const sky = useSkyState();
  const { peakPx, horizonPx } = sky;
  const { weather, phase } = own && !sky.weather ? lastWeather() : sky;
  const units = SW / Math.max(1, window.innerWidth);
  const horizon = horizonPx != null ? horizonPx * units : horizonOf(H);
  // Below the page's own header (title, tabs).
  const peak = peakPx != null ? peakPx * units : H * 0.32;
  const meadow = lit(
    mix("var(--summer)", 16, mix("var(--scene-secondary)", 80, "var(--scene-background)")),
    d,
  );
  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${SW} ${H}`}
      preserveAspectRatio="none"
      className={`${layer} z-0`}
    >
      <TimeSky
        d={d}
        w={SW}
        h={H}
        horizon={horizon}
        peak={Math.min(peak, horizon - 60)}
        bodies={bodies}
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
      <rect x={0} y={H * 0.8} width={SW} height={H * 0.2} fill="url(#page-ground)" />
      <WeatherFront
        d={d}
        w={SW}
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
export function SkyLand({ high = false }: { high?: boolean }) {
  const d = daylight(useNow());
  const { h: H } = useView(W);
  // `high`: the plain pages, where the hills climb well up the window and leave less blue sky behind the text.
  const horizon = high ? H * 0.36 : horizonOf(H) + 30;
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
        fill={lit(
          // `high` (the plain pages and the tree): a cool slate-blue, since warm daylight turns the usual grey to a
          // brown that swallows the bark and the amber text over it.
          high
            ? mix(
                "var(--fitness)",
                28,
                mix("var(--scene-secondary)", 75, "var(--scene-background)"),
              )
            : mix("var(--scene-border)", 80, "var(--primary)"),
          d,
        )}
      />
      <polygon
        points={ridge(near, horizon + 10, 70)}
        fill={lit(
          mix("var(--pine)", 16, mix("var(--scene-secondary)", 50, "var(--scene-background)")),
          d,
        )}
      />
      <path
        d={`M0,${H} L0,${H * 0.92} Q${W / 2},${H * 0.86} ${W},${H * 0.92} L${W},${H} Z`}
        fill={lit(
          mix("var(--summer)", 18, mix("var(--scene-secondary)", 80, "var(--scene-background)")),
          d,
        )}
      />
    </svg>,
    document.body,
  );
}
