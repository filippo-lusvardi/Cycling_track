import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Star } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { gradientLines } from "@/components/GradientProfile";
import { RouteMap, type MapLine } from "@/components/RouteMap";
import { Panel } from "@/components/StatCard";
import { useSegmentNames } from "@/hooks/use-segment-names";
import { useSegmentLibrary } from "@/hooks/use-segments";
import { tracksQuery } from "@/lib/queries";
import { segmentSummary, segmentTrace } from "@/lib/segments";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/segments/")({
  head: () => ({ meta: [{ title: "Segments — Cadence" }] }),
  component: Segments,
});

const FILTERS = ["All", "Starred", "Saved", "Auto"] as const;

function Segments() {
  const { data: tracks, isLoading, error } = useQuery(tracksQuery(180));
  const lib = useSegmentLibrary(tracks);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const navigate = useNavigate();
  const [hovered, setHovered] = useState<string | null>(null);
  const nameOf = useSegmentNames(lib.list);
  // Moving between the pieces of a highlighted line fires out→over; a short delay stops it flickering.
  const unhover = useRef<ReturnType<typeof setTimeout>>(undefined);
  const rows = useRef(new Map<string, HTMLDivElement>());
  const hover = (id: string, over: boolean, fromMap = false) => {
    clearTimeout(unhover.current);
    // Pointing at a line on the map brings its row into view in the list.
    if (over && fromMap)
      rows.current.get(id)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    if (over) setHovered(id);
    else unhover.current = setTimeout(() => setHovered((h) => (h === id ? null : h)), 120);
  };
  const shown = useMemo(
    () =>
      lib.list.filter((s) =>
        filter === "Starred"
          ? s.starred
          : filter === "Saved"
            ? s.saved
            : filter === "Auto"
              ? !s.saved
              : true,
      ),
    [lib.list, filter],
  );

  // One path per segment, traced from the first ride that covers it.
  const traces = useMemo(
    () => new Map(tracks ? lib.list.map((s) => [s.id, segmentTrace(tracks, s)] as const) : []),
    [tracks, lib.list],
  );
  // Normally coloured by kind; while one is highlighted the rest go dim grey and it shows its gradient, on top.
  const lines = useMemo<MapLine[]>(() => {
    const base: MapLine[] = [];
    const top: MapLine[] = [];
    for (const s of shown) {
      const t = traces.get(s.id);
      if (!t) continue;
      const events = {
        tooltip: nameOf(s),
        onClick: () => navigate({ to: "/segments/$id", params: { id: s.id } }),
        onHover: (over: boolean) => hover(s.id, over, true),
      };
      if (hovered === s.id) {
        top.push({ lat: t.lat, lng: t.lng, color: "#ffffff", weight: 12, ...events });
        top.push(...gradientLines(t).map((g) => ({ ...g, weight: 7, ...events })));
      } else if (hovered)
        base.push({
          lat: t.lat,
          lng: t.lng,
          color: "var(--muted-foreground)",
          weight: 4,
          opacity: 0.45,
          ...events,
        });
      else
        base.push({
          lat: t.lat,
          lng: t.lng,
          color: s.starred ? "var(--birch)" : s.saved ? "var(--fitness)" : "var(--z1)",
          weight: 5,
          ...events,
        });
    }
    return [...base, ...top];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, traces, hovered, navigate, nameOf]);

  // Fills the screen below the header (and above the phone's bottom bar): the page stays put, only the list scrolls.
  return (
    <div className="-mb-12 flex h-[calc(100dvh-165px-env(safe-area-inset-bottom))] flex-col gap-4 lg:mb-0 lg:h-[calc(100dvh-129px)]">
      <div className="flex shrink-0 flex-wrap items-end justify-between gap-3">
        <div>
          <div className="eyebrow">Last 180 days · outdoor rides</div>
          <h1 className="text-3xl font-bold tracking-tight">Segments</h1>
        </div>
        <div className="flex gap-1 rounded-lg bg-secondary p-1">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "rounded-md px-3 py-1 text-xs",
                filter === f ? "bg-background text-foreground" : "text-muted-foreground",
              )}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:grid-rows-1">
        <Panel title="Map" className="flex min-h-0 flex-col">
          {lines.length > 0 ? (
            <RouteMap
              fitKey={`${filter}-${lines.length}`}
              lines={lines}
              className="h-auto min-h-0 flex-1"
            />
          ) : (
            <div className="flex min-h-0 flex-1 items-center justify-center rounded-lg bg-background/50 text-sm text-muted-foreground">
              {isLoading ? "Loading rides…" : "No segments to show"}
            </div>
          )}
          <div className="mt-2 flex shrink-0 gap-4 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="h-1 w-4 rounded bg-birch" /> Starred
            </span>
            <span className="flex items-center gap-1">
              <span className="h-1 w-4 rounded bg-fitness" /> Saved
            </span>
            <span className="flex items-center gap-1">
              <span className="h-1 w-4 rounded" style={{ background: "var(--z1)" }} /> Auto-detected
            </span>
          </div>
        </Panel>

        <Panel title={`${shown.length} segments`} className="flex min-h-0 flex-col">
          <div className="-mx-4 min-h-0 flex-1 overflow-y-auto overscroll-contain px-4">
            {isLoading && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Scanning your rides for recurring climbs… (first time takes a while; streams are
                cached after that)
              </p>
            )}
            {error && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Couldn't load rides: {String(error.message)}
              </p>
            )}
            {!isLoading && shown.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No segments yet. Star a climb or draw a segment on any ride's elevation profile.
              </p>
            )}
            <div className="-mx-3 divide-y divide-border">
              {shown.map((s) => (
                <div
                  key={s.id}
                  ref={(el) => {
                    if (el) rows.current.set(s.id, el);
                    else rows.current.delete(s.id);
                  }}
                  className={cn(
                    "flex items-center gap-2 px-3 transition-colors",
                    hovered === s.id && "bg-secondary/60",
                  )}
                  onMouseEnter={() => hover(s.id, true)}
                  onMouseLeave={() => hover(s.id, false)}
                >
                  <button
                    aria-label={s.starred ? "Unstar" : "Star"}
                    onClick={() => lib.toggleStar(s)}
                    className="p-1"
                  >
                    <Star
                      className={cn(
                        "h-4 w-4",
                        s.starred ? "fill-birch text-birch" : "text-muted-foreground",
                      )}
                    />
                  </button>
                  <Link
                    to="/segments/$id"
                    params={{ id: s.id }}
                    className="flex min-w-0 flex-1 items-center justify-between gap-4 rounded-lg py-3 hover:text-primary"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium">{nameOf(s)}</div>
                      <div className="stat-num truncate text-xs text-muted-foreground">
                        {segmentSummary(s)}
                      </div>
                    </div>
                    <div className="shrink-0 text-right text-xs text-muted-foreground">
                      <div>{s.saved ? (s.source === "custom" ? "Manual" : "Saved") : "Auto"}</div>
                      {s.rides != null && <div className="stat-num">{s.rides} rides</div>}
                    </div>
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}
