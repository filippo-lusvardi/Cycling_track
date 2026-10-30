import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Search, Star, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { gradientLines } from "@/components/GradientProfile";
import { RouteMap, type MapLine } from "@/components/RouteMap";
import { Panel } from "@/components/StatCard";
import { Input } from "@/components/ui/input";
import { useNamesPending, useSegmentNames } from "@/hooks/use-segment-names";
import { useSegmentLibrary } from "@/hooks/use-segments";
import { historyYears } from "@/lib/segment-app";
import type { Status } from "@/lib/segment-engine";
import { segmentSummary } from "@/lib/segments";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/segments/")({
  head: () => ({ meta: [{ title: "Segments — Ora" }] }),
  component: Segments,
});

const FILTERS = ["All", "Starred", "Saved", "Auto"] as const;

/** Lower-case without accents, so "coe" finds "Passo Coè" and "rovereto" finds "Rovereto → Pozzacchio". */
const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

function Segments() {
  const lib = useSegmentLibrary();
  const isLoading =
    lib.status.phase !== "idle" && lib.status.phase !== "error" && lib.list.length === 0;
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const navigate = useNavigate();
  const [hovered, setHovered] = useState<string | null>(null);
  // The segment the map is zoomed to: after a short rest on a row (desktop) or a first tap (phone).
  const [focused, setFocused] = useState<string | null>(null);
  const dwell = useRef<ReturnType<typeof setTimeout>>(undefined);
  const touch = useMemo(() => window.matchMedia("(hover: none) and (pointer: coarse)").matches, []);
  const highlight = hovered ?? focused;
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
  const [query, setQuery] = useState("");
  const search = useRef<HTMLInputElement>(null);
  const shown = useMemo(() => {
    const q = fold(query.trim());
    return lib.list.filter(
      (s) =>
        (filter === "Starred"
          ? s.starred
          : filter === "Saved"
            ? s.saved
            : filter === "Auto"
              ? !s.saved
              : true) &&
        (!q || fold(nameOf(s)).includes(q)),
    );
  }, [lib.list, filter, query, nameOf]);

  // "/" jumps to the search box on desktop, like many sites; Esc clears it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing =
        e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      if (e.key === "/" && !typing) {
        e.preventDefault();
        search.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // One path per segment, traced from the first ride that covers it.
  // Normally coloured by kind; while one is highlighted the rest go dim grey and it shows its gradient, on top.
  const lines = useMemo<MapLine[]>(() => {
    const base: MapLine[] = [];
    const top: MapLine[] = [];
    for (const s of shown) {
      const t = s.trace;
      if (!t) continue;
      const events = {
        tooltip: nameOf(s),
        onClick: () => navigate({ to: "/segments/$id", params: { id: s.id } }),
        onHover: (over: boolean) => hover(s.id, over, true),
      };
      if (highlight === s.id) {
        top.push({ lat: t.lat, lng: t.lng, color: "#ffffff", weight: 12, ...events });
        top.push(...gradientLines(t).map((g) => ({ ...g, weight: 7, ...events })));
      } else if (highlight)
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
  }, [shown, highlight, navigate, nameOf]);
  const focusPath = useMemo(() => {
    const t = shown.find((s) => s.id === focused)?.trace;
    return t && focused ? { key: focused, lat: t.lat, lng: t.lng } : null;
  }, [shown, focused]);

  // Fills the screen below the header (and above the phone's bottom bar): the page stays put, only the list scrolls.
  return (
    <div className="-mb-12 flex h-[calc(100dvh-165px-env(safe-area-inset-bottom))] flex-col gap-4 lg:mb-0 lg:h-[calc(100dvh-129px)]">
      <div className="flex shrink-0 flex-wrap items-end justify-between gap-3">
        <div>
          <div className="eyebrow">
            {lib.ridesAnalysed} outdoor rides ·{" "}
            {historyYears()
              ? `last ${historyYears()} year${historyYears() > 1 ? "s" : ""}`
              : "all history"}
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Segments</h1>
        </div>
        <div className="flex gap-1 rounded-lg bg-secondary p-1">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => {
                setFilter(f);
                setFocused(null);
              }}
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

      <SyncStatus status={lib.status} />
      <NamingStatus />

      <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:grid-rows-1">
        <Panel title="Map" className="flex min-h-0 flex-col">
          {lines.length > 0 ? (
            <RouteMap
              fitKey={`${filter}-${lines.length}`}
              lines={lines}
              focus={focusPath}
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
          <div className="relative mb-2 shrink-0">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={search}
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setFocused(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setQuery("");
                  e.currentTarget.blur();
                }
              }}
              placeholder={touch ? "Search segments" : "Search segments  ( / )"}
              aria-label="Search segments by name"
              className="pl-8 pr-8"
            />
            {query && (
              <button
                aria-label="Clear search"
                onClick={() => setQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <div
            className="-mx-4 min-h-0 flex-1 overflow-y-auto overscroll-contain px-4"
            onMouseEnter={() => clearTimeout(dwell.current)}
            onMouseLeave={() => {
              clearTimeout(dwell.current);
              if (!touch) dwell.current = setTimeout(() => setFocused(null), 400);
            }}
          >
            {isLoading && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Looking for recurring climbs in your rides… The first time each ride is downloaded
                once; after that only new rides are.
              </p>
            )}
            {!isLoading && shown.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {query.trim()
                  ? `No segment matches “${query.trim()}”.`
                  : "No segments yet. Star a climb or draw a segment on any ride's elevation profile."}
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
                    highlight === s.id && "bg-secondary/60",
                  )}
                  onMouseEnter={() => {
                    hover(s.id, true);
                    clearTimeout(dwell.current);
                    if (!touch) dwell.current = setTimeout(() => setFocused(s.id), 350);
                  }}
                  onMouseLeave={() => {
                    hover(s.id, false);
                    clearTimeout(dwell.current);
                  }}
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
                    onClick={(e) => {
                      // Phone: the first tap shows the segment on the map, the second opens it.
                      if (touch && focused !== s.id) {
                        e.preventDefault();
                        setFocused(s.id);
                      }
                    }}
                    className="flex min-w-0 flex-1 items-center justify-between gap-4 rounded-lg py-3 hover:text-primary"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium">{nameOf(s)}</div>
                      <div className="stat-num truncate text-xs text-muted-foreground">
                        {segmentSummary(s)}
                      </div>
                      {touch && focused === s.id && (
                        <div className="text-[11px] text-primary">Tap again to open</div>
                      )}
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

const PHASE: Record<Status["phase"], string> = {
  idle: "",
  listing: "Checking intervals.icu for new rides",
  downloading: "Downloading and analysing rides",
  analysing: "Matching segments to rides",
  error: "",
};

/** Progress of the background analysis; hidden when idle. */
function NamingStatus() {
  const left = useNamesPending();
  if (!left) return null;
  return (
    <p className="shrink-0 text-xs text-muted-foreground">
      Naming {left} segment{left === 1 ? "" : "s"} from OpenStreetMap… (keep Ora open)
    </p>
  );
}

function SyncStatus({ status }: { status: Status }) {
  if (status.phase === "idle") return null;
  if (status.phase === "error")
    return (
      <p className="shrink-0 text-xs text-muted-foreground">
        {status.message ?? "Segment analysis stopped."}
      </p>
    );
  const pct = status.total ? Math.round((status.done / status.total) * 100) : 0;
  return (
    <div className="shrink-0 space-y-1">
      <div className="stat-num flex justify-between text-xs text-muted-foreground">
        <span className="font-sans">{PHASE[status.phase]}…</span>
        {status.total > 0 && (
          <span>
            {status.done} / {status.total}
          </span>
        )}
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-secondary">
        <div
          className="h-full bg-primary transition-all"
          style={{ width: `${status.total ? pct : 15}%` }}
        />
      </div>
    </div>
  );
}
