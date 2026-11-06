// How each person arranges a page: which sections and numbers show, in what order, what's closed. Saved layouts hold
// only what's been chosen, so sections added in later versions simply appear where they belong.
import { t } from "./i18n";
import type { Activity } from "./intervals";
import { isSport } from "./sport";

export type LayoutKind =
  | "recap-day"
  | "recap-week"
  | "recap-month"
  | "recap-long"
  | "activity-ride"
  | "activity-run"
  | "activity-other";

export type NumberDef = { id: string; label: () => string; hidden?: boolean };

export type SectionDef = {
  id: string;
  label: () => string;
  /** Not closable: it's only a line or a row of cards. */
  fixed?: boolean;
  /** Not inside a Panel of its own, so it gets a small header to open and close by. */
  plain?: boolean;
  closed?: boolean;
  hidden?: boolean;
  numbers?: NumberDef[];
};

export type Layout = {
  order?: string[];
  hidden?: Record<string, boolean>;
  closed?: Record<string, boolean>;
  numbers?: Record<string, { order?: string[]; hidden?: Record<string, boolean> }>;
};

export type ResolvedNumber = { id: string; label: string; hidden: boolean };
export type ResolvedSection = {
  id: string;
  label: string;
  fixed: boolean;
  plain: boolean;
  hidden: boolean;
  closed: boolean;
  numbers: ResolvedNumber[];
};

/**
 * The saved order, without what no longer exists; what's new goes right after the item that comes before it by
 * default, so an update doesn't push it to the bottom.
 */
export function orderOf(saved: string[] | undefined, defaults: string[]): string[] {
  if (!saved?.length) return defaults;
  const out = saved.filter((id, i) => defaults.includes(id) && saved.indexOf(id) === i);
  defaults.forEach((id, i) => {
    if (out.includes(id)) return;
    const before = i > 0 ? out.indexOf(defaults[i - 1]!) : -1;
    out.splice(before + 1, 0, id);
  });
  return out;
}

export function resolveLayout(saved: Layout | undefined, defs: SectionDef[]): ResolvedSection[] {
  const byId = new Map(defs.map((d) => [d.id, d]));
  return orderOf(
    saved?.order,
    defs.map((d) => d.id),
  ).map((id) => {
    const d = byId.get(id)!;
    const own = saved?.numbers?.[id];
    const numbers = new Map((d.numbers ?? []).map((n) => [n.id, n]));
    return {
      id,
      label: d.label(),
      fixed: !!d.fixed,
      plain: !!d.plain,
      hidden: saved?.hidden?.[id] ?? !!d.hidden,
      closed: !d.fixed && (saved?.closed?.[id] ?? !!d.closed),
      numbers: orderOf(own?.order, [...numbers.keys()]).map((nid) => {
        const n = numbers.get(nid)!;
        return { id: nid, label: n.label(), hidden: own?.hidden?.[nid] ?? !!n.hidden };
      }),
    };
  });
}

/** `id` moved to where `over` is. */
export function moved(order: string[], id: string, over: string): string[] {
  const from = order.indexOf(id);
  const to = order.indexOf(over);
  if (from < 0 || to < 0 || from === to) return order;
  const next = [...order];
  next.splice(from, 1);
  next.splice(to, 0, id);
  return next;
}

export const moveSection = (l: Layout, order: string[], id: string, over: string): Layout => ({
  ...l,
  order: moved(order, id, over),
});
export const setHidden = (l: Layout, id: string, hidden: boolean): Layout => ({
  ...l,
  hidden: { ...l.hidden, [id]: hidden },
});
export const setClosed = (l: Layout, id: string, closed: boolean): Layout => ({
  ...l,
  closed: { ...l.closed, [id]: closed },
});
export const moveNumber = (
  l: Layout,
  section: string,
  order: string[],
  id: string,
  over: string,
): Layout => ({
  ...l,
  numbers: { ...l.numbers, [section]: { ...l.numbers?.[section], order: moved(order, id, over) } },
});
export const setNumberHidden = (
  l: Layout,
  section: string,
  id: string,
  hidden: boolean,
): Layout => ({
  ...l,
  numbers: {
    ...l.numbers,
    [section]: {
      ...l.numbers?.[section],
      hidden: { ...l.numbers?.[section]?.hidden, [id]: hidden },
    },
  },
});

/** Which layout a stretch of time uses. */
export const recapKind = (days: number): LayoutKind =>
  days <= 1 ? "recap-day" : days <= 14 ? "recap-week" : days <= 62 ? "recap-month" : "recap-long";

export const activityLayoutKind = (a: Pick<Activity, "type">): LayoutKind =>
  isSport(a as Activity, "run")
    ? "activity-run"
    : isSport(a as Activity, "ride")
      ? "activity-ride"
      : "activity-other";

