import { describe, expect, it, vi } from "vitest";
import {
  memberRows,
  membersAsked,
  type AskMember,
  type MemberTree,
  type MemberTrees,
} from "./ask-members";
import type { SharedRide, TreeHeader } from "./forest/types";

vi.hoisted(() => localStorage.setItem("cadence_language", JSON.stringify("it")));

const today = "2026-11-05";
const marco: AskMember = { fid: "f1", forest: "Bosco", uid: "u1", name: "Marco Rossi" };
const other: AskMember = { fid: "f2", forest: "Valle", uid: "u1", name: "Marco" };
const ride = (id: string, date: string, km: number): SharedRide =>
  ({
    id,
    name: `Giro ${id}`,
    type: "Ride",
    start_date_local: `${date}T08:00:00`,
    moving_time: 3600,
    distance: km * 1000,
    total_elevation_gain: 500,
    icu_training_load: 777,
    icu_intensity: 0.83,
  }) as SharedRide;
const tree: MemberTree = {
  header: {
    crown: { seasonLabel: "Estate", weather: null, score: 913, ctl: 661, atl: 402, form: 259 },
    day: today,
    years: ["2026"],
    km: 12345,
    off: [],
    updatedAt: 0,
  } as unknown as TreeHeader,
  years: {
    "2026": {
      rides: [ride("a", "2026-09-10", 50), ride("b", "2026-10-20", 30)],
      ctl: [],
      atl: [],
    },
  },
};
const trees = { "f1/u1": tree };
const rows = (q: string, t: MemberTrees = trees, who = [marco]) => memberRows(q, who, t, today);

describe("people by name", () => {
  it("a name points to the tree, and reads nothing", () => {
    expect(membersAsked("marco", [marco])).toEqual([]);
    const [r] = rows("marco", {});
    expect(r?.dest).toMatchObject({ to: "/forest/$fid/$uid", params: { fid: "f1", uid: "u1" } });
    expect(r?.answer).toBe("Bosco");
    expect(r?.value).toBeUndefined();
  });
  it("needs three letters and no slips", () => {
    expect(rows("ma")).toEqual([]);
    expect(rows("mar")).toHaveLength(1);
    expect(rows("rossi")).toHaveLength(1);
    expect(rows("marko")).toEqual([]);
  });
  it("a few letters don't claim the first place; the whole name does", () => {
    expect(rows("mar")[0]?.exact).toBeUndefined();
    expect(rows("marco")[0]?.exact).toBe(true);
  });
  it("the last ride, either way round", () => {
    for (const q of [
      "marco ultima uscita",
      "ultima uscita di marco",
      "marco last ride",
      "rossi ultima",
    ]) {
      expect(membersAsked(q, [marco]), q).toEqual([marco]);
      const [r] = rows(q);
      expect(r?.q, q).toContain("Giro b");
      expect(r?.dest).toMatchObject({
        to: "/forest/$fid/$uid/ride/$rid",
        params: { fid: "f1", uid: "u1", rid: "b" },
      });
    }
  });
  it("a ride past a year old goes to the tree, since it has no page", () => {
    const old = {
      ...tree,
      years: { "2024": { rides: [ride("x", "2024-01-01", 10)], ctl: [], atl: [] } },
    };
    expect(rows("marco ultima uscita", { "f1/u1": old })[0]?.dest).toMatchObject({
      to: "/forest/$fid/$uid",
    });
  });
  it("totals: all of them from the tree, a stretch from what's shared", () => {
    expect(rows("marco km")[0]?.value).toContain("km");
    expect(rows("marco km")[0]?.value?.replace(/\D/g, "")).toBe("12345");
    expect(rows("marco km ottobre")[0]?.value).toBe("30 km");
    expect(rows("marco uscite")[0]?.value).toBe("2");
    expect(rows("marco dislivello ottobre")[0]?.value).toBe("500 m");
    expect(rows("marco tempo settembre")[0]?.value).toBe(rows("marco tempo ottobre")[0]?.value);
  });
  it("the season in words", () => {
    for (const q of ["marco stagione", "come sta marco"])
      expect(rows(q)[0]?.answer, q).toContain("Estate");
  });
  it("never shows what their pages keep back", () => {
    for (const q of ["marco ultima uscita", "marco km", "marco stagione", "marco uscite"]) {
      const s = JSON.stringify(rows(q));
      for (const hidden of ["777", "0.83", "913", "661", "402", "259"])
        expect(s, q).not.toContain(hidden);
    }
    expect(rows("marco fitness")).toEqual([]);
    expect(rows("marco carico")).toEqual([]);
    expect(rows("marco forma")).toEqual([]);
  });
  it("still reading, or nothing shared", () => {
    expect(rows("marco km", {})[0]?.value).toBe("…");
    expect(rows("marco km", { "f1/u1": null })[0]?.answer).toContain("niente");
  });
  it("one row per forest", () => {
    expect(rows("marco", {}, [marco, other])).toHaveLength(2);
  });
});
