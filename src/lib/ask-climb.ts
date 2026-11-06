// "quanto ci metto sul manghen", "manghen a 250 W", "che potenza per stare sotto 1h sul manghen": a climb ahead, from your
// weight, your curve and your own passes. A range, never to the second.
import type { Dest, Entry } from "./ask";
import { matchClimbs, type IntentClimb } from "./ask-read";
import {
  holdablePower,
  powerForTime,
  timeAtPower,
  type Climb,
  type TimeRange,
} from "./climb-predict";
import { t } from "./i18n";
import type { PowerCurve } from "./intervals";
import type { Attempt } from "./segments";
import type { MainSport } from "./sport";
import { formatClock } from "./training";
import { valueAt } from "./analysis";

export type ClimbData = {
  sport: MainSport;
  climbs: IntentClimb[];
  curves?: PowerCurve[] | undefined;
  weight?: number | null | undefined;
};

export type Parsed =
  | { kind: "time"; name: string }
  | { kind: "at"; name: string; watts: number }
  | { kind: "power"; name: string; secs: number; label: string };

const ASK_TIME =
  /^(?:quanto ci metto|quanto ci vuole|quanto impiego|in quanto tempo|tempo stimato|how long(?: will it take| to)?)(?: (?:a fare|per fare|a salire|per salire|to climb|per|to|up|su|sul|sulla|sullo|il|la|lo|on))* (.+)$/;
const AT = /^(.+?) (?:a|at) (\d{2,4}) ?(?:w|watts?)$/;
const WITH_LENGTH = /(\d{1,2}) ?h ?(\d{1,2})?|(\d{1,3}) ?(?:min|minuti|m|')/;

function lengthOf(s: string): { secs: number; label: string } | null {
  const m = WITH_LENGTH.exec(s);
  if (!m) return null;
  const secs = m[1] ? Number(m[1]) * 3600 + Number(m[2] ?? 0) * 60 : Number(m[3]) * 60;
  return secs > 0 ? { secs, label: s.trim() } : null;
}
const POWER_FIRST =
  /^(?:che potenza|quanta potenza|quanti watt|potenza|power|what power|how many watts)(?: (?:serve|mi serve|per|to|for|go|stare|fare|stay))* (?:sotto|in|under) (\S+(?: \S+)?) (?:su|sul|sulla|sullo|on|up) (.+)$/;
const POWER_LAST =
  /^(?:che potenza|quanta potenza|quanti watt|potenza|power|what power|how many watts)(?: (?:serve|mi serve|per|to|for|su|sul|sulla|sullo|on|up|fare))* (.+?) (?:sotto|in|under) (\d\S*(?: \S+)?)$/;

export function parseClimb(s: string): Parsed | null {
  let m = POWER_FIRST.exec(s);
  if (m) {
    const len = lengthOf(m[1]!);
    return len ? { kind: "power", name: m[2]!, ...len } : null;
  }
  m = POWER_LAST.exec(s);
  if (m) {
    const len = lengthOf(m[2]!);
    return len ? { kind: "power", name: m[1]!, ...len } : null;
  }
  const asked = ASK_TIME.exec(s);
  const rest = asked ? asked[1]! : s;
  m = AT.exec(rest);
  if (m) return { kind: "at", name: m[1]!, watts: Number(m[2]) };
  return asked ? { kind: "time", name: rest } : null;
}

const clockShort = (secs: number) => {
  const mins = Math.round(secs / 60);
  return mins < 60 ? `${mins}` : `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, "0")}`;
};

/** "48–52 min", "1h 08–1h 14". */
export function rangeText(r: TimeRange): string {
  const [a, b] = [clockShort(r.low), clockShort(r.high)];
  return r.high < 3600 ? `${a}–${b} min` : r.low < 3600 ? `${a} min–${b}` : `${a}–${b}`;
}

const bestPass = (attempts: Attempt[]) =>
  attempts.length ? attempts.reduce((m, a) => (a.duration < m.duration ? a : m)) : null;

const curveFor = (d: ClimbData) =>
  d.curves?.find((c) => c.id.includes("42")) ??
  d.curves?.find((c) => c.id.includes("1y") || c.id.includes("365"));

export function climbPredictRows(s: string, d: ClimbData): Entry[] {
  if (d.sport === "run") return [];
  const asked = parseClimb(s);
  if (!asked) return [];
  const found = matchClimbs(d.climbs, asked.name)[0]?.c;
  if (!found) return [];
  const gain = found.gain ?? bestPass(found.attempts)?.gain;
  const dest: Dest = {
    kind: "route",
    to: "/segments/$id",
    params: { id: found.id },
    search: { sport: "ride" },
  };
  const base = { page: "segments" as const, kind: "value" as const, exact: true, dest };
  const title =
    asked.kind === "at"
      ? `${found.name} ${t("at", "a")} ${asked.watts} W`
      : asked.kind === "power"
        ? `${found.name} ${t("under", "sotto")} ${asked.label}`
        : t(`${found.name}: how long`, `${found.name}: quanto ci metti`);
  const row = { ...base, id: "climb-predict", q: title };
  if (!gain || gain <= 0 || !found.length)
    return [
      { ...row, answer: t("This climb's gradient isn't known", "Pendenza della salita non nota") },
    ];
  if (!d.weight) return [{ ...row, answer: t("Needs your weight", "Serve il tuo peso") }];
  const climb: Climb = { length: found.length, gain };
  const best = bestPass(found.attempts);
  const passNote = best
    ? t(`your best ${formatClock(best.duration)}`, `il tuo meglio ${formatClock(best.duration)}`)
    : t("no passes yet, so a wider range", "ancora nessun passaggio, quindi più largo");

  if (asked.kind === "at") {
    return [
      {
        ...row,
        value: rangeText(timeAtPower(asked.watts, d.weight, climb, found.attempts)),
        answer: [`${(asked.watts / d.weight).toFixed(1)} W/kg`, passNote].join(" · "),
      },
    ];
  }
  if (asked.kind === "power") {
    const p = powerForTime(asked.secs, d.weight, climb, found.attempts);
    const curve = curveFor(d);
    const held = valueAt(curve, asked.secs);
    return [
      {
        ...row,
        value: `${Math.round(p.low)}–${Math.round(p.high)} W`,
        answer: [
          `${(p.watts / d.weight).toFixed(1)} W/kg`,
          held
            ? held >= p.watts
              ? t(
                  `within your ${Math.round(held)} W for that long`,
                  `dentro i tuoi ${Math.round(held)} W per quella durata`,
                )
              : t(
                  `above your ${Math.round(held)} W for that long`,
                  `sopra i tuoi ${Math.round(held)} W per quella durata`,
                )
            : null,
        ]
          .filter(Boolean)
          .join(" · "),
      },
    ];
  }
  const curve = curveFor(d);
  const watts = holdablePower(curve, d.weight, climb, found.attempts);
  if (watts == null)
    return [
      {
        ...row,
        answer: curve
          ? t(
              "Nothing that long on your curve yet",
              "Ancora nessuno sforzo così lungo sulla tua curva",
            )
          : t("Needs your power curve", "Serve la tua curva di potenza"),
      },
    ];
  return [
    {
      ...row,
      value: rangeText(timeAtPower(watts, d.weight, climb, found.attempts)),
      answer: [
        t(`at your ${Math.round(watts)} W`, `ai tuoi ${Math.round(watts)} W`),
        passNote,
      ].join(" · "),
    },
  ];
}
