// How the rider is doing: critical power, durability, aerobic efficiency and fitness, each with its last weeks. Trends only;
// a tap opens the larger chart. The numbers come from rides already there: nothing is projected.
import { useQueries, useQuery } from "@tanstack/react-query";
import { parseISO } from "date-fns";
import { ChevronRight } from "lucide-react";
import { useState, type ReactNode } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ResponsiveDialog } from "@/components/ResponsiveDialog";
import { format, lang, t } from "@/lib/i18n";
import {
  cpTrend,
  cpWindows,
  daysSinceHard,
  durabilityTrend,
  efficiencyTrend,
} from "@/lib/plan/performance";
import { durabilityRidesQuery, powerCurveRangeQuery, wellnessQuery } from "@/lib/queries";
import type { SuggestInput } from "@/lib/suggest";
import { addDays } from "@/lib/training";

const fixed = (n: number, digits: number) =>
  n.toLocaleString(lang === "it" ? "it-IT" : "en-GB", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
const signed = (n: number, digits = 0) =>
  `${n > 0 ? "+" : n < 0 ? "−" : ""}${fixed(Math.abs(n), digits)}`;

type Series = { key: string; label: string; color: string };
type Row = { date: string } & Record<string, number | null | string>;

/** The point at least four weeks before the last, to say how things moved. */
const monthBefore = (rows: Row[], key: string) => {
  const last = rows.at(-1);
  if (!last) return null;
  const cut = addDays(last.date, -28);
  return [...rows].reverse().find((r) => r.date <= cut && typeof r[key] === "number") ?? null;
};

function Spark({ rows, series }: { rows: Row[]; series: Series }) {
  return (
    <div className="mt-2 h-10">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 2, bottom: 2, left: 2, right: 2 }}>
          <YAxis hide domain={["dataMin", "dataMax"]} />
          <Line
            dataKey={series.key}
            stroke={series.color}
            dot={false}
            strokeWidth={2}
            connectNulls
            isAnimationActive={false}
            type="monotone"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function Big({ rows, series, unit }: { rows: Row[]; series: Series[]; unit: string }) {
  return (
    <div>
      <div className="mb-1 flex flex-wrap gap-4 text-xs text-muted-foreground">
        {series.map((s) => (
          <span key={s.key} className="flex items-center gap-2">
            <span className="h-1 w-4 rounded-full" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ left: -12, right: 8, top: 4 }}>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={(d) => format(parseISO(d), "d MMM")}
              stroke="var(--muted-foreground)"
              fontSize={11}
              minTickGap={40}
            />
            <YAxis stroke="var(--muted-foreground)" fontSize={11} domain={["auto", "auto"]} />
            <Tooltip
              contentStyle={{
                background: "var(--popover)",
                border: "1px solid var(--border)",
                borderRadius: 8,
              }}
              labelFormatter={(d) => format(parseISO(String(d)), "d MMM yyyy")}
              formatter={(v, key) => [
                `${fixed(Number(v), Number.isInteger(Number(v)) ? 0 : 2)} ${unit}`,
                series.find((s) => s.key === key)?.label ?? String(key),
              ]}
            />
            {series.map((s) => (
              <Line
                key={s.key}
                dataKey={s.key}
                stroke={s.color}
                strokeWidth={2}
                dot={{ r: 2 }}
                connectNulls
                isAnimationActive={false}
                type="monotone"
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function Card({
  label,
  value,
  unit,
  hint,
  rows,
  series,
  about,
  more = [],
}: {
  label: string;
  value: string | null;
  unit?: string;
  hint: string;
  rows: Row[];
  series: Series;
  about: string;
  more?: Series[];
}) {
  const [open, setOpen] = useState(false);
  const has = value != null && rows.length > 0;
  return (
    <>
      <button
        type="button"
        disabled={!has}
        onClick={() => setOpen(true)}
        className="rounded-xl border border-border bg-card p-4 text-left hover:bg-secondary/40 disabled:hover:bg-card"
      >
        <span className="flex items-center justify-between">
          <span className="eyebrow">{label}</span>
          {has && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
        </span>
        <span className="stat-num mt-1 block text-2xl font-semibold">
          {value ?? "–"}
          {has && unit && <span className="ml-1 text-sm text-muted-foreground">{unit}</span>}
        </span>
        <span className="mt-0.5 block text-xs text-muted-foreground">{hint}</span>
        {rows.length > 1 && <Spark rows={rows} series={series} />}
      </button>
      {has && (
        <ResponsiveDialog open={open} onOpenChange={setOpen} title={label} description={about}>
          <Big rows={rows} series={[series, ...more]} unit={unit ?? ""} />
        </ResponsiveDialog>
      )}
    </>
  );
}

export function DoingSection({ input }: { input: SuggestInput }) {
  const { today } = input;
  const windows = cpWindows(today);
  const curves = useQueries({ queries: windows.map((w) => powerCurveRangeQuery(w.from, w.to)) });
  const durability = useQuery(durabilityRidesQuery());
  const wellness = useQuery(wellnessQuery(90));

  // Critical power.
  const cp = curves.every((c) => !c.isLoading)
    ? cpTrend(windows.map((w, i) => ({ to: w.to, curve: curves[i]?.data ?? null })))
    : [];
  const cpRows: Row[] = cp.map((p) => ({ date: p.date, cp: p.cp, wPrime: p.wPrime }));
  const cpLast = cp.at(-1);
  const cpBefore = monthBefore(cpRows, "cp");
  const hard = daysSinceHard(input.acts, today);

  // Durability: after 30 kJ/kg when rides got there, otherwise after 15.
  const blocks = durabilityTrend(durability.data ?? [], today);
  const bucket = blocks.some((b) => b.drop[30][0] != null) ? 30 : 15;
  const durRows: Row[] = blocks.map((b) => ({
    date: b.monday,
    five: b.drop[bucket][0] == null ? null : -b.drop[bucket][0]!,
    twenty: b.drop[bucket][1] == null ? null : -b.drop[bucket][1]!,
  }));
  const durWith = durRows.filter((r) => typeof r["five"] === "number");
  const durLast = durWith.at(-1);
  const durBefore = durWith.at(-2);

  // Efficiency: outdoors when there's enough of it, else on the trainer.
  const eff = efficiencyTrend(input.acts, today);
  const outdoors = eff.outdoor.length >= 2 || !eff.indoor.length;
  const effSeries = outdoors ? eff.outdoor : eff.indoor;
  const effRows: Row[] = [...new Set([...eff.outdoor, ...eff.indoor].map((p) => p.monday))]
    .sort()
    .map((date) => ({
      date,
      outdoor: eff.outdoor.find((p) => p.monday === date)?.efficiency ?? null,
      indoor: eff.indoor.find((p) => p.monday === date)?.efficiency ?? null,
    }));
  const effLast = effSeries.at(-1);
  const effBefore = monthBefore(
    effSeries.map((p) => ({ date: p.monday, e: p.efficiency })),
    "e",
  );

  // Fitness.
  const fitRows: Row[] = (wellness.data ?? [])
    .filter((w) => w.ctl != null && w.atl != null && w.id <= today)
    .map((w) => ({ date: w.id, fitness: Math.round(w.ctl!), fatigue: Math.round(w.atl!) }));
  const fitLast = fitRows.at(-1);

  const cards: ReactNode[] = [
    <Card
      key="cp"
      label={t("Critical power", "Potenza critica")}
      value={cpLast ? String(cpLast.cp) : null}
      unit="W"
      hint={
        cpLast
          ? [
              cpBefore
                ? t(
                    `${signed(cpLast.cp - Number(cpBefore["cp"]))} W in 4 weeks`,
                    `${signed(cpLast.cp - Number(cpBefore["cp"]))} W in 4 settimane`,
                  )
                : null,
              `W′ ${fixed(cpLast.wPrime / 1000, 1)} kJ`,
            ]
              .filter(Boolean)
              .join(" · ")
          : t("Needs hard efforts of 3 to 20 minutes", "Servono sforzi duri da 3 a 20 minuti")
      }
      rows={cpRows}
      series={{ key: "cp", label: t("Critical power", "Potenza critica"), color: "var(--primary)" }}
      about={t(
        "From your best 3–20 min efforts of the six weeks before each point.",
        "Dai tuoi migliori sforzi da 3 a 20 minuti delle sei settimane prima di ogni punto.",
      )}
    />,
    <Card
      key="durability"
      label="Durability"
      value={durLast ? signed(Number(durLast["five"]), 1) : null}
      unit="%"
      hint={
        durLast
          ? [
              t(`5 min after ${bucket} kJ/kg`, `5 min dopo ${bucket} kJ/kg`),
              durBefore
                ? t(
                    `was ${signed(Number(durBefore["five"]), 1)}%`,
                    `era ${signed(Number(durBefore["five"]), 1)}%`,
                  )
                : null,
            ]
              .filter(Boolean)
              .join(" · ")
          : t(
              "Needs rides of 2 hours or more with power",
              "Servono uscite di almeno 2 ore con potenza",
            )
      }
      rows={durRows}
      series={{ key: "five", label: "5 min", color: "var(--pine)" }}
      more={[{ key: "twenty", label: "20 min", color: "var(--fitness)" }]}
      about={t(
        `Power lost against your fresh best after ${bucket} kJ/kg of work, in blocks of four weeks.`,
        `Potenza persa rispetto al tuo meglio da fresco dopo ${bucket} kJ/kg di lavoro, a blocchi di quattro settimane.`,
      )}
    />,
    <Card
      key="efficiency"
      label={t("Efficiency", "Efficienza")}
      value={effLast ? fixed(effLast.efficiency, 2) : null}
      unit={t("W/beat", "W/battito")}
      hint={
        effLast
          ? [
              outdoors
                ? t("easy rides outdoors", "uscite facili fuori")
                : t("easy rides indoors", "uscite facili sui rulli"),
              effBefore
                ? t(
                    `${signed(((effLast.efficiency - Number(effBefore["e"])) / Number(effBefore["e"])) * 100)}% in 4 weeks`,
                    `${signed(((effLast.efficiency - Number(effBefore["e"])) / Number(effBefore["e"])) * 100)}% in 4 settimane`,
                  )
                : null,
            ]
              .filter(Boolean)
              .join(" · ")
          : t(
              "Needs steady easy rides with heart rate",
              "Servono uscite facili regolari con il cardio",
            )
      }
      rows={effRows}
      series={
        outdoors
          ? { key: "outdoor", label: t("Outdoor", "Fuori"), color: "var(--fitness)" }
          : { key: "indoor", label: t("Indoor", "Rulli"), color: "var(--fitness)" }
      }
      more={
        outdoors
          ? [{ key: "indoor", label: t("Indoor", "Rulli"), color: "var(--birch)" }]
          : [{ key: "outdoor", label: t("Outdoor", "Fuori"), color: "var(--birch)" }]
      }
      about={t(
        "Watts per heartbeat on steady easy rides, week by week: more watts for the same heart rate is more aerobic fitness.",
        "Watt per battito nelle uscite facili e regolari, settimana per settimana: più watt allo stesso battito è più fondo.",
      )}
    />,
    <Card
      key="fitness"
      label="Fitness"
      value={fitLast ? String(fitLast["fitness"]) : null}
      hint={
        fitLast
          ? t(
              `Fatigue ${fitLast["fatigue"]} · Form ${Number(fitLast["fitness"]) - Number(fitLast["fatigue"])}`,
              `Fatica ${fitLast["fatigue"]} · Forma ${Number(fitLast["fitness"]) - Number(fitLast["fatigue"])}`,
            )
          : "–"
      }
      rows={fitRows}
      series={{
        key: "fitness",
        label: t("Fitness (CTL)", "Fitness (CTL)"),
        color: "var(--fitness)",
      }}
      more={[
        { key: "fatigue", label: t("Fatigue (ATL)", "Fatica (ATL)"), color: "var(--fatigue)" },
      ]}
      about={t("The load of the last 42 and 7 days.", "Il carico degli ultimi 42 e 7 giorni.")}
    />,
  ];

  return (
    <section className="space-y-2">
      <h2 className="on-sky text-sm font-semibold">{t("How you're doing", "Come stai andando")}</h2>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{cards}</div>
      {hard != null && (
        <p className="on-sky text-xs text-foreground/80">
          {hard === 0
            ? t(
                "Last ride hard enough to move critical power: today.",
                "Ultima uscita abbastanza dura da muovere la potenza critica: oggi.",
              )
            : t(
                `Last ride hard enough to move critical power: ${hard} ${hard === 1 ? "day" : "days"} ago.`,
                `Ultima uscita abbastanza dura da muovere la potenza critica: ${hard} ${hard === 1 ? "giorno" : "giorni"} fa.`,
              )}
        </p>
      )}
    </section>
  );
}
