import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

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

const BASE_KEY = "cadence_map_base";

// Free tile sources, no API key. Viewed tiles are cached by the service worker for offline use.
const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services";
const OSM_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
const esri = (service: string, maxZoom: number) =>
  L.tileLayer(`${ESRI}/${service}/MapServer/tile/{z}/{y}/{x}`, { maxZoom, attribution: "Tiles &copy; Esri" });

const BASES = {
  // Esri's dark grey canvas has no labels; its reference layer adds them on top.
  Dark: () => L.layerGroup([esri("Canvas/World_Dark_Gray_Base", 16), esri("Canvas/World_Dark_Gray_Reference", 16)]),
  Topo: () =>
    L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", {
      subdomains: "abc",
      maxZoom: 17,
      attribution: `${OSM_ATTR}, &copy; <a href="https://opentopomap.org">OpenTopoMap</a>`,
    }),
  Streets: () => L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: OSM_ATTR }),
  Satellite: () => esri("World_Imagery", 18),
};

const savedBase = (): keyof typeof BASES => {
  try {
    const v = localStorage.getItem(BASE_KEY);
    return v && v in BASES ? (v as keyof typeof BASES) : "Dark";
  } catch {
    return "Dark";
  }
};

/**
 * Leaflet map drawing polylines and pins. It re-fits the view only when `fitKey` changes,
 * so hovering a profile (`cursor`) or highlighting a line doesn't reset the zoom.
 */
export function RouteMap({
  lines,
  pins = [],
  cursor,
  fitKey,
  className,
}: {
  lines: MapLine[];
  pins?: MapPin[];
  cursor?: { lat: number; lng: number } | null;
  fitKey: string;
  className?: string;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const drawn = useRef<L.LayerGroup | null>(null);
  const dot = useRef<L.CircleMarker | null>(null);
  const fitted = useRef<string | null>(null);

  useEffect(() => {
    if (!el.current) return;
    const m = L.map(el.current, { scrollWheelZoom: false, zoomSnap: 0.5, maxZoom: 18 });
    const layers = Object.fromEntries(Object.entries(BASES).map(([k, make]) => [k, make()]));
    layers[savedBase()]!.addTo(m);
    L.control.layers(layers, undefined, { position: "topright" }).addTo(m);
    m.on("baselayerchange", (e) => {
      try {
        localStorage.setItem(BASE_KEY, e.name);
      } catch {
        /* per-device nicety only */
      }
    });
    // Wheel zoom only after clicking the map, so scrolling the page doesn't zoom by accident.
    m.on("click", () => m.scrollWheelZoom.enable());
    m.on("mouseout", () => m.scrollWheelZoom.disable());
    drawn.current = L.layerGroup().addTo(m);
    map.current = m;
    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(el.current);
    return () => {
      ro.disconnect();
      m.remove();
      map.current = null;
      fitted.current = null;
    };
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
    if (fitted.current !== fitKey && bounds.isValid()) {
      m.fitBounds(bounds, { padding: [24, 24], maxZoom: 16 });
      fitted.current = fitKey;
    }
  }, [lines, pins, fitKey]);

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

  // `isolate` keeps Leaflet's high z-indexes below the app's header, bottom bar and dialogs.
  return <div ref={el} className={cn("isolate z-0 h-72 w-full overflow-hidden rounded-lg bg-background", className)} />;
}
