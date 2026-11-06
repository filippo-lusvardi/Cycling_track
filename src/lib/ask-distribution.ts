// "distribuzione fc oggi", "power distribution last ride", "zone marzo": how time was spread, for a ride or a stretch. The row
// says the biggest zones, from what's already read; choosing it opens the page there.
import type { Dest, Entry } from "./ask";
import {
  activityDay,
  readDistribution,
  type AskedDistribution,
  type Here,
  type IntentClimb,
  type Metric,
} from "./ask-read";
import { aroundChips, openWords, targetPhrase, type AskDetail } from "./ask-detail";
import { daysIn } from "./ask-when";
import { sumZones, topZones, type DistMetric } from "./distribution";
import { t } from "./i18n";
import type { Activity } from "./intervals";
import { isSport, type MainSport } from "./sport";

export type DistributionData = {
  today: string;
  sport: MainSport;
  acts?: Activity[] | undefined;
  climbs?: IntentClimb[] | undefined;
  here?: Here | null | undefined;
};

const NAME: Partial<Record<Metric, () => string>> = {
  power: () => t("Power distribution", "Distribuzione potenza"),
  hr: () => t("HR distribution", "Distribuzione FC"),
};

export const distributionAsked = (s: string, d: DistributionData) =>
  readDistribution(s, {
    today: d.today,
    sport: d.sport,
    acts: d.acts,
    climbs: d.climbs,
    here: d.here,
  });

export function distributionRows(s: string, d: DistributionData): Entry[] {
  const asked = distributionAsked(s, d);
  return asked ? askedDistributionRows(asked, d) : [];
}

export function askedDistributionRows(asked: AskedDistribution, d: DistributionData): Entry[] {
  const { target } = asked;
  if (target.kind === "span" && target.from > d.today)
    return [
      {
        id: "distribution-ahead",
        q: `${t("Distribution", "Distribuzione")} · ${target.q}`,
        page: "programme",
        kind: "value",
        exact: true,
        answer: t("It hasn't happened yet", "Non è ancora successo"),
        dest: { kind: "route", to: "/recap", search: { from: target.from, to: target.to } },
      },
    ];
  const acts =
    target.kind === "ride"
      ? (d.acts ?? []).filter((a) => a.id === target.id)
      : (d.acts ?? []).filter((a) => {
          const day = activityDay(a);
          return (
            day >= target.from &&
            day <= target.to &&
            (!asked.onlySport || isSport(a, asked.onlySport))
          );
        });
  const metrics: DistMetric[] = asked.metric
    ? [asked.metric]
    : d.sport === "run"
      ? ["hr"]
      : ["power", "hr"];
  return metrics.map((m, i) => {
    const zones = sumZones(acts.map((a) => (m === "power" ? a.zoneTimes : a.hrZoneTimes)));
    const said = topZones(zones);
    const dest: Dest =
      target.kind === "ride"
        ? {
            kind: "route",
            to: "/rides/$id",
            params: { id: target.id },
            search: { focus: "distribution", metric: m },
          }
        : {
            kind: "route",
            to: "/recap",
            search: { from: target.from, to: target.to, focus: "distribution", metric: m },
          };
    const name = target.kind === "ride" ? target.name : target.q;
    const phrase = targetPhrase(target, d.here, d.today);
    const say = (metric: DistMetric, where: string) =>
      ["distribuzione", metric === "power" ? "power" : "hr", where].filter(Boolean).join(" ");
    const other: DistMetric = m === "power" ? "hr" : "power";
    const days =
      target.kind === "ride"
        ? 1
        : daysIn({ from: target.from, to: target.to < d.today ? target.to : d.today });
    return {
      id: `distribution-${m}`,
      q: `${NAME[m]!()} · ${name}`,
      page: target.kind === "ride" ? "ride" : "recap",
      kind: "value",
      exact: true,
      boost: -i,
      ...(acts.length
        ? {
            detail: {
              view: {
                kind: "distribution",
                metric: m,
                ids: acts.map((a) => a.id),
                days,
                ...(d.sport === "run" ? {} : { other: say(other, phrase) }),
              },
              ...aroundChips(target, d.today, (where) => say(m, where)),
              open: target.kind === "ride" ? openWords.ride() : openWords.recap(),
            } satisfies AskDetail,
          }
        : {}),
      ...(said
        ? { answer: said }
        : acts.length
          ? {}
          : { answer: t("No activities", "Nessuna attività") }),
      dest,
    } as Entry;
  });
}
