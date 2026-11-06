// "tempo in z2 questa settimana", "tempo sopra 300 W oggi", "time above 160 bpm": how long at a zone or past a value. Zones add
// up from what's already read; a value needs the streams of one day, or each activity's histogram over a short stretch.
import type { Dest, Entry } from "./ask";
import { aroundChips, openWords, type AskDetail } from "./ask-detail";
import type { EffortData } from "./ask-efforts";
import {
  activityDay,
  FAMILIES,
  hereTarget,
  sift,
  takeTarget,
  type ReadContext,
  type Target,
} from "./ask-read";
import { command, simplify } from "./ask-sentence";
import { daysIn } from "./ask-when";
import { BUCKET, mergeHistograms, sumZones, zonesOfBuckets, type DistMetric } from "./distribution";
import { t } from "./i18n";
import type { Activity, Histograms } from "./intervals";
import { isSport, type MainSport } from "./sport";
import { addDays, formatDuration } from "./training";
import { hrZoneNames, zoneNames } from "./zone-table";

/** Past this many days a value can't be worked out: it would take a request per activity. */
export const VALUE_DAYS = 31;
const RECENT_DAYS = 28;

export type AskedTime = {
  metric: DistMetric;
  zone: number | null;
  past: { value: number; op: "above" | "below" } | null;
  target: Target;
  sport: MainSport | null;
};

export type TimeData = EffortData & {
  histograms?: Record<string, Histograms | null> | undefined;
  zoneTops?: { power: number[]; hr: number[] } | undefined;
};

const NOT_THIS =
  /\b(?:riposo|resting|soglia|threshold|vs|versus|contro|confronta|compare|rispetto|uscite|pedalate|rides|corse|runs|attivita|activities|km)\b/;
const TIME_WORD = /\b(?:quanto tempo|how long|how much time|tempo|time|minuti|minutes|quanto)\b/g;
// "in" goes with the zone: left behind, "in 3 novembre" would read as time ahead.
const ZONE = /\b(?:(?:in|nella) )?(?:z|zona |zone )([1-7])\b/;
const PAST =
  /\b(sopra(?: (?:i|a|ai))?|oltre(?: (?:i|a))?|above|over|more than|piu di|sotto(?: (?:i|a|ai))?|below|under|less than|meno di) (\d{2,4}) ?(w|watts?|bpm)?(?= |$)/;

function readTime(typed: string, ctx: ReadContext): AskedTime | null {
  if (NOT_THIS.test(typed)) return null;
  const zoneHit = ZONE.exec(typed);
  const pastHit = PAST.exec(typed);
  if (!zoneHit === !pastHit) return null;
  const timed = typed.search(TIME_WORD) >= 0;
  let s = typed.replace(TIME_WORD, " ");
  s = s.replace(zoneHit ? ZONE : PAST, " ");
  let said: DistMetric | null = null;
  for (const [m, re] of FAMILIES) {
    if ((m !== "power" && m !== "hr") || s.search(re) < 0) continue;
    if (said) return null;
    said = m;
    s = s.replace(re, " ");
  }
  const unit = pastHit?.[3];
  const byUnit: DistMetric | null = unit ? (unit === "bpm" ? "hr" : "power") : null;
  if (said && byUnit && said !== byUnit) return null;
  const metric = said ?? byUnit ?? (zoneHit ? (ctx.sport === "run" ? "hr" : "power") : null);
  if (!metric) return null;
  if (metric === "power" && ctx.sport === "run") return null;
  const where = takeTarget(s.split(" ").filter(Boolean), ctx);
  const { sport, rest } = sift(where.rest);
  if (rest.length) return null;
  // "z2" and "fc z2" alone are the zone's own range.
  if (zoneHit && !timed && !where.target) return null;
  const target: Target = where.target ??
    hereTarget(ctx) ?? {
      kind: "span",
      from: addDays(ctx.today, 1 - RECENT_DAYS),
      to: ctx.today,
      q: t(`Last ${RECENT_DAYS} days`, `Ultimi ${RECENT_DAYS} giorni`),
    };
  return {
    metric,
    zone: zoneHit ? Number(zoneHit[1]) : null,
    past: pastHit
      ? {
          value: Number(pastHit[2]),
          op: /^(sotto|below|under|less|meno)/.test(pastHit[1]!) ? "below" : "above",
        }
      : null,
    target,
    sport,
  };
}

