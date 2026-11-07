// The tree's drawing machinery, shared by your own Tree page and the forest's view of a member's tree:
// trunk and branches row by row, rendered a page at a time, with pinch to zoom.
import { parseISO } from "date-fns";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { dayHeight, MONTH_H, RECENT_DAYS, restHeight, WEEK_H } from "@/components/tree/geometry";
import { DayRow, MonthRow, RestRow, Roots, WeekRow, type Held } from "@/components/tree/TreeRows";
import type { Sheet } from "@/components/tree/TreeSheets";
import { returnShoots } from "@/lib/arrivals";
import type { Block } from "@/lib/focus";
import { addDays } from "@/lib/training";
import {
  buildWeeks,
  offTitle,
  smoothTrunk,
  weekRange,
  type Chapter,
  type TreeDay,
  type TrunkEdge,
  type TrunkPiece,
} from "@/lib/tree";
import { format, t } from "@/lib/i18n";
import { byMain } from "@/lib/sport";

const PAGE = 150;

/** Container width in px, so the tree is drawn at the real size (no stretched curves). */
export function useWidth() {
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

/** Two-finger pinch steps the zoom (out = toward Years); Ctrl+wheel does the same on desktop. */
export function usePinch(ref: React.RefObject<HTMLDivElement | null>, step: (dir: 1 | -1) => void) {
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
export function TreeBody({
  days,
  w,
  today,
  quiet,
  blocks,
  open,
  plain = false,
  held,
  bloomed,
  onWeek,
  onMonth,
}: {
  days: TreeDay[];
  w: number;
  today: string;
  quiet: boolean;
  /** Training blocks this device remembers, labelled on the week each one started. */
  blocks: Block[];
  open: (s: Sheet) => void;
  /** Plain bark all the way down: no build/rest tints or labels (a friend's tree in a forest). */
  plain?: boolean;
  /** What's being held back while it arrives on the tree (see components/tree/Arrivals). */
  held?: Held | null;
  /** Rides ridden during a bloom. */
  bloomed?: Set<string> | undefined;
  /** A week's branch and a month's name open their recap: only on your own tree. */
  onWeek?: (start: string) => void;
  onMonth?: (month: string) => void;
}) {
  const recent = useMemo(() => days.slice(0, RECENT_DAYS), [days]);
  const weeks = useMemo(() => {
    const all = buildWeeks(days.slice(RECENT_DAYS));
    return plain ? all.map((wk) => ({ ...wk, chapter: "steady" as const })) : all;
  }, [days, plain]);
  const shoots = useMemo(() => returnShoots(days), [days]);
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
      openMonth?: () => void,
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
            onOpen={openMonth}
          />
        ),
      });
    const newMonth = (date: string, trunk: number, ctl: number | null, chapter?: Chapter) => {
      if (date.slice(0, 7) === month) return false;
      month = date.slice(0, 7);
      const m = month;
      monthRow(
        monthName(date),
        `m${m}`,
        trunk,
        ctl,
        chapter,
        chapter,
        onMonth ? () => onMonth(m) : undefined,
      );
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
          : run.some((d) => d.sprouts.length)
            ? byMain(
                t(`${run.length} days off the bike`, `${run.length} giorni senza bici`),
                t(`${run.length} days of other sports`, `${run.length} giorni di altri sport`),
              )
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
            shoot={dates.some((d) => shoots.has(d))}
            heldShoot={dates.some((d) => d === held?.shootDay)}
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
            held={held}
            bloomed={bloomed}
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
      monthRow(
        t("By week", "Per settimana"),
        "weekly",
        weeks[0]!.trunk,
        null,
        weeks[0]!.chapter,
        "steady",
      );
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
            bloomed={bloomed}
            shoot={dates.some((d) => shoots.has(d))}
            heldShoot={dates.some((d) => d === held?.shootDay)}
            onOpen={() =>
              onWeek
                ? onWeek(wk.start)
                : open({
                    kind: "days",
                    title: t(
                      `Week ${weekRange(wk.start, wk.end)}`,
                      `Settimana ${weekRange(wk.start, wk.end)}`,
                    ),
                    dates,
                  })
            }
          />
        ),
      });
    });
    const edges = smoothTrunk(pieces);
    return pieces.map((p, i) => p.render(edges[i]!));
  }, [days, recent, weeks, w, today, quiet, blocks, open, onWeek, onMonth, shoots, held, bloomed]);
  const last = days[days.length - 1]!;
  return (
    <Progressive
      items={items}
      tail={<Roots trunk={weeks[weeks.length - 1]?.trunk ?? last.trunk} w={w} since={last.date} />}
    />
  );
}
