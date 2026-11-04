// @vitest-environment jsdom
import L from "leaflet";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RouteMap, type MapLine } from "./RouteMap";

const line: MapLine = { lat: [46, 46.1], lng: [11, 11.1], color: "red" };
const home: [[number, number], [number, number]] = [
  [46, 11],
  [46.1, 11.1],
];
const elsewhere: [[number, number], [number, number]] = [
  [45, 10],
  [45.1, 10.1],
];
const focus = { key: "a", lat: [46, 46.01], lng: [11, 11.01] };

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
const render = (first: ReactNode) => {
  const container = document.createElement("div");
  document.body.append(container);
  const r = createRoot(container);
  root = r;
  const rerender = (ui: ReactNode) => act(() => r.render(ui));
  rerender(first);
  return { container, rerender };
};
const cleanup = () => {
  const r = root;
  if (r) act(() => r.unmount());
  root = null;
  document.body.innerHTML = "";
};

describe("RouteMap with a home view", () => {
  let map: L.Map;
  let fit: ReturnType<typeof vi.spyOn>;
  let flyBounds: ReturnType<typeof vi.spyOn>;
  let fly: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      },
    );
    const real = L.map;
    vi.spyOn(L, "map").mockImplementation((...args) => (map = real(...args)));
    fit = vi.spyOn(L.Map.prototype, "fitBounds").mockReturnThis();
    flyBounds = vi.spyOn(L.Map.prototype, "flyToBounds").mockReturnThis();
    fly = vi.spyOn(L.Map.prototype, "flyTo").mockReturnThis();
    vi.spyOn(L.Map.prototype, "getCenter").mockReturnValue(L.latLng(46, 11));
    vi.spyOn(L.Map.prototype, "getZoom").mockReturnValue(12);
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const drag = (box: Element) => {
    box.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    act(() => void map.fire("moveend"));
  };

  it("does not re-fit when the lines change under the same fitKey", () => {
    const ui = render(<RouteMap fitKey="k" home={home} lines={[line]} />);
    expect(fit).toHaveBeenCalledTimes(1);
    ui.rerender(<RouteMap fitKey="k" home={home} lines={[line, line, line]} />);
    expect(fit).toHaveBeenCalledTimes(1);
  });

  it("follows a moving home until the user takes over the map", () => {
    const ui = render(<RouteMap fitKey="k" home={home} lines={[line]} />);
    ui.rerender(<RouteMap fitKey="k" home={elsewhere} lines={[line]} />);
    expect(fit).toHaveBeenCalledTimes(2);
    drag(ui.container.firstElementChild!);
    ui.rerender(<RouteMap fitKey="k" home={home} lines={[line]} />);
    expect(fit).toHaveBeenCalledTimes(2);
  });

  it("re-fits on a new fitKey even after the user moved the map", () => {
    const ui = render(<RouteMap fitKey="k" home={home} lines={[line]} />);
    drag(ui.container.firstElementChild!);
    ui.rerender(<RouteMap fitKey="other" home={home} lines={[line]} />);
    expect(fit).toHaveBeenCalledTimes(2);
  });

  it("ends a focus on the view the user chose, not on home", () => {
    const ui = render(<RouteMap fitKey="k" home={home} lines={[line]} />);
    drag(ui.container.firstElementChild!);
    ui.rerender(<RouteMap fitKey="k" home={home} lines={[line]} focus={focus} />);
    flyBounds.mockClear();
    ui.rerender(<RouteMap fitKey="k" home={home} lines={[line]} focus={null} />);
    expect(flyBounds).not.toHaveBeenCalled();
    expect(fly).toHaveBeenCalledWith(L.latLng(46, 11), 12, { duration: 0.6 });
  });

  it("ends a focus on home when the user never moved the map", () => {
    const ui = render(<RouteMap fitKey="k" home={home} lines={[line]} focus={focus} />);
    flyBounds.mockClear();
    ui.rerender(<RouteMap fitKey="k" home={home} lines={[line]} focus={null} />);
    expect(flyBounds).toHaveBeenCalledTimes(1);
    expect(fly).not.toHaveBeenCalled();
  });

  it("stays put when the user moved the map during the focus", () => {
    const ui = render(<RouteMap fitKey="k" home={home} lines={[line]} focus={focus} />);
    flyBounds.mockClear();
    ui.container.firstElementChild!.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    ui.rerender(<RouteMap fitKey="k" home={home} lines={[line]} focus={null} />);
    expect(flyBounds).not.toHaveBeenCalled();
    expect(fly).not.toHaveBeenCalled();
  });

  it("the home button returns home, forgets the user's view and tells the page", () => {
    const onHome = vi.fn();
    const ui = render(<RouteMap fitKey="k" home={home} lines={[line]} onHome={onHome} />);
    drag(ui.container.firstElementChild!);
    const button = ui.container.querySelector<HTMLElement>('a[aria-label="Home view"]')!;
    act(() => button.click());
    expect(flyBounds).toHaveBeenCalledTimes(1);
    expect(onHome).toHaveBeenCalledTimes(1);
    ui.rerender(<RouteMap fitKey="k" home={home} lines={[line]} focus={focus} onHome={onHome} />);
    flyBounds.mockClear();
    ui.rerender(<RouteMap fitKey="k" home={home} lines={[line]} focus={null} onHome={onHome} />);
    expect(flyBounds).toHaveBeenCalledTimes(1);
    expect(fly).not.toHaveBeenCalled();
  });

  it("has no home button without a home", () => {
    const ui = render(<RouteMap fitKey="k" lines={[line]} />);
    expect(ui.container.querySelector('a[aria-label="Home view"]')).toBeNull();
  });
});