const contextOf = (d: EffortData): ReadContext => ({
  today: d.today,
  sport: d.sport,
  acts: d.acts,
  climbs: d.climbs,
  here: d.here,
});

export function timeAsked(query: string, d: EffortData): AskedTime | null {
  const ctx = contextOf(d);
  for (const s of [command(query), simplify(query)]) {
    const a = s ? readTime(s, ctx) : null;
    if (a) return a;
  }
  return null;
}

function actsOf(a: AskedTime, d: EffortData): Activity[] {
  const acts = d.acts ?? [];
  const target = a.target;
  if (target.kind === "ride") return acts.filter((x) => x.id === target.id);
  return acts.filter((x) => {
    const day = activityDay(x);
    return day >= target.from && day <= target.to && (!a.sport || isSport(x, a.sport));
  });
}

const carries = (metric: DistMetric) => (x: Activity) =>
  metric === "power" ? x.icu_average_watts != null : x.average_heartrate != null;

/** One ride, or one day already lived: its streams answer to the second. */
const oneDay = (a: AskedTime, today: string) => {
  const target = a.target;
  if (target.kind === "ride") return true;
  return target.from === (target.to < today ? target.to : today);
};

const spanDays = (a: AskedTime, today: string) =>
  a.target.kind === "ride"
    ? 1
    : daysIn({ from: a.target.from, to: a.target.to < today ? a.target.to : today });

/** What this question needs read. */
export function timeNeeds(
  a: AskedTime | null,
  d: EffortData,
): { rideIds: string[]; histIds: string[] } {
  const none = { rideIds: [], histIds: [] };
  if (!a || (a.target.kind === "span" && a.target.from > d.today)) return none;
  const pool = actsOf(a, d).filter(carries(a.metric));
  if (a.past && oneDay(a, d.today)) return { ...none, rideIds: pool.map((x) => x.id) };
  if (spanDays(a, d.today) > VALUE_DAYS) return none;
  if (a.past) return { ...none, histIds: pool.map((x) => x.id) };
  // A zone's time is on the activity, unless it isn't: then it follows from the histograms.
  const has = sumZones(pool.map((x) => (a.metric === "power" ? x.zoneTimes : x.hrZoneTimes)));
  return has.some((s) => s > 0) ? none : { ...none, histIds: pool.map((x) => x.id) };
}

const clock = (secs: number) =>
  secs > 0 && secs < 60 ? `${Math.round(secs)} s` : formatDuration(secs);
const share = (a: number, b: number) =>
  b
    ? t(`${Math.round((a / b) * 100)}% of the time`, `${Math.round((a / b) * 100)}% del tempo`)
    : null;

