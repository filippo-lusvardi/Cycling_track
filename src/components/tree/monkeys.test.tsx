// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Activity, Wellness } from "@/lib/intervals";
import { buildDays, buildWeeks } from "@/lib/tree";
import { dayHeight, WEEK_H } from "./geometry";
import { MONKEYS, monkeyOf } from "./Monkeys";
import { branchCurve, DayRow, WeekRow } from "./TreeRows";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const TODAY = "2026-11-28";
const ride = (id: string, date: string, monkey: boolean) =>
  ({
    id,
    name: id,
    type: "Ride",
    start_date_local: `${date}T09:00:00`,
    moving_time: 150 * 60,
    distance: 60_000,
    total_elevation_gain: 900,
    icu_training_load: 160,
    brioches: 0,
    monkey,
  }) as unknown as Activity;
const days = (monkey: boolean) =>
  buildDays(
    [ride("stelvio", TODAY, monkey)],
    [{ id: "2026-11-01", ctl: 50 } as Wellness],
    "2026-11-01",
    TODAY,
  );
const edge = { h: 0, top: 12, bottom: 12, slopeTop: 0, slopeBottom: 0 };

describe("the monkey on your back", () => {
  let root: Root;
  let host: HTMLDivElement;
  beforeEach(() => {
    host = document.createElement("div");
    root = createRoot(host);
  });
  afterEach(() => act(() => root.unmount()));

  it("is only on the rides marked with it", () => {
    expect(days(false)[0]!.branches[0]!.monkey).toBeUndefined();
    expect(days(true)[0]!.branches[0]!.monkey).toBe(true);
  });

  it("bends the branch: the tip hangs lower than a free branch's, still inside the row's width", () => {
    const b = days(true)[0]!.branches[0]!;
    const bent = branchCurve(b, 195, 12, 44);
    const free = branchCurve({ ...b, monkey: false }, 195, 12, 44);
    expect(bent.at(1)[1]).toBeGreaterThan(free.at(1)[1]);
    // Up first, then down: the highest point is somewhere along the branch, not at the tip.
    const ys = Array.from({ length: 21 }, (_, i) => bent.at(i / 20)[1]);
    expect(Math.min(...ys)).toBeLessThan(bent.at(1)[1]);
    expect(bent.at(1)[0]).toBeGreaterThan(0);
    expect(bent.at(1)[0]).toBeLessThan(390);
  });

  it("hangs from the tip, and its row lets it out over the row below", () => {
    const show = (monkey: boolean) => {
      const day = days(monkey)[0]!;
      act(() =>
        root.render(
          <DayRow
            day={day}
            edge={{ ...edge, h: dayHeight(1) }}
            w={390}
            quiet={false}
            onOpen={() => {}}
          />,
        ),
      );
      return host.querySelector("button")!;
    };
    expect(show(false).style.contentVisibility).toBe("auto");
    const row = show(true);
    expect(row.style.contentVisibility).toBe("");
    expect(row.style.zIndex).toBe("1");
    expect(row.querySelector("svg")!.style.overflow).toBe("visible");
    const b = days(true)[0]!.branches[0]!;
    const [tx, ty] = branchCurve(b, 195, days(true)[0]!.trunk, dayHeight(1) - 8).at(1);
    const hung = [...row.querySelectorAll("g[transform^='translate']")].some((g) =>
      g.getAttribute("transform")!.startsWith(`translate(${tx} ${ty})`),
    );
    expect(hung).toBe(true);
  });

  it("stays on a week's twig once the ride has folded into it", () => {
    const week = buildWeeks(days(true))[0]!;
    act(() =>
      root.render(
        <WeekRow
          week={week}
          edge={{ ...edge, h: WEEK_H }}
          w={390}
          quiet={false}
          olderChapter={undefined}
          onOpen={() => {}}
        />,
      ),
    );
    expect(host.querySelector("button")!.style.zIndex).toBe("1");
  });

  it("is one of the nine species, fixed by the ride, and every species turns up", () => {
    expect(MONKEYS).toHaveLength(9);
    const b = days(true)[0]!.branches[0]!;
    expect(monkeyOf(b)).toBe(monkeyOf({ ...b }));
    const seen = new Set(Array.from({ length: 400 }, (_, i) => monkeyOf({ seed: i / 400 }).id));
    expect(seen.size).toBe(9);
  });
});
