// The charts that can be opened on their own: /analysis?plot=<id>.
import { t } from "./i18n";
import type { MainSport } from "./sport";

export const RIDE_PLOTS = [
  "fitness",
  "power",
  "durability",
  "eftp",
  "decoupling",
  "zones",
] as const;
export const RUN_PLOTS = [
  "fitness",
  "pace",
  "bests",
  "fade",
  "threshold",
  "drift",
  "zones",
] as const;
export const BODY_PLOTS = ["weight", "fat", "sleep", "hrv"] as const;

export type RidePlot = (typeof RIDE_PLOTS)[number];
export type RunPlot = (typeof RUN_PLOTS)[number];
export type BodyPlot = (typeof BODY_PLOTS)[number];
export type Plot = RidePlot | RunPlot | BodyPlot;

export const isBodyPlot = (p: Plot): p is BodyPlot => (BODY_PLOTS as readonly string[]).includes(p);
export const isPlot = (p: unknown): p is Plot =>
  typeof p === "string" &&
  [...RIDE_PLOTS, ...RUN_PLOTS, ...BODY_PLOTS].includes(p as RidePlot & RunPlot & BodyPlot);

export const PLOT_LABEL: Record<Plot, () => string> = {
  fitness: () => t("Fitness, fatigue & form", "Fitness, fatica e forma"),
  power: () => t("Power curve", "Curva di potenza"),
  durability: () => "Durability",
  eftp: () => "eFTP",
  decoupling: () => "Decoupling",
  zones: () => t("Intensity distribution", "Distribuzione dell'intensità"),
  pace: () => t("Pace curve", "Curva del passo"),
  bests: () => t("Best times", "Migliori tempi"),
  fade: () => t("Late-run fade", "Calo nel finale"),
  threshold: () => t("Threshold pace", "Passo di soglia"),
  drift: () => "Decoupling",
  weight: () => t("Weight", "Peso"),
  fat: () => t("Body fat", "Grasso corporeo"),
  sleep: () => t("Sleep", "Sonno"),
  hrv: () => "HRV",
};

/** Other words for each chart, in both languages. */
export const PLOT_WORDS: Partial<Record<Plot, string[]>> = {
  fitness: ["pmc", "ctl", "atl", "tsb", "form", "forma", "fatica", "fatigue", "performance"],
  power: ["mmp", "cp", "curve", "curva", "potenza", "power", "critical", "critica"],
  durability: ["fade", "resistenza", "calo"],
  eftp: ["ftp", "soglia"],
  decoupling: ["pwhr", "pw hr", "deriva", "aerobic"],
  zones: ["polarized", "polarizzato", "intensita", "intensity", "zone", "distribuzione"],
  pace: ["gap", "passo", "pace", "curva", "curve"],
  bests: ["record", "pb", "migliori", "best", "tempi"],
  fade: ["durability", "calo", "finale"],
  threshold: ["soglia", "passo"],
  drift: ["pahr", "pa hr", "deriva"],
};

export const plotsFor = (sport: MainSport): readonly Plot[] =>
  sport === "run" ? RUN_PLOTS : RIDE_PLOTS;
