// An answer stays on screen while the sentence that made it is still being typed. Pure.
import type { Alt } from "./ask";
import { mayContinue } from "./ask-complete";
import { command } from "./ask-sentence";

export type Held = { q: string; row: Alt };

/** How long words that read as nothing are given, before they're taken at their word. */
export const HOLD_MS = 900;

/** What's worth keeping: a real answer. What saves is never kept, and a note isn't an answer. */
export const holdable = (e: Alt | undefined): e is Alt =>
  !!e?.exact && e.dest.kind !== "write" && !e.id.startsWith("note-");

/** The same sentence, further on or a little back. */
const related = (held: string, q: string) => {
  const a = command(held);
  const b = command(q);
  return b.length >= 3 && (b.startsWith(a) || a.startsWith(b));
};

/** The answer to keep showing instead of `found`, or null when `found` is what to show. */
export function heldAnswer(
  held: Held | null,
  q: string,
  found: Alt[],
  paused: boolean,
): Alt | null {
  if (!held || !q.trim()) return null;
  // A pause only ends it when the words can't become anything: "grafico km m" is still on its way.
  if (paused && !mayContinue(q)) return null;
  const top = found[0];
  if (top?.exact) return null;
  return related(held.q, q) ? held.row : null;
}
