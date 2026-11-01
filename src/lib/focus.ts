// What to train: the focus for the current block, from your upcoming races and your own power, compared only
// with yourself. Readiness still decides when; this decides what. Pure.
import { parseISO } from "date-fns";
import { format, t } from "./i18n";
import type { Activity, PowerCurve, RideZones, Wellness } from "./intervals";
import {
  COMPLETE,
  FOCUS_LABEL,
  FOCUSES,
  formatMinutes,
  KINDS,
  profileFor,
  type Focus,
  type Profile,
  type Race,
} from "./races";
import { addDays } from "./training";

/** Weight of a race by priority, and of the complete-cyclist profile that is always there. */
const PRIORITY_WEIGHT = { A: 3, B: 2, C: 1 } as const;
const COMPLETE_WEIGHT = 2;
/** Races count fully up to this many days ahead, then fade to nothing. */
const NEAR_DAYS = 56;
const FAR_DAYS = 140;
/** A block lasts at least this long unless the races change. */
const HOLD_DAYS = 14;

/** Power durations (s) that stand for each focus on your curve. */
const DURATIONS: Record<Focus, number[]> = {
  base: [3600],
  aerobic: [1200, 2400],
  vo2: [180, 300, 480],
  anaerobic: [30, 60, 120],
  sprint: [5, 10, 15],
};
const DURATION_WORD: Record<Focus, string> = {
  base: t("60-min", "60 min"),
  aerobic: t("20–40-min", "20–40 min"),
  vo2: t("3–8-min", "3–8 min"),
  anaerobic: t("30 s–2 min", "30 s–2 min"),
  sprint: t("sprint", "sprint"),
};
/** Zones (1-based, intervals.icu Z1–Z7) for each focus, and the share of riding time below which it's neglected. */
const ZONES: Record<Focus, [number[], number]> = {
  base: [[2], 0.2],
  aerobic: [[3, 4], 0.05],
  vo2: [[5], 0.01],
  anaerobic: [[6], 0.003],
  sprint: [[7], 0.001],
};
const NEGLECT_BONUS = 0.03;
/** Every focus scores at least this much gap, so demand alone decides when your power is even. */
const GAP_FLOOR = 0.02;

/** Watts at duration `secs` on an intervals.icu curve (exact or the next longer duration). */
export function wattsAt(c: PowerCurve | undefined, secs: number): number | null {
  if (!c) return null;
  const i = c.secs.findIndex((s) => s >= secs);
  return i >= 0 && c.watts[i] ? c.watts[i]! : null;
}

const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

/** How much a race counts today: full within 8 weeks, fading to nothing at 20. */
export function closeness(days: number): number {
  if (days < 0) return 0;
  if (days <= NEAR_DAYS) return 1;
  return Math.max(0, (FAR_DAYS - days) / (FAR_DAYS - NEAR_DAYS));
}

export const raceWeight = (r: Race, today: string) =>
  PRIORITY_WEIGHT[r.priority] * closeness(daysBetween(today, r.date));

/** Profile of a race without a kind yet: a general road race. */
const FALLBACK = profileFor({ discipline: "road", kind: "road", minutes: null, sprint: false });

/** Season demand as shares (0–1) per focus: the complete cyclist plus every upcoming race. */
export function seasonDemand(races: Race[], today: string): Profile {
  const sum = Object.fromEntries(FOCUSES.map((f) => [f, COMPLETE[f] * COMPLETE_WEIGHT])) as Profile;
  for (const r of races) {
    const w = raceWeight(r, today);
    if (!w) continue;
    const prof = r.info ? profileFor(r.info) : FALLBACK;
    for (const f of FOCUSES) sum[f] += prof[f] * w;
  }
  const total = FOCUSES.reduce((s, f) => s + sum[f], 0);
  return Object.fromEntries(FOCUSES.map((f) => [f, sum[f] / total])) as Profile;
}

/** Your last 42 days against your last year, per focus: 0 = at your best, 0.1 = 10% under. */
export function powerGaps(
  c42: PowerCurve | undefined,
  c1y: PowerCurve | undefined,
): { gap: Profile; ratio: Profile } {
  const ratio = {} as Profile;
  for (const f of FOCUSES) {
    const rs = DURATIONS[f].flatMap((d) => {
      const [now, best] = [wattsAt(c42, d), wattsAt(c1y, d)];
      return now && best ? [Math.min(1, now / best)] : [];
    });
    ratio[f] = rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : 1;
  }
  return { ratio, gap: Object.fromEntries(FOCUSES.map((f) => [f, 1 - ratio[f]])) as Profile };
}

