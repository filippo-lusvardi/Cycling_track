import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { parseISO } from "date-fns";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Buds, CrownView, Rings } from "@/components/tree/Crown";
import { dayHeight, MONTH_H, restHeight, WEEK_H } from "@/components/tree/geometry";
import { DayRow, MonthRow, RestRow, Roots, WeekRow } from "@/components/tree/TreeRows";
import { TreeSheet, type Sheet } from "@/components/tree/TreeSheets";
import { useFocus } from "@/hooks/use-focus";
import { useLocalStore } from "@/hooks/use-local-store";
import type { Block } from "@/lib/focus";
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
import {
  buildDays,
  buildWeeks,
  buildYears,
  crownFor,
  offDays,
  offTitle,
  smoothTrunk,
  weekRange,
  type Chapter,
  type TreeDay,
  type TrunkEdge,
  type TrunkPiece,
} from "@/lib/tree";
import { cn } from "@/lib/utils";
import { format, t } from "@/lib/i18n";

export const Route = createFileRoute("/tree")({
  head: () => ({ meta: [{ title: t("Tree — Cirmolo", "Albero — Cirmolo") }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(allActivitiesQuery()),
  component: TreePage,
});

type Zoom = "tree" | "years";
const ZOOMS: { key: Zoom; label: string }[] = [
  { key: "tree", label: t("Tree", "Albero") },
  { key: "years", label: t("Years", "Anni") },
];
/** Days shown one branch per ride; older history folds into weeks. */
const RECENT_DAYS = 5;
const PAGE = 150;

/** Container width in px, so the tree is drawn at the real size (no stretched curves). */
function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.floor(e!.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

function TreePage() {
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
  const [zoom, setZoom] = useState<Zoom>("tree");
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [ref, w] = useWidth();

  const days = useMemo(
    () => buildDays(acts, wellness, oldest, today, offDays(offEvents ?? [])),
    [acts, wellness, oldest, today, offEvents],
  );
  const crown = useMemo(() => crownFor(wellness, acts, today), [wellness, acts, today]);
  const limit = crown.score != null && zones ? ceiling(crown.score, zones) : null;
  // Only today's plan buds above the crown.
  const planned = (events ?? []).filter(
    (e) => e.date === today && (e.category === "WORKOUT" || e.category.startsWith("RACE")),
  );

  const step = (dir: 1 | -1) => {
    const i = ZOOMS.findIndex((z) => z.key === zoom) + dir;
    if (ZOOMS[i]) setZoom(() => ZOOMS[i]!.key);
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
            />
          </>
        )}
        {w > 0 && zoom === "years" && (
          <div className="pt-2">
            <h1 className="mb-1 text-center text-lg font-semibold">{t("The tree, cut across", "L'albero, in sezione")}</h1>
            <Rings years={buildYears(days)} w={w} />
          </div>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-10 flex justify-center lg:bottom-6">
        <div
          className="flex gap-1 rounded-full border border-border bg-card/85 p-1 shadow-lg backdrop-blur"
          role="tablist"
          aria-label={t("Zoom", "Zoom")}
        >
          {ZOOMS.map((z) => (
            <button
              key={z.key}
              role="tab"
              aria-selected={zoom === z.key}
              onClick={() => setZoom(() => z.key)}
              className={cn(
                "min-h-10 rounded-full px-4 text-sm text-muted-foreground transition-colors",
                zoom === z.key && "bg-secondary text-foreground",
              )}
            >
              {z.label}
            </button>
          ))}
        </div>
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
      />
    </div>
  );
}

/** Two-finger pinch steps the zoom (out = toward Years); Ctrl+wheel does the same on desktop. */
function usePinch(ref: React.RefObject<HTMLDivElement | null>, step: (dir: 1 | -1) => void) {
  const stepRef = useRef(step);
  stepRef.current = step;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let start = 0;
    const dist = (t: TouchList) =>
      Math.hypot(t[0]!.clientX - t[1]!.clientX, t[0]!.clientY - t[1]!.clientY);
    const onStart = (e: TouchEvent) => {
      if (e.touches.length === 2) start = dist(e.touches);
    };
    const onMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || !start) return;
      e.preventDefault();
      const ratio = dist(e.touches) / start;
      if (ratio < 0.7 || ratio > 1.4) {
        stepRef.current(ratio < 1 ? 1 : -1);
        start = 0; // one step per gesture
      }
    };
    const onEnd = () => (start = 0);
    let last = 0;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      if (Date.now() - last < 500) return;
      last = Date.now();
      stepRef.current(e.deltaY > 0 ? 1 : -1);
    };
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("wheel", onWheel);
    };
  }, [ref]);
}

/** Renders a long list a page at a time as you scroll toward the roots. */
function Progressive({ items, tail }: { items: ReactNode[]; tail: ReactNode }) {
  const [shown, setShown] = useState(PAGE);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = end.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => e!.isIntersecting && setShown((n) => n + PAGE), {
      rootMargin: "800px",
    });
    io.observe(el);
    return () => io.disconnect();
  }, [shown, items.length]);
  return (
    <>
      {items.slice(0, shown)}
      {shown < items.length ? <div ref={end} className="h-px" /> : tail}
    </>
  );
}

const monthName = (date: string) => format(parseISO(date), "MMMM yyyy");

