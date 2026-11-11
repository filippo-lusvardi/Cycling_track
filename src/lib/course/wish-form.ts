// A wish for a loop as the form and the page address hold it: /courses?ask=1&min=60&climbs=short,steep&from=here.
// Typing builds the same address. Pure.
import { CLIMB_WISHES, type ClimbWish } from "./generate";

export type From = "here" | "home" | "place";

export type WishForm = {
  minutes: number | null;
  km: number | null;
  climbs: ClimbWish[];
  gain: number | null;
  from: From;
  /** The place typed, when `from` is "place". */
  place: string;
  myRoads: boolean;
  cyclepaths: boolean;
};

export const DEFAULT_WISH: WishForm = {
  minutes: 60,
  km: null,
  climbs: [],
  gain: null,
  from: "here",
  place: "",
  myRoads: true,
  cyclepaths: false,
};

export type WishSearch = {
  ask?: string;
  min?: string;
  km?: string;
  climbs?: string;
  gain?: string;
  from?: string;
  place?: string;
  roads?: string;
  paths?: string;
};

export function toSearch(w: WishForm): Record<string, string> {
  return {
    ask: "1",
    ...(w.km ? { km: String(w.km) } : w.minutes ? { min: String(w.minutes) } : {}),
    ...(w.climbs.length ? { climbs: w.climbs.join(",") } : {}),
    ...(w.gain ? { gain: String(w.gain) } : {}),
    from: w.from,
    ...(w.from === "place" && w.place ? { place: w.place } : {}),
    ...(w.myRoads ? {} : { roads: "new" }),
    ...(w.cyclepaths ? { paths: "1" } : {}),
  };
}

const pos = (s: string | undefined) => {
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
};

export function fromSearch(s: WishSearch): WishForm {
  const km = pos(s.km);
  const from: From = s.from === "home" || s.from === "place" ? s.from : "here";
  return {
    minutes: km ? null : (pos(s.min) ?? DEFAULT_WISH.minutes),
    km,
    climbs: (s.climbs ?? "")
      .split(",")
      .filter((c): c is ClimbWish => (CLIMB_WISHES as string[]).includes(c)),
    gain: pos(s.gain),
    from: from === "place" && !s.place ? "here" : from,
    place: s.place ?? "",
    myRoads: s.roads !== "new",
    cyclepaths: s.paths === "1",
  };
}

/** Climb words that can't go together: choosing one drops the other. */
export function toggleClimb(cs: ClimbWish[], c: ClimbWish): ClimbWish[] {
  if (cs.includes(c)) return cs.filter((x) => x !== c);
  const against: Record<ClimbWish, ClimbWish[]> = {
    short: ["long", "flat"],
    long: ["short", "flat"],
    steep: ["gentle", "flat"],
    gentle: ["steep", "flat"],
    flat: ["short", "long", "steep", "gentle"],
  };
  return [...cs.filter((x) => !against[c].includes(x)), c];
}
