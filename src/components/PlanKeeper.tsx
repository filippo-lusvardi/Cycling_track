// The plan's check, when it comes round: there's no server, so it runs when the app is opened. It writes the next seven days
// to the calendar and draws nothing.
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { toast } from "sonner";
import { ZodError } from "zod";
import { useOnline } from "@/hooks/use-online";
import { usePlan } from "@/hooks/use-plan";
import { t } from "@/lib/i18n";
import { runCheck } from "@/lib/plan/actions";
import { fillDue } from "@/lib/plan/engine";
import { hasSource } from "@/lib/source";
import { mainSport } from "@/lib/sport";

/** What went wrong, in a line someone can pass on: the plan's own checks say which field, intervals.icu its status. */
function causeOf(err: unknown): string {
  if (err instanceof ZodError) {
    const issue = err.issues[0];
    const where = issue?.path.join(".") || t("a value", "un valore");
    return issue?.code === "too_big"
      ? t(`${where} is too long`, `${where} è troppo lungo`)
      : t(`${where} isn't valid`, `${where} non è valido`);
  }
  return err instanceof Error && err.message ? err.message : String(err);
}

/** Once per day and session: a failure is tried again the next time the app opens. */
let ranOn: string | null = null;

function Keeper() {
  const qc = useQueryClient();
  const online = useOnline();
  const { ctx, executions, today } = usePlan();
  const due = !!ctx && fillDue(ctx.note, today, ctx.input.races);
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
        toast.error(t("Couldn't update the plan", "Impossibile aggiornare il piano"), {
          description: causeOf(err),
        });
      })
      .finally(() => void qc.invalidateQueries({ queryKey: ["events"] }));
  }, [ctx, executions, online, due, today, qc]);
  return null;
}

export function PlanKeeper() {
  return hasSource() && mainSport() === "ride" ? <Keeper /> : null;
}