/** The last few days as branches, then the rest of the history folded into weeks. */
type Piece = TrunkPiece & { render: (edge: TrunkEdge) => ReactNode };

/** The last few days as branches, then the rest of the history folded into weeks. */
function TreeBody({
  days,
  w,
  today,
  quiet,
  blocks,
  open,
}: {
  days: TreeDay[];
  w: number;
  today: string;
  quiet: boolean;
  /** Training blocks this device remembers, labelled on the week each one started. */
  blocks: Block[];
  open: (s: Sheet) => void;
}) {
  const recent = useMemo(() => days.slice(0, RECENT_DAYS), [days]);
  const weeks = useMemo(() => buildWeeks(days.slice(RECENT_DAYS)), [days]);
  const items = useMemo(() => {
    // Every row is one piece of trunk; pieces are collected first so their joins can be smoothed.
    const pieces: Piece[] = [];
    let month = today.slice(0, 7);
    const monthRow = (
      label: string,
      key: string,
      trunk: number,
      ctl?: number | null,
      chapter?: Chapter,
      fadeFrom: Chapter | undefined = chapter,
    ) =>
      pieces.push({
        h: MONTH_H,
        top: trunk,
        bottom: trunk,
        render: (edge) => (
          <MonthRow
            key={key}
            month={label}
            edge={edge}
            w={w}
            ctl={quiet ? null : ctl}
            chapter={chapter}
            fadeFrom={fadeFrom}
          />
        ),
      });
    const newMonth = (date: string, trunk: number, ctl: number | null, chapter?: Chapter) => {
      if (date.slice(0, 7) === month) return false;
      month = date.slice(0, 7);
      monthRow(monthName(date), `m${month}`, trunk, ctl, chapter);
      return true;
    };

    let rest: TreeDay[] = [];
    const flushRest = (below: number) => {
      if (!rest.length) return;
      const run = rest;
      const dates = run.map((d) => d.date);
      const off = run.every((d) => d.off) ? run[0]!.off : null;
      const title = off
        ? offTitle(off, dates[dates.length - 1]!, dates[0]!)
        : run.length === 1
          ? format(parseISO(dates[0]!), "EEEE d MMMM")
          : t(`${run.length} rest days`, `${run.length} giorni di riposo`);
      pieces.push({
        h: restHeight(run.length),
        top: run[0]!.trunk,
        bottom: below,
        render: (edge) => (
          <RestRow
            key={`r${dates[0]}`}
            days={run}
            edge={edge}
            w={w}
            onOpen={() => open({ kind: "days", title, dates })}
          />
        ),
      });
      rest = [];
    };
    recent.forEach((d, i) => {
      const below = days[i + 1]?.trunk ?? d.trunk;
      if (d.date.slice(0, 7) !== month) flushRest(d.trunk);
      newMonth(d.date, d.trunk, d.ctl);
      if (!d.branches.length) {
        rest.push(d);
        return;
      }
      flushRest(d.trunk);
      pieces.push({
        h: dayHeight(d.branches.length),
        top: d.trunk,
        bottom: below,
        render: (edge) => (
          <DayRow
            key={d.date}
            day={d}
            edge={edge}
            w={w}
            quiet={quiet}
            onOpen={() =>
              open({
                kind: "days",
                title: format(parseISO(d.date), "EEEE d MMMM"),
                dates: [d.date],
              })
            }
          />
        ),
      });
    });
    flushRest(weeks[0]?.trunk ?? recent[recent.length - 1]?.trunk ?? 6);

    // The recent days above are plain bark; fade into the first week's chapter.
    if (weeks.length)
      monthRow(t("By week", "Per settimana"), "weekly", weeks[0]!.trunk, null, weeks[0]!.chapter, "steady");
    const oldest = days[days.length - 1]!.date;
    weeks.forEach((wk, i) => {
      newMonth(wk.start < oldest ? oldest : wk.start, wk.trunk, wk.ctl, wk.chapter);
      const older = weeks[i + 1];
      // wk.end is already cut short when the recent days above take part of the week.
      const dates = Array.from({ length: 7 }, (_, k) => addDays(wk.end, -k)).filter(
        (d) => d >= wk.start,
      );
      pieces.push({
        h: WEEK_H,
        top: wk.trunk,
        bottom: older?.trunk ?? wk.trunk,
        render: (edge) => (
          <WeekRow
            key={wk.start}
            week={wk}
            edge={edge}
            w={w}
            quiet={quiet}
            block={blocks.find((b) => b.since >= wk.start && b.since <= wk.end)?.focus}
            olderChapter={older?.chapter}
            onOpen={() =>
              open({ kind: "days", title: t(`Week ${weekRange(wk.start, wk.end)}`, `Settimana ${weekRange(wk.start, wk.end)}`), dates })
            }
          />
        ),
      });
    });
    const edges = smoothTrunk(pieces);
    return pieces.map((p, i) => p.render(edges[i]!));
  }, [days, recent, weeks, w, today, quiet, blocks, open]);
  const last = days[days.length - 1]!;
  return (
    <Progressive
      items={items}
      tail={<Roots trunk={weeks[weeks.length - 1]?.trunk ?? last.trunk} w={w} since={last.date} />}
    />
  );
}
