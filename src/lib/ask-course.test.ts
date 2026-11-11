import { describe, expect, it } from "vitest";
import { asksRoute, courseRows, fromIn, gainIn, kmIn, minutesIn, wishIn } from "./ask-course";
import { intentEntries, type IntentData } from "./ask-intents";
import { command } from "./ask-sentence";
import { fromSearch } from "./course/wish-form";

const d = { courses: [{ id: "c1", name: "Giro di Sardagna e Povo" }] };

describe("a route by typing", () => {
  it("reads how long", () => {
    expect(minutesIn("giro di 1h con salite")).toBe(60);
    expect(minutesIn("giro di 1h30")).toBe(90);
    expect(minutesIn("giro di 1 ora e mezza")).toBe(90);
    expect(minutesIn("un'ora da qui")).toBe(60);
    expect(minutesIn("un ora e mezza")).toBe(90);
    expect(minutesIn("mezz'ora")).toBe(30);
    expect(minutesIn("2 ore in piano")).toBe(120);
    expect(minutesIn("90 min")).toBe(90);
    expect(minutesIn("1.5 h")).toBe(90);
    expect(minutesIn("an hour and a half")).toBe(90);
    expect(kmIn("percorso di 60 km")).toBe(60);
    expect(gainIn("anello 800 m di dislivello")).toBe(800);
    expect(gainIn("dislivello 1200")).toBe(1200);
    expect(gainIn("60 km")).toBeNull();
  });

  it("reads where from", () => {
    expect(fromIn("giro da qui")).toEqual({ from: "here", place: "" });
    expect(fromIn("giro da casa con salite")).toEqual({ from: "home", place: "" });
    expect(fromIn("giro di 1h da sardagna con salite corte")).toEqual({
      from: "place",
      place: "sardagna",
    });
    expect(fromIn("loop from levico terme with climbs")).toEqual({
      from: "place",
      place: "levico terme",
    });
    expect(fromIn("giro di 1h con salite")).toEqual({ from: "here", place: "" });
  });

  it("reads the whole wish", () => {
    const w = wishIn(command("Giro di 1h con salite corte e ripide da qui"));
    expect(w).toMatchObject({
      minutes: 60,
      km: null,
      climbs: ["short", "steep"],
      from: "here",
      myRoads: true,
    });
    expect(wishIn("percorso di 60 km in piano da casa sulle ciclabili")).toMatchObject({
      km: 60,
      minutes: null,
      climbs: ["flat"],
      from: "home",
      cyclepaths: true,
    });
    expect(wishIn("anello 2 ore strade nuove").myRoads).toBe(false);
  });

  it("knows a route asked from a ride said", () => {
    expect(asksRoute("giro di 1h con salite corte e ripide da qui")).toBe(true);
    expect(asksRoute("percorso di 60 km")).toBe(true);
    expect(asksRoute("proponimi un giro")).toBe(true);
    // A ride done, said with a day, or a ride with nothing of a route about it, stays a ride.
    expect(asksRoute("giro di 1h ieri")).toBe(false);
    expect(asksRoute("giro con salite ieri")).toBe(false);
    expect(asksRoute("giro di 2h")).toBe(false);
    expect(asksRoute("percorsi")).toBe(false);
  });

  it("gives a row that opens three loops with the wish in the address", () => {
    const [row] = courseRows(d, command("giro di 1h con salite corte e ripide da qui"));
    expect(row?.id).toBe("course-ask");
    expect(row?.answer).toMatch(/1 h/);
    expect(row?.dest).toMatchObject({ kind: "route", to: "/courses" });
    const search = (row!.dest as { search: Record<string, string> }).search;
    expect(fromSearch(search)).toMatchObject({
      minutes: 60,
      climbs: ["short", "steep"],
      from: "here",
    });
  });

  it("opens the list, the planner, and a saved route", () => {
    expect(courseRows(d, "percorsi")[0]?.dest).toMatchObject({ to: "/courses" });
    expect(courseRows(d, "nuovo percorso")[0]?.dest).toMatchObject({ search: { plan: "new" } });
    expect(courseRows(d, "percorso sardagna")[0]?.dest).toMatchObject({ search: { id: "c1" } });
    expect(courseRows(d, "giro")).toEqual([]);
    expect(courseRows(d, "sardagna")).toEqual([]);
  });

  it("comes before logging a ride, and leaves a ride said with a day alone", () => {
    const data: IntentData = {
      today: "2026-11-11",
      sport: "ride",
      native: false,
      climbs: [],
      ...d,
    };
    expect(intentEntries("giro di 1h con salite corte da qui", data)[0]?.id).toBe("course-ask");
    expect(intentEntries("giro di 1h ieri", data).some((e) => e.id === "course-ask")).toBe(false);
  });
});
