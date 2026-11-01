// Early warning: trends over several mornings that readiness, a snapshot of today, can absorb. Pure.
// Owner's rule: resting heart rate is not used anywhere in Cirmolo.
import { t } from "./i18n";
import type { Wellness } from "./intervals";
import { addDays } from "./training";

export type Signal = { key: "hrv" | "fatigue" | "stress" | "mood" | "sleep"; text: string };

/** HRV: the last week's mean this far under the four weeks before. */
const HRV_DROP = 0.08;
const HRV_MIN_WEEK = 5;
const HRV_MIN_BASE = 14;
/** Check-in answers at or above this (high / poor) on this many of the last answered days. */
const FEEL_HIGH = 3;
const FEEL_HITS = 3;
const FEEL_OF = 4;
/** Nights this much under your usual sleep, on this many of the last few. */
const SLEEP_SHORT_SECS = 45 * 60;
const SLEEP_MIN_NIGHTS = 10;

const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
const median = (v: number[]) => {
  const s = [...v].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

type Row = Pick<Wellness, "id" | "atl" | "hrv" | "sleepSecs" | "fatigue" | "stress" | "mood">;

/** Signals for `today`, from the rows up to and including it. Each needs several days; one bad morning never counts. */
export function earlySignals(rows: Row[], today: string): Signal[] {
  const past = rows
    .filter((r) => r.id <= today && r.id > addDays(today, -35))
    .sort((a, b) => b.id.localeCompare(a.id));
  const inWeek = (r: Row) => r.id > addDays(today, -7);
  const signals: Signal[] = [];

  const week = past.filter((r) => inWeek(r) && r.hrv != null).map((r) => r.hrv!);
  const base = past.filter((r) => !inWeek(r) && r.hrv != null).map((r) => r.hrv!);
  if (
    week.length >= HRV_MIN_WEEK &&
    base.length >= HRV_MIN_BASE &&
    mean(week) < mean(base) * (1 - HRV_DROP)
  ) {
    const atlNow = past.find((r) => r.id === today)?.atl ?? past[0]?.atl;
    const atlBefore = past.find((r) => r.id === addDays(today, -7))?.atl;
    const loadUp = atlNow != null && atlBefore != null && atlNow > atlBefore;
    signals.push({
      key: "hrv",
      text: loadUp
        ? t(
            "HRV has been below your usual for a week while load went up.",
            "L'HRV è sotto il tuo solito da una settimana mentre il carico è salito.",
          )
        : t(
            "HRV has been below your usual for a week.",
            "L'HRV è sotto il tuo solito da una settimana.",
          ),
    });
  }

  const feel: ["fatigue" | "stress" | "mood", string][] = [
    [
      "fatigue",
      t(
        "Fatigue has been high on 3 of the last 4 check-ins.",
        "La fatica è stata alta in 3 degli ultimi 4 check-in.",
      ),
    ],
    [
      "stress",
      t(
        "Stress has been high on 3 of the last 4 check-ins.",
        "Lo stress è stato alto in 3 degli ultimi 4 check-in.",
      ),
    ],
    [
      "mood",
      t(
        "Mood has been low on 3 of the last 4 check-ins.",
        "L'umore è stato basso in 3 degli ultimi 4 check-in.",
      ),
    ],
  ];
  for (const [key, text] of feel) {
    // Answers from the last ten days only: an old run of bad check-ins says nothing about now.
    const last = past.filter((r) => r.id > addDays(today, -10) && r[key] != null).slice(0, FEEL_OF);
    if (last.filter((r) => r[key]! >= FEEL_HIGH).length >= FEEL_HITS) signals.push({ key, text });
  }

  const nights = past
    .filter((r) => r.id > addDays(today, -28) && r.sleepSecs)
    .map((r) => r.sleepSecs!);
  if (nights.length >= SLEEP_MIN_NIGHTS) {
    const usual = median(nights);
    const recent = past.filter((r) => r.id > addDays(today, -4) && r.sleepSecs).slice(0, 4);
    if (recent.filter((r) => r.sleepSecs! < usual - SLEEP_SHORT_SECS).length >= 3)
      signals.push({
        key: "sleep",
        text: t(
          "You've slept well under your usual on 3 of the last 4 nights.",
          "Hai dormito molto meno del solito in 3 delle ultime 4 notti.",
        ),
      });
  }
  return signals;
}
