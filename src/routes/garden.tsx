import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { parseISO } from "date-fns";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { OpenScene, switchFit } from "@/components/forest/ForestScene";
import { GardenScene } from "@/components/garden/GardenScene";
import { GardenSwitch, type GardenView } from "@/components/garden/GardenSwitch";
import { Pantry } from "@/components/garden/Pantry";
import { usePinch } from "@/components/tree/TreeBody";
import { ResponsiveDialog } from "@/components/ResponsiveDialog";
import { Button } from "@/components/ui/button";
import { useNow } from "@/hooks/use-now";
import {
  allSports,
  buildGarden,
  buildPantry,
  CROP_COLOR,
  cropFor,
  GROWING_DAYS,
  jarSessions,
  sportName,
  type CropMap,
  type Garden,
  type Jar,
  type Sport,
} from "@/lib/garden";
import { useCropMap } from "@/hooks/use-crop-map";
import { useLocalStore } from "@/hooks/use-local-store";
import { format, t } from "@/lib/i18n";
import { rememberTree } from "@/lib/accent";
import { treeGrowth } from "@/lib/forest/age";
import { myTreeHeader } from "@/lib/home";
import { recordSinceLoad } from "@/lib/perf";
import { resetSky, setSky } from "@/lib/sky-store";
import type { Activity } from "@/lib/intervals";
import { allActivitiesQuery, offEventsQuery, wellnessRangeQuery } from "@/lib/queries";
import { addDays, formatDuration, isoDate } from "@/lib/training";
import { worldWidth } from "@/lib/ridge";
import { CHECK_IN, gardenOn } from "@/lib/settings";
import { crownFor } from "@/lib/tree";
import { byMain, mainSport } from "@/lib/sport";

export const Route = createFileRoute("/garden")({
  // Turned off in Settings: an old link or a home-screen shortcut lands on the Tree.
  beforeLoad: () => {
    if (!gardenOn()) throw redirect({ to: "/" });
  },
  head: () => ({ meta: [{ title: t("Garden — Cirmolo", "Orto — Cirmolo") }] }),
  // ?zoom=pantry opens the pantry; otherwise the garden.
  validateSearch: (s: Record<string, unknown>): { zoom?: "pantry" } =>
    s["zoom"] === "pantry" ? { zoom: "pantry" } : {},
  loader: ({ context }) => context.queryClient.ensureQueryData(allActivitiesQuery()),
  component: GardenPage,
});

const NO_EVENTS: never[] = [];

