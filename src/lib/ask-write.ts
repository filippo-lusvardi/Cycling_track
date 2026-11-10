// What the rows that save do, each returning how to undo it. Through the same paths as the check-in, the crown's sheet
// and the ride's page, so nothing is written any differently from typing than from tapping.
import type { QueryClient } from "@tanstack/react-query";
import { LOGGED_IN_BATCH, type WriteAction } from "./ask-intents";
import { withBrioches } from "./brioches";
import { readSetting, writeSetting } from "./settings";
import { isFreeRide, type ManualActivity, type OffKind } from "./intervals";
import {
  createOffEvent,
  deleteEvent,
  planFreeRide,
  createManualActivity,
  deleteActivity,
  getActivity,
  getOffEvents,
  getWellness,
  movePlanned,
  scheduleWorkout,
  setActivityDescription,
  setActivityFeel,
  updateOffEvent,
} from "./source";
import { gearState, removeGear, saveGear, setRideGear } from "./gear-store";
import { addDays } from "./training";
import { offToggle } from "./tree";
import { saveWellnessOrQueue } from "./wellness-queue";

export type WriteResult = {
  queued: boolean;
  undo: () => Promise<void>;
  /** What was created, when something was. */
  id?: string;
};

let last: { label: string; run: () => Promise<void> } | null = null;

/** What typing `annulla` would take back. */
export const lastSaved = () => last?.label ?? null;

/** Keeps a save's way back for typing, and gives the same way back for its message: either one, once. */
export function rememberUndo(label: string, undo: () => Promise<void>) {
  const run = async () => {
    await undo();
    if (last?.run === run) last = null;
  };
  last = { label, run };
  return run;
}

export const undoLast = async () => {
  await last?.run();
};

/** The time an activity logged today started, having just ended; other days keep the form's morning. */
export function loggedNow(entry: ManualActivity, now: Date): ManualActivity {
  const pad = (n: number) => String(n).padStart(2, "0");
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  if (entry.time || entry.date !== today) return entry;
  const start = Math.max(0, now.getHours() * 60 + now.getMinutes() - entry.minutes);
  return { ...entry, time: `${pad(Math.floor(start / 60))}:${pad(start % 60)}` };
}

const SCALES = new Set(["sleepQuality", "fatigue", "stress", "mood"]);

async function toggleOff(off: OffKind, today: string) {
  const events = await getOffEvents({ oldest: addDays(today, -90), newest: addDays(today, 90) });
  const change = offToggle(events, off, today);
  if (change.op === "create") await createOffEvent(off, change.start, change.last);
  else if (change.op === "update") await updateOffEvent(change.id, change.start, change.last);
  else await deleteEvent(change.id);
}

