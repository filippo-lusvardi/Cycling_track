import { useMemo, useRef, useState } from "react";

/** Look of the stretch being dragged (a Recharts ReferenceArea): accent-tinted with solid edges. */
export const ZOOM_AREA = {
  fill: "var(--primary)",
  fillOpacity: 0.22,
  stroke: "var(--primary)",
  strokeOpacity: 0.9,
} as const;

type ChartState = { activeTooltipIndex?: number } | null | undefined;

/** `range` slid by `delta` indices (rounded), stopped at either end of `n` points, its span unchanged. */
export function panRange([a, b]: [number, number], delta: number, n: number): [number, number] {
  const span = b - a;
  const start = Math.min(n - 1 - span, Math.max(0, Math.round(a + delta)));
  return [start, start + span];
}

/**
 * Zoom a chart along x only. With a mouse, drag across the chart to zoom to that stretch; on a phone, pinch with
 * two fingers (one finger still scrolls the page and scrubs). Once zoomed, a sideways swipe, Shift+drag or a horizontal
 * wheel/trackpad scroll slides the window. Double-click resets. Works on indices of `data`:
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
  // A one-finger swipe on a zoomed chart: undecided until it has moved, then panning or left to the page.
  const swipe = useRef<{
    x: number;
    y: number;
    range: [number, number];
    mode: "?" | "pan" | "off";
  } | null>(null);
  const mousePan = useRef<{ x: number; range: [number, number] } | null>(null);

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
    const plotWidth = (r: DOMRect) => r.width - live.current.inset.left - live.current.inset.right;
    const fracs = (el: HTMLElement, touches: React.TouchList) => {
      const { inset } = live.current;
      const r = el.getBoundingClientRect();
      const w = plotWidth(r);
      return [touches[0]!, touches[1]!]
        .map((tc) => (tc.clientX - r.left - inset.left) / w)
        .sort((x, y) => x - y) as [number, number];
    };
    /** Slide `from` by `dx` pixels of the plot (positive = later data). */
    const pan = (el: HTMLElement, from: [number, number], dx: number) => {
      const { data } = live.current;
      const w = plotWidth(el.getBoundingClientRect());
      if (w > 0) set(...panRange(from, (dx / w) * (from[1] - from[0]), data.length));
    };
    return {
      reset,
      // Recharts reports touches as mouse downs too: only a real mouse (it has `button`) starts a drag.
      chart: {
        onMouseDown: (st: ChartState, e: unknown) => {
          const i = st?.activeTooltipIndex;
          // Shift+drag pans instead (see the wrapper).
          if (
            i != null &&
            e &&
            typeof e === "object" &&
            "button" in e &&
            e.button === 0 &&
            !("shiftKey" in e && e.shiftKey)
          )
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
        onMouseDown: (e: React.MouseEvent<HTMLElement>) => {
          const { range } = live.current;
          if (e.shiftKey && e.button === 0 && range) mousePan.current = { x: e.clientX, range };
        },
        onMouseMove: (e: React.MouseEvent<HTMLElement>) => {
          const p = mousePan.current;
          if (p) pan(e.currentTarget, p.range, p.x - e.clientX);
        },
        onMouseUp: () => {
          mousePan.current = null;
        },
        onMouseLeave: () => {
          mousePan.current = null;
        },
        onWheel: (e: React.WheelEvent<HTMLElement>) => {
          const { range } = live.current;
          if (!range) return;
          // Sideways scroll, or Shift+wheel on a mouse; a plain vertical wheel keeps scrolling the page.
          const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.shiftKey ? e.deltaY : 0;
          // Firefox counts a mouse wheel in lines.
          if (d) pan(e.currentTarget, range, e.deltaMode === 1 ? d * 16 : d);
        },
        onTouchStart: (e: React.TouchEvent<HTMLElement>) => {
          const { range } = live.current;
          if (e.touches.length === 1 && range) {
            const tc = e.touches[0]!;
            swipe.current = { x: tc.clientX, y: tc.clientY, range, mode: "?" };
            return;
          }
          swipe.current = null;
          if (e.touches.length !== 2) return;
          const [i0, i1] = bounds();
          const [f1, f2] = fracs(e.currentTarget, e.touches);
          pinch.current = { a: i0 + f1 * (i1 - i0), b: i0 + f2 * (i1 - i0) };
        },
        onTouchMove: (e: React.TouchEvent<HTMLElement>) => {
          const s = swipe.current;
          if (s && e.touches.length === 1) {
            const tc = e.touches[0]!;
            const dx = tc.clientX - s.x;
            const dy = tc.clientY - s.y;
            if (s.mode === "?" && Math.hypot(dx, dy) > 8)
              s.mode = Math.abs(dx) > Math.abs(dy) ? "pan" : "off";
            // The data under the finger stays under it.
            if (s.mode === "pan") pan(e.currentTarget, s.range, -dx);
            return;
          }
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
          if (e.touches.length === 0) swipe.current = null;
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
