// The summit book (libro di vetta) of a climb: every ascent in order, how the record fell over the years, and the
// round-numbered ascents. Pure; components/SummitBook.tsx draws it.

/** Ascent numbers worth a mark: the first, the 10th, the 25th, then every 50th. */
export const isMilestone = (n: number) =>
  n === 1 || n === 10 || n === 25 || (n >= 50 && n % 50 === 0);

export type BookEntry<E> = {
  e: E;
  /** Ascent number, oldest first (1 = first ascent). */
  n: number;
  /** "current": today's record; "then": the record when it was ridden, beaten since. */
  record: "current" | "then" | null;
  /** Seconds slower than today's record (0 for the record itself). */
  gap: number;
};

export type SummitBook<E> = {
  /** Year chapters, newest first; entries in each newest first. */
  years: { year: string; entries: BookEntry<E>[] }[];
  count: number;
  /** Date of the first ascent. */
  since: string | null;
};

export function summitBook<E extends { date: string; duration: number }>(
  efforts: E[],
): SummitBook<E> {
  const chrono = [...efforts].sort(
    (a, b) => a.date.localeCompare(b.date) || a.duration - b.duration,
  );
  const fastest = Math.min(...chrono.map((e) => e.duration));
  let best = Infinity;
  let currentMarked = false;
  const entries = chrono.map((e, i): BookEntry<E> => {
    let record: BookEntry<E>["record"] = null;
    if (e.duration < best) {
      best = e.duration;
      // Ties with the record later on don't take it: the first to ride that time holds it.
      record = e.duration === fastest && !currentMarked ? "current" : "then";
      if (record === "current") currentMarked = true;
    }
    return { e, n: i + 1, record, gap: e.duration - fastest };
  });
  const years = new Map<string, BookEntry<E>[]>();
  for (const b of [...entries].reverse()) {
    const y = b.e.date.slice(0, 4);
    years.set(y, [...(years.get(y) ?? []), b]);
  }
  return {
    years: [...years].map(([year, list]) => ({ year, entries: list })),
    count: entries.length,
    since: chrono[0]?.date ?? null,
  };
}
