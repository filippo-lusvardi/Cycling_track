import { useQueries, useQuery } from "@tanstack/react-query";
import { createFileRoute, useCanGoBack, useRouter } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useMemo } from "react";
import { ChartPlot } from "@/components/ChartPanels";
import { Panel } from "@/components/StatCard";
import { buildChart, chartAsked, chartCurves, chartWellnessSpan } from "@/lib/ask-chart";
import { curveKey, type CurveRead } from "@/lib/ask-efforts";
import { t } from "@/lib/i18n";
import {
  allActivitiesQuery,
  hrCurveRangeQuery,
  powerCurveRangeQuery,
  wellnessRangeQuery,
} from "@/lib/queries";
import { mainSport } from "@/lib/sport";
import { isoDate } from "@/lib/training";

export const Route = createFileRoute("/chart")({
  // The question itself, so a chart reads the same as typing it and stays current.
  validateSearch: (s: Record<string, unknown>): { q?: string } =>
    typeof s["q"] === "string" ? { q: s["q"] } : {},
  component: ChartPage,
});

function ChartPage() {
  const { q } = Route.useSearch();
  const router = useRouter();
  const canGoBack = useCanGoBack();
  const today = isoDate(new Date());
  const sport = mainSport();
  const asked = useMemo(() => (q ? chartAsked(q, { today, sport }) : null), [q, today, sport]);
  const { data: acts } = useQuery(allActivitiesQuery());
  const needs = useMemo(
    () => (asked ? chartCurves(asked, { today, sport }) : []),
    [asked, today, sport],
  );
  const curveQueries = useQueries({
    queries: needs.map((c) =>
      c.metric === "power"
        ? powerCurveRangeQuery(c.from, c.to)
        : hrCurveRangeQuery(c.from, c.to, c.sport),
    ) as ReturnType<typeof powerCurveRangeQuery>[],
  });
  const curvesKey = curveQueries.map((r) => `${r.dataUpdatedAt}/${r.isError}`).join();
  const curveReads = useMemo(
    () =>
      Object.fromEntries(
        needs.flatMap((c, i): [string, CurveRead][] => {
          const r = curveQueries[i];
          if (r?.isError) return [[curveKey(c), { curve: null, failed: true }]];
          return r?.data !== undefined ? [[curveKey(c), { curve: r.data }]] : [];
        }),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `curveQueries` changes with `curvesKey`.
    [needs, curvesKey],
  );
  const days = asked ? chartWellnessSpan(asked, today) : null;
  const wellness = useQuery({
    ...wellnessRangeQuery({ oldest: days?.from ?? "", newest: days?.to ?? "" }),
    enabled: !!days,
  });
  const built = useMemo(
    () =>
      asked
        ? buildChart(asked, {
            today,
            sport,
            acts,
            curveReads,
            ...(days ? { chartWellness: { days: wellness.data, failed: wellness.isError } } : {}),
          })
        : null,
    [asked, today, sport, acts, curveReads, days, wellness.data, wellness.isError],
  );
  return (
    <div className="space-y-4">
      {canGoBack && (
        <button
          type="button"
          onClick={() => router.history.back()}
          className="on-sky inline-flex min-h-9 items-center gap-1 text-sm text-foreground/85 hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> {t("Back", "Indietro")}
        </button>
      )}
      {!built ? (
        <h1 className="on-sky text-3xl font-bold tracking-tight">
          {t("No chart to show", "Nessun grafico da mostrare")}
        </h1>
      ) : (
        <>
          <div>
            <h1 className="on-sky text-3xl font-bold tracking-tight">{built.title}</h1>
            <p className="on-sky mt-1 text-sm text-foreground/85">
              {[built.answer, built.value].filter(Boolean).join(" · ")}
            </p>
          </div>
          {built.view.loading &&
          !built.view.panels.some((p) => p.points.some((d) => d.value != null)) ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {t("Loading…", "Caricamento…")}
            </p>
          ) : (
            built.view.panels.map((p) => (
              <Panel key={p.title} title={p.title}>
                <ChartPlot p={p} height={built.view.panels.length > 1 ? "h-48" : "h-64"} />
              </Panel>
            ))
          )}
          {built.view.note && (
            <p className="on-sky text-xs text-foreground/85">{built.view.note}</p>
          )}
        </>
      )}
    </div>
  );
}
