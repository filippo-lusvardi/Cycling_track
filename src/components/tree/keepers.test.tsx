// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Activity, Wellness } from "@/lib/intervals";
import { buildDays, buildWeeks, KEEPERS, type PowerRecords } from "@/lib/tree";
import { dayHeight, WEEK_H } from "./geometry";
import { DayRow, WeekRow } from "./TreeRows";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const TODAY = "2026-11-26";
const ride = (id: string, date: string, mins: number) =>
  ({
    id,
    name: id,
    type: "Ride",
    start_date_local: `${date}T09:00:00`,
    moving_time: mins * 60,
    distance: 20_000,
    total_elevation_gain: 100,
    icu_training_load: 120,
    brioches: 0,
  }) as unknown as Activity;
const wellness = [{ id: "2026-11-01", ctl: 50 } as Wellness];
// One ride holds every record; an older, longer one keeps the squirrel and the owl away from it.
const acts = [ride("old", "2026-11-01", 400), ride("race", "2026-11-26", 150)];
acts[0]!.distance = 200_000;
acts[0]!.total_elevation_gain = 3000;
const all: PowerRecords = Object.fromEntries(KEEPERS.map((k) => [k, "race"]));
const days = (power: PowerRecords) =>
  buildDays(acts, wellness, "2026-11-01", TODAY, new Map(), "ride", power);
const edge = { h: 0, top: 12, bottom: 12, slopeTop: 0, slopeBottom: 0 };

describe("the keepers of the power records on the tree", () => {
  let root: Root;
  let host: HTMLDivElement;
  beforeEach(() => {
    host = document.createElement("div");
    root = createRoot(host);
  });
  afterEach(() => act(() => root.unmount()));
  /** The animals drawn: each one is a group moved into place and scaled. */
  const animals = () =>
    [...host.querySelectorAll("g[transform^='translate']")].map((g) => {
      const [, x, y] = /translate\(([-\d.]+) ([-\d.]+)\)/.exec(g.getAttribute("transform")!)!;
      return { x: Number(x), y: Number(y) };
    });

  it("all five live on the branch of the ride that holds their records, inside its row", () => {
    const w = 390;
    const show = (power: PowerRecords) => {
      const day = days(power)[0]!;
      act(() =>
        root.render(
          <DayRow
            day={day}
            edge={{ ...edge, h: dayHeight(1) }}
            w={w}
            quiet={false}
            onOpen={() => {}}
          />,
        ),
      );
      return animals();
    };
    expect(show({})).toHaveLength(0);
    const drawn = show(all);
    expect(drawn).toHaveLength(5);
    for (const a of drawn) {
      expect(a.x).toBeGreaterThanOrEqual(0);
      expect(a.x).toBeLessThanOrEqual(w);
      expect(a.y).toBeLessThanOrEqual(dayHeight(1));
    }
  });
  it("and on a week's bough once the ride has folded into it", () => {
    const week = buildWeeks(days(all)).find((wk) => wk.twigs.some((t) => t.id === "race"))!;
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
    expect(animals()).toHaveLength(5);
  });
});
