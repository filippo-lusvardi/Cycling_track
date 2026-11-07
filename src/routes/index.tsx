import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { endOfMonth, parseISO } from "date-fns";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Buds, CrownView, Rings } from "@/components/tree/Crown";
import { TreeBody, usePinch, useWidth } from "@/components/tree/TreeBody";
import { TreeSheet, type Sheet } from "@/components/tree/TreeSheets";
import { useFocus } from "@/hooks/use-focus";
import { useLocalStore } from "@/hooks/use-local-store";
import { usePublishTree } from "@/hooks/use-publish-tree";
import { isPlanned } from "@/lib/intervals";
import { FOCUS_LABEL } from "@/lib/races";
import {
  allActivitiesQuery,
  eventsQuery,
  offEventsQuery,
  rideZonesQuery,
  wellnessRangeQuery,
} from "@/lib/queries";
import { ceiling } from "@/lib/readiness";
import { CHECK_IN, GARDEN, gardenOn, QUIET_TREE, zoneTops } from "@/lib/settings";
import { addDays, isoDate } from "@/lib/training";
import { buildDays, buildYears, crownFor, offDays, onlySprouts } from "@/lib/tree";
import { sportOf } from "@/lib/garden";
import { useCropMap } from "@/hooks/use-crop-map";
import { t } from "@/lib/i18n";
import { rememberTree } from "@/lib/accent";
import { useTreeSky } from "@/hooks/use-tree-sky";
import { recordSinceLoad } from "@/lib/perf";
import { knownRunThreshold, mainSport } from "@/lib/sport";

export const Route = createFileRoute("/")({
  // ?zoom=years opens the rings; ?sheet=today opens today's sheet (what you asked the tree); otherwise the tree.
  validateSearch: (s: Record<string, unknown>): { zoom?: "years"; sheet?: "today" } => ({
    ...(s["zoom"] === "years" ? { zoom: "years" as const } : {}),
    ...(s["sheet"] === "today" ? { sheet: "today" as const } : {}),
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(allActivitiesQuery()),
  component: TreePage,
});

type Zoom = "tree" | "years";
const ZOOMS: Zoom[] = ["tree", "years"];
/** A stable empty list, so effects keyed on it don't rerun every render while events load. */
const NO_EVENTS: never[] = [];

function TreePage() {
  // Opening the app to the moment the tree is drawn with its data: the startup that matters.
  useEffect(() => recordSinceLoad("first_tree", ["/"]), []);
  const today = isoDate(new Date());
  const { data: acts } = useSuspenseQuery(allActivitiesQuery());
  const oldest = acts.length
    ? acts[acts.length - 1]!.start_date_local.slice(0, 10)
    : addDays(today, -365);
  const { data: wellness } = useSuspenseQuery(wellnessRangeQuery({ oldest, newest: today }));
  const { data: events } = useQuery(eventsQuery({ oldest: today, newest: addDays(today, 3) }));
  const { data: offEvents } = useQuery(offEventsQuery({ oldest, newest: today }));
  const { data: zones } = useQuery(rideZonesQuery(mainSport()));
  const [quiet] = useLocalStore(QUIET_TREE, false);
  const [checkIn] = useLocalStore(CHECK_IN, true);
  const [garden] = useLocalStore(GARDEN, gardenOn());
  const focus = useFocus(acts, wellness, today);
  // Not remembered: the home page always opens on the tree, Years is a look you take from there.
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [zoom, setZoom] = useState<Zoom>(search.zoom ?? "tree");
  const [sheet, setSheet] = useState<Sheet | null>(null);
  // Asked for from outside the page, even while it's open: the rings, the tree, today's sheet.
  useEffect(() => setZoom(() => search.zoom ?? "tree"), [search.zoom]);
  useEffect(() => {
    if (search.sheet !== "today") return;
    setSheet({ kind: "today" });
    void navigate({ to: "/", search: {}, replace: true });
  }, [search.sheet, navigate]);
  const [ref, w] = useWidth();

  const [crops] = useCropMap(garden ? acts : undefined);
  const days = useMemo(() => {
    const sport = mainSport();
    const all = buildDays(acts, wellness, oldest, today, offDays(offEvents ?? []), sport);
    // A sprout says "this grows in the garden": only for what does.
    const grows = garden ? acts.filter((a) => sportOf(a, crops, sport)).map((a) => a.id) : [];
    return onlySprouts(all, new Set(grows));
  }, [acts, wellness, oldest, today, offEvents, garden, crops]);
  const crown = useMemo(
    () => crownFor(wellness, acts, today, offEvents ?? [], checkIn),
    [wellness, acts, today, offEvents, checkIn],
  );
  // The app's colours follow today's season and weather.
  useEffect(
    () => rememberTree(crown.season, crown.weather, crown.weatherPhase),
    [crown.season, crown.weather, crown.weatherPhase],
  );
  // Today's form is the weather of the page's sky.
  useTreeSky(crown.weather, crown.weatherPhase);
  // My forests get a copy of this tree (only the rides I share with each; throttled, only what changed).
  usePublishTree({ acts, wellness, offEvents: offEvents ?? NO_EVENTS, crown, today });
  const limit =
    crown.score != null && zones
      ? ceiling(
          crown.score,
          zones,
          mainSport() === "run" ? knownRunThreshold() : null,
          zoneTops().pace,
        )
      : null;
  // Only today's plan buds above the crown.
  const planned = (events ?? []).filter((e) => e.date === today && isPlanned(e));

  // A week's branch and a month's name: their recap.
  const openWeek = useCallback(
    (start: string) => void navigate({ to: "/recap", search: { from: start, to: addDays(start, 6) } }),
    [navigate],
  );
  const openMonth = useCallback(
    (month: string) => {
      const first = `${month}-01`;
      void navigate({
        to: "/recap",
        search: { from: first, to: isoDate(endOfMonth(parseISO(first))) },
      });
    },
    [navigate],
  );

  const step = (dir: 1 | -1) => {
    const i = ZOOMS.indexOf(zoom) + dir;
    if (ZOOMS[i]) setZoom(() => ZOOMS[i]!);
  };
  usePinch(ref, step);

  return (
    <div className="-mt-2">
      <div ref={ref} className="touch-pan-y">
        {w > 0 && zoom !== "years" && (
          <>
            <Buds events={planned} onOpen={(e) => setSheet({ kind: "plan", event: e })} />
            <CrownView
              crown={crown}
              today={today}
              trunk={days[0]!.trunk}
              w={w}
              limit={limit}
              quiet={quiet}
              block={FOCUS_LABEL[focus.focus]}
              onOpen={() => setSheet({ kind: "today" })}
            />
            <TreeBody
              days={days}
              w={w}
              today={today}
              quiet={quiet}
              blocks={focus.blocks}
              open={setSheet}
              onWeek={openWeek}
              onMonth={openMonth}
            />
          </>
        )}
        {w > 0 && zoom === "years" && (
          <div className="pt-2">
            <h1 className="on-sky mb-1 text-center text-lg font-semibold">
              {t("The tree, cut across", "L'albero, in sezione")}
            </h1>
            <Rings years={buildYears(days)} w={w} />
          </div>
        )}
      </div>


      <TreeSheet
        sheet={sheet}
        onClose={() => setSheet(null)}
        today={today}
        wellness={wellness}
        acts={acts}
        offEvents={offEvents ?? []}
        limit={limit}
        focus={focus}
        planned={(events ?? NO_EVENTS).filter(isPlanned)}
      />
    </div>
  );
}
