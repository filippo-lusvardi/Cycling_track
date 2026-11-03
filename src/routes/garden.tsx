import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { parseISO } from "date-fns";
import { useEffect, useMemo, useState } from "react";
import { OpenScene } from "@/components/forest/ForestScene";
import { GardenScene } from "@/components/garden/GardenScene";
import { GardenSwitch, type GardenView } from "@/components/garden/GardenSwitch";
import { Pantry, PantryLegend } from "@/components/garden/Pantry";
import { usePinch, useWidth } from "@/components/tree/TreeBody";
import { BackHome } from "@/components/home/BackHome";
import { ResponsiveDialog } from "@/components/ResponsiveDialog";
import { useNow } from "@/hooks/use-now";
import {
  bedName,
  buildGarden,
  buildPantry,
  CROP_COLOR,
  GROWING_DAYS,
  SPORT_NAME,
  SPORTS,
  type CropMap,
  type Garden,
  type Jar,
  type Sport,
} from "@/lib/garden";
import { useCropMap } from "@/hooks/use-crop-map";
import { format, t } from "@/lib/i18n";
import { rememberSeason } from "@/lib/accent";
import { recordSinceLoad } from "@/lib/perf";
import { resetSky, setSky } from "@/lib/sky-store";
import { allActivitiesQuery, offEventsQuery, wellnessRangeQuery } from "@/lib/queries";
import { addDays, formatDuration, isoDate } from "@/lib/training";
import { crownFor } from "@/lib/tree";

export const Route = createFileRoute("/garden")({
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
  // The garden shares the tree's season (readiness) and weather (form).
  const crown = useMemo(
    () => crownFor(wellness, acts, today, offEvents),
    [wellness, acts, today, offEvents],
  );
  // The app's accent follows today's season.
  useEffect(() => rememberSeason(crown.season), [crown.season]);
  const [map] = useCropMap();
  const garden = useMemo(() => buildGarden(acts, today, map), [acts, today, map]);
  // The page's sky shows today's weather, as the garden does.
  useEffect(() => {
    setSky({ weather: crown.weather, phase: crown.weatherPhase });
  }, [crown.weather, crown.weatherPhase]);
  useEffect(() => resetSky, []);
  const shelves = useMemo(() => buildPantry(acts), [acts]);
  const [bed, setBed] = useState<Sport | null>(null);
  const [jar, setJar] = useState<Jar | null>(null);
  const [view, setView] = useState<GardenView>(Route.useSearch().zoom ?? "garden");
  // Pinch between the garden and the pantry, as the tree pinches to its rings.
  const [ref, w] = useWidth();
  usePinch(ref, (dir) => setView(dir > 0 ? "pantry" : "garden"));
  const used = SPORTS.filter((c) => shelves.some((s) => s.jars.some((j) => j.bySport[c])));

  return (
    // Room at the bottom for the floating switch.
    <div className="-mt-2 pb-16">
      <BackHome className="mb-2" />
      <div ref={ref} className="touch-pan-y">
        {view === "garden" ? (
          <OpenScene>
            {(sw) => (
              <GardenScene
                garden={garden}
                sky={{
                  season: crown.season,
                  weather: crown.weather,
                  weatherPhase: crown.weatherPhase,
                }}
                w={sw}
                now={now}
                onPlant={(p) => navigate({ to: "/rides/$id", params: { id: p.id } })}
                onBed={setBed}
              />
            )}
          </OpenScene>
        ) : (
          w > 0 && (
            <div className="pt-2">
              <h1 className="on-sky mb-2 text-center text-lg font-semibold">
                {t("The pantry", "La dispensa")}
              </h1>
              <Pantry
                shelves={shelves}
                today={today}
                w={w < 640 ? 360 : Math.round(w / 1.5)}
                onJar={setJar}
                map={map}
              />
              <PantryLegend sports={used} map={map} />
            </div>
          )
        )}
      </div>
      <GardenSwitch active={view} onView={setView} />
      <BedSheet garden={garden} sport={bed} onClose={() => setBed(null)} />
      <JarSheet jar={jar} map={map} onClose={() => setJar(null)} />
    </div>
  );
}

/** One month's jar: its hours, sport by sport. */
function JarSheet({ jar, map, onClose }: { jar: Jar | null; map: CropMap; onClose: () => void }) {
  const parts = jar
    ? SPORTS.flatMap((c) => (jar.bySport[c] ? [{ c, minutes: jar.bySport[c]! }] : [])).sort(
        (a, b) => b.minutes - a.minutes,
      )
    : [];
  const [y, m] = (jar?.month ?? "2000-01").split("-").map(Number);
  return (
    <ResponsiveDialog
      open={jar != null}
      onOpenChange={(o) => !o && onClose()}
      title={jar ? format(new Date(y!, m! - 1, 1), "MMMM yyyy") : ""}
      {...(jar && {
        description: t(
          `${formatDuration(jar.minutes * 60)} off the bike`,
          `${formatDuration(jar.minutes * 60)} senza bici`,
        ),
      })}
    >
      <ul className="space-y-2 text-sm">
        {parts.map(({ c, minutes }) => (
          <li key={c} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ background: CROP_COLOR[map[c]] }}
                aria-hidden
              />
              {SPORT_NAME[c]()}
            </span>
            <span className="stat-num text-muted-foreground">{formatDuration(minutes * 60)}</span>
          </li>
        ))}
      </ul>
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
      title={found ? bedName(found.sport, found.crop) : ""}
      description={t(
        `Last ${weeks} weeks: ${plants.length} sessions · ${formatDuration(minutes * 60)}${km >= 1 ? ` · ${Math.round(km)} km` : ""}`,
        `Ultime ${weeks} settimane: ${plants.length} sessioni · ${formatDuration(minutes * 60)}${km >= 1 ? ` · ${Math.round(km)} km` : ""}`,
      )}
    >
      <ul className="-mx-2 divide-y divide-border">
        {[...plants].reverse().map((p) => (
          <li key={p.id}>
            <Link
              to="/rides/$id"
              params={{ id: p.id }}
              className="flex items-center justify-between gap-3 rounded-md px-2 py-2.5 hover:bg-secondary/40"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm">{p.name}</span>
                <span className="block text-xs text-muted-foreground">
                  {format(parseISO(p.date), "EEE d MMM")}
                </span>
              </span>
              <span className="stat-num shrink-0 text-right text-sm">
                {formatDuration(p.minutes * 60)}
                {p.km >= 0.5 && (
                  <span className="block text-xs text-muted-foreground">{p.km.toFixed(1)} km</span>
                )}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </ResponsiveDialog>
  );
}
