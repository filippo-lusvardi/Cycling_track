// Reads and writes the plan's note through the account's source, so nothing here depends on where it ends up.
import { createNote, getEvents, setActivityDescription, updateNote } from "../source";
import { addDays } from "../training";
import {
  NOTE_SEARCH_DAYS,
  PLAN_NOTE_NAME,
  noteDate,
  readNote,
  writeNote,
  type PlanNote,
} from "./note";
import { withRating } from "./rating";
import type { Rating } from "./types";

export type StoredPlan = { id: string; date: string; note: PlanNote };

export async function loadPlan(today: string): Promise<StoredPlan | null> {
  const events = await getEvents({
    oldest: addDays(today, -NOTE_SEARCH_DAYS),
    newest: addDays(today, NOTE_SEARCH_DAYS),
  });
  for (const e of events) {
    if (e.category !== "NOTE" || e.name !== PLAN_NOTE_NAME) continue;
    const note = readNote(e.description);
    if (note) return { id: e.id, date: e.date, note };
  }
  return null;
}

export async function savePlan(
  note: PlanNote,
  today: string,
  stored: Pick<StoredPlan, "id" | "date"> | null,
): Promise<string> {
  const text = writeNote(note, today);
  const date = noteDate(note.state.startedOn, stored?.date ?? null, today);
  if (!stored) return createNote(PLAN_NOTE_NAME, text, date);
  await updateNote(stored.id, text, date);
  return stored.id;
}

export const saveRating = (id: string, description: string | null, rating: Rating | null) =>
  setActivityDescription(id, withRating(description, rating));
