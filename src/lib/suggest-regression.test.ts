// Pins which workouts get picked, by id. Growing the cycling library can change a cyclist's picks: review the diff and
// update on purpose. A runner's picks must not change when only cycling workouts are added.
import { describe, expect, it } from "vitest";
import type { Activity } from "./intervals";
import type { Focus } from "./races";
import { buildPool, suggestDay, suggestWeek, type SuggestInput } from "./suggest";
import type { MainSport } from "./sport";
import { addDays } from "./training";

// A Thursday.
const today = "2026-11-05";
const th = { ftp: 250, pace: 4 };
const FOCUSES: Focus[] = ["base", "aerobic", "vo2", "anaerobic", "sprint"];

const act = (date: string, sport: MainSport) =>
  ({
    id: date,
    name: date,
    type: sport === "run" ? "Run" : "Ride",
    start_date_local: `${date}T09:00:00`,
    moving_time: sport === "run" ? 3000 : 5400,
    icu_intensity: 65,
    icu_training_load: 70,
  }) as unknown as Activity;

const input = (sport: MainSport, focus: Focus): SuggestInput => ({
  today,
  sport,
  focus,
  races: [],
  events: [],
  offEvents: [],
  acts: Array.from({ length: 20 }, (_, i) => act(addDays(today, -2 - i), sport)),
  wellness: [],
  score: 85,
  form: 0,
  th,
  pool: buildPool([], sport, th),
});

/** What the person is offered, as ids only: names and reasons are free to change. */
function offered(sport: MainSport) {
  return Object.fromEntries(
    FOCUSES.map((focus) => {
      const i = input(sport, focus);
      return [
        focus,
        {
          today: suggestDay(i, today).picks.map((p) => p.workout.id),
          short: suggestDay(i, today, { minutes: 45 }).picks.map((p) => p.workout.id),
          long: suggestDay(i, today, { minutes: 150 }).picks.map((p) => p.workout.id),
          week: suggestWeek(i, today, addDays(today, 6)).days.map(
            (d) => `${d.date} ${d.ask} ${d.picks[0]?.workout.id ?? "-"}`,
          ),
        },
      ];
    }),
  );
}

describe("what gets picked", () => {
  it("for a cyclist", () => expect(offered("ride")).toMatchSnapshot());
  it("for a runner", () => expect(offered("run")).toMatchSnapshot());
});
