// Your roads: every outdoor ride laid on the map as a heat map, cool on roads ridden once or twice, warm on the
// everyday ones. Opened by typing ("le mie strade", "heatmap"). Road shows road rides, gravel adds gravel rides, MTB all.
import { createFileRoute, Link, useCanGoBack, useRouter } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import { RouteMap } from "@/components/RouteMap";
import { heatColor, heatLines, mostRidden } from "@/components/roads/heat";
import { KINDS } from "@/lib/activity-kind";
import { t } from "@/lib/i18n";
import { BIKES, homeOf, roadLines, type Bike, type Bounds } from "@/lib/roads/my-roads";
import { useRoads } from "@/lib/roads/roads-app";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/roads")({ component: RoadsPage });

/** Europe, for someone with no rides to say where home is. */
const WIDE: Bounds = [
  [36, -10],
  [60, 28],
];

const around = (p: { lat: number; lng: number }): Bounds => [
  [p.lat - 0.06, p.lng - 0.08],
  [p.lat + 0.06, p.lng + 0.08],
];

/** The area roads are drawn for: the view and as much again on every side, at least ~15 km. */
function grow(v: Bounds): Bounds {
  const dLat = Math.max(0.15, v[1][0] - v[0][0]);
  const dLng = Math.max(0.2, v[1][1] - v[0][1]);
  return [
    [v[0][0] - dLat, v[0][1] - dLng],
    [v[1][0] + dLat, v[1][1] + dLng],
  ];
}

const inside = (v: Bounds, b: Bounds) =>
  v[0][0] >= b[0][0] && v[0][1] >= b[0][1] && v[1][0] <= b[1][0] && v[1][1] <= b[1][1];

function Chip({
  on,
  icon: Icon,
  onClick,
  children,
}: {
  on: boolean;
  icon: LucideIcon;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cn(
        "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors",
        on
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-secondary text-foreground hover:bg-secondary/70",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {children}
    </button>
  );
}

function BackButton() {
  const router = useRouter();
  const canGoBack = useCanGoBack();
  const cls =
    "on-sky inline-flex min-h-9 items-center gap-1 text-sm text-foreground/85 hover:text-foreground";
  const label = (
    <>
      <ArrowLeft className="h-4 w-4" /> {t("Back", "Indietro")}
    </>
  );
  return canGoBack ? (
    <button type="button" onClick={() => router.history.back()} className={cls}>
      {label}
    </button>
  ) : (
    <Link to="/" className={cls}>
      {label}
    </Link>
  );
}

function RoadsPage() {
  const roads = useRoads();
  const [bike, setBike] = useState<Bike>("road");
  const home = useMemo(() => (roads ? homeOf(roads) : null), [roads]);
  const start = home ? around(home) : null;
  // Drawn for the view and around it; again only when the map is moved or zoomed out past that.
  const [box, setBox] = useState<Bounds | null>(null);
  const area = box ?? (start ? grow(start) : null);
  const onView = useCallback((v: Bounds) => setBox((b) => (b && inside(v, b) ? b : grow(v))), []);
  const top = useMemo(() => (roads ? mostRidden(roads, bike) : 1), [roads, bike]);
  const underlay = useMemo(
    () => (roads && area ? heatLines(roadLines(roads, area, 1, bike), top) : []),
    [roads, area, top, bike],
  );
  const empty = roads !== null && roads.rides.size === 0;

  return (
    <div className="space-y-3">
      <BackButton />
      <h1 className="on-sky text-3xl font-bold tracking-tight">
        {t("Your roads", "Le tue strade")}
      </h1>
      <div className="flex flex-wrap gap-2">
        {BIKES.map((b) => (
          <Chip key={b} on={bike === b} icon={KINDS[b].icon} onClick={() => setBike(b)}>
            {KINDS[b].label}
          </Chip>
        ))}
      </div>
      <div className="relative">
        <RouteMap
          lines={[]}
          underlay={underlay}
          fitKey={home ? "home" : "wide"}
          home={start ?? WIDE}
          wheelZoom
          base="Satellite"
          onView={onView}
          className="h-[calc(100dvh-16rem)] min-h-[360px] rounded-xl"
        />
        {roads === null && (
          <span className="pointer-events-none absolute bottom-3 left-3 z-[500] flex items-center gap-1.5 rounded-full bg-background/85 px-3 py-1 text-xs">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {t("Reading your rides…", "Leggo le tue uscite…")}
          </span>
        )}
        {empty && (
          <span className="pointer-events-none absolute bottom-3 left-3 right-3 z-[500] rounded-lg bg-background/85 px-3 py-2 text-xs">
            {t(
              "No outdoor rides with GPS yet: your roads show up here after the first one.",
              "Ancora nessuna uscita all'aperto con GPS: le tue strade compaiono qui dopo la prima.",
            )}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>{t("rare", "rare")}</span>
        {[0.2, 0.5, 0.75, 0.95].map((h) => (
          <span key={h} className="h-1.5 w-6 rounded-full" style={{ background: heatColor(h) }} />
        ))}
        <span>{t("everyday", "di tutti i giorni")}</span>
      </div>
    </div>
  );
}
