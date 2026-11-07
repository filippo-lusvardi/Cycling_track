// What to train: the focus for the current block, from your upcoming races and your own power, compared only
// with yourself. Readiness still decides when; this decides what. Pure.
import { parseISO } from "date-fns";
import type { DurabilityProfile } from "./durability";
import { t } from "./i18n";
import type { Activity, PowerCurve, RideZones, Wellness } from "./intervals";
import { formatPace } from "./pace";
import type { FadeProfile } from "./run-metrics";
import {
  COMPLETE,
  COMPLETE_RUN,
  FOCUS_LABEL,
  FOCUSES,
  focusesFor,
  formatMinutes,
  KINDS,
  profileFor,
  raceSport,
  type Focus,
  type Profile,
  type Race,
} from "./races";
import { isSport, type MainSport } from "./sport";
import { addDays } from "./training";

/** Weight of a race by priority, and of the complete-cyclist profile that is always there. */
export const PRIORITY_WEIGHT = { A: 3, B: 2, C: 1 } as const;
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
  base: t("60-min", "sui 60 min"),
  aerobic: t("20–40-min", "sui 20–40 min"),
  vo2: t("3–8-min", "sui 3–8 min"),
  anaerobic: t("30 s–2 min", "sui 30 s–2 min"),
  sprint: t("sprint", "in sprint"),
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
/** The same on foot: a half marathon. */
const RUN_FALLBACK = profileFor({ discipline: "run", kind: "runHalf", minutes: null, sprint: false });

