// The one question after a session of the plan: how it went against what was planned. Nothing shows for any other ride.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { planQuery } from "@/hooks/use-plan";
import { t } from "@/lib/i18n";
import type { ActivityDetail } from "@/lib/intervals";
import { matchSessions } from "@/lib/plan/match";
import { ratingIn } from "@/lib/plan/rating";
import { saveRating } from "@/lib/plan/store";
import type { PlanWorkout, Rating } from "@/lib/plan/types";
import { eventsQuery } from "@/lib/queries";
import { hasSource } from "@/lib/source";
import { isSport } from "@/lib/sport";
import { isoDate } from "@/lib/training";
import { cn } from "@/lib/utils";

const LABEL: Record<Rating, () => string> = {
  easier: () => t("Easier", "Più facile"),
  expected: () => t("As expected", "Come previsto"),
  harder: () => t("Harder", "Più dura"),
  failed: () => t("Couldn't finish", "Non finita"),
};
const ORDER: Rating[] = ["easier", "expected", "harder", "failed"];

/** The plan's session this ride went with, and its workout on the calendar. */
export function usePlanSession(a: ActivityDetail) {
  const date = a.start_date_local.slice(0, 10);
  const today = isoDate(new Date());
  const enabled = hasSource() && isSport(a, "ride");
  const { data: plan } = useQuery({ ...planQuery(today), enabled });
  const { data: events } = useQuery({ ...eventsQuery({ oldest: date, newest: date }), enabled });
  const session = plan?.note.sessions.find((s) => s.date === date);
  const event = events?.find((e) => e.id === session?.eventId);
  if (!session || !event) return null;
  const matched = matchSessions(
    [
      {
        date,
        workout: { seconds: session.seconds } as PlanWorkout,
        pairedActivityId: event.pairedActivityId ?? null,
      },
    ],
    [a],
  );
  return matched.get(date) ? { session, event, reviews: plan?.note.reviews ?? [] } : null;
}

export function PlanRating({ a }: { a: ActivityDetail }) {
  const qc = useQueryClient();
  const matched = usePlanSession(a);
  const saved = ratingIn(a.description);
  const [value, setValue] = useState<Rating | null>(saved);
  const [busy, setBusy] = useState(false);
  if (!matched) return null;

  async function pick(r: Rating) {
    const next = value === r ? null : r;
    const prev = value;
    setValue(next);
    setBusy(true);
    try {
      await saveRating(a.id, a.description, next);
      await qc.invalidateQueries({ queryKey: ["activity", a.id] });
      await qc.invalidateQueries({ queryKey: ["activities"] });
    } catch {
      setValue(prev);
      toast.error(t("Couldn't save", "Impossibile salvare"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 border-t border-border pt-3">
      <div className="mb-1.5 text-xs text-muted-foreground">
        {t("Compared with the plan", "Rispetto al piano")}
      </div>
      <div className="grid grid-cols-4 gap-1.5" role="group">
        {ORDER.map((r) => {
          const on = value === r;
          return (
            <button
              key={r}
              type="button"
              disabled={busy}
              aria-pressed={on}
              onClick={() => void pick(r)}
              className={cn(
                "flex min-h-11 items-center justify-center rounded-md border px-0.5 py-1.5 text-center text-[11px] leading-tight sm:text-xs",
                on
                  ? "border-transparent bg-secondary text-foreground"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {LABEL[r]()}
            </button>
          );
        })}
      </div>
    </div>
  );
}
