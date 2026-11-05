// The plan's check, when it comes round: there's no server, so it runs when the app is opened. It writes the next seven days
// to the calendar and draws nothing.
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { toast } from "sonner";
import { useOnline } from "@/hooks/use-online";
import { usePlan } from "@/hooks/use-plan";
import { t } from "@/lib/i18n";
import { runCheck } from "@/lib/plan/actions";
import { fillDue } from "@/lib/plan/engine";
import { hasSource } from "@/lib/source";
import { mainSport } from "@/lib/sport";

/** Once per day and session: a failure is tried again the next time the app opens. */
let ranOn: string | null = null;

function Keeper() {
  const qc = useQueryClient();
  const online = useOnline();
  const { ctx, executions, today } = usePlan();
  const due = !!ctx && fillDue(ctx.note, today);
  useEffect(() => {
    if (!ctx || !executions || !online || !due || ranOn === today) return;
    ranOn = today;
    runCheck(ctx, executions, today)
      .then((added) => {
        if (added)
          toast.success(
            t("The next days are on the calendar", "I prossimi giorni sono in calendario"),
          );
      })
      .catch((err) => {
        console.warn("Plan check failed", err);
        toast.error(t("Couldn't update the plan", "Impossibile aggiornare il piano"));
      })
      .finally(() => void qc.invalidateQueries({ queryKey: ["events"] }));
  }, [ctx, executions, online, due, today, qc]);
  return null;
}

export function PlanKeeper() {
  return hasSource() && mainSport() === "ride" ? <Keeper /> : null;
}
