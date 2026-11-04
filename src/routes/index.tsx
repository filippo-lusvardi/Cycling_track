import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { OpenScene } from "@/components/forest/ForestScene";
import { HomeScene } from "@/components/home/HomeScene";
import { TodayRecap } from "@/components/home/TodayRecap";
import { TreeSheet, type Sheet } from "@/components/tree/TreeSheets";
import { useFocus } from "@/hooks/use-focus";
import { useLocalStore } from "@/hooks/use-local-store";
import { useCropMap } from "@/hooks/use-crop-map";
import { useNow } from "@/hooks/use-now";
import { usePublishTree } from "@/hooks/use-publish-tree";
import { auth } from "@/lib/firebase";
import { treeGrowth } from "@/lib/forest/age";
import { buildGarden } from "@/lib/garden";
import { myTreeHeader } from "@/lib/home";
import { t } from "@/lib/i18n";
import { rememberTree } from "@/lib/accent";
import { recordSinceLoad } from "@/lib/perf";
import { resetSky, setSky } from "@/lib/sky-store";
import {
  allActivitiesQuery,
  eventsQuery,
  offEventsQuery,
  rideZonesQuery,
  wellnessRangeQuery,
} from "@/lib/queries";
import { FOCUS_LABEL } from "@/lib/races";
import { ceiling } from "@/lib/readiness";
import { QUIET_TREE } from "@/lib/settings";
import { addDays, isoDate } from "@/lib/training";
import { crownFor } from "@/lib/tree";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [{ title: t("Cirmolo — Cycling Training", "Cirmolo — Allenamento ciclismo") }],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(allActivitiesQuery()),
  component: HomePage,
});

const NO_EVENTS: never[] = [];

/** Room the bottom bar takes on a phone, in px: the scene ends above it. */
const BAR = 84;

/**
 * Home: my tree and my garden in one landscape under the sky of the moment, with today written over the sky (the
 * tree's crown recap). Tap the tree for the Tree, the garden for the Garden, today for today's sheet.
 */
function HomePage() {
  // Opening the app to the moment the home scene is drawn with its data: the startup that matters.
  useEffect(() => recordSinceLoad("first_home", ["/"]), []);
  const navigate = useNavigate();
  const now = useNow();
  const today = isoDate(now);
  const { data: acts } = useSuspenseQuery(allActivitiesQuery());
  const oldest = acts.length
    ? acts[acts.length - 1]!.start_date_local.slice(0, 10)
    : addDays(today, -365);
  const { data: wellness } = useSuspenseQuery(wellnessRangeQuery({ oldest, newest: today }));
  const { data: offEvents = NO_EVENTS } = useQuery(offEventsQuery({ oldest, newest: today }));
  const { data: events } = useQuery(eventsQuery({ oldest: today, newest: today }));
  const { data: zones } = useQuery(rideZonesQuery());
  const [quiet] = useLocalStore(QUIET_TREE, false);
  const focus = useFocus(acts, wellness, today);
  const crown = useMemo(
    () => crownFor(wellness, acts, today, offEvents),
    [wellness, acts, today, offEvents],
  );
  // The app's colours follow today's season and weather.
  useEffect(
    () => rememberTree(crown.season, crown.weather, crown.weatherPhase),
    [crown.season, crown.weather, crown.weatherPhase],
  );
  // My forests get a copy of my tree from here too, as from the Tree page.
  usePublishTree({ acts, wellness, offEvents, crown, today });
  const [cropMap] = useCropMap();
  const garden = useMemo(() => buildGarden(acts, today, cropMap), [acts, today, cropMap]);
  const header = useMemo(() => myTreeHeader(crown, acts, today), [crown, acts, today]);
  const limit = crown.score != null && zones ? ceiling(crown.score, zones) : null;
  const planned = (events ?? []).filter(
    (e) => e.date === today && (e.category === "WORKOUT" || e.category.startsWith("RACE")),
  );
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const name = auth.currentUser?.email?.split("@")[0] ?? "";

  const recap = useRef<HTMLDivElement>(null);
  // The page's sky shows today's weather, and keeps the sun and moon below the recap.
  useEffect(() => {
    setSky({ weather: crown.weather, phase: crown.weatherPhase });
  }, [crown.weather, crown.weatherPhase]);
  useEffect(() => resetSky, []);
  useEffect(() => {
    const el = recap.current;
    if (el) setSky({ peakPx: el.getBoundingClientRect().bottom + window.scrollY + 36 });
  });
  // The recap's height, so the sun and moon pass below it.
  const [recapPx, setRecapPx] = useState(150);
  useEffect(() => {
    const el = recap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setRecapPx(e!.contentRect.height));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="relative -mt-2">
      <OpenScene>
        {(w, fit) => {
          // Scene units per screen px: the scene spans the window's width.
          const k = w / Math.max(1, window.innerWidth);
          const bar = window.innerWidth < 1024 ? BAR : 0;
          return (
            <HomeScene
              tree={{ uid: "me", name, header }}
              growth={treeGrowth(header, today)}
              garden={garden}
              sky={{
                season: crown.season,
                weather: crown.weather,
                weatherPhase: crown.weatherPhase,
              }}
              w={w}
              h={fit - bar * k}
              peak={(recapPx + 36) * k}
              now={now}
              onTree={() => navigate({ to: "/tree" })}
              onGarden={() => navigate({ to: "/garden" })}
            />
          );
        }}
      </OpenScene>
      {/* A soft darkening at the top of the sky, so today's words read on a noon sky as on a night one. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 h-64 bg-gradient-to-b from-background/60 via-background/25 to-transparent"
      />
      <div ref={recap} className="absolute inset-x-0 top-0 mx-auto max-w-md px-1 pt-3">
        <TodayRecap
          crown={crown}
          today={today}
          block={FOCUS_LABEL[focus.focus]}
          limit={limit}
          quiet={quiet}
          planned={planned}
          onOpen={() => setSheet({ kind: "today" })}
          onPlan={(e) => setSheet({ kind: "plan", event: e })}
        />
      </div>
      <TreeSheet
        sheet={sheet}
        onClose={() => setSheet(null)}
        today={today}
        wellness={wellness}
        acts={acts}
        offEvents={offEvents}
        limit={limit}
        focus={focus}
      />
    </div>
  );
}
