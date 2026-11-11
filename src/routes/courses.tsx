// Routes: plan a ride on the roads you usually ride, with its climbs and altimetry, keep it, and send it to Garmin.
// The list holds your routes (and which ones you've ridden since); the planner draws one from checkpoints tapped on
// the map; "Proponimi un giro" draws three loops from a wish (how long, which climbs, from where).
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { parseISO } from "date-fns";
import {
  Bike,
  ChevronRight,
  Flag,
  Loader2,
  LocateFixed,
  Pencil,
  Plus,
  Route as RouteIcon,
  Save,
  Sparkles,
  Trash2,
  Undo2,
  Watch,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Chip, Shape, Spark, Stat } from "@/components/course/bits";
import { GarminSheet } from "@/components/course/GarminSheet";
import { StopList } from "@/components/course/StopList";
import { heatLines, mostRidden } from "@/components/course/heat";
import {
  climbNames,
  useKnownClimbs,
  useRider,
  type NamedClimb,
} from "@/components/course/use-course-data";
import { CLIMB_LABEL, durationText } from "@/components/course/labels";
import { WishSheet } from "@/components/course/WishSheet";
import { CAT_COLOR } from "@/components/ElevationProfile";
import { GradientProfile, gradientLines } from "@/components/GradientProfile";
import { ResponsiveDialog } from "@/components/ResponsiveDialog";
import { RouteMap, type MapLine } from "@/components/RouteMap";
import { Panel } from "@/components/StatCard";
import { Input } from "@/components/ui/input";
import type { Climb } from "@/lib/climbs";
import { routeThrough } from "@/lib/course/brouter";
import {
  newCourseId,
  rodeIt,
  summarize,
  type Checkpoint,
  type Course,
  type Ridden,
} from "@/lib/course/course";
import { lineClimbs, lineTimes } from "@/lib/course/estimate";
import { coursePoints, type CourseFile } from "@/lib/course/fit-course";
import { generate, type Proposal, type Wish } from "@/lib/course/generate";
import { bearing, boundsOf, gainOf, type Bounds, type LatLng, type Line } from "@/lib/course/geo";
import { homeOf, roadLines, type Roads } from "@/lib/course/my-roads";
import {
  DEFAULT_OPTIONS,
  planRoute,
  stopsOn,
  type Planned,
  type PlanOptions,
} from "@/lib/course/plan";
import { ridesSince, useRoads } from "@/lib/course/roads-app";
import {
  DEFAULT_WISH,
  fromSearch,
  toSearch,
  type WishForm,
  type WishSearch,
} from "@/lib/course/wish-form";
import { patchCourse, removeCourse, saveCourse, useCourseState } from "@/lib/course-store";
import { format, num, t } from "@/lib/i18n";
import { searchPlace } from "@/lib/places";
import { storedTrack } from "@/lib/segment-app";
import { addDays, isoDate } from "@/lib/training";
import { cn } from "@/lib/utils";

type Search = WishSearch & { id?: string; plan?: string };

const STR_KEYS = [
  "id",
  "plan",
  "ask",
  "min",
  "km",
  "climbs",
  "gain",
  "from",
  "place",
  "roads",
  "paths",
] as const;

export const Route = createFileRoute("/courses")({
  validateSearch: (s: Record<string, unknown>): Search =>
    Object.fromEntries(
      STR_KEYS.flatMap((k) =>
        typeof s[k] === "string" || typeof s[k] === "number" ? [[k, String(s[k])]] : [],
      ),
    ) as Search,
  component: CoursesPage,
});

/** A route being drawn: a new one, a proposal taken up, or a saved one opened. */
type Draft = {
  id?: string;
  name: string;
  created?: string;
  ridden?: Ridden[] | undefined;
  checkedTo?: string | undefined;
  checkpoints: Checkpoint[];
  options: PlanOptions;
  planned: Planned | null;
};

/** A proposal handed to the planner across the navigation. */
let handed: Draft | null = null;

function CoursesPage() {
  const search = Route.useSearch();
  const { courses, ready } = useCourseState();
  if (search.id) {
    const c = courses.find((x) => x.id === search.id);
    if (c) return <Planner key={`${c.id}-${c.updated}`} initial={draftOf(c)} />;
    return ready ? (
      <div className="space-y-3">
        <BackToList />
        <p className="text-sm text-muted-foreground">
          {t("This route is no longer here.", "Questo percorso non c'è più.")}
        </p>
      </div>
    ) : null;
  }
  if (search.plan) {
    const d = search.plan === "draft" && handed ? handed : newDraft();
    return <Planner key={search.plan === "draft" ? "draft" : "new"} initial={d} />;
  }
  if (search.ask) return <Proposals key={JSON.stringify(search)} form={fromSearch(search)} />;
  return <CourseList courses={courses} ready={ready} />;
}

const newDraft = (): Draft => ({
  name: "",
  checkpoints: [],
  options: DEFAULT_OPTIONS,
  planned: null,
});

function draftOf(c: Course): Draft {
  return {
    id: c.id,
    name: c.name,
    created: c.created,
    ridden: c.ridden,
    checkedTo: c.checkedTo,
    checkpoints: c.checkpoints,
    options: c.options,
    planned:
      c.line.lat.length > 1
        ? { line: c.line, stops: stopsOn(c.line, c.checkpoints, c.options.loop), own: c.own }
        : null,
  };
}

