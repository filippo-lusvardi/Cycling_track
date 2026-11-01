// Brioches eaten on a ride, kept as a readable "Brioches: 2" line in its intervals.icu description. Pure.

const LINE = /^\s*brioches?:\s*(\d+)\s*$/im;

/** The count in a description; 0 when there's no line. */
export function briochesIn(description: string | null): number {
  const m = LINE.exec(description ?? "");
  return m ? Number(m[1]) : 0;
}

/** The description with the count set: the line is replaced, added at the end, or removed at 0. */
export function withBrioches(description: string | null, n: number): string {
  const rest = (description ?? "")
    .split("\n")
    .filter((l) => !LINE.test(l))
    .join("\n")
    .trim();
  return n > 0 ? [rest, `Brioches: ${n}`].filter(Boolean).join("\n\n") : rest;
}

/** The description to show, without the brioche line (it has its own section). */
export const withoutBrioches = (description: string | null) => withBrioches(description, 0);