/** The Garden: the last 8 weeks of training off the bike, growing. Tap a plant for its activity, a sign for its bed. */
function GardenPage() {
  useEffect(() => recordSinceLoad("first_garden", ["/garden"]), []);
  const navigate = useNavigate();
  const now = useNow();
  const today = isoDate(now);
  const { data: acts } = useSuspenseQuery(allActivitiesQuery());
  const oldest = acts.length
    ? acts[acts.length - 1]!.start_date_local.slice(0, 10)
    : addDays(today, -365);
  const { data: wellness } = useSuspenseQuery(wellnessRangeQuery({ oldest, newest: today }));
  const { data: offEvents = NO_EVENTS } = useQuery(offEventsQuery({ oldest, newest: today }));
  const [checkIn] = useLocalStore(CHECK_IN, true);
  // The garden shares the tree's season (readiness) and weather (form).
  const crown = useMemo(
    () => crownFor(wellness, acts, today, offEvents, checkIn),
    [wellness, acts, today, offEvents, checkIn],
  );
  // The app's colours follow today's season and weather.
  useEffect(
    () => rememberTree(crown.season, crown.weather, crown.weatherPhase),
    [crown.season, crown.weather, crown.weatherPhase],
  );
  const header = useMemo(() => myTreeHeader(crown, acts, today, mainSport()), [crown, acts, today]);
  const [map] = useCropMap(acts);
  const garden = useMemo(() => buildGarden(acts, today, map, mainSport()), [acts, today, map]);
  // The page's sky shows today's weather, as the garden does.
  const shelves = useMemo(() => buildPantry(acts, map, mainSport()), [acts, map]);
  const [bed, setBed] = useState<Sport | null>(null);
  const [jar, setJar] = useState<Jar | null>(null);
  const [view, setView] = useState<GardenView>(Route.useSearch().zoom ?? "garden");
  // The pantry is indoors: over its strip of sky, with the title on it, no clouds and no rain.
  useEffect(() => {
    if (view === "pantry") setSky({ weather: null, phase: 0 });
    else setSky({ weather: crown.weather, phase: crown.weatherPhase });
  }, [view, crown.weather, crown.weatherPhase]);
  useEffect(() => resetSky, []);
  // Pinch between the garden and the pantry, as the tree pinches to its rings.
  const ref = useRef<HTMLDivElement>(null);
  usePinch(ref, (dir) => setView(dir > 0 ? "pantry" : "garden"));
  const used = allSports(map, mainSport()).filter((c) =>
    shelves.some((s) => s.jars.some((j) => j.bySport[c])),
  );
  // The page's sky ends where this view's land or cupboard begins, its sun and moon just under the page's header.
  const sceneRef = useRef<HTMLDivElement>(null);
  const onHorizon = useCallback((units: number) => {
    const el = sceneRef.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY;
    const px = window.innerWidth;
    setSky({ peakPx: top + 12, horizonPx: top + (units * px) / worldWidth(px) });
  }, []);
  const open = (children: (w: number, h: number, foot: number) => ReactNode) => (
    <div ref={sceneRef}>
      <OpenScene>
        {(w, fit) => {
          const room = switchFit(w, fit);
          return children(w, room.fit, room.clear);
        }}
      </OpenScene>
    </div>
  );

  return (
    // The scene runs to the window's foot on a phone, with nothing below it: the page's padding isn't wanted.
    <div className="-mb-32 -mt-2 lg:mb-0">
      <div ref={ref} className="touch-pan-y">
        {view === "garden" ? (
          open((w, h, foot) => (
            <GardenScene
              garden={garden}
              sky={{
                season: crown.season,
                weather: crown.weather,
                weatherPhase: crown.weatherPhase,
              }}
              tree={{ uid: "me", name: "", header }}
              growth={treeGrowth(header, today)}
              onTree={() => navigate({ to: "/" })}
              onAddSport={
                allSports(map, mainSport()).length
                  ? undefined
                  : () => navigate({ to: "/settings", search: { tab: "garden" } })
              }
              w={w}
              h={h}
              foot={foot}
              now={now}
              onPlant={(p) => navigate({ to: "/rides/$id", params: { id: p.id } })}
              onBed={setBed}
              map={map}
              onHorizon={onHorizon}
            />
          ))
        ) : (
          <>
            <div className="pb-3 pt-2">
              <h1 className="on-sky text-center text-lg font-semibold">
                {t("The pantry", "La dispensa")}
              </h1>
            </div>
            {open((w, h, foot) => (
              <Pantry
                sports={used}
                shelves={shelves}
                today={today}
                w={w}
                h={h}
                foot={foot}
                onJar={setJar}
                onHorizon={onHorizon}
                map={map}
              />
            ))}
          </>
        )}
      </div>
      <GardenSwitch active={view} onView={setView} />
      <BedSheet garden={garden} sport={bed} onClose={() => setBed(null)} />
      <JarSheet jar={jar} acts={acts} map={map} onClose={() => setJar(null)} />
    </div>
  );
}

/** One session in a list, opening its activity. */
function SessionRow({
  s,
}: {
  s: { id: string; date: string; name: string; minutes: number; km: number };
}) {
  return (
    <li>
      <Link
        to="/rides/$id"
        params={{ id: s.id }}
        className="flex items-center justify-between gap-3 rounded-md px-2 py-2.5 hover:bg-secondary/40"
      >
        <span className="min-w-0">
          <span className="block truncate text-sm">{s.name}</span>
          <span className="block text-xs text-muted-foreground">
            {format(parseISO(s.date), "EEE d MMM")}
          </span>
        </span>
        <span className="stat-num shrink-0 text-right text-sm">
          {formatDuration(s.minutes * 60)}
          {s.km >= 0.5 && (
            <span className="block text-xs text-muted-foreground">{s.km.toFixed(1)} km</span>
          )}
        </span>
      </Link>
    </li>
  );
}

