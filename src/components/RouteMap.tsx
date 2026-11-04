import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";

export type MapLine = {
  lat: number[];
  lng: number[];
  color: string;
  weight?: number;
  opacity?: number;
  tooltip?: string;
  onClick?: () => void;
  onHover?: (over: boolean) => void;
};
export type MapPin = { lat: number; lng: number; color: string; label: string };

// Renamed when Satellite became the default, so every device starts on it once.
const BASE_KEY = "ora_map_base";

// Free tile sources, no API key. Viewed tiles are cached by the service worker for offline use. Tiles are fetched
// with CORS (all three servers allow it): an opaque no-CORS response counts as about 7 MB in Chrome's storage
// quota, which made a few hundred cached tiles look like gigabytes on Android.
const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services";
const OSM_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
const esri = (service: string, maxZoom: number) =>
  L.tileLayer(`${ESRI}/${service}/MapServer/tile/{z}/{y}/{x}`, {
    maxZoom,
    crossOrigin: true,
    attribution: "Tiles &copy; Esri",
  });

const BASES = {
  // Esri's dark grey canvas has no labels; its reference layer adds them on top.
  Dark: () => L.layerGroup([esri("Canvas/World_Dark_Gray_Base", 16), esri("Canvas/World_Dark_Gray_Reference", 16)]),
  Topo: () =>
    L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", {
      subdomains: "abc",
      maxZoom: 17,
      crossOrigin: true,
      attribution: `${OSM_ATTR}, &copy; <a href="https://opentopomap.org">OpenTopoMap</a>`,
    }),
  Streets: () =>
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      crossOrigin: true,
      attribution: OSM_ATTR,
    }),
  // Imagery with Esri's place names and boundaries on top.
  Satellite: () =>
    L.layerGroup([esri("World_Imagery", 18), esri("Reference/World_Boundaries_and_Places", 18)]),
};

const BASE_LABEL: Record<keyof typeof BASES, string> = {
  Dark: t("Dark", "Scura"),
  Topo: "Topo",
  Streets: t("Streets", "Stradale"),
  Satellite: t("Satellite", "Satellite"),
};

const savedBase = (): keyof typeof BASES => {
  try {
    const v = localStorage.getItem(BASE_KEY);
    return v && v in BASES ? (v as keyof typeof BASES) : "Satellite";
  } catch {
    return "Satellite";
  }
};

const HOME_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>';

/**
 * Leaflet map drawing polylines and pins. It re-fits the view only when `fitKey` changes,
 * so hovering a profile (`cursor`) or highlighting a line doesn't reset the zoom.
 */
