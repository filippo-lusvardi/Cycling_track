// The numbers people ask for by name, answered in the row: thresholds, zones, fitness, body.
import { curveFit } from "./analysis";
import { t } from "./i18n";
import type { AthleteThresholds, PowerCurve, RideZones, Wellness } from "./intervals";
import { formatPace } from "./pace";
import { PLOT_LABEL, PLOT_WORDS, plotsFor } from "./plots";
import type { MainSport } from "./sport";
import { computeForm, formatDuration } from "./training";
import { hrRows, paceRows, powerRows, zoneNames, type ZoneRow } from "./zone-table";

/** The shape ask.ts takes; repeated here so the two don't import each other at runtime. */
export type ParamEntry = {
  id: string;
  q: string;
  page: "zones" | "analysis" | "body";
  kind: "value" | "perf";
  dest: { kind: "route"; to: string; search?: Record<string, string> };
  words?: string[];
  also?: string;
  boost?: number;
  value?: string;
  answer?: string;
};

export type ParamData = {
  sport: MainSport;
  /** Whether running belongs on this device: the main sport, or Analysis for both. */
  runs: boolean;
  rideZones?: RideZones | undefined;
  runZones?: RideZones | undefined;
  thresholds?: AthleteThresholds | undefined;
  runThreshold: number | null;
  paceTops?: number[] | null | undefined;
  curves?: PowerCurve[] | undefined;
  wellness?: Wellness[] | undefined;
};

const zonesDest = (search: Record<string, string> = {}): ParamEntry["dest"] => ({
  kind: "route",
  to: "/analysis",
  search: { view: "zones", ...search },
});
const plotDest = (plot: string): ParamEntry["dest"] => ({
  kind: "route",
  to: "/analysis",
  search: { plot },
});