export async function runWrite(a: WriteAction, qc: QueryClient): Promise<WriteResult> {
  if (a.kind === "undo") throw new Error("Undoing goes through undoLast");
  if (a.kind === "batch") {
    // In order, the activity first so a brioche can land on it. If one fails, what's done is taken back: all or nothing.
    const done: WriteResult[] = [];
    const ordered = [...a.parts].sort(
      (x, y) => Number(y.action.kind === "log") - Number(x.action.kind === "log"),
    );
    let newId: string | undefined;
    try {
      for (const part of ordered) {
        const step =
          part.action.kind === "brioche" && part.action.activityId === LOGGED_IN_BATCH
            ? { ...part.action, activityId: newId ?? "" }
            : part.action;
        const r = await runWrite(step, qc);
        done.push(r);
        if (r.id) newId = r.id;
      }
    } catch (e) {
      for (const r of done.reverse()) await r.undo().catch(() => {});
      throw e;
    }
    return {
      queued: done.some((r) => r.queued),
      undo: async () => {
        for (const r of [...done].reverse()) await r.undo();
      },
    };
  }
  if (a.kind === "gear") {
    const before = gearState().gears.find((g) => g.id === a.gear.id) ?? null;
    await saveGear({ ...a.gear, updatedAt: Date.now() });
    return {
      queued: false,
      undo: async () => {
        if (before) await saveGear({ ...before, updatedAt: Date.now() });
        else await removeGear(a.gear.id);
      },
    };
  }
  if (a.kind === "gear-ride") {
    const ov = gearState().overrides;
    const had = a.activityId in ov;
    const prev = ov[a.activityId];
    await setRideGear(a.activityId, a.gearId);
    return {
      queued: false,
      undo: async () => {
        await setRideGear(a.activityId, had ? prev : undefined);
      },
    };
  }
  if (a.kind === "wellness") {
    const refresh = () => qc.invalidateQueries({ queryKey: ["wellness"] });
    let before: number | null = null;
    try {
      const rows = await getWellness({ oldest: a.date, newest: a.date });
      before = (rows.find((w) => w.id === a.date)?.[a.field] as number | null | undefined) ?? null;
    } catch {
      /* Offline: nothing to read back, so undoing clears it. */
    }
    const status = await saveWellnessOrQueue({ date: a.date, [a.field]: a.value });
    // One typed word isn't the morning's check-in: it stays on offer, already holding this answer.
    const state = `cadence_checkin_${a.date}`;
    const typed = SCALES.has(a.field) && !readSetting(state);
    if (typed) writeSetting(state, "typed");
    await refresh();
    return {
      queued: status === "queued",
      undo: async () => {
        await saveWellnessOrQueue({ date: a.date, [a.field]: before });
        if (typed && readSetting(state) === "typed") writeSetting(state, null);
        await refresh();
      },
    };
  }
  if (a.kind === "off") {
    await toggleOff(a.off, a.today);
    await qc.invalidateQueries({ queryKey: ["events"] });
    return {
      queued: false,
      undo: async () => {
        await toggleOff(a.off, a.today);
        await qc.invalidateQueries({ queryKey: ["events"] });
      },
    };
  }
  if (a.kind === "ride") {
    const id = await planFreeRide({
      name: a.name,
      type: a.type,
      date: a.date,
      seconds: a.seconds,
      ...(a.load != null ? { load: a.load } : {}),
    });
    await qc.invalidateQueries({ queryKey: ["events"] });
    return {
      queued: false,
      undo: async () => {
        await deleteEvent(id);
        await qc.invalidateQueries({ queryKey: ["events"] });
      },
    };
  }
  if (a.kind === "log") {
    const refresh = () => qc.invalidateQueries({ queryKey: ["activities"] });
    const { id } = await createManualActivity(loggedNow(a.entry, new Date()));
    await refresh();
    return {
      queued: false,
      ...(id ? { id } : {}),
      undo: async () => {
        if (!id) throw new Error("The new activity's id wasn't returned");
        await deleteActivity(id);
        await refresh();
      },
    };
  }
  if (a.kind === "move-plan") {
    const refresh = () => qc.invalidateQueries({ queryKey: ["events"] });
    await movePlanned(a.id, a.to);
    await refresh();
    return {
      queued: false,
      undo: async () => {
        await movePlanned(a.id, a.from);
        await refresh();
      },
    };
  }
  if (a.kind === "remove-plan") {
    const refresh = () => qc.invalidateQueries({ queryKey: ["events"] });
    const e = a.event;
    await deleteEvent(e.id);
    await refresh();
    return {
      queued: false,
      // Back as it was read: a new event in the same place, since the old one is gone.
      undo: async () => {
        if (isFreeRide(e))
          await planFreeRide({
            name: a.label,
            type: e.type === "Run" ? "Run" : "Ride",
            date: e.date,
            ...(e.moving_time ? { seconds: e.moving_time } : {}),
            ...(e.icu_training_load != null ? { load: e.icu_training_load } : {}),
          });
        else
          await scheduleWorkout(
            { name: a.label, type: e.type ?? "Ride", description: e.description ?? "" },
            e.date,
          );
        await refresh();
      },
    };
  }
  if (a.kind === "feel") {
    const refresh = async () => {
      await qc.invalidateQueries({ queryKey: ["activity", a.activityId] });
      await qc.invalidateQueries({ queryKey: ["activities"] });
    };
    const before = (await getActivity(a.activityId)).feel ?? null;
    await setActivityFeel(a.activityId, a.feel);
    await refresh();
    return {
      queued: false,
      undo: async () => {
        await setActivityFeel(a.activityId, before);
        await refresh();
      },
    };
  }
  const detail = await getActivity(a.activityId);
  const before = detail.description;
  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ["activity", a.activityId] });
    await qc.invalidateQueries({ queryKey: ["activities"] });
  };
  await setActivityDescription(a.activityId, withBrioches(before, a.count));
  await refresh();
  return {
    queued: false,
    undo: async () => {
      await setActivityDescription(a.activityId, before ?? "");
      await refresh();
    },
  };
}