export function askedTimeRows(a: AskedTime, d: TimeData): Entry[] {
  const target = a.target;
  const name = target.kind === "ride" ? target.name : target.q;
  const unit = a.metric === "power" ? "W" : "bpm";
  const title = a.zone
    ? `${t("Time in", "Tempo in")} Z${a.zone}${a.metric === "hr" ? ` ${t("HR", "FC")}` : ""}`
    : `${
        a.past!.op === "above" ? t("Time above", "Tempo sopra") : t("Time below", "Tempo sotto")
      } ${a.past!.value} ${unit}`;
  const search = { focus: "distribution", metric: a.metric };
  const dest: Dest =
    target.kind === "ride"
      ? { kind: "route", to: "/rides/$id", params: { id: target.id }, search }
      : { kind: "route", to: "/recap", search: { from: target.from, to: target.to, ...search } };
  const base = {
    id: `time-${a.metric}`,
    q: `${title} · ${name}`,
    page: target.kind === "ride" ? ("ride" as const) : ("recap" as const),
    kind: "value" as const,
    exact: true,
    dest,
  };
  if (target.kind === "span" && target.from > d.today)
    return [
      { ...base, page: "programme", answer: t("It hasn't happened yet", "Non è ancora successo") },
    ];
  const acts = actsOf(a, d);
  if (!acts.length) return [{ ...base, answer: t("No activities", "Nessuna attività") }];
  const pool = acts.filter(carries(a.metric));
  const none =
    a.metric === "power"
      ? t("No power recorded", "Nessun dato di potenza")
      : t("No heart rate recorded", "Nessun dato di FC");
  if (!pool.length) return [{ ...base, answer: none }];
  const loading = [{ ...base, answer: t("Loading…", "Caricamento…") }];
  const failed = [{ ...base, answer: t("Needs a connection", "Serve la connessione") }];
  const tooLong = [
    {
      ...base,
      answer: t(
        `Choose a stretch of up to ${VALUE_DAYS} days`,
        `Scegli un periodo fino a ${VALUE_DAYS} giorni`,
      ),
    },
  ];
  const histReads = () => pool.map((x) => d.histograms?.[x.id]);
  const say = (where: string) => {
    const what = a.zone
      ? `tempo in z${a.zone}${a.metric === "hr" ? " fc" : ""}`
      : `tempo ${a.past!.op === "above" ? "sopra" : "sotto"} ${a.past!.value} ${unit.toLowerCase()}`;
    return [what, where].filter(Boolean).join(" ");
  };
  const detail: AskDetail = {
    view: {
      kind: "distribution",
      metric: a.metric,
      ids: pool.map((x) => x.id),
      days: spanDays(a, d.today),
    },
    ...aroundChips(target, d.today, say),
    open: target.kind === "ride" ? openWords.ride() : openWords.recap(),
  };

  if (a.zone) {
    const i = a.zone - 1;
    let zones = sumZones(pool.map((x) => (a.metric === "power" ? x.zoneTimes : x.hrZoneTimes)));
    if (!zones.some((s) => s > 0)) {
      if (spanDays(a, d.today) > VALUE_DAYS) return tooLong;
      const reads = histReads();
      if (reads.some((r) => r === undefined)) return loading;
      if (reads.every((r) => r === null)) return failed;
      const tops = d.zoneTops?.[a.metric] ?? [];
      if (!tops.length) return [{ ...base, answer: t("No zones set", "Zone non impostate") }];
      zones = zonesOfBuckets(
        mergeHistograms(reads.flatMap((r) => (r ? [r[a.metric]] : []))),
        BUCKET[a.metric],
        tops,
      );
    }
    const total = zones.reduce((n, s) => n + s, 0);
    const names = a.metric === "hr" ? hrZoneNames(d.sport) : zoneNames(d.sport);
    return [
      {
        ...base,
        detail,
        value: zones[i] ? clock(zones[i]!) : "–",
        answer: [names[i], share(zones[i] ?? 0, total)].filter(Boolean).join(" · "),
      },
    ];
  }

  const past = a.past!;
  const beyond = (v: number) => (past.op === "above" ? v > past.value : v < past.value);
  if (oneDay(a, d.today)) {
    const signals = pool.map((x) => d.signals?.[x.id]);
    if (signals.some((s) => s === undefined)) return loading;
    if (signals.every((s) => s === null)) return failed;
    let at = 0;
    let all = 0;
    for (const s of signals) {
      if (!s) continue;
      for (const v of a.metric === "power" ? s.watts : s.heartrate) {
        if (v == null || v <= 0) continue;
        all++;
        if (beyond(v)) at++;
      }
    }
    return [
      {
        ...base,
        detail,
        value: at ? clock(at) : "–",
        ...(all ? { answer: share(at, all) ?? "" } : {}),
      },
    ];
  }
  if (spanDays(a, d.today) > VALUE_DAYS) return tooLong;
  const reads = histReads();
  if (reads.some((r) => r === undefined)) return loading;
  if (reads.every((r) => r === null)) return failed;
  const size = BUCKET[a.metric];
  const buckets = mergeHistograms(reads.flatMap((r) => (r ? [r[a.metric]] : []))).filter(
    (b) => b.start > 0,
  );
  // Whole bands are all there is to read, so the nearest edge, and it says which.
  const edge = Math.round(past.value / size) * size;
  const inside = buckets.filter((b) => (past.op === "above" ? b.start >= edge : b.start < edge));
  const at = inside.reduce((n, b) => n + b.secs, 0);
  const all = buckets.reduce((n, b) => n + b.secs, 0);
  return [
    {
      ...base,
      detail,
      value: at ? clock(at) : "–",
      answer: [
        edge !== past.value ? t(`read from ${edge} ${unit}`, `letti da ${edge} ${unit}`) : null,
        share(at, all),
      ]
        .filter(Boolean)
        .join(" · "),
    },
  ];
}

export function timeRows(s: string, d: TimeData): Entry[] {
  const a = timeAsked(s, d);
  return a ? askedTimeRows(a, d) : [];
}