export function paramEntries(d: ParamData): ParamEntry[] {
  const out: ParamEntry[] = [];
  const ride = d.sport !== "run";
  const main = ride ? d.rideZones : d.runZones;
  const lastOf = (pick: (w: Wellness) => number | null | undefined) =>
    [...(d.wellness ?? [])]
      .sort((a, b) => b.id.localeCompare(a.id))
      .map(pick)
      .find((v) => v != null);

  // Thresholds: where the zones come from, so they open with them.
  const ftp = d.rideZones?.ftp ?? d.thresholds?.ftp;
  if (ftp)
    out.push({
      id: "param-ftp",
      q: "FTP",
      page: "zones",
      kind: "value",
      value: `${Math.round(ftp)} W`,
      dest: zonesDest(),
      words: ["soglia", "threshold", "potenza", "power"],
    });
  if (d.thresholds?.lthr)
    out.push({
      id: "param-lthr",
      q: t("Threshold HR", "FC soglia"),
      also: "threshold hr fc soglia",
      page: "zones",
      kind: "value",
      value: `${d.thresholds.lthr} bpm`,
      dest: zonesDest(),
      words: ["lthr", "cardiaca", "heart", "bpm"],
    });
  if (d.thresholds?.maxHr)
    out.push({
      id: "param-maxhr",
      q: t("Max HR", "FC max"),
      also: "max hr fc massima",
      page: "zones",
      kind: "value",
      value: `${d.thresholds.maxHr} bpm`,
      dest: zonesDest(),
      words: ["massima", "cardiaca", "heart", "bpm"],
    });
  if (d.runs && d.runThreshold)
    out.push({
      id: "param-pace",
      q: t("Threshold pace", "Passo soglia"),
      also: "threshold pace passo soglia",
      page: "zones",
      kind: "value",
      value: `${formatPace(d.runThreshold)} /km`,
      dest: zonesDest(ride ? { sport: "run" } : {}),
      words: ["corsa", "run"],
    });

  // Zones.
  const power = powerRows(d.rideZones?.power ?? []);
  const hr = hrRows(main?.hr ?? [], d.sport);
  const pace: ZoneRow[] = d.runs && d.runThreshold ? paceRows(d.runThreshold, d.paceTops) : [];
  zoneNames(d.sport).forEach((name, i) => {
    const n = i + 1;
    const rows = ride ? [power[i], hr[i]] : [pace[i], hr[i]];
    const answer = rows.flatMap((r) => (r ? [r.range] : [])).join(" · ");
    if (!answer) return;
    out.push({
      id: `param-zone-${n}`,
      q: t(`Zone ${n} · ${name}`, `Zona ${n} · ${name}`),
      also: `zone ${n} zona`,
      page: "zones",
      kind: "value",
      answer,
      dest: zonesDest({ zone: String(n) }),
      words: [`z${n}`, name],
    });
  });
  if (power.length || hr.length || pace.length)
    out.push({
      id: "param-zones",
      q: t("All the zones", "Tutte le zone"),
      also: "zones zone",
      page: "zones",
      kind: "value",
      dest: zonesDest(),
      words: ["zones", "zone"],
    });
  if (ride && power.length)
    out.push({
      id: "param-zones-power",
      q: t("Power zones", "Zone di potenza"),
      page: "zones",
      kind: "value",
      dest: zonesDest(),
      words: ["watt", "power"],
    });
  if (hr.length)
    out.push({
      id: "param-zones-hr",
      q: t("Heart rate zones", "Zone di frequenza cardiaca"),
      page: "zones",
      kind: "value",
      dest: zonesDest(),
      words: ["fc", "hr", "bpm", "heart", "cardiaca"],
    });
  if (pace.length)
    out.push({
      id: "param-zones-pace",
      q: t("Pace zones", "Zone di passo"),
      page: "zones",
      kind: "value",
      dest: zonesDest(ride ? { sport: "run" } : {}),
      words: ["pace", "corsa"],
    });

  // From the power curve.
  if (ride) {
    const fit = curveFit(d.curves?.find((c) => c.id.includes("42")));
    if (fit) {
      out.push({
        id: "param-cp",
        q: t("Critical power", "Potenza critica"),
        page: "analysis",
        kind: "value",
        value: `${Math.round(fit.cp)} W`,
        dest: plotDest("power"),
        words: ["cp"],
      });
      out.push({
        id: "param-wprime",
        q: "W′",
        page: "analysis",
        kind: "value",
        value: `${(fit.wPrime / 1000).toFixed(1)} kJ`,
        dest: plotDest("power"),
        words: ["w'", "wprime", "w"],
      });
      if (fit.pmax != null)
        out.push({
          id: "param-sprint",
          q: t("Sprint power", "Potenza sprint"),
          page: "analysis",
          kind: "value",
          value: `${Math.round(fit.pmax)} W`,
          dest: plotDest("power"),
          words: ["pmax"],
        });
    }
    const eftp = lastOf((w) => w.eftp);
    if (eftp)
      out.push({
        id: "param-eftp",
        q: "eFTP",
        page: "analysis",
        kind: "value",
        value: `${Math.round(eftp)} W`,
        dest: plotDest("eftp"),
        words: ["ftp", "stimata", "estimated"],
        boost: 25,
      });
  }

  // Today's training state.
  const ctl = lastOf((w) => w.ctl);
  const atl = lastOf((w) => w.atl);
  const ramp = lastOf((w) => w.rampRate);
  if (ctl != null)
    out.push({
      id: "param-fitness",
      q: "Fitness",
      page: "analysis",
      kind: "value",
      value: String(Math.round(ctl)),
      dest: plotDest("fitness"),
      words: ["ctl"],
    });
  if (atl != null)
    out.push({
      id: "param-fatigue",
      q: t("Fatigue", "Fatica"),
      also: "fatigue fatica",
      page: "analysis",
      kind: "value",
      value: String(Math.round(atl)),
      dest: plotDest("fitness"),
      words: ["atl"],
    });
  if (ctl != null && atl != null)
    out.push({
      id: "param-form",
      q: t("Form", "Forma"),
      also: "form forma",
      page: "analysis",
      kind: "value",
      value: String(Math.round(computeForm(ctl, atl))),
      dest: plotDest("fitness"),
      words: ["tsb"],
    });
  if (ramp != null)
    out.push({
      id: "param-ramp",
      q: "Ramp rate",
      page: "analysis",
      kind: "value",
      value: ramp.toFixed(1),
      dest: plotDest("fitness"),
    });

  // The body.
  const weight = lastOf((w) => w.weight);
  const fat = lastOf((w) => w.bodyFat);
  const hrv = lastOf((w) => w.hrv);
  const sleep = lastOf((w) => w.sleepSecs);
  if (weight != null)
    out.push({
      id: "param-weight",
      q: t("Weight", "Peso"),
      also: "weight peso",
      page: "body",
      kind: "value",
      value: `${weight} kg`,
      dest: plotDest("weight"),
      words: ["kg", "bilancia", "scale"],
    });
  if (fat != null)
    out.push({
      id: "param-fat",
      q: t("Body fat", "Grasso corporeo"),
      also: "body fat grasso",
      page: "body",
      kind: "value",
      value: `${fat} %`,
      dest: plotDest("fat"),
    });
  if (hrv != null)
    out.push({
      id: "param-hrv",
      q: "HRV",
      page: "body",
      kind: "value",
      value: `${Math.round(hrv)} ms`,
      dest: plotDest("hrv"),
      words: ["variabilita"],
    });
  if (sleep != null)
    out.push({
      id: "param-sleep",
      q: t("Sleep", "Sonno"),
      also: "sleep sonno",
      page: "body",
      kind: "value",
      value: formatDuration(sleep),
      dest: plotDest("sleep"),
      words: ["notte", "night", "dormire"],
    });

  // The charts themselves. A number already opens eFTP's, so it isn't listed twice.
  for (const plot of plotsFor(d.sport)) {
    if (plot === "eftp" || plot === "fitness") continue;
    out.push({
      id: `plot-${plot}`,
      q: PLOT_LABEL[plot](),
      page: "analysis",
      kind: "perf",
      dest: plotDest(plot),
      words: PLOT_WORDS[plot] ?? [],
    });
  }
  out.push({
    id: "plot-fitness",
    q: PLOT_LABEL.fitness(),
    page: "analysis",
    kind: "perf",
    dest: plotDest("fitness"),
    words: PLOT_WORDS.fitness ?? [],
  });
  return out;
}