/** What a layout applies to, said plainly where it's edited. */
export const KIND_SCOPE: Record<LayoutKind, () => string> = {
  "recap-day": () => t("This applies to every single day.", "Questo vale per ogni singolo giorno."),
  "recap-week": () =>
    t(
      "This applies to all weeks, and stretches up to 14 days.",
      "Questo vale per tutte le settimane e i periodi fino a 14 giorni.",
    ),
  "recap-month": () =>
    t(
      "This applies to all months, and stretches up to 2 months.",
      "Questo vale per tutti i mesi e i periodi fino a 2 mesi.",
    ),
  "recap-long": () =>
    t(
      "This applies to stretches longer than 2 months.",
      "Questo vale per i periodi più lunghi di 2 mesi.",
    ),
  "activity-ride": () =>
    t("This applies to all your rides.", "Questo vale per tutte le uscite in bici."),
  "activity-run": () => t("This applies to all your runs.", "Questo vale per tutte le corse."),
  "activity-other": () =>
    t("This applies to your other sports.", "Questo vale per le attività degli altri sport."),
};

const RECAP_NUMBERS: NumberDef[] = [
  { id: "time", label: () => t("Time", "Tempo") },
  { id: "rest", label: () => t("Rest", "Riposo") },
  { id: "distance", label: () => t("Distance", "Distanza") },
  { id: "climbing", label: () => t("Climbing", "Dislivello") },
  { id: "load", label: () => t("Load", "Carico"), hidden: true },
  { id: "count", label: () => t("Activities", "Attività"), hidden: true },
];

export function recapSections(kind: LayoutKind): SectionDef[] {
  const single = kind === "recap-day";
  const long = kind === "recap-month" || kind === "recap-long";
  return [
    {
      id: "numbers",
      label: () => t("Numbers", "Numeri"),
      fixed: true,
      hidden: single,
      numbers: RECAP_NUMBERS,
    },
    { id: "compare", label: () => t("Comparison", "Confronto"), fixed: true, hidden: single },
    { id: "planned", label: () => t("Planned", "In programma"), plain: true },
    ...(long ? [{ id: "weeks", label: () => t("Week by week", "Settimana per settimana") }] : []),
    { id: "sports", label: () => t("By sport", "Per sport") },
    {
      id: "body",
      label: () => t("Body", "Corpo"),
      numbers: [
        { id: "sleep", label: () => t("Average sleep", "Sonno medio") },
        { id: "hrv", label: () => t("Average HRV", "HRV media") },
        { id: "fitness", label: () => "Fitness" },
        { id: "load", label: () => t("Load", "Carico") },
      ],
    },
    { id: "mix", label: () => t("Intensity", "Intensità") },
    { id: "distribution", label: () => t("Distribution", "Distribuzione") },
    {
      id: "activities",
      label: () => (long ? t("The longest", "Le più lunghe") : t("Activities", "Attività")),
    },
  ];
}

export function activitySections(kind: LayoutKind): SectionDef[] {
  const run = kind === "activity-run";
  return [
    { id: "feel", label: () => t("How did it feel?", "Com'è andata?") },
    {
      id: "numbers",
      label: () => t("Numbers", "Numeri"),
      fixed: true,
      numbers: [
        { id: "distance", label: () => t("Distance", "Distanza") },
        { id: "time", label: () => t("Moving time", "Tempo in movimento") },
        { id: "elevation", label: () => t("Elevation", "Dislivello") },
        { id: "load", label: () => t("Load", "Carico") },
        ...(run
          ? [
              { id: "pace", label: () => t("Avg pace", "Passo medio") },
              { id: "gap", label: () => "GAP" },
            ]
          : [
              { id: "power", label: () => t("Avg power", "Potenza media") },
              { id: "np", label: () => t("Norm. power", "Potenza norm.") },
            ]),
        { id: "intensity", label: () => t("Intensity", "Intensità") },
        { id: "hr", label: () => t("Avg / max HR", "FC media / max") },
        run
          ? { id: "ngp", label: () => t("Normalized GAP", "GAP normalizzato") }
          : { id: "speed", label: () => t("Avg speed", "Velocità media") },
        { id: "cadence", label: () => t("Cadence", "Cadenza") },
        { id: "decoupling", label: () => "Decoupling" },
        { id: "calories", label: () => t("Calories", "Calorie") },
      ],
    },
    {
      id: "zones",
      label: () => (run ? t("Pace zones", "Zone di passo") : t("Distribution", "Distribuzione")),
    },
    run
      ? { id: "splits", label: () => t("Splits", "Parziali") }
      : { id: "blocks", label: () => t("Workout blocks", "Blocchi di allenamento") },
    {
      id: "climbs",
      label: () => t("Map, elevation & climbs", "Mappa, altimetria e salite"),
      plain: true,
    },
    { id: "segments", label: () => t("Segments", "Segmenti") },
    {
      id: "charts",
      label: () => t("Charts", "Grafici"),
      closed: true,
      numbers: [
        { id: "speed", label: () => (run ? t("Pace", "Passo") : t("Speed", "Velocità")) },
        ...(run
          ? [{ id: "gap", label: () => t("Grade-adjusted pace", "Passo corretto per pendenza") }]
          : [{ id: "watts", label: () => t("Power", "Potenza") }]),
        { id: "hr", label: () => t("Heart rate", "Frequenza cardiaca") },
        { id: "cadence", label: () => t("Cadence", "Cadenza") },
        ...(run ? [] : [{ id: "wbal", label: () => t("W′ balance", "Bilancio W′") }]),
      ],
    },
    { id: "intervals", label: () => t("Intervals", "Intervalli"), closed: true },
    { id: "brioche", label: () => t("Brioches", "Brioche") },
    { id: "visibility", label: () => t("Visible in forests", "Visibile nei boschi"), fixed: true },
  ];
}
