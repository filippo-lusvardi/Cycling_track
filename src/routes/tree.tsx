import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Buds, CrownView, Rings } from "@/components/tree/Crown";
import { TreeBody, usePinch, useWidth } from "@/components/tree/TreeBody";
import { ZoomSwitch, type Zoom } from "@/components/tree/ZoomSwitch";
import { TreeSheet, type Sheet } from "@/components/tree/TreeSheets";
import { BackHome } from "@/components/home/BackHome";
import { useFocus } from "@/hooks/use-focus";
import { useLocalStore } from "@/hooks/use-local-store";
import { usePublishTree } from "@/hooks/use-publish-tree";
import { FOCUS_LABEL } from "@/lib/races";
import {
  allActivitiesQuery,
  eventsQuery,
  offEventsQuery,
  rideZonesQuery,
  wellnessRangeQuery,
} from "@/lib/queries";
import { ceiling } from "@/lib/readiness";
import { QUIET_TREE } from "@/lib/settings";
import { addDays, isoDate } from "@/lib/training";
import { buildDays, buildYears, crownFor, offDays } from "@/lib/tree";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";
import { rememberSeason } from "@/lib/accent";
import { recordSinceLoad } from "@/lib/perf";

export const Route = createFileRoute("/tree")({
  head: () => ({ meta: [{ title: t("Tree — Cirmolo", "Albero — Cirmolo") }] }),
  // ?zoom=years opens the rings (from the Forest page's switch); otherwise the tree.
  validateSearch: (s: Record<string, unknown>): { zoom?: "years" } =>
    s["zoom"] === "years" ? { zoom: "years" } : {},
  loader: ({ context }) => context.queryClient.ensureQueryData(allActivitiesQuery()),
  component: TreePage,
});

const ZOOMS: Zoom[] = ["tree", "years"];
/** A stable empty list, so effects keyed on it don't rerun every render while events load. */
const NO_EVENTS: never[] = [];

function TreePage() {
  // Opening the app to the moment the tree is drawn with its data: the startup that matters.
  useEffect(() => recordSinceLoad("first_tree", ["/tree"]), []);
  const today = isoDate(new Date());
  const { data: acts } = useSuspenseQuery(allActivitiesQuery());
  const oldest = acts.length
    ? acts[acts.length - 1]!.start_date_local.slice(0, 10)
    : addDays(today, -365);
  const { data: wellness } = useSuspenseQuery(wellnessRangeQuery({ oldest, newest: today }));
  const { data: events } = useQuery(eventsQuery({ oldest: today, newest: today }));
  const { data: offEvents } = useQuery(offEventsQuery({ oldest, newest: today }));
  const { data: zones } = useQuery(rideZonesQuery());
  const [quiet] = useLocalStore(QUIET_TREE, false);
  const focus = useFocus(acts, wellness, today);
  // Not remembered: the home page always opens on the tree, Years is a look you take from there.
  const [zoom, setZoom] = useState<Zoom>(Route.useSearch().zoom ?? "tree");
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [ref, w] = useWidth();

  const days = useMemo(
    () => buildDays(acts, wellness, oldest, today, offDays(offEvents ?? [])),
    [acts, wellness, oldest, today, offEvents],
  );
  const crown = useMemo(
    () => crownFor(wellness, acts, today, offEvents ?? []),
    [wellness, acts, today, offEvents],
  );
  // The app's accent follows today's season.
  useEffect(() => rememberSeason(crown.season), [crown.season]);
  // My forests get a copy of this tree (only the rides I share with each; throttled, only what changed).
  usePublishTree({ acts, wellness, offEvents: offEvents ?? NO_EVENTS, crown, today });
  const limit = crown.score != null && zones ? ceiling(crown.score, zones) : null;
  // Only today's plan buds above the crown.
  const planned = (events ?? []).filter(
    (e) => e.date === today && (e.category === "WORKOUT" || e.category.startsWith("RACE")),
  );

  const step = (dir: 1 | -1) => {
    const i = ZOOMS.indexOf(zoom) + dir;
    if (ZOOMS[i]) setZoom(() => ZOOMS[i]!);
  };
  usePinch(ref, step);

  return (
    <div className="-mt-2">
      <BackHome className="mb-1" />
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
            />
          </>
        )}
        {w > 0 && zoom === "years" && (
          <div className="pt-2">
            <h1 className="mb-1 text-center text-lg font-semibold">
              {t("The tree, cut across", "L'albero, in sezione")}
            </h1>
            <Rings years={buildYears(days)} w={w} />
          </div>
        )}
      </div>

      <ZoomSwitch active={zoom} onZoom={(z) => setZoom(() => z)} />

      <TreeSheet
        sheet={sheet}
        onClose={() => setSheet(null)}
        today={today}
        wellness={wellness}
        acts={acts}
        offEvents={offEvents ?? []}
        limit={limit}
        focus={focus}
      />
    </div>
  );
}
