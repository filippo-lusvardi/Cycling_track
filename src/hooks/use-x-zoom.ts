import { useMemo, useRef, useState } from "react";

/** Look of the stretch being dragged (a Recharts ReferenceArea): accent-tinted with solid edges. */
export const ZOOM_AREA = {
  fill: "var(--primary)",
  fillOpacity: 0.22,
  stroke: "var(--primary)",
  strokeOpacity: 0.9,
} as const;

type ChartState = { activeTooltipIndex?: number } | null | undefined;

/**
 * Zoom a chart along x only. With a mouse, drag across the chart to zoom to that stretch; on a phone, pinch with
 * two fingers (one finger still scrolls the page and scrubs). Double-click resets. Works on indices of `data`:
 * charts are given just the visible slice, so their y axis rescales to it.
 *
 * `inset` is the plot area's left/right offset (px) inside the wrapper, to place fingers on the data.
 * The handlers keep their identity across renders, so memoised charts don't redraw on every hover.
 */
export function useXZoom<T>(
  data: T[],
  { minSpan = 2, inset }: { minSpan?: number; inset: { left: number; right: number } },
) {
  // Keyed on the data, so new data (another ride, a work picked) starts unzoomed.
  const [zoom, setZoom] = useState<{ data: T[]; range: [number, number] } | null>(null);
  const [drag, setDrag] = useState<[number, number] | null>(null);
  const range = zoom?.data === data ? zoom.range : null;
  const view = useMemo(() => (range ? data.slice(range[0], range[1] + 1) : data), [data, range]);

  // Latest values for the stable handlers below.
  const live = useRef({ data, range, drag, minSpan, inset });
  live.current = { data, range, drag, minSpan, inset };
  const pinch = useRef<{ a: number; b: number } | null>(null);

  const handlers = useMemo(() => {
    const bounds = () => {
      const { data, range } = live.current;
      return range ?? [0, data.length - 1];
    };
    const set = (a: number, b: number) => {
      const { data } = live.current;
      const n = data.length;
      setZoom(a <= 0 && b >= n - 1 ? null : { data, range: [Math.max(0, a), Math.min(n - 1, b)] });
    };
    const reset = () => {
      setZoom(null);
      setDrag(null);
    };
    const fracs = (el: HTMLElement, touches: React.TouchList) => {
      const { inset } = live.current;
      const r = el.getBoundingClientRect();
      const w = r.width - inset.left - inset.right;
      return [touches[0]!, touches[1]!]
        .map((tc) => (tc.clientX - r.left - inset.left) / w)
        .sort((x, y) => x - y) as [number, number];
    };
    return {
      reset,
      // Recharts reports touches as mouse downs too: only a real mouse (it has `button`) starts a drag.
      chart: {
        onMouseDown: (st: ChartState, e: unknown) => {
          const i = st?.activeTooltipIndex;
          if (i != null && e && typeof e === "object" && "button" in e && e.button === 0)
            setDrag([i, i]);
        },
        onMouseMove: (st: ChartState) => {
          const i = st?.activeTooltipIndex;
          const { drag } = live.current;
          if (drag && i != null && i !== drag[1]) setDrag([drag[0], i]);
        },
        onMouseUp: () => {
          const { drag, minSpan } = live.current;
          const [i0] = bounds();
          if (drag && Math.abs(drag[1] - drag[0]) >= minSpan)
            set(i0 + Math.min(...drag), i0 + Math.max(...drag));
          setDrag(null);
        },
        onMouseLeave: () => setDrag(null),
      },
      wrapper: {
        style: { touchAction: "pan-y" } as const,
        onDoubleClick: reset,
        onTouchStart: (e: React.TouchEvent<HTMLElement>) => {
          if (e.touches.length !== 2) return;
          const [i0, i1] = bounds();
          const [f1, f2] = fracs(e.currentTarget, e.touches);
          pinch.current = { a: i0 + f1 * (i1 - i0), b: i0 + f2 * (i1 - i0) };
        },
        onTouchMove: (e: React.TouchEvent<HTMLElement>) => {
          if (!pinch.current || e.touches.length !== 2) return;
          const [g1, g2] = fracs(e.currentTarget, e.touches);
          if (g2 - g1 < 0.05) return;
          // Keep the data points that started under each finger under that finger.
          const { data, minSpan } = live.current;
          const n = data.length;
          const { a, b } = pinch.current;
          const span = Math.min(n - 1, Math.max(minSpan, (b - a) / (g2 - g1)));
          const start = Math.min(n - 1 - span, Math.max(0, a - g1 * span));
          set(Math.round(start), Math.round(start + span));
        },
        onTouchEnd: (e: React.TouchEvent<HTMLElement>) => {
          if (e.touches.length < 2) pinch.current = null;
        },
      },
    };
  }, []);

  /** The stretch being dragged, as indices into `view`, for a ReferenceArea. */
  const selection = useMemo(
    () =>
      drag && drag[0] !== drag[1]
        ? ([Math.min(...drag), Math.max(...drag)] as [number, number])
        : null,
    [drag],
  );
  return { view, zoomed: !!range, selection, ...handlers };
}
