// What the rows that save do, each returning how to undo it. Through the same paths as the check-in, the crown's sheet
// and the ride's page, so nothing is written any differently from typing than from tapping.
import type { QueryClient } from "@tanstack/react-query";
import type { WriteAction } from "./ask-intents";
import { withBrioches } from "./brioches";
import type { OffKind } from "./intervals";
import {
  createOffEvent,
  deleteEvent,
  getActivity,
  getOffEvents,
  getWellness,
  setActivityDescription,
  setActivityFeel,
  updateOffEvent,
} from "./source";
import { addDays } from "./training";
import { offToggle } from "./tree";
import { saveWellnessOrQueue } from "./wellness-queue";

export type WriteResult = { queued: boolean; undo: () => Promise<void> };

async function toggleOff(off: OffKind, today: string) {
  const events = await getOffEvents({ oldest: addDays(today, -90), newest: addDays(today, 90) });
  const change = offToggle(events, off, today);
  if (change.op === "create") await createOffEvent(off, change.start, change.last);
  else if (change.op === "update") await updateOffEvent(change.id, change.start, change.last);
  else await deleteEvent(change.id);
}

export async function runWrite(a: WriteAction, qc: QueryClient): Promise<WriteResult> {
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
    await refresh();
    return {
      queued: status === "queued",
      undo: async () => {
        await saveWellnessOrQueue({ date: a.date, [a.field]: before });
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
