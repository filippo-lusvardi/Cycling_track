import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { parseISO } from "date-fns";
import { allActivitiesQuery } from "@/lib/queries";
import { ActivityRow } from "@/components/ActivityRow";
import { Panel, StatCard } from "@/components/StatCard";
import { activityKind, KINDS, type Kind } from "@/lib/activity-kind";
import { applyFilter, filterFromSearch, filterTitle, type ActivityFilter } from "@/lib/ask-filter";
import type { Activity } from "@/lib/intervals";
import { formatDuration, isoDate } from "@/lib/training";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { format, t } from "@/lib/i18n";
import { mainSport } from "@/lib/sport";

const PAGE = 100;

/** Consecutive activities (newest first) grouped by YYYY-MM. */
function groupByMonth<T extends { start_date_local: string }>(acts: T[]): [string, T[]][] {
  const out: [string, T[]][] = [];
  for (const a of acts) {
    const m = a.start_date_local.slice(0, 7);
    if (out.at(-1)?.[0] === m) out.at(-1)![1].push(a);
    else out.push([m, [a]]);
  }
  return out;
}

export const Route = createFileRoute("/rides/")({
  validateSearch: (s: Record<string, unknown>): { filter?: string } & Record<string, unknown> =>
    s["filter"] == null ? {} : s,
  loader: ({ context }) => context.queryClient.ensureQueryData(allActivitiesQuery()),
  component: Rides,
});

/** A list asked for by typing: only that, in the order asked, and one tap back to everything. */
function FilteredRides({ f, data }: { f: ActivityFilter; data: Activity[] }) {
  const found = useMemo(() => applyFilter(data, f), [data, f]);
  const [limit, setLimit] = useState(PAGE);
  return (
    <div className="space-y-6">
      <div>
        <Link to="/rides" search={{}} className="eyebrow hover:text-foreground">
          {t("All activities", "Tutte le attività")}
        </Link>
        <h1 className="on-sky text-3xl font-bold tracking-tight">
          {filterTitle(f, isoDate(new Date()))}
        </h1>
      </div>
      <Panel title={`${found.length} ${t("activities", "attività")}`}>
        {found.length ? (
          <div className="-mx-3 -my-1">
            {found.slice(0, limit).map((a) => (
              <ActivityRow key={a.id} a={a} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t("Nothing found", "Nessun risultato")}</p>
        )}
        {found.length > limit && (
          <Button
            variant="secondary"
            className="mt-3 w-full"
            onClick={() => setLimit(limit + PAGE)}
          >
            {t("Show more", "Mostra altre")}
          </Button>
        )}
      </Panel>
    </div>
  );
}

function Rides() {
  const search = Route.useSearch();
  const { data } = useSuspenseQuery(allActivitiesQuery());
  const f = useMemo(() => filterFromSearch(search), [search]);
  return f ? <FilteredRides f={f} data={data} /> : <AllRides data={data} />;
}

function AllRides({ data }: { data: Activity[] }) {
  const [kind, setKind] = useState<Kind | null>(null);
  // Only the kinds you actually have, most frequent first; they double as the colour legend.
  const kinds = useMemo(() => {
    const n = new Map<Kind, number>();
    for (const a of data) n.set(activityKind(a), (n.get(activityKind(a)) ?? 0) + 1);
    return [...n.entries()].sort((a, b) => b[1] - a[1]);
  }, [data]);
  const filtered = useMemo(
    () => (kind ? data.filter((a) => activityKind(a) === kind) : data),
    [data, kind],
  );
  // The whole history can be thousands of rows: render a page at a time.
  const [limit, setLimit] = useState(PAGE);
  const shown = filtered.slice(0, limit);
  const months = useMemo(() => {
    const totals = new Map<string, { n: number; km: number; secs: number; load: number }>();
    for (const a of filtered) {
      const m = a.start_date_local.slice(0, 7);
      const t = totals.get(m) ?? { n: 0, km: 0, secs: 0, load: 0 };
      t.n++;
      t.km += (a.distance ?? 0) / 1000;
      t.secs += a.moving_time ?? 0;
      t.load += a.icu_training_load ?? 0;
      totals.set(m, t);
    }
    return totals;
  }, [filtered]);
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
        <div className="eyebrow">
          {t("All activities", "Tutte le attività")}
          {data.length
            ? ` · ${t("since", "dal")} ${format(parseISO(data.at(-1)!.start_date_local), "MMM yyyy")}`
            : ""}
        </div>
        <h1 className="on-sky text-3xl font-bold tracking-tight">{t("Activities", "Attività")}</h1>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label={t("28d distance", "Distanza 28g")}
          value={Math.round(totals.km)}
          unit="km"
        />
        <StatCard label={t("28d time", "Tempo 28g")} value={formatDuration(totals.time)} />
        <StatCard
          label={t("28d load", "Carico 28g")}
          value={Math.round(totals.load)}
          tone="fitness"
        />
        <StatCard label={t("28d activities", "Attività 28g")} value={totals.count} />
      </div>
      <div className="flex flex-wrap gap-2">
        {kinds.map(([k, n]) => {
          const K = KINDS[k];
          const on = kind === k;
          return (
            <button
              key={k}
              onClick={() => {
                setKind(on ? null : k);
                setLimit(PAGE);
              }}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors",
                on
                  ? "border-transparent text-background"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
              style={on ? { background: K.color } : undefined}
            >
              <K.icon className="h-3.5 w-3.5" style={on ? undefined : { color: K.color }} />
              {K.label}
              <span className="stat-num opacity-70">{n}</span>
            </button>
          );
        })}
      </div>
      <Panel title={`${filtered.length} ${t("activities", "attività")}`}>
        <div className="mb-1 hidden justify-end gap-4 px-3 text-right sm:flex">
          <span className="eyebrow">{t("Dist", "Dist")}</span>
          <span className="eyebrow">{t("Time", "Tempo")}</span>
          <span className="eyebrow w-14">
            {mainSport() === "run" ? t("Pace", "Passo") : t("Power", "Potenza")}
          </span>
          <span className="eyebrow w-12">{t("Load", "Carico")}</span>
        </div>
        <div className="-mx-3">
          {groupByMonth(shown).map(([m, acts]) => {
            const mt = months.get(m)!;
            // One block per month, so its heading sticks under the site header while you scroll through it.
            return (
              <section key={m}>
                <div className="stat-num sticky top-[env(safe-area-inset-top)] z-10 flex items-baseline justify-between gap-3 border-b border-border bg-card/95 px-3 pb-1.5 pt-4 text-xs text-muted-foreground backdrop-blur lg:top-[57px]">
                  <span className="font-sans text-sm font-semibold text-foreground">
                    {format(parseISO(`${m}-01`), "MMMM yyyy")}
                  </span>
                  <span>
                    {mt.n} · {Math.round(mt.km)} km · {formatDuration(mt.secs)} ·{" "}
                    <span className="text-primary">{Math.round(mt.load)}</span>
                  </span>
                </div>
                <div className="divide-y divide-border">
                  {acts.map((a) => (
                    <ActivityRow key={a.id} a={a} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
        {filtered.length > limit && (
          <div className="mt-4 flex justify-center">
            <Button variant="secondary" onClick={() => setLimit((l) => l + PAGE)}>
              {t(
                `Show more (${filtered.length - limit} left)`,
                `Mostra altre (${filtered.length - limit} rimanenti)`,
              )}
            </Button>
          </div>
        )}
      </Panel>
    </div>
  );
}