/** Season demand as shares (0–1) per focus: the complete athlete plus every upcoming race in this sport. */
export function seasonDemand(races: Race[], today: string, sport: MainSport = "ride"): Profile {
  const complete = sport === "run" ? COMPLETE_RUN : COMPLETE;
  const sum = Object.fromEntries(FOCUSES.map((f) => [f, complete[f] * COMPLETE_WEIGHT])) as Profile;
  for (const r of races) {
    if (raceSport(r) !== sport) continue;
    const w = raceWeight(r, today);
    if (!w) continue;
    const prof = r.info ? profileFor(r.info) : sport === "run" ? RUN_FALLBACK : FALLBACK;
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

/** Zones with almost no time over the last 8 weeks in this sport. */
export function neglected(acts: Activity[], today: string, sport: MainSport = "ride"): Focus[] {
  const from = addDays(today, -56);
  const rides = acts.filter(
    (a) => isSport(a, sport) && a.start_date_local.slice(0, 10) > from && a.zoneTimes.length,
  );
  const total = rides.reduce((s, a) => s + a.zoneTimes.reduce((x, y) => x + y, 0), 0);
  if (!total) return [];
  return focusesFor(sport).filter((f) => {
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
export function baseGate(
  acts: Activity[],
  wellness: Wellness[],
  today: string,
  durability?: DurabilityProfile | null,
  sport: MainSport = "ride",
  fadeP?: FadeProfile | null,
): string[] {
  const isRun = sport === "run";
  const reasons: string[] = [];
  const steady = acts
    .filter(
      (a) =>
        isSport(a, sport) &&
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
        isRun
          ? t(
              `Decoupling on easy runs is ${avg.toFixed(1)}% (over 5%).`,
              `Il decoupling nelle corse lente è ${avg.toFixed(1)}% (oltre il 5%).`,
            )
          : t(
              `Aerobic decoupling on steady rides is ${avg.toFixed(1)}% (over 5%).`,
              `Il decoupling nelle uscite regolari è ${avg.toFixed(1)}% (oltre il 5%).`,
            ),
      );
  }

  const z2 = (from: string, to: string) =>
    acts
      .filter(
        (a) =>
          isSport(a, sport) &&
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
        `Il fitness (${Math.round(now)}) è molto sotto il tuo solito (${Math.round(median(year))}).`,
      ),
    );

  // Durability: 20 min power after 30 kJ/kg, from at least 3 long rides. Amateurs commonly lose 10–15% there.
  // On foot: 5 min pace after 25 km of flat-equivalent running, from at least 3 long runs.
  if (isRun) {
    const late = (fadeP?.reached?.[25] ?? 0) >= 3 ? fadeP!.drop[25][0] : null;
    if (late != null && late > DURABILITY_FADE)
      reasons.push(
        t(
          `Your 5 min pace drops ${late.toFixed(0)}% after 25 km of running (over ${DURABILITY_FADE}%).`,
          `Il tuo passo sui 5 min cala del ${late.toFixed(0)}% dopo 25 km di corsa (oltre il ${DURABILITY_FADE}%).`,
        ),
      );
    return reasons;
  }
  const fade = (durability?.reached?.[30] ?? 0) >= 3 ? durability!.drop[30][2] : null;
  if (fade != null && fade > DURABILITY_FADE)
    reasons.push(
      t(
        `Your 20 min power drops ${fade.toFixed(0)}% after 30 kJ/kg of work (over ${DURABILITY_FADE}%).`,
        `La tua potenza sui 20 min cala del ${fade.toFixed(0)}% dopo 30 kJ/kg di lavoro (oltre il ${DURABILITY_FADE}%).`,
      ),
    );
  return reasons;
}

/** Fade (%) of 20 min power after 30 kJ/kg beyond which base comes first. */
const DURABILITY_FADE = 15;

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
  durability?: DurabilityProfile | null;
  /** Curves hold speeds (m/s) for a run: only ratios are taken, so the units don't matter. */
  sport?: MainSport;
  fade?: FadeProfile | null;
}): FocusResult {
  const sport = input.sport ?? "ride";
  const demand = seasonDemand(input.races, input.today, sport);
  const { gap, ratio } = powerGaps(input.c42, input.c1y);
  const lazy = neglected(input.acts, input.today, sport);
  const score = Object.fromEntries(
    FOCUSES.map((f) => [
      f,
      demand[f] * (gap[f] + GAP_FLOOR + (lazy.includes(f) ? NEGLECT_BONUS : 0)),
    ]),
  ) as Profile;
  const base = baseGate(input.acts, input.wellness, input.today, input.durability, sport, input.fade);
  const focus = base.length
    ? "base"
    : focusesFor(sport).reduce((a, b) => (score[b] > score[a] ? b : a));
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

/** A pace range from shares of threshold: `lo` and `hi` are speeds, so the faster pace reads second. */
const paceRange = (threshold: number | null, lo: number, hi: number) =>
  threshold
    ? `${formatPace(threshold * lo)}–${formatPace(threshold * hi)}/km`
    : t(
        `${Math.round(lo * 100)}–${Math.round(hi * 100)}% of threshold pace`,
        `${Math.round(lo * 100)}–${Math.round(hi * 100)}% del passo di soglia`,
      );

/** The quality session for a runner: running can't take a cyclist's volume, so it's shorter, with strides. */
function runSession(input: {
  focus: Focus;
  races: Race[];
  today: string;
  threshold: number | null;
  c1y: PowerCurve | undefined;
}): string {
  const { threshold } = input;
  const races = input.races.filter((r) => raceSport(r) === "run");
  const lead = leadRace(races, input.today);
  let text: string;
  const main = lead?.info
    ? [...FOCUSES]
        .sort((a, b) => profileFor(lead.info!)[b] - profileFor(lead.info!)[a])
        .slice(0, 2)
    : [];
  if (lead?.info && input.focus !== "base" && main.includes(input.focus)) {
    const m = lead.info.minutes ?? KINDS[lead.info.kind].minutes!;
    const reps =
      m <= 8
        ? `5×${formatMinutes(m)}`
        : m <= 25
          ? `3×${formatMinutes(Math.round(m * 0.5))}`
          : `2×${formatMinutes(Math.min(30, Math.round(m * 0.4)))}`;
    const best = wattsAt(input.c1y, m * 60);
    const at = best
      ? `${formatPace(best * 0.95)}–${formatPace(best)}/km`
      : t("race pace", "passo gara");
    text = t(
      `Race pace for ${lead.name} (${formatMinutes(m)}): ${reps} at ${at}, easy jog between.`,
      `Passo gara per ${lead.name} (${formatMinutes(m)}): ${reps} a ${at}, corsa lenta tra le ripetute.`,
    );
  } else {
    const strides = t(" Finish with 4 strides.", " Chiudi con 4 allunghi.");
    text = {
      base:
        t(
          `Long run: 90–150 min easy (${paceRange(threshold, 0.78, 0.88)}), the last 20 min a little quicker.`,
          `Lungo: 90–150 min lento (${paceRange(threshold, 0.78, 0.88)}), gli ultimi 20 min un po' più veloci.`,
        ) + strides,
      aerobic:
        t(
          `3×10 min at ${paceRange(threshold, 0.97, 1)}, 3 min easy jog between.`,
          `3×10 min a ${paceRange(threshold, 0.97, 1)}, 3 min di corsa lenta tra le ripetute.`,
        ) + strides,
      vo2: t(
        `5×3 min at ${paceRange(threshold, 1.05, 1.12)}, 3 min easy jog between.`,
        `5×3 min a ${paceRange(threshold, 1.05, 1.12)}, 3 min di corsa lenta tra le ripetute.`,
      ),
      anaerobic: t(
        `8×45 s at ${paceRange(threshold, 1.15, 1.3)}, full recovery walking and jogging.`,
        `8×45 s a ${paceRange(threshold, 1.15, 1.3)}, recupero completo camminando e corricchiando.`,
      ),
      sprint: t("6 strides inside an easy run.", "6 allunghi dentro una corsa lenta."),
    }[input.focus];
  }
  if (races.some((r) => raceWeight(r, input.today) > 0 && r.info?.discipline === "trail"))
    text += t(
      " Do it on a climb where you can: pace gives way to effort there.",
      " Falla in salita dove puoi: lì conta lo sforzo più del passo.",
    );
  return text;
}

/** The quality session for a summer day in this block, with targets from your zones and curve. */
export function focusSession(input: {
  focus: Focus;
  races: Race[];
  today: string;
  zones: RideZones | undefined;
  c1y: PowerCurve | undefined;
  sport?: MainSport;
  threshold?: number | null;
}): string {
  if (input.sport === "run") return runSession({ ...input, threshold: input.threshold ?? null });
  const ftp = input.zones?.ftp ?? null;
  const weighted = input.races.filter((r) => raceWeight(r, input.today) > 0);
  const lead = leadRace(input.races, input.today);
  let text: string;
  const timed = lead?.info && KINDS[lead.info.kind].timed ? lead : undefined;
  // Race pace only when the block trains what that effort is mostly made of (its two biggest focuses).
  const main = timed
    ? [...FOCUSES]
        .sort((a, b) => profileFor(timed.info!)[b] - profileFor(timed.info!)[a])
        .slice(0, 2)
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
        `Fondo lungo: 3–4 h in Z2 (${z2}), l'ultima ora con 2×20 min di tempo.`,
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
      " Poi 3×15 s di sprint negli ultimi 20 min, a gambe stanche.",
    );
  return text;
}

/** What race days, the day after and the taper ask for instead of the block's session. */
export function roleText(role: DayRole, sport: MainSport = "ride"): string {
  const name = role.race.name;
  if (sport === "run" && role.role === "sharpen")
    return t(
      `Taper for ${name} (${role.days} days): short easy runs, with 4 strides and 3×1 min at race pace.`,
      `Scarico per ${name} (${role.days} giorni): corse brevi e lente, con 4 allunghi e 3×1 min a passo gara.`,
    );
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
export function focusWhy(
  r: FocusResult,
  races: Race[],
  today: string,
  sport: MainSport = "ride",
): string[] {
  if (r.base.length) return r.base;
  const lines: string[] = [];
  const isRun = sport === "run";
  // The races themselves are listed next to this; here, only how they weigh.
  const n = races.filter((x) => raceSport(x) === sport && raceWeight(x, today) > 0).length;
  lines.push(
    n
      ? t(
          `What your ${n === 1 ? "next race needs" : `${n} races in the next 20 weeks need`}, the nearest and the A races counting most.`,
          `Ciò che ${n === 1 ? "serve alla prossima gara" : `serve alle ${n} gare delle prossime 20 settimane`}, con più peso alle più vicine e alle A.`,
        )
      : t(
          "No races ahead: training all-round.",
          "Nessuna gara in programma: ti alleni a tutto tondo.",
        ),
  );
  const pct = Math.round(r.ratio[r.focus] * 100);
  if (pct < 100)
    lines.push(
      isRun
        ? t(
            `Your ${DURATION_WORD[r.focus]} pace is at ${pct}% of your best this year.`,
            `Il tuo passo ${DURATION_WORD[r.focus]} è al ${pct}% del tuo migliore dell'anno.`,
          )
        : t(
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