export function RouteMap({
  lines,
  pins = [],
  cursor,
  fitKey,
  focus,
  markers,
  home,
  onHome,
  wheelZoom = false,
  className,
}: {
  lines: MapLine[];
  pins?: MapPin[];
  cursor?: { lat: number; lng: number } | null;
  fitKey: string;
  /** Fly to this path; when it goes back to null, fly back out to everything. */
  focus?: { key: string; lat: number[]; lng: number[] } | null;
  /** Moving dots (e.g. the two riders of a ghost race); updated in place, never re-fitting the view. */
  markers?: MapPin[];
  /**
   * Where the map opens instead of fitting everything drawn, and what its home button goes back to. Once the
   * user has moved the map it stays theirs: a focus ends back on the view they chose, not here.
   */
  home?: [[number, number], [number, number]] | null;
  /** The home button was pressed (e.g. to drop whatever the page has focused). */
  onHome?: () => void;
  /** Wheel zoom from the start, for a map on a page that doesn't scroll. Otherwise it waits for a click on the map. */
  wheelZoom?: boolean;
  className?: string;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const drawn = useRef<L.LayerGroup | null>(null);
  const dot = useRef<L.CircleMarker | null>(null);
  const moving = useRef<L.CircleMarker[]>([]);
  const fitted = useRef<string | null>(null);
  const all = useRef<L.LatLngBounds | null>(null);
  const focused = useRef<string | null>(null);
  const hasHome = home !== undefined;
  // The user touched the map since the app last moved it.
  const gesture = useRef(false);
  // The view the user last chose; null while the map is still on the app's own view.
  const userView = useRef<{ center: L.LatLng; zoom: number } | null>(null);
  const lastFit = useRef<L.LatLngBounds | null>(null);
  const homePressed = useRef(onHome);
  homePressed.current = onHome;

  useEffect(() => {
    if (!el.current) return;
    const box = el.current;
    const m = L.map(box, { scrollWheelZoom: wheelZoom, zoomSnap: 0.5, maxZoom: 18 });
    const keys = Object.keys(BASES) as (keyof typeof BASES)[];
    // The control shows translated names; the stored choice stays the language-independent key.
    const layers = Object.fromEntries(keys.map((k) => [BASE_LABEL[k], BASES[k]()]));
    layers[BASE_LABEL[savedBase()]]!.addTo(m);
    L.control.layers(layers, undefined, { position: "topright" }).addTo(m);
    m.on("baselayerchange", (e) => {
      try {
        localStorage.setItem(BASE_KEY, keys.find((k) => BASE_LABEL[k] === e.name) ?? e.name);
      } catch {
        /* per-device nicety only */
      }
    });
    // Wheel zoom only after clicking the map, so scrolling the page doesn't zoom by accident.
    if (!wheelZoom) {
      m.on("click", () => m.scrollWheelZoom.enable());
      m.on("mouseout", () => m.scrollWheelZoom.disable());
    }
    // Capture phase, so presses on the zoom buttons count too. A wheel only counts if it can zoom the map.
    const touched = () => {
      gesture.current = true;
    };
    const wheeled = () => {
      if (m.scrollWheelZoom.enabled()) touched();
    };
    box.addEventListener("pointerdown", touched, true);
    box.addEventListener("keydown", touched, true);
    box.addEventListener("wheel", wheeled, { capture: true, passive: true });
    m.on("moveend", () => {
      if (gesture.current) userView.current = { center: m.getCenter(), zoom: m.getZoom() };
    });
    if (hasHome) {
      const control = new L.Control({ position: "topleft" });
      control.onAdd = () => {
        const bar = L.DomUtil.create("div", "leaflet-bar");
        const a = L.DomUtil.create("a", "", bar);
        const label = t("Home view", "Vista iniziale");
        a.href = "#";
        a.title = label;
        a.setAttribute("role", "button");
        a.setAttribute("aria-label", label);
        a.style.display = "flex";
        a.style.alignItems = "center";
        a.style.justifyContent = "center";
        a.innerHTML = HOME_ICON;
        L.DomEvent.disableClickPropagation(bar);
        L.DomEvent.on(a, "click", (e) => {
          L.DomEvent.preventDefault(e);
          focused.current = null;
          userView.current = null;
          gesture.current = false;
          if (all.current)
            m.flyToBounds(all.current, { padding: [24, 24], maxZoom: 16, duration: 0.6 });
          homePressed.current?.();
        });
        return bar;
      };
      control.addTo(m);
    }
    drawn.current = L.layerGroup().addTo(m);
    map.current = m;
    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(el.current);
    return () => {
      ro.disconnect();
      box.removeEventListener("pointerdown", touched, true);
      box.removeEventListener("keydown", touched, true);
      box.removeEventListener("wheel", wheeled, true);
      m.remove();
      map.current = null;
      fitted.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const m = map.current;
    const g = drawn.current;
    if (!m || !g) return;
    g.clearLayers();
    const bounds = L.latLngBounds([]);
    for (const l of lines) {
      const pts = l.lat.map((la, i) => L.latLng(la, l.lng[i]!));
      if (pts.length < 2) continue;
      const pl = L.polyline(pts, {
        color: l.color,
        weight: l.weight ?? 4,
        opacity: l.opacity ?? 1,
        lineCap: "round",
        lineJoin: "round",
      }).addTo(g);
      if (l.tooltip) pl.bindTooltip(l.tooltip, { sticky: true });
      if (l.onClick) pl.on("click", l.onClick);
      if (l.onHover) pl.on("mouseover", () => l.onHover!(true)).on("mouseout", () => l.onHover!(false));
      bounds.extend(pl.getBounds());
    }
    for (const p of pins) {
      L.circleMarker([p.lat, p.lng], { radius: 7, color: "#0b1220", weight: 2, fillColor: p.color, fillOpacity: 1 })
        .bindTooltip(p.label)
        .addTo(g);
      bounds.extend([p.lat, p.lng]);
    }
    const target = home ? L.latLngBounds(home) : bounds;
    if (target.isValid()) all.current = target;
    if (target.isValid()) {
      const fit = () => {
        gesture.current = false;
        m.fitBounds(target, { padding: [24, 24], maxZoom: 16 });
        lastFit.current = target;
      };
      if (fitted.current !== fitKey) {
        fitted.current = fitKey;
        userView.current = null;
        gesture.current = false;
        // While focused the map stays put; ending the focus flies to the new target.
        if (!focused.current) fit();
      } else if (
        // Segments still arriving move the home area: follow it until the user takes over the map.
        hasHome &&
        !focused.current &&
        !gesture.current &&
        !userView.current &&
        !lastFit.current?.equals(target)
      )
        fit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, pins, fitKey]);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (focus && focus.lat.length > 1) {
      gesture.current = false;
      m.flyToBounds(L.latLngBounds(focus.lat.map((la, i) => L.latLng(la, focus.lng[i]!))), {
        padding: [40, 40],
        maxZoom: 15,
        duration: 0.6,
      });
      focused.current = focus.key;
    } else if (focused.current) {
      focused.current = null;
      // The user moved the map during the focus: that's where it stays.
      if (hasHome && gesture.current) {
        userView.current = { center: m.getCenter(), zoom: m.getZoom() };
        return;
      }
      gesture.current = false;
      const view = hasHome ? userView.current : null;
      if (view) m.flyTo(view.center, view.zoom, { duration: 0.6 });
      else if (all.current)
        m.flyToBounds(all.current, { padding: [24, 24], maxZoom: 16, duration: 0.6 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.key]);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (!cursor) {
      dot.current?.remove();
      dot.current = null;
      return;
    }
    if (!dot.current)
      dot.current = L.circleMarker([cursor.lat, cursor.lng], {
        radius: 6,
        color: "#ffffff",
        weight: 2,
        fillColor: "#38bdf8",
        fillOpacity: 1,
        interactive: false,
      }).addTo(m);
    else dot.current.setLatLng([cursor.lat, cursor.lng]);
  }, [cursor]);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const want = markers ?? [];
    while (moving.current.length > want.length) moving.current.pop()!.remove();
    want.forEach((p, i) => {
      const cur = moving.current[i];
      if (cur) cur.setLatLng([p.lat, p.lng]).setStyle({ fillColor: p.color });
      else
        moving.current[i] = L.circleMarker([p.lat, p.lng], {
          radius: 8,
          color: "#0b1220",
          weight: 2,
          fillColor: p.color,
          fillOpacity: 1,
          interactive: false,
        })
          .bindTooltip(p.label, { permanent: false })
          .addTo(m);
    });
  }, [markers]);

  // `isolate` keeps Leaflet's high z-indexes below the app's header, bottom bar and dialogs.
  return <div ref={el} className={cn("isolate z-0 h-72 w-full overflow-hidden rounded-lg bg-background", className)} />;
}
