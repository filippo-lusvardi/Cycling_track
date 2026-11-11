// The account's planned routes, live on this device (like gear-store): Firestore's cache keeps them offline and queues
// what is written. Started with the session (lib/account).
import { useSyncExternalStore } from "react";
import type { Course, StoredCourse } from "./course/course";

export type CourseState = { courses: Course[]; ready: boolean };

let state: CourseState = { courses: [], ready: false };
const listeners = new Set<() => void>();

function set(next: Partial<CourseState>) {
  state = { ...state, ...next };
  for (const l of listeners) l();
}

export const courseState = () => state;
export const subscribeCourses = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export const useCourseState = () =>
  useSyncExternalStore(subscribeCourses, courseState, courseState);

/** Newest first. */
const sorted = (cs: Course[]) => [...cs].sort((a, b) => b.updated - a.updated);
const warn = (e: unknown) => console.warn("Course sync failed", e);

export async function followCourses(): Promise<() => void> {
  const { watchCourses } = await import("./cloud");
  return watchCourses((courses) => set({ courses: sorted(courses), ready: true }));
}

export async function saveCourse(c: Course) {
  set({ courses: sorted([...state.courses.filter((x) => x.id !== c.id), c]) });
  const { writeCourse } = await import("./cloud");
  await writeCourse(c).catch(warn);
}

/** Change fields that don't touch the line (name, rides that went round it). */
export async function patchCourse(id: string, patch: Partial<StoredCourse>) {
  set({ courses: sorted(state.courses.map((c) => (c.id === id ? { ...c, ...patch } : c))) });
  const { patchCourse: write } = await import("./cloud");
  await write(id, patch).catch(warn);
}

export async function removeCourse(id: string) {
  set({ courses: state.courses.filter((c) => c.id !== id) });
  const { deleteCourse } = await import("./cloud");
  deleteCourse(id).catch(warn);
}

export const resetCourseState = (next: Partial<CourseState> = {}) =>
  set({ courses: [], ready: false, ...next });