const isRide = (a: Activity) => (a.type ?? "").includes("Ride");

/** Zones with almost no time over the last 8 weeks of riding. */
export function neglected(acts: Activity[], today: string): Focus[] {
  const from = addDays(today, -56);
  const rides = acts.filter(
    (a) => isRide(a) && a.start_date_local.slice(0, 10) > from && a.zoneTimes.length,
  );
  const total = rides.reduce((s, a) => s + a.zoneTimes.reduce((x, y) => x + y, 0), 0);
  if (!total) return [];
  return FOCUSES.filter((f) => {
    const [zones, min] = ZONES[f];
    const secs = rides.reduce(
      (s, a) => s + zones.reduce((x, z) => x + (a.zoneTimes[z - 1] ?? 0), 0),
      0,
    );
    return secs / total < min;
  });
}

const median = (v: number[]) => {
  const s = [...v].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

/** Reasons the base comes first, whatever the races: no crown without a trunk. Empty when the base is solid. */
export function baseGate(acts: Activity[], wellness: Wellness[], today: string): string[] {
  const reasons: string[] = [];
  const steady = acts
    .filter(
      (a) =>
        isRide(a) &&
        a.start_date_local.slice(0, 10) > addDays(today, -90) &&
        (a.moving_time ?? 0) >= 3600 &&
        a.icu_intensity != null &&
        a.icu_intensity < 80 &&
        a.decoupling != null,
    )
    .sort((a, b) => b.start_date_local.localeCompare(a.start_date_local))
    .slice(0, 8);
  if (steady.length >= 3) {
    const avg = steady.reduce((s, a) => s + a.decoupling!, 0) / steady.length;
    if (avg > 5)
      reasons.push(
        t(
          `Aerobic decoupling on steady rides is ${avg.toFixed(1)}% (over 5%).`,
          `Il disaccoppiamento aerobico nelle uscite regolari è ${avg.toFixed(1)}% (oltre il 5%).`,
        ),
      );
  }

  const z2 = (from: string, to: string) =>
    acts
      .filter(
        (a) =>
          isRide(a) &&
          a.start_date_local.slice(0, 10) > from &&
          a.start_date_local.slice(0, 10) <= to,
      )
      .reduce((s, a) => s + (a.zoneTimes[1] ?? 0), 0);
  const recent = z2(addDays(today, -42), today) / 6;
  const usual = z2(addDays(today, -182), addDays(today, -42)) / 20;
  if (usual > 0 && recent < usual * 0.6)
    reasons.push(
      t(
        `Z2 time in the last 6 weeks is ${Math.round((recent / usual) * 100)}% of your usual.`,
        `Il tempo in Z2 nelle ultime 6 settimane è il ${Math.round((recent / usual) * 100)}% del tuo solito.`,
      ),
    );

  const year = wellness
    .filter((w) => w.id > addDays(today, -365) && w.id <= today && w.ctl != null)
    .map((w) => w.ctl!);
  const now = [...wellness]
    .filter((w) => w.id <= today && w.ctl != null)
    .sort((a, b) => b.id.localeCompare(a.id))[0]?.ctl;
  if (year.length >= 60 && now != null && now < median(year) * 0.75)
    reasons.push(
      t(
        `Fitness ${Math.round(now)} is well below your usual ${Math.round(median(year))}.`,
        `La forma fisica ${Math.round(now)} è molto sotto il tuo solito ${Math.round(median(year))}.`,
      ),
    );
  return reasons;
}

export type FocusResult = {
  focus: Focus;
  demand: Profile;
  ratio: Profile;
  score: Profile;
  base: string[];
  neglected: Focus[];
};

export function computeFocus(input: {
  races: Race[];
  today: string;
  acts: Activity[];
  wellness: Wellness[];
  c42: PowerCurve | undefined;
  c1y: PowerCurve | undefined;
}): FocusResult {
  const demand = seasonDemand(input.races, input.today);
  const { gap, ratio } = powerGaps(input.c42, input.c1y);
  const lazy = neglected(input.acts, input.today);
  const score = Object.fromEntries(
    FOCUSES.map((f) => [
      f,
      demand[f] * (gap[f] + GAP_FLOOR + (lazy.includes(f) ? NEGLECT_BONUS : 0)),
    ]),
  ) as Profile;
  const base = baseGate(input.acts, input.wellness, input.today);
  const focus = base.length ? "base" : FOCUSES.reduce((a, b) => (score[b] > score[a] ? b : a));
  return { focus, demand, ratio, score, base, neglected: lazy };
}

/** Monday of the week `date` is in. */
export const mondayOf = (date: string) => addDays(date, -((parseISO(date).getDay() + 6) % 7));

export type Block = { focus: Focus; since: string };
/** What this device remembers: the blocks so far and the races they were chosen for. */
export type FocusState = { blocks: Block[]; key: string };

/** Identity of the race calendar: any race added, moved or changed starts a new block straight away. */
export const racesKey = (races: Race[]) =>
  races
    .map((r) => `${r.id}:${r.date}:${r.priority}:${JSON.stringify(r.info)}`)
    .sort()
    .join("|");

/**
 * The block to follow: the current one holds for at least two weeks, unless the races change. A new block starts
 * on this week's Monday.
 */
export function holdFocus(
  prev: FocusState | null,
  next: Focus,
  today: string,
  key: string,
): FocusState {
  const since = mondayOf(today);
  const blocks = prev?.blocks ?? [];
  const current = blocks[blocks.length - 1];
  if (current?.focus === next) return { blocks, key };
  if (current && prev!.key === key && daysBetween(current.since, today) < HOLD_DAYS) return prev!;
  const kept = blocks.filter((b) => b.since < since).slice(-59);
  return { blocks: [...kept, { focus: next, since }], key };
}

export type DayRole =
  | { role: "race"; race: Race }
  | { role: "recovery"; race: Race }
  | { role: "sharpen"; race: Race; days: number }
  | { role: "ease"; race: Race; days: number };

/** Race day, the day after, the taper before an A race (10 days) and the easy days before a B race (3). */
export function dayRole(races: Race[], today: string): DayRole | null {
  const on = races.find((r) => r.date === today);
  if (on) return { role: "race", race: on };
  const after = races.find((r) => r.date === addDays(today, -1));
  if (after) return { role: "recovery", race: after };
  const ahead = races
    .map((r) => ({ r, days: daysBetween(today, r.date) }))
    .filter((x) => x.days > 0)
    .sort((a, b) => a.days - b.days);
  const a = ahead.find((x) => x.r.priority === "A" && x.days <= 10);
  if (a) return { role: "sharpen", race: a.r, days: a.days };
  const b = ahead.find((x) => x.r.priority === "B" && x.days <= 3);
  if (b) return { role: "ease", race: b.r, days: b.days };
  return null;
}

/** The upcoming race that weighs most right now, if any. */
export const leadRace = (races: Race[], today: string) =>
  races
    .filter((r) => raceWeight(r, today) > 0)
    .sort((a, b) => raceWeight(b, today) - raceWeight(a, today) || a.date.localeCompare(b.date))[0];

const range = (ftp: number | null, lo: number, hi: number) =>
  ftp
    ? `${Math.round(ftp * lo)}–${Math.round(ftp * hi)} W`
    : `${Math.round(lo * 100)}–${Math.round(hi * 100)}% FTP`;

/** The quality session for a summer day in this block, with targets from your zones and curve. */
export function focusSession(input: {
  focus: Focus;
  races: Race[];
  today: string;
  zones: RideZones | undefined;
  c1y: PowerCurve | undefined;
}): string {
  const ftp = input.zones?.ftp ?? null;
  const weighted = input.races.filter((r) => raceWeight(r, input.today) > 0);
  const lead = leadRace(input.races, input.today);
  let text: string;
  const timed = lead?.info && KINDS[lead.info.kind].timed ? lead : undefined;
  // Race pace only when the block trains what that effort is mostly made of (its two biggest focuses).
  const main = timed
    ? [...FOCUSES].sort((a, b) => profileFor(timed.info!)[b] - profileFor(timed.info!)[a]).slice(0, 2)
    : [];
  if (timed && input.focus !== "base" && main.includes(input.focus)) {
    // Race-specific: efforts close to the race's length at the power you hold for that long.
    const m = timed.info!.minutes ?? KINDS[timed.info!.kind].minutes!;
    const reps =
      m <= 8
        ? `5×${formatMinutes(m)}`
        : m <= 25
          ? `3×${formatMinutes(Math.round(m * 0.8))}`
          : `2×${formatMinutes(Math.min(30, Math.round(m * 0.5)))}`;
    const best = wattsAt(input.c1y, m * 60);
    const at = best
      ? `${Math.round(best * 0.95)}–${Math.round(best)} W`
      : t("race pace", "ritmo gara");
    text = t(
      `Race pace for ${timed.name} (${formatMinutes(m)}): ${reps} at ${at}, equal time easy between.`,
      `Ritmo gara per ${timed.name} (${formatMinutes(m)}): ${reps} a ${at}, recupero facile di pari durata.`,
    );
  } else {
    const z2 = input.zones?.power.length
      ? `${input.zones.power[0]}–${input.zones.power[1]} W`
      : range(ftp, 0.56, 0.75);
    text = {
      base: t(
        `Long endurance: 3–4 h in Z2 (${z2}), the last hour with 2×20 min tempo.`,
        `Fondo lungo: 3–4 h in Z2 (${z2}), l'ultima ora con 2×20 min a ritmo tempo.`,
      ),
      aerobic: t(
        `3×12 min at ${range(ftp, 0.95, 1.0)}, 5 min easy between.`,
        `3×12 min a ${range(ftp, 0.95, 1.0)}, 5 min facili tra le ripetute.`,
      ),
      vo2: t(
        `5×4 min at ${range(ftp, 1.08, 1.2)}, 4 min easy between.`,
        `5×4 min a ${range(ftp, 1.08, 1.2)}, 4 min facili tra le ripetute.`,
      ),
      anaerobic: t(
        `6×1 min at ${range(ftp, 1.3, 1.5)}, full recovery (4–5 min).`,
        `6×1 min a ${range(ftp, 1.3, 1.5)}, recupero completo (4–5 min).`,
      ),
      sprint: t(
        "8×10 s all-out sprints inside a Z2 ride, 5 min easy between.",
        "8×10 s di sprint massimale dentro un'uscita in Z2, 5 min facili tra uno e l'altro.",
      ),
    }[input.focus];
  }
  if (input.focus !== "sprint" && weighted.some((r) => r.info?.sprint))
    text += t(
      " Then 3×15 s sprints in the last 20 min, when tired.",
      " Poi 3×15 s di sprint negli ultimi 20 min, da stanco.",
    );
  return text;
}

/** What race days, the day after and the taper ask for instead of the block's session. */
export function roleText(role: DayRole): string {
  const name = role.race.name;
  const sprint = role.race.info?.sprint;
  switch (role.role) {
    case "race":
      return t(
        `Race day: ${name}. Warm up well and enjoy it.`,
        `Giorno di gara: ${name}. Riscaldati bene e goditela.`,
      );
    case "recovery":
      return t(
        `Recovery after ${name}: 45–60 min in Z1, or rest.`,
        `Recupero dopo ${name}: 45–60 min in Z1, oppure riposo.`,
      );
    case "sharpen":
      return sprint
        ? t(
            `Taper for ${name} (${role.days} days): short rides; openers with 3×1 min at race effort and 3 short sprints.`,
            `Scarico per ${name} (${role.days} giorni): uscite brevi; attivazione con 3×1 min a ritmo gara e 3 sprint brevi.`,
          )
        : t(
            `Taper for ${name} (${role.days} days): short rides; openers with 3×1 min at race effort.`,
            `Scarico per ${name} (${role.days} giorni): uscite brevi; attivazione con 3×1 min a ritmo gara.`,
          );
    case "ease":
      return t(
        `${name} in ${role.days} days: keep it easy, short openers the day before.`,
        `${name} tra ${role.days} giorni: vai facile, breve attivazione il giorno prima.`,
      );
  }
}

/** Why this focus, in a few short lines. */
export function focusWhy(r: FocusResult, races: Race[], today: string): string[] {
  if (r.base.length) return r.base;
  const lines: string[] = [];
  const near = races
    .filter((x) => raceWeight(x, today) > 0)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 3);
  lines.push(
    near.length
      ? t(
          `Races ahead: ${near.map((x) => `${x.name} ${format(parseISO(x.date), "d MMM")} (${x.priority})`).join(", ")}.`,
          `Gare in arrivo: ${near.map((x) => `${x.name} ${format(parseISO(x.date), "d MMM")} (${x.priority})`).join(", ")}.`,
        )
      : t(
          "No races ahead: training the complete cyclist.",
          "Nessuna gara in arrivo: alleni il ciclista completo.",
        ),
  );
  const pct = Math.round(r.ratio[r.focus] * 100);
  if (pct < 100)
    lines.push(
      t(
        `Your ${DURATION_WORD[r.focus]} power is at ${pct}% of your best this year.`,
        `La tua potenza ${DURATION_WORD[r.focus]} è al ${pct}% del tuo migliore dell'anno.`,
      ),
    );
  if (r.neglected.includes(r.focus))
    lines.push(
      t(
        `Little time in ${FOCUS_LABEL[r.focus]} zones over the last 8 weeks.`,
        `Poco tempo nelle zone ${FOCUS_LABEL[r.focus]} nelle ultime 8 settimane.`,
      ),
    );
  return lines;
}
