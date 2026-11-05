// The plan as the page needs it: the note, the calendar around today, and how recent rides compared with their workouts.
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useSuggestInput } from "@/hooks/use-suggest-input";
import { compareRides } from "@/lib/plan/actions";
import { ridesToCompare, type PlanContext } from "@/lib/plan/engine";
import { loadPlan } from "@/lib/plan/store";
import { eventsQuery } from "@/lib/queries";
import { hasSource } from "@/lib/source";
import { addDays, isoDate } from "@/lib/training";

export const planQuery = (today: string) => ({
  queryKey: ["events", "plan", today],
  queryFn: () => loadPlan(today),
  staleTime: 5 * 60_000,
});

export function usePlan() {
  const today = isoDate(new Date());
  const enabled = hasSource();
  const input = useSuggestInput();
  const plan = useQuery({ ...planQuery(today), enabled });
  const calendar = useQuery({
    ...eventsQuery({ oldest: addDays(today, -21), newest: addDays(today, 21) }),
    enabled,
  });
  const ctx = useMemo<PlanContext | null>(
    () =>
      plan.data && input && calendar.data
        ? { note: plan.data.note, input, calendar: calendar.data }
        : null,
    [plan.data, input, calendar.data],
  );
  const rides = useMemo(() => (ctx ? ridesToCompare(ctx) : []), [ctx]);
  const executions = useQuery({
    queryKey: ["plan-compare", rides.map((r) => r.act.id).join(), input?.th.ftp],
    queryFn: () => compareRides(rides, input?.th.ftp),
    enabled: !!ctx,
    staleTime: 60 * 60_000,
  });
  return {
    today,
    input,
    stored: plan.data ?? null,
    loading: plan.isLoading || calendar.isLoading || !input,
    failed: plan.isError || calendar.isError,
    calendar: calendar.data ?? [],
    ctx,
    executions: executions.data ?? null,
  };
}

/** How far back the progress page looks at each session: as far as the note keeps them. */
const PROGRESS_DAYS = 28;

/** The sessions of the last weeks with how they went. Longer than the plan's own look back, so only for the page that shows it. */
export function usePlanProgress(ctx: PlanContext) {
  const { today } = ctx.input;
  const oldest = addDays(today, -PROGRESS_DAYS);
  const events = useQuery({
    ...eventsQuery({ oldest, newest: addDays(today, 21) }),
    enabled: hasSource(),
  });
  const wide = useMemo<PlanContext>(
    () => (events.data ? { ...ctx, calendar: events.data } : ctx),
    [ctx, events.data],
  );
  const rides = useMemo(() => ridesToCompare(wide, PROGRESS_DAYS), [wide]);
  const scores = useQuery({
    queryKey: ["plan-compare", rides.map((r) => r.act.id).join(), ctx.input.th.ftp],
    queryFn: () => compareRides(rides, ctx.input.th.ftp),
    enabled: !!events.data,
    staleTime: 60 * 60_000,
  });
  return { wide, oldest: events.data ? oldest : addDays(today, -21), scores: scores.data ?? null };
}