/** One month's jar: its hours sport by sport, each with the sessions behind them, and the way to that month's calendar. */
function JarSheet({
  jar,
  acts,
  map,
  onClose,
}: {
  jar: Jar | null;
  acts: Activity[];
  map: CropMap;
  onClose: () => void;
}) {
  const parts = useMemo(() => {
    if (!jar) return [];
    const sessions = jarSessions(acts, jar.month, map, mainSport());
    return allSports(map, mainSport())
      .flatMap((c) =>
        jar.bySport[c]
          ? [{ c, minutes: jar.bySport[c]!, sessions: sessions.filter((s) => s.sport === c) }]
          : [],
      )
      .sort((a, b) => b.minutes - a.minutes);
  }, [jar, acts, map]);
  const [y, m] = (jar?.month ?? "2000-01").split("-").map(Number);
  return (
    <ResponsiveDialog
      open={jar != null}
      onOpenChange={(o) => !o && onClose()}
      title={jar ? format(new Date(y!, m! - 1, 1), "MMMM yyyy") : ""}
      {...(jar && {
        description: byMain(
          t(
            `${formatDuration(jar.minutes * 60)} off the bike`,
            `${formatDuration(jar.minutes * 60)} senza bici`,
          ),
          t(
            `${formatDuration(jar.minutes * 60)} at other sports`,
            `${formatDuration(jar.minutes * 60)} di altri sport`,
          ),
        ),
      })}
    >
      <div className="space-y-4">
        {parts.map(({ c, minutes, sessions }) => (
          <section key={c}>
            <h3 className="flex items-center justify-between gap-3 text-sm font-medium">
              <span className="flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ background: CROP_COLOR[cropFor(map, c)] }}
                  aria-hidden
                />
                {sportName(map, c)}
              </span>
              <span className="stat-num font-normal text-muted-foreground">
                {formatDuration(minutes * 60)}
              </span>
            </h3>
            <ul className="-mx-2 mt-1 divide-y divide-border">
              {sessions.map((s) => (
                <SessionRow key={s.id} s={s} />
              ))}
            </ul>
          </section>
        ))}
        {jar && (
          <Button asChild variant="outline" className="w-full">
            <Link to="/calendar" search={{ month: jar.month }}>
              {t("Open this month in the calendar", "Apri questo mese nel calendario")}
            </Link>
          </Button>
        )}
      </div>
    </ResponsiveDialog>
  );
}

/** One bed's last 8 weeks: how much, and each session (newest first), each opening its activity. */
function BedSheet({
  garden,
  sport,
  onClose,
}: {
  garden: Garden;
  sport: Sport | null;
  onClose: () => void;
}) {
  const found = garden.beds.find((b) => b.sport === sport);
  const plants = found?.plants ?? [];
  const minutes = plants.reduce((s, p) => s + p.minutes, 0);
  const km = plants.reduce((s, p) => s + p.km, 0);
  const weeks = GROWING_DAYS / 7;
  return (
    <ResponsiveDialog
      open={sport != null}
      onOpenChange={(o) => !o && onClose()}
      title={found?.name ?? ""}
      description={t(
        `Last ${weeks} weeks: ${plants.length} sessions · ${formatDuration(minutes * 60)}${km >= 1 ? ` · ${Math.round(km)} km` : ""}`,
        `Ultime ${weeks} settimane: ${plants.length} sessioni · ${formatDuration(minutes * 60)}${km >= 1 ? ` · ${Math.round(km)} km` : ""}`,
      )}
    >
      <ul className="-mx-2 divide-y divide-border">
        {[...plants].reverse().map((p) => (
          <SessionRow key={p.id} s={p} />
        ))}
      </ul>
    </ResponsiveDialog>
  );
}
