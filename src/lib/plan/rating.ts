// How a planned session went, kept as a readable "Plan: harder" line in the activity's description, as brioches are. Pure.
import { RATINGS, type Rating } from "./types";

const LINE = /^\s*plan:\s*(easier|expected|harder|failed)\s*$/im;

export function ratingIn(description: string | null): Rating | null {
  const m = LINE.exec(description ?? "");
  const found = m?.[1]?.toLowerCase() as Rating | undefined;
  return found && RATINGS.includes(found) ? found : null;
}

/** The description with the rating set: the line is replaced, added at the end, or removed. */
export function withRating(description: string | null, rating: Rating | null): string {
  const rest = (description ?? "")
    .split("\n")
    .filter((l) => !LINE.test(l))
    .join("\n")
    .trim();
  return rating ? [rest, `Plan: ${rating}`].filter(Boolean).join("\n\n") : rest;
}

/** The description to show, without the line. */
export const withoutRating = (description: string | null) => withRating(description, null);