const BackToList = () => (
  <Link to="/courses" search={{}} className="eyebrow hover:text-foreground">
    {t("Routes", "Percorsi")}
  </Link>
);

// --- text ---

const km = (m: number) =>
  (m / 1000).toLocaleString(t("en-GB", "it-IT"), {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  });
const timeText = (s: number) => {
  const m = Math.round(s / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}`;
};
const pct = (g: number) =>
  `${g.toLocaleString(t("en-GB", "it-IT"), { maximumFractionDigits: 1 })}%`;
const dayShort = (d: string) => format(parseISO(d), "d MMM");

const DIRECTIONS = () => [
  t("north", "nord"),
  t("north-east", "nord-est"),
  t("east", "est"),
  t("south-east", "sud-est"),
  t("south", "sud"),
  t("south-west", "sud-ovest"),
  t("west", "ovest"),
  t("north-west", "nord-ovest"),
];

/** "Giro di Sardagna e Povo", or the way it heads: "Giro verso est, 32 km". */
function suggestName(line: Line, names: (string | null)[]): string {
  const known = [...new Set(names.filter((n): n is string => !!n))].slice(0, 2);
  if (known.length)
    return known.length === 1
      ? t(`${known[0]} ride`, `Giro di ${known[0]}`)
      : t(`${known[0]} and ${known[1]} ride`, `Giro di ${known[0]} e ${known[1]}`);
  if (line.lat.length < 2) return t("New route", "Nuovo percorso");
  const start = { lat: line.lat[0]!, lng: line.lng[0]! };
  let far = 0;
  let fi = 0;
  for (let i = 0; i < line.lat.length; i += 10) {
    const d = Math.hypot(line.lat[i]! - start.lat, (line.lng[i]! - start.lng) * 0.7);
    if (d > far) {
      far = d;
      fi = i;
    }
  }
  const dir =
    DIRECTIONS()[Math.round(bearing(start, { lat: line.lat[fi]!, lng: line.lng[fi]! }) / 45) % 8];
  return t(
    `Ride ${dir}, ${km(line.dist.at(-1)!)} km`,
    `Giro verso ${dir}, ${km(line.dist.at(-1)!)} km`,
  );
}

const pad = (b: Bounds | null, by: number): Bounds | null =>
  b && [
    [b[0][0] - by, b[0][1] - by],
    [b[1][0] + by, b[1][1] + by],
  ];

/** The area your roads are drawn for: the view and as much again on every side, at least ~15 km. */
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

/**
 * Your roads as a heat map under the map (quieter once a route is drawn), for the area around what the map shows:
 * drawn again only when the map is moved or zoomed out past it.
 */
function useRoadUnderlay(roads: Roads | null, start: Bounds | null, dim = false) {
  const [box, setBox] = useState<Bounds | null>(null);
  const area = box ?? (start ? grow(start) : null);
  const onView = useCallback((v: Bounds) => setBox((b) => (b && inside(v, b) ? b : grow(v))), []);
  const key = area
    ? area
        .flat()
        .map((v) => v.toFixed(3))
        .join(",")
    : "";
  const top = useMemo(() => (roads ? mostRidden(roads) : 1), [roads]);
  const underlay = useMemo(() => {
    if (!roads || !area) return [];
    return heatLines(roadLines(roads, area), top, dim);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roads, key, top, dim]);
  return { underlay, onView };
}

// --- the list ---

function CourseList({ courses, ready }: { courses: Course[]; ready: boolean }) {
  const navigate = useNavigate();
  const roads = useRoads();
  const [asking, setAsking] = useState(false);
  useRiddenCheck(courses);
  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          {courses.length > 0 && (
            <div className="eyebrow">
              {t(
                `${courses.length} ${courses.length === 1 ? "route" : "routes"}`,
                `${courses.length} ${courses.length === 1 ? "percorso" : "percorsi"}`,
              )}
            </div>
          )}
          <h1 className="on-sky text-3xl font-bold tracking-tight">{t("Routes", "Percorsi")}</h1>
        </div>
        <Link
          to="/courses"
          search={{ plan: "new" }}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-secondary px-4 text-sm font-medium"
        >
          <Plus className="h-4 w-4" />
          {t("New", "Nuovo")}
        </Link>
      </div>
      <button
        type="button"
        onClick={() => setAsking(true)}
        className="flex w-full items-center gap-3 rounded-xl border border-border bg-card p-3 text-left transition-colors hover:bg-secondary"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary">
          <Sparkles className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-medium">{t("Suggest a ride", "Proponimi un giro")}</span>
          <span className="block text-xs text-muted-foreground">
            {t("how long, which climbs, from where", "quanto, che salite, da dove")}
          </span>
        </span>
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </button>
      {ready && !courses.length && (
        <p className="px-1 text-sm text-muted-foreground">
          {t(
            "Tap New and then the map to draw a route through your checkpoints, or let Cirmolo suggest one.",
            "Tocca Nuovo e poi la mappa per tracciare un percorso tra le tue tappe, o fattene proporre uno.",
          )}
        </p>
      )}
      {courses.length > 0 && (
        <section className="space-y-2">
          <div className="eyebrow">{t("Saved", "Salvati")}</div>
          {courses.map((c) => (
            <CourseCard key={c.id} c={c} />
          ))}
        </section>
      )}
      {asking && (
        <WishSheet
          open
          onOpenChange={setAsking}
          initial={DEFAULT_WISH}
          hasHome={!!roads && !!homeOf(roads)}
          onGo={(w) => {
            setAsking(false);
            void navigate({ to: "/courses", search: toSearch(w) });
          }}
        />
      )}
    </div>
  );
}

function riddenText(r: Ridden[] | undefined) {
  if (!r?.length) return null;
  const last = dayShort(r.at(-1)!.date);
  return r.length === 1
    ? t(`ridden ${last}`, `pedalato ${last}`)
    : t(`ridden ${r.length} times · last ${last}`, `pedalato ${r.length} volte · ultima ${last}`);
}

function CourseCard({ c }: { c: Course }) {
  const ridden = riddenText(c.ridden);
  return (
    <Link
      to="/courses"
      search={{ id: c.id }}
      className="flex w-full items-center gap-3 rounded-xl border border-border bg-card p-3 text-left transition-colors hover:bg-secondary"
    >
      <span className="flex h-14 w-20 shrink-0 items-center justify-center rounded-lg bg-secondary/60 text-foreground/80">
        <Shape lat={c.line.lat} lng={c.line.lng} className="h-12 w-12" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="truncate font-medium">{c.name}</span>
          <span className="stat-num shrink-0 font-semibold">
            {km(c.distance)}
            <span className="ml-1 text-xs text-muted-foreground">km</span>
          </span>
        </span>
        <span className="block text-xs text-muted-foreground">
          {num(Math.round(c.gain))} m · {timeText(c.seconds)} ·{" "}
          {t(
            `${c.climbs.length} ${c.climbs.length === 1 ? "climb" : "climbs"}`,
            `${c.climbs.length} ${c.climbs.length === 1 ? "salita" : "salite"}`,
          )}{" "}
          · {t(`made ${dayShort(c.created)}`, `creato ${dayShort(c.created)}`)}
        </span>
        <span
          className="mt-0.5 flex items-center gap-1 text-xs"
          style={ridden ? { color: "var(--z2)" } : undefined}
        >
          {ridden ? (
            <>
              <Bike className="h-3 w-3" /> {ridden}
            </>
          ) : (
            <span className="text-muted-foreground">
              {t("not ridden yet", "non ancora pedalato")}
            </span>
          )}
        </span>
      </span>
    </Link>
  );
}

/** Rides since each route was made (or last looked at) that went round it: noted on the route, once. */
function useRiddenCheck(courses: Course[]) {
  const busy = useRef(false);
  const sig = courses.map((c) => `${c.id}:${c.checkedTo ?? ""}`).join("|");
  useEffect(() => {
    if (busy.current || !courses.length) return;
    busy.current = true;
    const today = isoDate(new Date());
    void (async () => {
      try {
        for (const c of courses) {
          if (c.checkedTo === today || c.line.lat.length < 2) continue;
          const from = c.checkedTo ? addDays(c.checkedTo, 1) : c.created;
          const rides = await ridesSince(from);
          const seen = new Set((c.ridden ?? []).map((r) => r.id));
          const found: Ridden[] = [];
          for (const r of rides) {
            if (seen.has(r.id)) continue;
            const tr = await storedTrack(r.id);
            if (tr && rodeIt(c.line, tr)) found.push({ id: r.id, date: r.date.slice(0, 10) });
          }
          await patchCourse(c.id, {
            checkedTo: today,
            ...(found.length ? { ridden: [...(c.ridden ?? []), ...found] } : {}),
          });
        }
      } catch (e) {
        console.warn("Route rides check failed", e);
      } finally {
        busy.current = false;
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);
}

// --- the planner ---

const planKey = (cps: LatLng[], o: PlanOptions, withRoads: boolean) =>
  JSON.stringify([cps.map((p) => [p.lat.toFixed(5), p.lng.toFixed(5)]), o, withRoads && o.myRoads]);

function stopLabel(i: number, n: number, loop: boolean) {
  if (i === 0) return t("Start", "Partenza");
  if (!loop && i === n - 1) return t("Finish", "Arrivo");
  return t(`Stop ${i}`, `Tappa ${i}`);
}

function Planner({ initial }: { initial: Draft }) {
  const navigate = useNavigate();
  const roads = useRoads();
  const rider = useRider();
  const known = useKnownClimbs();
  const [cps, setCps] = useState<Checkpoint[]>(initial.checkpoints);
  const [opts, setOpts] = useState<PlanOptions>(initial.options);
  const [planned, setPlanned] = useState<Planned | null>(initial.planned);
  const [undo, setUndo] = useState<Checkpoint[][]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [focusClimb, setFocusClimb] = useState<number | null>(null);
  const [sheet, setSheet] = useState<"save" | "garmin" | "delete" | null>(null);
  const routed = useRef(
    initial.planned ? planKey(initial.checkpoints, initial.options, !!roads) : "",
  );
  const withRoads = !!roads;

  useEffect(() => {
    const k = planKey(cps, opts, withRoads);
    // A saved route or a proposal comes with its line: drawn again only once something changes.
    if (
      k === routed.current ||
      (initial.planned && routed.current === planKey(cps, opts, !withRoads))
    ) {
      routed.current = k;
      return;
    }
    if (cps.length < 2) {
      routed.current = k;
      setPlanned(null);
      setError(null);
      return;
    }
    const ac = new AbortController();
    setBusy(true);
    const timer = setTimeout(() => {
      planRoute(cps, opts, { route: routeThrough, roads }, ac.signal)
        .then((p) => {
          routed.current = k;
          setPlanned(p);
          setError(null);
        })
        .catch((e) => {
          if (ac.signal.aborted) return;
          console.warn("Routing failed", e);
          setError(
            t(
              "No road found there: move the last checkpoint onto a road, or try again.",
              "Non trovo una strada: sposta l'ultima tappa su una strada, o riprova.",
            ),
          );
        })
        .finally(() => {
          if (!ac.signal.aborted) setBusy(false);
        });
    }, 350);
    return () => {
      clearTimeout(timer);
      ac.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cps, opts, withRoads]);

  const line = planned?.line ?? null;
  const times = useMemo(() => (line ? lineTimes(line, rider) : []), [line, rider]);
  const climbs = useMemo(() => (line ? lineClimbs(line, rider) : []), [line, rider]);
  const names = useMemo(() => (line ? climbNames(climbs, line, known) : []), [climbs, line, known]);
  const gain = line ? gainOf(line.alt) : 0;

  const change = (next: Checkpoint[]) => {
    setUndo((u) => [...u.slice(-30), cps]);
    setCps(next);
  };

  const home = roads ? homeOf(roads) : null;
  // No rides to know home from: the map opens where you are (or, without a position, on Europe).
  const here = useHere(!initial.planned && !initial.checkpoints.length && roads !== null && !home);
  const anchor = home ?? here;
  const viewBox: Bounds | null =
    boundsOf(line ?? { lat: [], lng: [] }, {
      lat: cps.map((c) => c.lat),
      lng: cps.map((c) => c.lng),
    }) ?? (anchor ? around(anchor) : null);
  const { underlay, onView } = useRoadUnderlay(roads, viewBox, !!line);
  const fitKey = initial.planned
    ? "loaded"
    : anchor
      ? `at-${anchor.lat.toFixed(3)},${anchor.lng.toFixed(3)}`
      : "wide";
  // While you draw, the view stays where you put it: it isn't refitted to each new checkpoint.
  const mapHome = initial.planned ? boundsOf(initial.planned.line) : anchor ? around(anchor) : WIDE;

  const lines: MapLine[] = line
    ? [
        { lat: line.lat, lng: line.lng, color: "#0b1220", weight: 9, opacity: 0.85 },
        ...gradientLines(
          line,
          focusClimb != null && climbs[focusClimb] ? climbRange(line, climbs[focusClimb]!) : null,
        ),
      ]
    : [];
  const handles = cps.map((c, i) => ({ lat: c.lat, lng: c.lng, label: i === 0 ? "▶" : String(i) }));
  const climbFocus = focusClimb != null && climbs[focusClimb] && line ? climbs[focusClimb]! : null;

  const name = initial.name || (line ? suggestName(line, names) : "");
  const stops = planned?.stops ?? [];
  const course: CourseFile | null = line
    ? {
        name,
        line,
        times,
        points: coursePoints(
          cps.map((c, i) => ({
            dist: line.dist[stops[i] ?? 0] ?? 0,
            name: c.name ?? stopLabel(i, cps.length, opts.loop),
          })),
          climbs,
          (c, i) => names[i] ?? t(`Climb ${i + 1}`, `Salita ${i + 1}`),
        ),
      }
    : null;

  function startHere() {
    navigator.geolocation?.getCurrentPosition(
      (p) =>
        change([
          { lat: p.coords.latitude, lng: p.coords.longitude },
          ...cps.slice(cps.length ? 1 : 0),
        ]),
      () => toast.error(t("Position not available", "Posizione non disponibile")),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  const map = (
    <div className="relative">
      <RouteMap
        lines={lines}
        underlay={underlay}
        handles={handles}
        fitKey={fitKey}
        home={mapHome}
        wheelZoom
        base="Satellite"
        focus={
          climbFocus && line ? { key: `climb-${focusClimb}`, ...sliceKm(line, climbFocus) } : null
        }
        cursor={hover != null && line ? { lat: line.lat[hover]!, lng: line.lng[hover]! } : null}
        onMapClick={(p) => change([...cps, p])}
        onView={onView}
        onHandleMove={(i, p) => change(cps.map((c, k) => (k === i ? { ...p } : c)))}
        onHandleTap={(i) => change(cps.filter((_, k) => k !== i))}
        className="h-[360px] rounded-xl lg:h-[620px]"
      />
      {busy && (
        <span className="pointer-events-none absolute bottom-3 left-3 z-[500] flex items-center gap-1.5 rounded-full bg-background/85 px-3 py-1 text-xs">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {t("Finding the road…", "Cerco la strada…")}
        </span>
      )}
      {!cps.length && (
        <span className="pointer-events-none absolute inset-x-3 bottom-3 z-[500] rounded-lg bg-background/85 px-3 py-2 text-center text-xs">
          {t(
            "Tap the map where you start, then where you want to pass.",
            "Tocca la mappa dove parti, poi dove vuoi passare.",
          )}
        </span>
      )}
    </div>
  );

  const tools = (
    <div className="flex flex-wrap gap-2">
      <Chip
        on={opts.myRoads}
        icon={RouteIcon}
        onClick={() => setOpts({ ...opts, myRoads: !opts.myRoads })}
      >
        {t("My roads", "Le mie strade")}
      </Chip>
      <Chip
        on={opts.cyclepaths}
        icon={Bike}
        onClick={() => setOpts({ ...opts, cyclepaths: !opts.cyclepaths })}
      >
        {t("Cycle paths", "Ciclabili")}
      </Chip>
      <Chip on={opts.loop} icon={Flag} onClick={() => setOpts({ ...opts, loop: !opts.loop })}>
        {t("Back to the start", "Torna alla partenza")}
      </Chip>
      {!cps.length && (
        <Chip icon={LocateFixed} onClick={startHere}>
          {t("Start here", "Parti da qui")}
        </Chip>
      )}
      <Chip
        icon={Undo2}
        disabled={!undo.length}
        onClick={() => {
          setCps(undo.at(-1)!);
          setUndo((u) => u.slice(0, -1));
        }}
      >
        {t("Undo", "Annulla")}
      </Chip>
    </div>
  );

  const head = (
    <div className="flex items-end justify-between gap-3">
      <div className="min-w-0">
        <BackToList />
        <h1 className="on-sky line-clamp-2 text-3xl font-bold tracking-tight">
          {initial.id ? initial.name : name || t("New route", "Nuovo percorso")}
        </h1>
        {initial.id && riddenText(initial.ridden) && (
          <div className="text-sm" style={{ color: "var(--z2)" }}>
            {riddenText(initial.ridden)}
          </div>
        )}
      </div>
      {initial.id && (
        <button
          type="button"
          onClick={() => setSheet("delete")}
          aria-label={t("Delete", "Elimina")}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground hover:text-foreground"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      )}
    </div>
  );

  const stats = line && (
    <div className="grid grid-cols-4 gap-1.5 rounded-xl border border-border bg-card p-3 sm:gap-2">
      <Stat v={km(line.dist.at(-1)!)} u="km" l={t("distance", "distanza")} />
      <Stat v={num(Math.round(gain))} u="m" l={t("climbing", "dislivello")} />
      <Stat v={timeText(times.at(-1) ?? 0)} l={t("estimated", "stimato")} />
      <Stat
        v={roads ? String(Math.round((planned?.own ?? 0) * 100)) : "–"}
        u="%"
        l={t("your roads", "strade tue")}
      />
    </div>
  );

  const errorNote = error && (
    <p
      className="rounded-lg border border-border bg-card px-3 py-2 text-sm"
      style={{ color: "var(--z5)" }}
    >
      {error}
    </p>
  );

  // A climb chosen: the altimetry zooms onto it, its km still the route's.
  const zoom = climbFocus && line ? climbRange(line, climbFocus) : null;
  const shown =
    line && zoom
      ? {
          dist: line.dist.slice(zoom.i0, zoom.i1 + 1),
          alt: line.alt.slice(zoom.i0, zoom.i1 + 1),
          from: zoom.i0,
        }
      : line
        ? { dist: line.dist, alt: line.alt, from: 0 }
        : null;
  const profile = line && shown && (
    <Panel
      title={
        zoom && focusClimb != null
          ? `${t("Altimetry", "Altimetria")} · ${names[focusClimb] ?? t(`Climb ${focusClimb + 1}`, `Salita ${focusClimb + 1}`)}`
          : t("Altimetry", "Altimetria")
      }
      action={
        zoom ? (
          <button
            type="button"
            onClick={() => setFocusClimb(null)}
            className="inline-flex min-h-8 shrink-0 items-center gap-1 rounded-full bg-secondary px-3 text-xs font-medium"
          >
            <X className="h-3.5 w-3.5" />
            {t("Whole route", "Tutto il percorso")}
          </button>
        ) : undefined
      }
    >
      <GradientProfile
        key={zoom ? `climb-${focusClimb}` : "all"}
        dist={shown.dist}
        alt={shown.alt}
        hover={
          hover != null && hover >= shown.from && hover < shown.from + shown.dist.length
            ? hover - shown.from
            : null
        }
        onHover={(i) => setHover(i == null ? null : i + shown.from)}
      />
    </Panel>
  );

  const climbList = line && (
    <Panel title={t(`Climbs · ${climbs.length}`, `Salite · ${climbs.length}`)}>
      {!climbs.length && (
        <p className="text-sm text-muted-foreground">
          {t("No real climbs.", "Nessuna vera salita.")}
        </p>
      )}
      {climbs.map((c, i) => (
        <ClimbRow
          key={i}
          c={c}
          name={names[i] ?? t(`Climb ${i + 1}`, `Salita ${i + 1}`)}
          on={focusClimb === i}
          onClick={() => setFocusClimb(focusClimb === i ? null : i)}
        />
      ))}
    </Panel>
  );

  const stopList = cps.length > 0 && (
    <Panel
      title={t("Checkpoints", "Tappe")}
      action={
        <span className="text-xs text-muted-foreground">
          {t(
            "tap the map to add, drag to reorder",
            "tocca la mappa per aggiungerne, trascina per riordinare",
          )}
        </span>
      }
    >
      <StopList
        stops={cps.map((c, i) => ({
          lat: c.lat,
          lng: c.lng,
          label: c.name ?? stopLabel(i, cps.length, opts.loop),
          // While the road is being found again the old distances would belong to other stops.
          km: line && !busy && stops[i] != null ? km(line.dist[stops[i]!]!) : null,
        }))}
        onOrder={(order) => change(order.map((k) => cps[k]!))}
        onRemove={(i) => change(cps.filter((_, k) => k !== i))}
      />
    </Panel>
  );

  const actions = line && (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={() => setSheet("save")}
        className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full bg-secondary px-4 text-sm font-medium"
      >
        <Save className="h-4 w-4" />
        {initial.id ? t("Save changes", "Salva modifiche") : t("Save", "Salva")}
      </button>
      <button
        type="button"
        onClick={() => setSheet("garmin")}
        className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground"
      >
        <Watch className="h-4 w-4" />
        {t("Send to Garmin", "Invia a Garmin")}
      </button>
    </div>
  );

  async function save(newName: string) {
    if (!line) return;
    const c: Course = {
      id: initial.id ?? newCourseId(),
      name: newName.trim() || name,
      created: initial.created ?? isoDate(new Date()),
      updated: Date.now(),
      distance: line.dist.at(-1) ?? 0,
      gain,
      seconds: times.at(-1) ?? 0,
      climbs: climbs.map((x, i) => summarize(x, names[i] ?? undefined)),
      checkpoints: cps,
      options: opts,
      own: planned?.own ?? 0,
      ...(initial.ridden ? { ridden: initial.ridden } : {}),
      ...(initial.checkedTo ? { checkedTo: initial.checkedTo } : {}),
      line,
    };
    setSheet(null);
    await saveCourse(c);
    toast.success(t("Route saved", "Percorso salvato"));
    if (!initial.id) void navigate({ to: "/courses", search: { id: c.id }, replace: true });
  }

  return (
    <div className="space-y-3">
      {head}
      <div className="space-y-3 lg:grid lg:grid-cols-[1fr_380px] lg:gap-4 lg:space-y-0">
        <div className="space-y-3">
          {map}
          {tools}
          {errorNote}
          <div className="hidden lg:block">{profile}</div>
        </div>
        <div className="space-y-3">
          {stats}
          <div className="hidden lg:block">{actions}</div>
          <div className="lg:hidden">{profile}</div>
          {climbList}
          {stopList}
          <div className="lg:hidden">{actions}</div>
        </div>
      </div>
      {sheet === "save" && (
        <SaveSheet
          initialName={initial.name || name}
          onCancel={() => setSheet(null)}
          onSave={(n) => void save(n)}
        />
      )}
      {sheet === "garmin" && course && (
        <GarminSheet
          open
          onOpenChange={(o) => !o && setSheet(null)}
          course={course}
          waypoints={cps.map((c, i) => ({
            ...c,
            name: c.name ?? stopLabel(i, cps.length, opts.loop),
          }))}
        />
      )}
      {sheet === "delete" && initial.id && (
        <ResponsiveDialog
          open
          onOpenChange={(o) => !o && setSheet(null)}
          title={t("Delete this route?", "Eliminare questo percorso?")}
        >
          <div className="flex gap-2 pb-2">
            <button
              type="button"
              onClick={() => setSheet(null)}
              className="inline-flex min-h-11 flex-1 items-center justify-center rounded-full bg-secondary px-4 text-sm font-medium"
            >
              {t("Keep", "Tieni")}
            </button>
            <button
              type="button"
              onClick={() => {
                void removeCourse(initial.id!);
                void navigate({ to: "/courses", search: {}, replace: true });
              }}
              className="inline-flex min-h-11 flex-1 items-center justify-center rounded-full bg-destructive px-4 text-sm font-medium text-white"
            >
              {t("Delete", "Elimina")}
            </button>
          </div>
        </ResponsiveDialog>
      )}
    </div>
  );
}

const around = (p: LatLng): Bounds => [
  [p.lat - 0.04, p.lng - 0.04],
  [p.lat + 0.04, p.lng + 0.04],
];

const WIDE: Bounds = [
  [36, -10],
  [60, 28],
];

/** Where you are, asked once when `ask` turns true. */
function useHere(ask: boolean): LatLng | null {
  const [here, setHere] = useState<LatLng | null>(null);
  useEffect(() => {
    if (!ask || here || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (p) => setHere({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => {},
      { enableHighAccuracy: false, timeout: 15_000, maximumAge: 10 * 60_000 },
    );
  }, [ask, here]);
  return here;
}

function climbRange(line: Line, c: Climb) {
  const i0 = Math.max(
    0,
    line.dist.findIndex((d) => d >= c.startKm * 1000),
  );
  let i1 = line.dist.findIndex((d) => d >= c.endKm * 1000);
  if (i1 < 0) i1 = line.dist.length - 1;
  return { i0, i1 };
}

function sliceKm(line: Line, c: Climb) {
  const { i0, i1 } = climbRange(line, c);
  return { lat: line.lat.slice(i0, i1 + 1), lng: line.lng.slice(i0, i1 + 1) };
}

function ClimbRow({
  c,
  name,
  on,
  onClick,
}: {
  c: Climb;
  name: string;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 border-t border-border py-2.5 text-left first:border-t-0",
        on && "rounded-lg bg-secondary/60",
      )}
    >
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-black"
        style={{ background: CAT_COLOR[c.category] }}
      >
        {c.category === "Uncat" ? "–" : c.category}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{name}</span>
        <span className="block text-xs text-muted-foreground">
          km {km(c.startKm * 1000)} · {km(c.length)} km · {num(Math.round(c.gain))} m
        </span>
      </span>
      <span className="text-right">
        <span className="stat-num block font-semibold">{pct(c.avgGrade)}</span>
        <span className="block text-xs text-muted-foreground">max {Math.round(c.maxGrade)}%</span>
      </span>
    </button>
  );
}

function SaveSheet({
  initialName,
  onCancel,
  onSave,
}: {
  initialName: string;
  onCancel: () => void;
  onSave: (name: string) => void;
}) {
  const [name, setName] = useState(initialName);
  return (
    <ResponsiveDialog
      open
      onOpenChange={(o) => !o && onCancel()}
      title={t("Save the route", "Salva il percorso")}
    >
      <form
        className="space-y-3 pb-2"
        onSubmit={(e) => {
          e.preventDefault();
          onSave(name);
        }}
      >
        <div className="flex items-center gap-2">
          <Pencil className="h-4 w-4 text-muted-foreground" />
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoFocus />
        </div>
        <button
          type="submit"
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground"
        >
          <Save className="h-4 w-4" />
          {t("Save", "Salva")}
        </button>
      </form>
    </ResponsiveDialog>
  );
}

// --- three loops from a wish ---

const LOOP_COLOR = ["var(--primary)", "var(--z3)", "var(--z5)"];

function wishChips(w: WishForm): string[] {
  return [
    w.km ? `${w.km} km` : w.minutes ? durationText(w.minutes) : "",
    ...w.climbs.map((c) => CLIMB_LABEL[c]()),
    w.gain ? `${num(w.gain)} m` : "",
    w.from === "here"
      ? t("from here", "da qui")
      : w.from === "home"
        ? t("from home", "da casa")
        : w.place,
    w.myRoads ? "" : t("new roads too", "anche strade nuove"),
    w.cyclepaths ? t("cycle paths", "ciclabili") : "",
  ].filter(Boolean);
}

function wishTitle(w: WishForm): string {
  const how = w.km ? `${w.km} km` : durationText(w.minutes ?? 60);
  const climbs = w.climbs.filter((c) => c !== "flat").map((c) => CLIMB_LABEL[c]());
  if (w.climbs.includes("flat")) return t(`${how}, flat`, `${how} in piano`);
  if (!climbs.length) return how;
  return t(`${how}, ${climbs.join(" and ")} climbs`, `${how}, salite ${climbs.join(" e ")}`);
}

async function startOf(w: WishForm, roads: Roads | null): Promise<LatLng> {
  if (w.from === "home") {
    const h = roads && homeOf(roads);
    if (h) return h;
  }
  if (w.from === "place") {
    const p = await searchPlace(w.place, roads ? homeOf(roads) : null);
    if (!p) throw new Error(t(`"${w.place}" not found`, `"${w.place}" non trovato`));
    return p;
  }
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation)
      return reject(new Error(t("Position not available", "Posizione non disponibile")));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => reject(new Error(t("Position not available", "Posizione non disponibile"))),
      { enableHighAccuracy: false, timeout: 15_000, maximumAge: 5 * 60_000 },
    );
  });
}

type Found =
  | { phase: "waiting" | "locating" | "working" }
  | { phase: "done"; list: Proposal[]; start: LatLng }
  | { phase: "error"; message: string };

function Proposals({ form }: { form: WishForm }) {
  const navigate = useNavigate();
  const roads = useRoads();
  const rider = useRider();
  const known = useKnownClimbs();
  const knownRef = useRef<NamedClimb[]>(known);
  knownRef.current = known;
  const [seed, setSeed] = useState(0);
  const [found, setFound] = useState<Found>({ phase: "waiting" });
  const [pick, setPick] = useState(0);
  const [editing, setEditing] = useState(false);
  const ready = !!roads;

  useEffect(() => {
    if (!ready) return;
    const ac = new AbortController();
    let live = true;
    setPick(0);
    void (async () => {
      try {
        setFound({ phase: "locating" });
        const start = await startOf(form, roads);
        if (!live) return;
        setFound({ phase: "working" });
        const wish: Wish = {
          seconds: form.km ? undefined : (form.minutes ?? 60) * 60,
          meters: form.km ? form.km * 1000 : undefined,
          climbs: form.climbs,
          gain: form.gain ?? undefined,
          start,
          options: { myRoads: form.myRoads, cyclepaths: form.cyclepaths, loop: true },
        };
        const list = await generate(
          wish,
          { route: routeThrough, roads, rider, known: knownRef.current },
          seed,
          ac.signal,
        );
        if (!live) return;
        setFound(
          list.length
            ? { phase: "done", list, start }
            : {
                phase: "error",
                message: t("No ride found from there.", "Nessun giro trovato da lì."),
              },
        );
      } catch (e) {
        if (live && !ac.signal.aborted) setFound({ phase: "error", message: (e as Error).message });
      }
    })();
    return () => {
      live = false;
      ac.abort();
    };
    // Rider and climbs are read when the search starts; a change of them later doesn't start it again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, seed]);

  const list = useMemo(() => (found.phase === "done" ? found.list : []), [found]);
  const named = useMemo(
    () =>
      list.map((p) => {
        const names = climbNames(p.climbs, p.planned.line, known);
        return { p, names, name: suggestName(p.planned.line, names) };
      }),
    [list, known],
  );
  const viewBox = boundsOf(...list.map((p) => p.planned.line));
  const { underlay, onView } = useRoadUnderlay(roads, viewBox, true);
  const lines: MapLine[] = named
    .map(({ p }, i) => ({
      lat: p.planned.line.lat,
      lng: p.planned.line.lng,
      color: LOOP_COLOR[i]!,
      weight: i === pick ? 6 : 4,
      opacity: i === pick ? 1 : 0.55,
      onClick: () => setPick(i),
    }))
    // The chosen one on top.
    .sort((a, b) => Number(a.weight === 6) - Number(b.weight === 6));

  function open(i: number) {
    const x = named[i];
    if (!x) return;
    handed = {
      name: x.name,
      checkpoints: x.p.checkpoints,
      options: { myRoads: form.myRoads, cyclepaths: form.cyclepaths, loop: true },
      planned: x.p.planned,
    };
    void navigate({ to: "/courses", search: { plan: "draft" } });
  }

  const status =
    found.phase === "waiting"
      ? t("Reading your roads…", "Leggo le tue strade…")
      : found.phase === "locating"
        ? t("Finding where you start…", "Cerco da dove parti…")
        : found.phase === "working"
          ? t("Drawing rides on your roads…", "Disegno i giri sulle tue strade…")
          : null;

  return (
    <div className="space-y-3">
      <div>
        <BackToList />
        <h1 className="on-sky text-3xl font-bold tracking-tight">{wishTitle(form)}</h1>
      </div>
      <div className="flex flex-wrap gap-2">
        {wishChips(form).map((c) => (
          <Chip key={c} on onClick={() => setEditing(true)}>
            {c}
          </Chip>
        ))}
        <Chip
          icon={Sparkles}
          disabled={found.phase !== "done"}
          onClick={() => setSeed((s) => s + 1)}
        >
          {t("three more", "altri tre")}
        </Chip>
      </div>
      {status && (
        <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-4 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          {status}
        </div>
      )}
      {found.phase === "error" && (
        <div className="rounded-xl border border-border bg-card p-4 text-sm">
          <p style={{ color: "var(--z5)" }}>{found.message}</p>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="mt-2 text-primary underline"
          >
            {t("Change the wish", "Cambia la richiesta")}
          </button>
        </div>
      )}
      {list.length > 0 && (
        <>
          <RouteMap
            lines={lines}
            underlay={underlay}
            pins={
              found.phase === "done"
                ? [{ ...found.start, color: "var(--primary)", label: t("Start", "Partenza") }]
                : []
            }
            fitKey={`loops-${seed}`}
            base="Satellite"
            onView={onView}
            className="h-[300px] rounded-xl lg:h-[480px]"
          />
          {named.map(({ p, names, name }, i) => (
            <button
              type="button"
              key={p.key}
              onClick={() => (i === pick ? open(i) : setPick(i))}
              className={cn(
                "flex w-full items-center gap-3 rounded-xl border bg-card p-3 text-left transition-colors",
                i === pick ? "border-primary" : "border-border hover:bg-secondary",
              )}
            >
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-secondary/60">
                <Shape
                  lat={p.planned.line.lat}
                  lng={p.planned.line.lng}
                  className="h-11 w-11"
                  color={LOOP_COLOR[i]!}
                />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="truncate font-medium">{name}</span>
                  <span className="stat-num shrink-0 font-semibold">{timeText(p.seconds)}</span>
                </span>
                <span className="block text-xs text-muted-foreground">
                  {km(p.planned.line.dist.at(-1)!)} km ·{" "}
                  {num(Math.round(gainOf(p.planned.line.alt)))} m
                  {p.climbs.length
                    ? ` · ${t("climbs", "salite")}: ${p.climbs
                        .map(
                          (c, k) =>
                            `${names[k] ? `${names[k]} ` : ""}${km(c.length)} km ${t("at", "al")} ${pct(c.avgGrade)}`,
                        )
                        .join(", ")}`
                    : ` · ${t("no climbs", "nessuna salita")}`}
                </span>
                {roads && roads.nodes.size > 0 && (
                  <span className="block text-xs text-muted-foreground">
                    {t(
                      `${Math.round(p.planned.own * 100)}% on your roads`,
                      `${Math.round(p.planned.own * 100)}% sulle tue strade`,
                    )}
                  </span>
                )}
                <Spark
                  dist={p.planned.line.dist}
                  alt={p.planned.line.alt}
                  className="mt-1 h-6 w-full"
                />
                {i === pick && (
                  <span className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary">
                    {t("Open it", "Aprilo")} <ChevronRight className="h-3 w-3" />
                  </span>
                )}
              </span>
            </button>
          ))}
        </>
      )}
      {editing && (
        <WishSheet
          open
          onOpenChange={setEditing}
          initial={form}
          hasHome={!!roads && !!homeOf(roads)}
          onGo={(w) => {
            setEditing(false);
            void navigate({ to: "/courses", search: toSearch(w), replace: true });
          }}
        />
      )}
    </div>
  );
}
