import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { activitiesQuery } from "@/lib/queries";
import { ActivityRow } from "@/components/ActivityRow";
import { Panel, StatCard } from "@/components/StatCard";
import { formatDuration } from "@/lib/training";

export const Route = createFileRoute("/rides/")({
  head: () => ({
    meta: [
      { title: "Rides — Cadence" },
      { name: "description", content: "All your rides and workouts synced from Garmin via intervals.icu." },
      { property: "og:title", content: "Rides — Cadence" },
      { property: "og:description", content: "Ride history with distance, power and training load." },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(activitiesQuery(90)),
  component: Rides,
});

function Rides() {
  const { data } = useSuspenseQuery(activitiesQuery(90));
  const totals = useMemo(() => {
    const cutoff = new Date(Date.now() - 28 * 86400000).toISOString();
    const last = data.filter((a) => a.start_date_local >= cutoff);
    return {
      km: last.reduce((s, a) => s + (a.distance ?? 0), 0) / 1000,
      time: last.reduce((s, a) => s + (a.moving_time ?? 0), 0),
      load: last.reduce((s, a) => s + (a.icu_training_load ?? 0), 0),
      count: last.length,
    };
  }, [data]);

  return (
    <div className="space-y-6">
      <div>
        <div className="eyebrow">Last 90 days</div>
        <h1 className="text-3xl font-bold tracking-tight">Rides</h1>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="28d distance" value={Math.round(totals.km)} unit="km" />
        <StatCard label="28d time" value={formatDuration(totals.time)} />
        <StatCard label="28d load" value={Math.round(totals.load)} tone="fitness" />
        <StatCard label="28d activities" value={totals.count} />
      </div>
      <Panel title={`${data.length} activities`}>
        <div className="mb-1 hidden justify-end gap-4 px-3 text-right sm:flex">
          <span className="eyebrow">Dist</span>
          <span className="eyebrow">Time</span>
          <span className="eyebrow w-14">Power</span>
          <span className="eyebrow w-12">Load</span>
        </div>
        <div className="-mx-3 divide-y divide-border">
          {data.map((a) => (
            <ActivityRow key={a.id} a={a} />
          ))}
        </div>
      </Panel>
    </div>
  );
}
